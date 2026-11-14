// Electron Forge configuration: packages the app and builds the installers
// for every platform from one place.
//   npm run package   packaged app in out/
//   npm run make      installers in out/make/
// https://github.com/haxtheweb/issues/issues/3343
const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");
const fs = require("fs");
const path = require("path");

// Signing is driven by the environment so the same config builds unsigned on
// a contributor's machine or a pull request, and signed in the release
// workflow once the secrets exist. See docs/RELEASING.md.
const env = process.env;
const macSigning = !!env.APPLE_SIGNING_IDENTITY;
const macNotarize = macSigning && !!env.APPLE_ID && !!env.APPLE_APP_SPECIFIC_PASSWORD && !!env.APPLE_TEAM_ID;

// Paths are tested from the project root with a leading slash. Only dist/,
// package.json, the license and production node_modules ship.
const ignore = [
  /^\/src($|\/)/,
  /^\/scripts($|\/)/,
  /^\/test($|\/)/,
  /^\/docs($|\/)/,
  /^\/screenshots($|\/)/,
  /^\/builds($|\/)/,
  /^\/out($|\/)/,
  /^\/\.github($|\/)/,
  /^\/\.haxcmsconfig($|\/)/,
  /^\/_(sites|published|archived)($|\/)/,
  /^\/(babel|forge)\.config\.js$/,
  /^\/(AGENTS|CHANGELOG|README)\.md$/,
  /^\/\.git(ignore|attributes)?($|\/)/,
  // php compatibility shims inside locutus that the server never loads
  /\/locutus\/(php\/bc|esm\/php\/bc)\//,
];

module.exports = {
  packagerConfig: {
    name: "haxtheweb-desktop",
    executableName: "haxtheweb-desktop",
    appBundleId: "org.haxtheweb.desktop",
    appCategoryType: "public.app-category.education",
    // packager picks favicon.ico / favicon.icns per platform when present
    icon: "./src/favicon",
    ignore: ignore,
    // offline or proxied builds: a folder already holding the Electron zip
    ...(env.ELECTRON_ZIP_DIR ? { electronZipDir: env.ELECTRON_ZIP_DIR } : {}),
    asar: {
      // sharp loads its native binding and libvips from disk
      unpack: "**/node_modules/{sharp,@img}/**",
    },
    ...(macSigning
      ? {
          osxSign: {
            identity: env.APPLE_SIGNING_IDENTITY,
          },
        }
      : {}),
    ...(macNotarize
      ? {
          osxNotarize: {
            appleId: env.APPLE_ID,
            appleIdPassword: env.APPLE_APP_SPECIFIC_PASSWORD,
            teamId: env.APPLE_TEAM_ID,
          },
        }
      : {}),
  },
  hooks: {
    // haxcms-nodejs ships its front end as an unbundled build that has its
    // own node_modules folder (dist/public/build/es6/node_modules). The
    // packager's dependency pruning treats packages in there as extraneous
    // and removes some of them, so put the whole build back after pruning.
    packageAfterPrune: async (_forgeConfig, buildPath) => {
      const build = path.join("node_modules", "@haxtheweb", "haxcms-nodejs", "dist", "public", "build");
      const from = path.join(__dirname, build);
      const to = path.join(buildPath, build);
      fs.rmSync(to, { recursive: true, force: true });
      fs.cpSync(from, to, { recursive: true, dereference: true });
    },
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "haxtheweb_desktop",
        setupIcon: "./src/favicon.ico",
      },
    },
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: {},
    },
    {
      // zip of the app: the macOS auto-update format, and a no-install
      // download on Linux
      name: "@electron-forge/maker-zip",
      platforms: ["darwin", "linux"],
      config: {},
    },
    {
      name: "@electron-forge/maker-deb",
      platforms: ["linux"],
      config: {
        options: {
          name: "haxtheweb-desktop",
          productName: "HAX The Desktop",
          genericName: "HAXcms site builder",
          maintainer: "HAXTheWeb core team",
          homepage: "https://haxtheweb.org/",
          categories: ["Education", "Development"],
        },
      },
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
    // The shipped binary only runs this app: it can't be used as a plain
    // Node runtime or debugger target, and it only loads code from the asar
    // archive whose hash is embedded in the binary.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
