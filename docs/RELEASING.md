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
| Linux (any distribution, one file) | `https://github.com/haxtheweb/haxcms-desktop/releases/latest/download/haxtheweb-desktop-linux-x64.AppImage` |
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

Applying is a form at <https://signpath.org/apply>. Read their conditions at <https://signpath.org/terms> first; the ones that need something from us:

- An OSI-approved license and a public repository. Done (Apache-2.0).
- A fully automated build from the repository. Done (`release.yml`).
- Every team member uses multi-factor authentication on GitHub and on SignPath.
- Named roles: who commits and reviews, and who approves each signing request.
- A code signing policy on the website or in the repository that names those roles and carries the line "Free code signing provided by SignPath.io, certificate by SignPath Foundation". Not written yet: it has to name real people.
- The certificate is issued to SignPath Foundation, so Windows shows them as the publisher.

A published release helps the application, so cut one unsigned release first.

### Linux

Linux packages don't need signing.

## Package managers

Every release run writes the entries for this version and keeps them on the run as the `package-managers` artifact (`scripts/package-manifests.js`): a winget manifest and a Homebrew cask, each naming the installer by its versioned URL and SHA-256. The hashes are of the files in the draft, so submit only after the draft is published unchanged.

### winget (Windows)

Unsigned installers are accepted, so this can start with the first published release.

1. **First version, by hand.** Fork [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs), copy the artifact's `winget/manifests/` folder into the fork's `manifests/` folder, and open a pull request. On Windows, `winget validate --manifest <folder>` and `winget install --manifest <folder>` check it first. Microsoft's validation installs it silently; if that fails, the installer switches in the manifest are what to look at.
2. **Later versions, automatically.** Once the package is accepted:
   - Create a classic personal access token with the `public_repo` scope, from the account that owns the winget-pkgs fork, and add it as the secret `WINGET_TOKEN`.
   - Add the repository **variable** `WINGET_PACKAGE_ID` with the value `HAXTheWeb.HAXTheDesktop`.

   From then on, publishing a release (not a pre-release) runs `publish-packages.yml`, which opens the winget-pkgs pull request for the new version. Without the variable the job is skipped.

After that, people install with `winget install HAXTheWeb.HAXTheDesktop`.

### Homebrew (macOS)

Homebrew only works once the app is signed and notarized. Since September 2026 the official tap disables casks that fail Gatekeeper, and the flag that used to skip the check is gone, so an unsigned cask fails in a tap of our own too. Set up macOS signing first.

Then either:

- **Our own tap.** Create the repository `haxtheweb/homebrew-tap` and commit the artifact's `homebrew/Casks/haxtheweb-desktop.rb` to it. People install with `brew install --cask haxtheweb/tap/haxtheweb-desktop`. Each release, replace the file with the new artifact's copy.
- **The official tap.** Open a pull request on [Homebrew/homebrew-cask](https://github.com/Homebrew/homebrew-cask) with the same file. They ask for some sign that people use the app, so start with our own tap.

Updating the tap is not automated yet.

### Linux

The `.AppImage` is one file that runs on any distribution: download, `chmod +x`, run. It needs no store account and no review. Flatpak (Flathub) and Snap both need an account and a review of their own; they are not set up.

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
