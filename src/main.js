import { app, BrowserWindow, Menu, dialog, session, shell } from "electron";
import path from "path";

// One copy of the app at a time: a second launch would start a second server
// on the next port and point a second window at the same sites folder.
const isPrimaryInstance = app.requestSingleInstanceLock();

let haxcms = null;
let serverStartError = null;
if (isPrimaryInstance) {
  try {
    haxcms = require("./haxcms-nodejs.server.js");
  } catch (e) {
    serverStartError = e;
  }
} else {
  app.quit();
}

let mainWindow = null;
let serverOrigin = "";

// The only web content this app trusts is the local HAXcms server.
function isServerUrl(target) {
  if (serverOrigin === "") {
    return false;
  }
  try {
    return new URL(target).origin === serverOrigin;
  } catch (e) {
    return false;
  }
}

function openExternally(target) {
  try {
    const parsed = new URL(target);
    if (parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:") {
      shell.openExternal(parsed.toString());
    }
  } catch (e) {
    // not a URL; ignore
  }
}

const secureWebPreferences = {
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  spellcheck: true,
};

// Applied to every webContents, including windows the page opens.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event, target) => {
    if (!isServerUrl(target)) {
      event.preventDefault();
      openExternally(target);
    }
  });
  contents.on("will-redirect", (event, target) => {
    if (!isServerUrl(target)) {
      event.preventDefault();
    }
  });
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    // HAX opens site previews and published copies in new windows
    if (isServerUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: secureWebPreferences,
        },
      };
    }
    openExternally(url);
    return { action: "deny" };
  });
});

function lockDownSession() {
  const ses = session.defaultSession;
  // Only the local server gets anything beyond the basics; the rest is denied.
  const allowed = ["clipboard-sanitized-write", "fullscreen"];
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(isServerUrl(webContents.getURL()) && allowed.indexOf(permission) !== -1);
  });
  ses.setPermissionCheckHandler((webContents, permission) => {
    return !!webContents && isServerUrl(webContents.getURL()) && allowed.indexOf(permission) !== -1;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    width: 1280,
    height: 800,
    show: false,
    icon: path.join(__dirname, "favicon.ico"),
    webPreferences: secureWebPreferences,
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  // static spinner (no script) while the server starts
  mainWindow.loadFile(path.join(__dirname, "..", "index.html"));
  if (serverOrigin !== "") {
    mainWindow.loadURL(serverOrigin);
  }
}

function openLegalNotices() {
  const legalWin = new BrowserWindow({
    width: 980,
    height: 720,
    title: "Legal Notices",
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences,
  });
  legalWin.loadFile(path.join(__dirname, "legal-notices", "legal-notices.html"));
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      label: "Help",
      submenu: [
        { label: "Legal Notices", click: () => openLegalNotices() }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (haxcms && haxcms.server && haxcms.server.listening) {
    haxcms.server.close();
  }
});

app.whenReady().then(async () => {
  if (!isPrimaryInstance) {
    return;
  }
  if (serverStartError) {
    dialog.showErrorBox("HAXcms could not start", String(serverStartError.message || serverStartError));
    app.quit();
    return;
  }
  lockDownSession();
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  const port = await haxcms.serverReady;
  const host = haxcms.getListenHost() || "127.0.0.1";
  const browserHost = host.indexOf(":") !== -1 ? `[${host}]` : host;
  serverOrigin = `${haxcms.serverProtocol}://${browserHost}:${port}`;
  if (mainWindow) {
    mainWindow.loadURL(serverOrigin);
  }
});
