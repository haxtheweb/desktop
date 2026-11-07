# HAX The Desktop
HAX The Desktop runs [haxcms-nodejs](https://github.com/haxtheweb/haxcms-nodejs) wrapped in Electron. Sites are stored in `_sites` in your home directory.

![HAXcms nodejs backend](screenshots/haxcms-nodejs.png)

The app starts the real haxcms-nodejs server (`dist/app.js`) in no-login local mode. That mode only listens on `127.0.0.1` and refuses writes from other origins, so the desktop app needs a haxcms-nodejs release that includes those guards; it will refuse to start on an older one.

## How to run

```bash
npm install
npm start
```

## Testing against haxcms-nodejs main

CI tests against haxcms-nodejs `main`, not the last npm release. To do the same locally:

```bash
git clone https://github.com/haxtheweb/haxcms-nodejs.git ../haxcms-nodejs
(cd ../haxcms-nodejs && yarn install && npm run build)
rm -rf node_modules/@haxtheweb/haxcms-nodejs
ln -s ../../../haxcms-nodejs node_modules/@haxtheweb/haxcms-nodejs
npm test    # boots the server outside Electron and checks it end to end
npm start
```

## How to package for distribution

```bash
npm run linux        # .deb (x64)
npm run windows      # installer (x64)
npm run mac          # .dmg (x64)
npm run darwin-arm64 # .dmg (Apple silicon)
```

Packaged builds have Electron fuses flipped (`scripts/flip-fuses.mjs`) so the binary can't be run as plain Node or opened with `--inspect`.
