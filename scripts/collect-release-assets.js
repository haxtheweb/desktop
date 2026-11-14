// Gathers the installers every platform job uploaded and gives them stable,
// version-free names, so a download link such as
//   https://github.com/haxtheweb/haxcms-desktop/releases/latest/download/haxtheweb-desktop-macos-arm64.dmg
// keeps working from one release to the next.
// Usage: node scripts/collect-release-assets.js <artifacts dir> <output dir> <tag>
// https://github.com/haxtheweb/issues/issues/3343
const fs = require("fs");
const path = require("path");

const artifactsDir = process.argv[2];
const outDir = process.argv[3];
const tag = process.argv[4] || "";
if (!artifactsDir || !outDir) {
  console.error("usage: node scripts/collect-release-assets.js <artifacts dir> <output dir> <tag>");
  process.exit(1);
}

const version = require(path.join(__dirname, "..", "package.json")).version;
if (tag !== "" && tag !== `v${version}`) {
  console.error(`tag ${tag} does not match package.json version ${version}`);
  process.exit(1);
}

// one installer of each kind is expected from every platform
const expected = {
  "linux-x64": [".deb", ".zip", ".appimage"],
  "windows-x64": [".exe"],
  "macos-arm64": [".dmg", ".zip"],
  "macos-x64": [".dmg", ".zip"],
};

function walk(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

fs.mkdirSync(outDir, { recursive: true });
let failed = false;
for (const platform of Object.keys(expected)) {
  const dir = path.join(artifactsDir, `haxtheweb-desktop-${platform}`);
  const files = fs.existsSync(dir) ? walk(dir) : [];
  for (const ext of expected[platform]) {
    const matches = files.filter((file) => path.extname(file).toLowerCase() === ext);
    if (matches.length !== 1) {
      console.error(`${platform}: expected one ${ext}, found ${matches.length}`);
      failed = true;
      continue;
    }
    const suffix = ext === ".exe" ? "-setup.exe" : ext === ".appimage" ? ".AppImage" : ext;
    const name = `haxtheweb-desktop-${platform}${suffix}`;
    fs.copyFileSync(matches[0], path.join(outDir, name));
    console.log(`${name}  <-  ${path.relative(artifactsDir, matches[0])}`);
  }
}
process.exit(failed ? 1 : 0);
