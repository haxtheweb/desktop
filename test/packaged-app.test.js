// Launches the packaged app (the thing people download, not `electron .`) and
// drives its window over the Chromium DevTools protocol:
//   - the fuses that lock the binary down are set
//   - the dashboard loads from inside the asar archive
//   - a site can be created, lands in the home directory and opens
//   - the page has no Node access and can't navigate the window off the server
//   - closing the app stops the server
// Run `npm run package` first, then: npm run test:app
// On Linux without a display: xvfb-run -a npm run test:app
// https://github.com/haxtheweb/issues/issues/3343
const assert = require("assert");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright-core");

const appName = "haxtheweb-desktop";
const root = path.join(__dirname, "..");

function findExecutable() {
  if (process.env.HAX_DESKTOP_EXECUTABLE) {
    return process.env.HAX_DESKTOP_EXECUTABLE;
  }
  const arch = process.env.HAX_DESKTOP_ARCH || process.arch;
  const dir = path.join(root, "out", `${appName}-${process.platform}-${arch}`);
  if (process.platform === "darwin") {
    return path.join(dir, `${appName}.app`, "Contents", "MacOS", appName);
  }
  if (process.platform === "win32") {
    return path.join(dir, `${appName}.exe`);
  }
  return path.join(dir, appName);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(what, fn, timeoutMs) {
  const end = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) {
        return value;
      }
    } catch (e) {
      lastError = e;
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}${lastError ? `: ${lastError.message}` : ""}`);
}

async function checkFuses(executable) {
  const { getCurrentFuseWire, FuseV1Options, FuseState } = await import("@electron/fuses");
  // on macOS the fuse wire lives in the framework inside the .app bundle
  const target = process.platform === "darwin" ? path.resolve(executable, "..", "..", "..") : executable;
  const wire = await getCurrentFuseWire(target);
  const expected = [
    [FuseV1Options.RunAsNode, FuseState.DISABLE, "can't run as plain Node"],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE, "ignores NODE_OPTIONS"],
    [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE, "ignores --inspect"],
    [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE, "encrypts cookies"],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE, "validates the asar archive"],
    [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE, "only loads the app from the asar archive"],
  ];
  for (const [fuse, state, label] of expected) {
    assert.strictEqual(wire[fuse], state, `fuse: packaged binary ${label}`);
  }
}

async function run() {
  const executable = findExecutable();
  assert.ok(fs.existsSync(executable), `packaged app not found at ${executable}; run "npm run package" first`);
  await checkFuses(executable);
  console.log("ok fuses");

  const home = fs.mkdtempSync(path.join(os.tmpdir(), "haxdesktop-app-home-"));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "haxdesktop-app-data-"));
  const debugPort = await freePort();
  const args = [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`];
  if (process.platform === "linux") {
    // CI runners and containers don't allow Chromium's namespace sandbox
    args.push("--no-sandbox");
  }
  const child = spawn(executable, args, {
    env: Object.assign({}, process.env, {
      HOME: home,
      USERPROFILE: home,
      // a busy default port must not matter, but start somewhere unusual
      PORT: process.env.PORT || "3457",
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });

  let browser = null;
  try {
    await waitFor(
      "the app's DevTools endpoint",
      async () => {
        assert.ok(!exited, "app exited during startup");
        const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
        return res.ok;
      },
      60000,
    );
    // attaching can be slow while the dashboard is still loading its modules
    browser = await waitFor(
      "a DevTools connection",
      () => chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`, { timeout: 45000 }),
      180000,
    );
    const page = await waitFor(
      "the window to load the local HAXcms server",
      () => {
        for (const context of browser.contexts()) {
          for (const candidate of context.pages()) {
            if (/^http:\/\/127\.0\.0\.1:\d+\//.test(candidate.url())) {
              return candidate;
            }
          }
        }
        return null;
      },
      60000,
    );
    const origin = new URL(page.url()).origin;

    // dashboard: app-hax is served out of the asar archive and upgrades
    await page.waitForFunction(
      () => !!document.querySelector("app-hax") && !!globalThis.customElements.get("app-hax"),
      null,
      { timeout: 60000 },
    );
    console.log("ok dashboard loads");

    // renderer hardening: no Node in the page
    // (HAX defines its own globalThis.process shim, so look for Node's)
    const nodeInPage = await page.evaluate(
      () =>
        typeof globalThis.require !== "undefined" ||
        !!(globalThis.process && globalThis.process.versions && globalThis.process.versions.node),
    );
    assert.strictEqual(nodeInPage, false, "page has no Node integration");
    console.log("ok no Node in the page");

    // create a site the way the dashboard does
    const created = await page.evaluate(async () => {
      const settings = await (await fetch("/system/api/v1/session/connection-settings")).text();
      const token = settings.match(/"token":"([^"]+)"/);
      const jwt = settings.match(/appSettings\.jwt = "([^"]+)"/);
      if (!token || !jwt) {
        return { status: 0, error: "no token in connection-settings" };
      }
      const res = await fetch("/system/api/v1/sites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt[1]}`,
          "X-HAXCMS-User-Token": token[1],
        },
        body: JSON.stringify({ site: { name: "apptest" }, theme: { name: "clean-one" } }),
      });
      return { status: res.status };
    });
    assert.strictEqual(created.status, 200, `site creation works (${JSON.stringify(created)})`);
    assert.ok(
      fs.existsSync(path.join(home, "_sites", "apptest", "site.json")),
      "site written under the home directory",
    );
    console.log("ok site created");

    // the new site opens and its builder element upgrades
    await page.goto(`${origin}/_sites/apptest/`);
    await page.waitForFunction(
      () => !!document.querySelector("haxcms-site-builder") && !!globalThis.customElements.get("haxcms-site-builder"),
      null,
      { timeout: 60000 },
    );
    console.log("ok site opens");

    // The window only ever shows the local server. ftp: is used because the
    // app hands blocked http(s) links to the system browser, which a test
    // run shouldn't open.
    const popup = await page.evaluate(() => globalThis.open("ftp://navigation-guard.invalid/") === null);
    assert.strictEqual(popup, true, "window.open to another origin is denied");
    await page.evaluate(() => {
      globalThis.location.href = "ftp://navigation-guard.invalid/";
    });
    await sleep(1500);
    assert.ok(page.url().indexOf(origin) === 0, `navigation off the server is blocked (at ${page.url()})`);
    console.log("ok navigation guard");

    // closing the app stops the server
    const session = await browser.newBrowserCDPSession();
    await session.send("Browser.close").catch(() => {});
    await waitFor("the app to exit", () => exited, 20000).catch(() => {});
    if (!exited) {
      // macOS apps stay open with no windows; ask it to quit
      child.kill();
      await waitFor("the app to exit after SIGTERM", () => exited, 20000);
    }
    const stillServing = await fetch(`${origin}/`).then(
      () => true,
      () => false,
    );
    assert.strictEqual(stillServing, false, "server stops when the app quits");
    console.log("ok clean shutdown");
  } catch (e) {
    console.error("---- app output ----");
    console.error(output.slice(-4000));
    throw e;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (!exited) {
      child.kill("SIGKILL");
      await sleep(500);
    }
    for (const dir of [home, userData]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      } catch (e) {
        // Windows can hold a lock on the profile for a moment; not a failure
      }
    }
  }
}

run().then(
  () => {
    console.log("packaged app test passed");
    process.exit(0);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
