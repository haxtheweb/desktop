# Releasing HAX The Desktop

A version tag builds every platform, signs what it has secrets for, and drafts a GitHub release with the installers attached. Nothing is published until a person reviews the draft.

## Cutting a release

1. Release [haxcms-nodejs](https://github.com/haxtheweb/haxcms-nodejs) first. A desktop release ships the haxcms-nodejs version in `package-lock.json`, and the app refuses to start on one without the local-mode guards (loopback bind, Host / Origin checks).
2. Update the dependency: `npm install @haxtheweb/haxcms-nodejs@latest`, commit.
3. `npm run release`. This bumps the version, updates `CHANGELOG.md`, tags `vX.Y.Z` and pushes the tag.
4. The `release` workflow runs on the tag. It packages and tests the app on Linux, Windows, macOS arm64 and macOS x64, then creates a **draft** release.
5. Open the draft under [Releases](https://github.com/haxtheweb/haxcms-desktop/releases), try an installer, and publish it.

If a platform fails to build or its packaged-app test fails, no release is drafted.

Until macOS signing is set up the draft is marked as a pre-release and titled "(unsigned)".

## Download links

Release assets have the same names every release, so links to the latest one don't change:

| Platform | Link |
| --- | --- |
| Windows | `https://github.com/haxtheweb/haxcms-desktop/releases/latest/download/haxtheweb-desktop-windows-x64-setup.exe` |
| macOS, Apple silicon | `https://github.com/haxtheweb/haxcms-desktop/releases/latest/download/haxtheweb-desktop-macos-arm64.dmg` |
| macOS, Intel | `https://github.com/haxtheweb/haxcms-desktop/releases/latest/download/haxtheweb-desktop-macos-x64.dmg` |
| Linux (Debian, Ubuntu) | `https://github.com/haxtheweb/haxcms-desktop/releases/latest/download/haxtheweb-desktop-linux-x64.deb` |
| Linux (any, no install) | `https://github.com/haxtheweb/haxcms-desktop/releases/latest/download/haxtheweb-desktop-linux-x64.zip` |

`latest` only points at published releases that are not pre-releases.

## Code signing

Signing is switched on by adding repository secrets (Settings > Secrets and variables > Actions). Without them everything still builds, unsigned. Pull request builds are never signed and never see these secrets.

### macOS

Unsigned apps are blocked by Gatekeeper, so this is the one that matters most. It needs an [Apple Developer Program](https://developer.apple.com/programs/) membership.

1. In the Apple Developer account, create a **Developer ID Application** certificate and install it in Keychain Access on a Mac.
2. Export it (certificate and private key) as a `.p12` file with a password.
3. Create an app-specific password for the Apple ID at <https://account.apple.com/> (Sign-In and Security > App-Specific Passwords). Notarization uses it.
4. Add these secrets:

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE_P12` | The `.p12` file, base64 encoded: `base64 -i certificate.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | The password set when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | The certificate's name, for example `Developer ID Application: Your Name (TEAMID1234)` |
| `APPLE_ID` | The Apple ID email of the developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | The app-specific password from step 3 |
| `APPLE_TEAM_ID` | The 10 character team ID shown under Membership details |

With those in place the release workflow signs the app with the hardened runtime, notarizes it with Apple, and then checks the result with `codesign` and `spctl` before the release is drafted.

### Windows

Windows builds are not signed yet. They install and run, but SmartScreen shows an "unknown publisher" warning first. The plan in <https://github.com/haxtheweb/issues/issues/3343> is the SignPath Foundation's free signing for open source projects; that is wired into `package.yml` once the project is accepted, because their signing policy decides how the workflow submits builds.

### Linux

Linux packages don't need signing.

## Building a signed macOS app locally

`forge.config.js` reads the same names from the environment:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID1234)"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID1234"
npm run make
```

Leave `APPLE_ID` unset to sign without notarizing.
