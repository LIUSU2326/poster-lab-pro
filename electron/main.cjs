const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const APP_NAME = "Poster Lab Pro";
const DEFAULT_PORT = 3000;
const WORKSPACE_HEALTH_PATH = "/api/workspaces/workspace-pizza-kitchen";

let mainWindow = null;
let nextProcess = null;

function projectRoot() {
  return path.resolve(__dirname, "..");
}

function usesPackagedNext() {
  const resourceServerPath = path.join(process.resourcesPath, "next", "standalone", "server.js");
  return (
    app.isPackaged ||
    process.env.POSTER_LAB_USE_PACKAGED_NEXT === "1" ||
    fs.existsSync(resourceServerPath)
  );
}

function packagedNextServerPath() {
  const resourceServerPath = path.join(process.resourcesPath, "next", "standalone", "server.js");
  const resourcesRoot = process.env.POSTER_LAB_PACKAGED_NEXT_DIR || (
    fs.existsSync(resourceServerPath) ? process.resourcesPath : path.join(projectRoot(), "dist-desktop")
  );
  return path.join(resourcesRoot, "next", "standalone", "server.js");
}

function packagedNextEnvironment(serverPath, port) {
  const standaloneRoot = path.dirname(serverPath);
  const sharpLibvipsPath = path.join(
    standaloneRoot,
    "node_modules",
    "@img",
    "sharp-libvips-win32-x64",
    "lib",
  );
  const pathValue = fs.existsSync(sharpLibvipsPath)
    ? `${sharpLibvipsPath}${path.delimiter}${process.env.PATH || ""}`
    : process.env.PATH;

  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    PATH: pathValue,
    PORT: String(port),
  };
}

function baseUrlForPort(port) {
  return `http://127.0.0.1:${port}`;
}

function requestOk(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function resolveNextTarget() {
  if (process.env.POSTER_LAB_DESKTOP_URL) {
    return {
      url: process.env.POSTER_LAB_DESKTOP_URL,
      shouldSpawn: false,
    };
  }

  const requestedPort = Number(process.env.POSTER_LAB_NEXT_PORT || DEFAULT_PORT);
  for (let offset = 0; offset < 20; offset += 1) {
    const port = requestedPort + offset;
    const url = baseUrlForPort(port);
    const healthUrl = `${url}${WORKSPACE_HEALTH_PATH}`;
    if (await requestOk(healthUrl, 500)) {
      return { url, port, shouldSpawn: false };
    }
    if (await portAvailable(port)) {
      return { url, port, shouldSpawn: true };
    }
  }

  throw new Error("No local port is available for the desktop Next service.");
}

function spawnNextDev(port) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = ["run", "dev:next", "--", "--hostname", "127.0.0.1", "--port", String(port)];
  const child = spawn(npmCommand, args, {
    cwd: projectRoot(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
  child.once("exit", (code, signal) => {
    if (nextProcess === child) nextProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("poster-lab:next-exit", { code, signal });
    }
  });

  nextProcess = child;
}

function spawnPackagedNext(port) {
  const serverPath = packagedNextServerPath();
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Packaged Next server is missing: ${serverPath}`);
  }

  const child = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: packagedNextEnvironment(serverPath, port),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
  child.once("exit", (code, signal) => {
    if (nextProcess === child) nextProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("poster-lab:next-exit", { code, signal });
    }
  });

  nextProcess = child;
}

function spawnNextService(port) {
  if (usesPackagedNext()) {
    spawnPackagedNext(port);
    return;
  }
  spawnNextDev(port);
}

async function waitForNext(url) {
  const healthUrl = `${url}${WORKSPACE_HEALTH_PATH}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await requestOk(healthUrl, 1000)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for the local Next service.");
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    title: APP_NAME,
    backgroundColor: "#f7f8fa",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (!targetUrl.startsWith(url)) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  mainWindow.loadURL(url);
}

async function startDesktop() {
  const target = await resolveNextTarget();
  if (target.shouldSpawn) spawnNextService(target.port);
  await waitForNext(target.url);
  createWindow(target.url);
}

app.setName(APP_NAME);
Menu.setApplicationMenu(null);
app.setPath(
  "userData",
  process.env.POSTER_LAB_DESKTOP_USER_DATA || path.join(app.getPath("appData"), APP_NAME),
);

app.whenReady().then(() => {
  startDesktop().catch((error) => {
    dialog.showErrorBox(APP_NAME, error instanceof Error ? error.message : String(error));
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && mainWindow) mainWindow.show();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextProcess && !nextProcess.killed) {
    nextProcess.kill();
  }
});
