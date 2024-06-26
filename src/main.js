import { app, globalShortcut, BrowserWindow, ipcMain, nativeTheme, utilityProcess } from "electron";
import * as remoteMain from '@electron/remote/main';
remoteMain.initialize();
import path from "path";
import fetch from "node-fetch";
import "./haxcms-nodejs.server.js";

const expressPort = process.env.PORT || 8080;
const expressAppUrl = `http://127.0.0.1:${expressPort}`;
let mainWindow;

function stripAnsiColors(text) {
  return text.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ""
  );
}

function redirectOutput(stream) {
  stream.on("data", (data) => {
    console.log(data);
    if (!mainWindow) return;
    data.toString().split("\n").forEach((line) => {
      if (line !== "") {
        mainWindow.webContents.send("server-log-entry", stripAnsiColors(line));
      }
    });
  });
}

function registerGlobalShortcuts() {
  globalShortcut.register("CommandOrControl+Shift+L", () => {
    mainWindow.webContents.send("show-server-log");
  });
}

function unregisterAllShortcuts() {
  globalShortcut.unregisterAll();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    width: 1080,
    height: 600,
    icon: path.join(__dirname, "favicon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      plugins: true,
      nodeIntegration: true,
      contextIsolation: true,
      backgroundThrottling: false,
      nativeWindowOpen: false,
      webSecurity: false
    },
  });
  remoteMain.enable(mainWindow.webContents);

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: Object.fromEntries(Object.entries(details.responseHeaders).filter(header => !/x-frame-options/i.test(header[0]))) });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("focus", registerGlobalShortcuts);
  mainWindow.on("blur", unregisterAllShortcuts);

  ipcMain.handle("get-express-app-url", () => expressAppUrl);
  ipcMain.handle('dark-mode:toggle', () => {
    if (nativeTheme.shouldUseDarkColors) {
      nativeTheme.themeSource = 'light'
    } else {
      nativeTheme.themeSource = 'dark'
    }
    return nativeTheme.shouldUseDarkColors
  })

  ipcMain.handle('dark-mode:system', () => {
    nativeTheme.themeSource = 'system'
  })
  mainWindow.loadURL(`file://${__dirname}/../index.html`);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.whenReady().then(() => {
  registerGlobalShortcuts();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  setTimeout(() => {
    const checkServerRunning = setInterval(() => {
      fetch(expressAppUrl)
        .then((response) => {
          if (response.status === 200) {
            clearInterval(checkServerRunning);
            mainWindow.webContents.send("server-running");
          }
        })
        .catch(() => { }); // swallow exception
    }, 300);
  }, 100);
});
