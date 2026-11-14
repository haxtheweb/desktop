// Writes the package manager entries for a release from its collected
// installers: a winget manifest (Windows) and a Homebrew cask (macOS). Both
// name the installer by its versioned release URL and its SHA-256, so they
// are generated, never typed.
// Usage: node scripts/package-manifests.js <release assets dir> <output dir>
// The assets dir is what collect-release-assets.js wrote. See
// docs/RELEASING.md, "Package managers".
// https://github.com/haxtheweb/issues/issues/3343
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const assetsDir = process.argv[2];
const outDir = process.argv[3];
if (!assetsDir || !outDir) {
  console.error("usage: node scripts/package-manifests.js <release assets dir> <output dir>");
  process.exit(1);
}

const pkg = require(path.join(__dirname, "..", "package.json"));
const version = pkg.version;
const repo = "https://github.com/haxtheweb/haxcms-desktop";
const download = `${repo}/releases/download/v${version}`;
const WINGET_ID = "HAXTheWeb.HAXTheDesktop";
const WINGET_SCHEMA = "1.10.0";

function sha256(name) {
  const file = path.join(assetsDir, name);
  if (!fs.existsSync(file)) {
    return null;
  }
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  console.log(path.relative(outDir, file));
}

let failed = false;

// winget: the folder layout winget-pkgs expects, manifests/h/HAXTheWeb/HAXTheDesktop/<version>/
const setup = "haxtheweb-desktop-windows-x64-setup.exe";
const setupHash = sha256(setup);
if (!setupHash) {
  console.error(`winget: ${setup} not found in ${assetsDir}`);
  failed = true;
} else {
  const dir = path.join(outDir, "winget", "manifests", "h", "HAXTheWeb", "HAXTheDesktop", version);
  const header = (type) => `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${type}.${WINGET_SCHEMA}.schema.json\n\n`;
  write(
    path.join(dir, `${WINGET_ID}.yaml`),
    `${header("version")}PackageIdentifier: ${WINGET_ID}
PackageVersion: ${version}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: ${WINGET_SCHEMA}
`,
  );
  write(
    path.join(dir, `${WINGET_ID}.installer.yaml`),
    `${header("installer")}PackageIdentifier: ${WINGET_ID}
PackageVersion: ${version}
InstallerType: exe
Scope: user
InstallModes:
- interactive
- silent
InstallerSwitches:
  Silent: --silent
  SilentWithProgress: --silent
UpgradeBehavior: install
Installers:
- Architecture: x64
  InstallerUrl: ${download}/${setup}
  InstallerSha256: ${setupHash.toUpperCase()}
ManifestType: installer
ManifestVersion: ${WINGET_SCHEMA}
`,
  );
  write(
    path.join(dir, `${WINGET_ID}.locale.en-US.yaml`),
    `${header("defaultLocale")}PackageIdentifier: ${WINGET_ID}
PackageVersion: ${version}
PackageLocale: en-US
Publisher: HAXTheWeb
PublisherUrl: https://haxtheweb.org/
PublisherSupportUrl: ${pkg.bugs.url}
PackageName: HAX The Desktop
PackageUrl: ${repo}
License: ${pkg.license}
LicenseUrl: ${repo}/blob/master/LICENSE
ShortDescription: Build HAXcms sites on your own computer. Runs the HAXcms site builder locally and keeps your sites in your home folder.
Tags:
- hax
- haxcms
- education
- site-builder
- web-components
ReleaseNotesUrl: ${repo}/releases/tag/v${version}
ManifestType: defaultLocale
ManifestVersion: ${WINGET_SCHEMA}
`,
  );
}

// Homebrew: one cask for both Mac architectures
const armHash = sha256("haxtheweb-desktop-macos-arm64.dmg");
const intelHash = sha256("haxtheweb-desktop-macos-x64.dmg");
if (!armHash || !intelHash) {
  console.error(`homebrew: both macOS .dmg files are needed in ${assetsDir}`);
  failed = true;
} else {
  write(
    path.join(outDir, "homebrew", "Casks", "haxtheweb-desktop.rb"),
    `cask "haxtheweb-desktop" do
  arch arm: "arm64", intel: "x64"

  version "${version}"
  sha256 arm:   "${armHash}",
         intel: "${intelHash}"

  url "${repo}/releases/download/v#{version}/haxtheweb-desktop-macos-#{arch}.dmg",
      verified: "github.com/haxtheweb/haxcms-desktop/"
  name "HAX The Desktop"
  desc "Build HAXcms sites on your own computer"
  homepage "https://haxtheweb.org/"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "haxtheweb-desktop.app"
end
`,
  );
}

process.exit(failed ? 1 : 0);
