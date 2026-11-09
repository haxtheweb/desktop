// Flips Electron fuses on a packaged build so the shipped binary can't be
// repurposed as a general Node runtime or debugger target.
// Usage: node scripts/flip-fuses.mjs <path to executable or .app>
// https://github.com/haxtheweb/issues/issues/3255
//
// The asar fuses (EnableEmbeddedAsarIntegrityValidation, OnlyLoadAppFromAsar)
// are left off until the packaged app is moved into an asar archive and tested,
// because haxcms-nodejs reads its boilerplate and build files from disk.
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/flip-fuses.mjs <executable>");
  process.exit(1);
}

await flipFuses(target, {
  version: FuseVersion.V1,
  resetAdHocDarwinSignature: process.platform === "darwin",
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
});
console.log(`fuses flipped: ${target}`);
