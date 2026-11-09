// Runs the real haxcms-nodejs server (dist/app.js) inside Electron's main
// process instead of a desktop-specific fork of it, so the desktop app always
// gets upstream's routes and security guards.
// https://github.com/haxtheweb/issues/issues/3255
const os = require("os");
const path = require("path");

// Sites, archives and the HAXcms config live in the user's home directory.
// haxcms-nodejs writes under HAXCMS_ROOT but serves several static paths
// (_sites, _published, .well-known) relative to process.cwd(), so run from the
// home directory too, the same as `npx @haxtheweb/haxcms-nodejs` run there.
process.chdir(os.homedir());
process.env.HAXCMS_ROOT = path.join(os.homedir(), path.sep);
// Single-user local app: no login screen. haxcms-nodejs only honours this
// outside NODE_ENV=production, binds 127.0.0.1 while it is on, and refuses
// cross-origin / DNS-rebinding writes.
process.env.HAXCMS_DISABLE_JWT_CHECKS = "true";
// Never let an inherited HAXCMS_HOST expose the no-login server to the LAN.
delete process.env.HAXCMS_HOST;

// Refuse to start on a haxcms-nodejs that predates the local-mode guards
// (loopback bind, Host / Origin checks). Requiring app.js starts listening, so
// this check has to happen first.
let hasLocalModeGuards = true;
try {
  require.resolve("@haxtheweb/haxcms-nodejs/dist/lib/listenHost.js");
} catch (e) {
  hasLocalModeGuards = false;
}
if (!hasLocalModeGuards) {
  throw new Error(
    "This version of @haxtheweb/haxcms-nodejs does not protect the no-login " +
      "local mode (missing dist/lib/listenHost.js). Install a release built " +
      "from haxcms-nodejs main.",
  );
}

const haxcms = require("@haxtheweb/haxcms-nodejs/dist/app.js");

module.exports = {
  server: haxcms.server,
  serverProtocol: haxcms.serverProtocol || "http",
  // resolves with the port actually bound (upstream retries the next port
  // when the default is busy)
  serverReady: haxcms.serverReady,
  getListenHost:
    typeof haxcms.getListenHost === "function"
      ? haxcms.getListenHost
      : () => "127.0.0.1",
};
