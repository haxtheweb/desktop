// Boots the desktop's haxcms-nodejs shim (dist/src/haxcms-nodejs.server.js)
// outside Electron against a throwaway home directory and checks that it
// starts, stays on loopback, creates a site, and refuses cross-origin writes.
// Run with: npm test
// https://github.com/haxtheweb/issues/issues/3255
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const home = fs.mkdtempSync(path.join(os.tmpdir(), "haxdesktop-smoke-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.PORT = process.env.PORT || "3456";
// the shim must ignore an inherited LAN bind
process.env.HAXCMS_HOST = "0.0.0.0";

const shim = require(path.join(__dirname, "..", "dist", "src", "haxcms-nodejs.server.js"));

async function run() {
  const port = await shim.serverReady;
  const host = shim.getListenHost();
  assert.strictEqual(host, "127.0.0.1", "no-login server must bind loopback");
  const origin = `${shim.serverProtocol}://${host}:${port}`;

  const home200 = await fetch(`${origin}/`);
  assert.strictEqual(home200.status, 200, "dashboard loads");

  const settingsJs = await (await fetch(`${origin}/system/api/v1/session/connection-settings`, {
    headers: { "Sec-Fetch-Site": "same-origin" },
  })).text();
  const tokenMatch = settingsJs.match(/"token":"([^"]+)"/);
  const jwtMatch = settingsJs.match(/appSettings\.jwt = "([^"]+)"/);
  assert.ok(tokenMatch && jwtMatch, "connection-settings hands the local editor its token");
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${jwtMatch[1]}`,
    "X-HAXCMS-User-Token": tokenMatch[1],
  };
  const body = JSON.stringify({ site: { name: "smoke" }, theme: { name: "clean-one" } });

  const evil = await fetch(`${origin}/system/api/v1/sites`, {
    method: "POST",
    headers: Object.assign({ Origin: "http://evil.example" }, headers),
    body: body,
  });
  assert.strictEqual(evil.status, 403, "cross-origin write is refused");

  const rebind = await fetch(`${origin}/system/api/v1/sites`, {
    method: "POST",
    headers: Object.assign({ Host: `rebind.example:${port}`, Origin: `http://rebind.example:${port}` }, headers),
    body: body,
  });
  assert.strictEqual(rebind.status, 403, "DNS-rebinding write is refused");

  const created = await fetch(`${origin}/system/api/v1/sites`, {
    method: "POST",
    headers: Object.assign({ Origin: origin }, headers),
    body: body,
  });
  assert.strictEqual(created.status, 200, "same-origin site creation works");
  assert.ok(fs.existsSync(path.join(home, "_sites", "smoke", "site.json")), "site written under the home directory");

  const siteJson = await fetch(`${origin}/_sites/smoke/site.json`);
  assert.strictEqual(siteJson.status, 200, "new site is served");
}

run()
  .then(() => {
    console.log("smoke test passed");
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    shim.server.close();
    // the shim runs from the home directory; Windows won't remove a folder
    // that is the working directory or still has files open in it
    process.chdir(os.tmpdir());
    try {
      fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (e) {
      console.warn(`could not remove ${home}: ${e.code || e.message}`);
    }
    // haxcms-nodejs keeps timers (upload sweeper, rate limiters) alive
    setTimeout(() => process.exit(process.exitCode || 0), 200).unref();
  });
