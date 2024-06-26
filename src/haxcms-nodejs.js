#!/usr/bin/env node
// lib dependencies
var argv = require('minimist')(process.argv.slice(2));
const express = require('express');
// load config from dot files
require('dotenv').config()
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const app = express();
const mime = require('mime');
const path = require('path');
const fs = require("fs-extra");
const server = require('http').Server(app);
let liveReloadServer;
// HAXcms core settings
// set HAXCMS_ROOT to user home directory so their sites get written there
const homedir = require('os').homedir();
process.env.HAXCMS_ROOT = homedir + '/';
process.env.HAXCMS_DISABLE_JWT_CHECKS = true;
process.env.haxcms_middleware = "node-express";

const { HAXCMS, systemStructureContext } = require('@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js');
HAXCMS.HAXCMS_DISABLE_JWT_CHECKS = true;
// routes with all requires
const { RoutesMap, OpenRoutes } = require('@haxtheweb/haxcms-nodejs/dist/lib/RoutesMap.js');
// app settings
const multer = require('multer')
const upload = multer({ dest: path.join(HAXCMS.configDirectory, 'tmp/') })
//let publicDir = path.join(__dirname, '/public');

let publicDir = path.join(__dirname, '../../node_modules/@haxtheweb/haxcms-nodejs/dist/public');
// @note no idea why these need set they don't work without them
app.set("views", path.join(__dirname, "..", "views"));
app.set("view engine", "ejs");
console.log(publicDir);
// if in development, live reload
if (process.env.NODE_ENV === "development") {
  const livereload = require("livereload");
  liveReloadServer = livereload.createServer({
    delay: 100
  });
  const connectLiveReload = require("connect-livereload");
  liveReloadServer.watch(__dirname);
  liveReloadServer.server.once("connection", () => {
    setTimeout(() => {
      liveReloadServer.refresh("/");
    }, 100);
  });
  app.use(connectLiveReload());
}
app.use(express.urlencoded({limit: '50mb',  extended: false, parameterLimit: 50000 }));
app.use(helmet({
  contentSecurityPolicy: false,
  referrerPolicy: {
    policy: ["origin", "unsafe-url"],
  },
}));
app.use(cookieParser());
//pre-flight requests
app.options('*', function(req, res, next) {
	res.send(200);
});
// attempt to establish context of site vs multi-site environment
const port = process.env.PORT || 8080;
systemStructureContext().then((site) => {
  // see if we have a single site context or if we need routes for multisite
  if (site) {
    // we have a site context, need paths to resolve to cwd instead of subsite path
    // in this configuration there is no overworld / 8-bit game to make new sites
    // this assumes a site has already been made or is being navigated to to work on
    // works great w/ CLI in stand alone mode for local developer
    publicDir = site.siteDirectory;
    app.use(express.static(publicDir));
    app.use('/', (req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', `http://localhost:${port}`);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');
      res.setHeader('Content-Type', 'application/json');
      if (req.url.includes('/system/api/')) {
        next()
      }
      // previous will catch as json, undo that
      else if (
        !req.url.includes('/custom/build/') && 
        (
          req.url.includes('/build/') || 
          req.url.includes('wc-registry.json') ||
          req.url.includes('build.js') ||
          req.url.includes('build-haxcms.js') ||
          req.url.includes('VERSION.txt')
        )
      ) {
        if (mime.getType(req.url.split('?')[0])) {
          res.setHeader('Content-Type', mime.getType(req.url));
        }
        let cleanFilePath = req.url
        .replace(/\/(.*?)\/build\//g, "build/")
        .replace(/\/(.*?)\/wc-registry.json/g, "wc-registry.json")
          .replace(/\/(.*?)\/build.js/g, "build.js")
          .replace(/\/(.*?)\/build-haxcms.js/g, "build-haxcms.js")
          .replace(/\/(.*?)\/VERSION.txt/g, "VERSION.txt");
        res.sendFile(cleanFilePath,
        {
          root: path.join(__dirname, '/public')
        });
      }
      else if (
        req.url.includes('legacy-outline.html') || 
        req.url.includes('custom/build') || 
        req.url.includes('/theme/') || 
        req.url.includes('/assets/') || 
        req.url.includes('/manifest.json') || 
        req.url.includes('/files/') || 
        req.url.includes('/pages/') || 
        req.url.includes('/site.json')
      ) {
        if (mime.getType(req.url.split('?')[0])) {
          res.setHeader('Content-Type', mime.getType(req.url));
        }
        else {
          res.setHeader('Content-Type', 'text/html');
        }
        res.sendFile(req.url.split('?')[0],
        {
          root: publicDir
        });
      }
      else {
        // all page calls just go to the index and the front end will render them
        if (mime.getType(req.url.split('?')[0])) {
          res.setHeader('Content-Type', mime.getType(req.url));
        }
        else {
          res.setHeader('Content-Type', 'text/html');
        }
        // send file for the index even tho route says it's a path not on our file system
        // this way internal routing picks up and loads the correct content while
        // at the same time express has delivered us SOMETHING as the path in the request
        // url doesn't actually exist
        res.sendFile(`index.html`,
        {
          root: publicDir
        });
      }
    });
  }
  else {
    app.use(express.static(publicDir));
    app.use('/', (req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', `http://localhost:${port}`);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');
      res.setHeader('Content-Type', 'application/json');
      // dynamic step routes in HAXcms site list UI
      if (!req.url.startsWith('/createSite-step-') && req.url !== "/home") {
        next();
      }
      else {
        if (mime.getType(req.url)) {
          res.setHeader('Content-Type', mime.getType(req.url));
        }
        else {
          res.setHeader('Content-Type', 'text/html');
        }
        res.sendFile(req.url.replace(/\/createSite-step-(.*)/, "/").replace(/\/home/, "/"),
        {
          root: publicDir
        });
      }
    });
    // sites need rewriting to work with PWA routes without failing file location
    // similar to htaccess
    app.use(`/${HAXCMS.sitesDirectory}/`,(req, res, next) => {
      if (req.url.includes('/system/api/')) {
        next()
      }
      // previous will catch as json, undo that
      else if (
        !req.url.includes('/custom/build/') && 
        (
          req.url.includes('/build/') || 
          req.url.includes('wc-registry.json') ||
          req.url.includes('build.js') ||
          req.url.includes('build-haxcms.js') ||
          req.url.includes('VERSION.txt')
        )
      ) {
        if (mime.getType(req.url.split('?')[0])) {
          res.setHeader('Content-Type', mime.getType(req.url));
        }
        let cleanFilePath = req.url
        .replace(/\/(.*?)\/build\//g, "build/")
        .replace(/\/(.*?)\/wc-registry.json/g, "wc-registry.json")
          .replace(/\/(.*?)\/build.js/g, "build.js")
          .replace(/\/(.*?)\/build-haxcms.js/g, "build-haxcms.js")
          .replace(/\/(.*?)\/VERSION.txt/g, "VERSION.txt");
        res.sendFile(cleanFilePath,
        {
          root: publicDir
        });
      }
      else if (
        req.url.includes('legacy-outline.html') || 
        req.url.includes('custom/build') || 
        req.url.includes('/theme/') || 
        req.url.includes('/assets/') || 
        req.url.includes('/manifest.json') || 
        req.url.includes('/files/') || 
        req.url.includes('/pages/') || 
        req.url.includes('/site.json')
      ) {
        if (mime.getType(req.url.split('?')[0])) {
          res.setHeader('Content-Type', mime.getType(req.url));
        }
        else {
          res.setHeader('Content-Type', 'text/html');
        }
        res.sendFile(req.url.split('?')[0],
        {
          root: homedir + `/${HAXCMS.sitesDirectory}`
        });
      }
      else {
        if (mime.getType(req.url.split('?')[0])) {
          res.setHeader('Content-Type', mime.getType(req.url));
        }
        else {
          res.setHeader('Content-Type', 'text/html');
        }
        // send file for the index even tho route says it's a path not on our file system
        // this way internal routing picks up and loads the correct content while
        // at the same time express has delivered us SOMETHING as the path in the request
        // url doesn't actually exist
        res.sendFile(req.url.replace(/\/(.*?)\/(.*)/, `/${HAXCMS.sitesDirectory}/$1/index.html`),
        {
          root: homedir
        });
      }
    });
    // published directory route if it exists
    app.use(`/${HAXCMS.publishedDirectory}/`,(req, res, next) => {
      if (mime.getType(req.url)) {
        res.setHeader('Content-Type', mime.getType(req.url));
      }
      else {
        res.setHeader('Content-Type', 'text/html');
      }
      res.sendFile(req.url,
      {
        root: homedir + `/${HAXCMS.publishedDirectory}`
      });
    });
  }
  // loop through methods and apply the route to the file to deliver it
  for (var method in RoutesMap) {
    for (var route in RoutesMap[method]) {
      let extra = express.json({
        type: "*/*",
        limit: '50mb'
      });
      if (route === "saveFile") {
        extra = upload.single('file-upload');
      }
      app[method](`${HAXCMS.basePath}${HAXCMS.systemRequestBase}${route}`, extra ,(req, res, next) => {
        const op = req.route.path.replace(`${HAXCMS.basePath}${HAXCMS.systemRequestBase}`, '');
        const rMethod = req.method.toLowerCase();
        if (OpenRoutes.includes(op) || HAXCMS.validateJWT(req, res)) {
          // call the method
          RoutesMap[rMethod][op](req, res, next);
        }
        else {
          res.sendStatus(403);
        }
      });
      app[method](`/${HAXCMS.sitesDirectory}/*${HAXCMS.basePath}${HAXCMS.systemRequestBase}${route}`, extra ,(req, res, next) => {
        const op = req.route.path.replace(`/${HAXCMS.sitesDirectory}/*${HAXCMS.basePath}${HAXCMS.systemRequestBase}`, '');
        const rMethod = req.method.toLowerCase();
        if (OpenRoutes.includes(op) || HAXCMS.validateJWT(req, res)) {
          // call the method
          RoutesMap[rMethod][op](req, res, next);
        }
        else {
          res.sendStatus(403);
        }
      });
    }
  }
  // can't do this for a site context
  if (!site) {
    // catch anything called on homepage that doens't match and ensure it still goes through so that it 404s correctly
    app.get('*', function(req, res, next) {
      if (
        req.url !== '/' &&
        !req.url.startsWith('/build') &&
        !req.url.startsWith('/site.json') &&
        !req.url.startsWith('/system') &&
        !req.url.startsWith('/_sites') &&
        !req.url.startsWith('/assets') &&
        !req.url.startsWith('/wc-registry.json') &&
        !req.url.startsWith('/favicon.ico') &&
        !req.url.startsWith('/manifest.json') &&
        !req.url.startsWith('/VERSION.txt')
      ) {
        res.sendFile('/',
        {
          root: publicDir
        });
      }
      else {
        next();
      }
    });
  }
});
server.listen(port, async (err) => {
  if (err) {
    throw err;
  }
  /* eslint-disable no-console */
  console.log(`open: http://localhost:${port}`);  
});


function handleServerError(e) {
  if (e.syscall !== "listen") throw e;

  switch (e.code) {
    case "EACCES":
      console.error(`${port} requires elevated privileges`);
      process.exit(1);
      break;
    case "EADDRINUSE":
      console.error(`${port} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
}

server.on("error", handleServerError);
const logger = require("morgan");
const createError = require("http-errors");
app.use(logger("dev"));
app.use((err, req, res, _next) => {
  res.locals.title = "error";
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  res.status(err.status || 500).render("error");
});

function shutdown() {
  console.log("Shutting down Express server...");
  server.close();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.on("listening", () => console.log(`Listening on: ${port}`));
server.on("close", () => console.log("Express server closed."));
