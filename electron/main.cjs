const { app, BrowserWindow, Menu, dialog, shell, session } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const APP_NAME = "Poster Lab Pro";
const DEFAULT_PORT = 3000;
const WORKSPACE_HEALTH_PATH = "/api/workspaces/workspace-pizza-kitchen";
const SHELL_HEALTH_PATH = "/";
const PACKAGED_ICON_PATH = path.join(process.resourcesPath || "", "poster-lab-pro.png");

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

function packagedNodeRuntimePath() {
  return process.execPath;
}

function withNodeEnvProxy(env) {
  const existingOptions = env.NODE_OPTIONS || "";
  const nodeOptions = existingOptions.includes("--use-env-proxy")
    ? existingOptions
    : `${existingOptions} --use-env-proxy`.trim();
  return {
    ...env,
    NODE_OPTIONS: nodeOptions,
  };
}

function mergeNoProxy(existing) {
  const defaults = ["127.0.0.1", "localhost", "::1"];
  const parts = String(existing || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set([...parts, ...defaults])).join(",");
}

function proxyEnvironmentFromResolvedProxy(resolvedProxy) {
  const candidate = String(resolvedProxy || "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item && !/^DIRECT$/i.test(item));
  if (!candidate) return {};

  const match = candidate.match(/^(PROXY|HTTPS|HTTP|SOCKS|SOCKS4|SOCKS5)\s+(.+)$/i);
  if (!match) return {};

  const proxyType = match[1].toUpperCase();
  const proxyTarget = match[2].trim();
  const scheme = proxyType === "HTTPS"
    ? "https"
    : proxyType.startsWith("SOCKS")
      ? "socks"
      : "http";
  const proxyUrl = `${scheme}://${proxyTarget}`;

  return {
    HTTP_PROXY: process.env.HTTP_PROXY || process.env.http_proxy || proxyUrl,
    HTTPS_PROXY: process.env.HTTPS_PROXY || process.env.https_proxy || proxyUrl,
    NO_PROXY: mergeNoProxy(process.env.NO_PROXY || process.env.no_proxy),
  };
}

function withTimeout(promise, timeoutMs, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

async function resolveDesktopProxyEnvironment() {
  const existingProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (existingProxy) {
    return withNodeEnvProxy({
      HTTP_PROXY: process.env.HTTP_PROXY || process.env.http_proxy || existingProxy,
      HTTPS_PROXY: process.env.HTTPS_PROXY || process.env.https_proxy || existingProxy,
      NO_PROXY: mergeNoProxy(process.env.NO_PROXY || process.env.no_proxy),
    });
  }

  try {
    const resolvedProxy = await withTimeout(
      session.defaultSession.resolveProxy("https://generativelanguage.googleapis.com/v1beta/models"),
      1500,
      "",
    );
    const proxyEnv = proxyEnvironmentFromResolvedProxy(resolvedProxy);
    return Object.keys(proxyEnv).length > 0 ? withNodeEnvProxy(proxyEnv) : {};
  } catch {
    return {};
  }
}

function desktopRuntimeEnvironment() {
  const userDataPath = app.getPath("userData");
  return {
    POSTER_LAB_RUNTIME_DIR: path.join(userDataPath, "runtime"),
    POSTER_LAB_UPLOAD_DIR: path.join(userDataPath, "uploads"),
    POSTER_LAB_LOCAL_VAULT_KEY: `poster-lab-local-vault:${userDataPath}`,
  };
}

function packagedNextEnvironment(serverPath, port, extraEnv = {}) {
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
    ...desktopRuntimeEnvironment(),
    ...extraEnv,
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

function requestOk(url, timeoutMs = 1200, statusOk = (statusCode) => statusCode >= 200 && statusCode < 500) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(statusOk(response.statusCode || 0));
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
  const canReuseExistingService = !usesPackagedNext();
  for (let offset = 0; offset < 20; offset += 1) {
    const port = requestedPort + offset;
    const url = baseUrlForPort(port);
    const healthUrl = `${url}${WORKSPACE_HEALTH_PATH}`;
    if (canReuseExistingService && await requestOk(healthUrl, 500, (statusCode) => statusCode >= 200 && statusCode < 300)) {
      return { url, port, shouldSpawn: false };
    }
    if (await portAvailable(port)) {
      return { url, port, shouldSpawn: true };
    }
  }

  throw new Error("No local port is available for the desktop Next service.");
}

function spawnNextDev(port, extraEnv = {}) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = ["run", "dev:next", "--", "--hostname", "127.0.0.1", "--port", String(port)];
  const child = spawn(npmCommand, args, {
    cwd: projectRoot(),
    env: { ...process.env, ...desktopRuntimeEnvironment(), ...extraEnv },
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

function spawnPackagedNext(port, extraEnv = {}) {
  const serverPath = packagedNextServerPath();
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Packaged Next server is missing: ${serverPath}`);
  }

  const child = spawn(packagedNodeRuntimePath(), [serverPath], {
    cwd: path.dirname(serverPath),
    env: packagedNextEnvironment(serverPath, port, extraEnv),
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

function spawnNextService(port, extraEnv = {}) {
  if (usesPackagedNext()) {
    spawnPackagedNext(port, extraEnv);
    return;
  }
  spawnNextDev(port, extraEnv);
}

async function waitForNext(url) {
  const healthUrl = `${url}${WORKSPACE_HEALTH_PATH}`;
  const shellUrl = `${url}${SHELL_HEALTH_PATH}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const shellReady = await requestOk(shellUrl, 1000, (statusCode) => statusCode >= 200 && statusCode < 300);
    const workspaceReady = await requestOk(healthUrl, 1000, (statusCode) => statusCode >= 200 && statusCode < 300);
    if (shellReady && workspaceReady) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for the local Next service.");
}

async function configureLocalSessionProxy() {
  try {
    await session.defaultSession.setProxy({
      proxyBypassRules: "<local>;127.0.0.1;localhost;::1",
    });
  } catch (error) {
    console.warn(`[desktop] Failed to configure local proxy bypass: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    title: APP_NAME,
    backgroundColor: "#f7f8fa",
    icon: PACKAGED_ICON_PATH,
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

  let loadRetryCount = 0;
  mainWindow.webContents.on("did-fail-load", (_event, _errorCode, _errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame || !String(validatedUrl || "").startsWith(url) || loadRetryCount >= 6) return;
    loadRetryCount += 1;
    const retryDelayMs = 350 * loadRetryCount;
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(url);
      }
    }, retryDelayMs);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    loadRetryCount = 0;
  });

  mainWindow.loadURL(url);
}

function installApplicationMenu() {
  const editSubmenu = [
    { role: "undo" },
    { role: "redo" },
    { type: "separator" },
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    { role: "pasteAndMatchStyle" },
    { role: "delete" },
    { role: "selectAll" },
  ];
  const template = process.platform === "darwin"
    ? [
        {
          label: APP_NAME,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
        { label: "Edit", submenu: editSubmenu },
        {
          label: "Window",
          submenu: [
            { role: "minimize" },
            { role: "zoom" },
            { type: "separator" },
            { role: "front" },
          ],
        },
      ]
    : [
        { label: "Edit", submenu: editSubmenu },
        {
          label: "View",
          submenu: [
            { role: "reload" },
            { role: "forceReload" },
            { role: "toggleDevTools" },
          ],
        },
      ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function installDockIcon() {
  if (process.platform !== "darwin" || !app.dock || !fs.existsSync(PACKAGED_ICON_PATH)) return;
  try {
    app.dock.setIcon(PACKAGED_ICON_PATH);
  } catch (error) {
    console.warn(`[desktop] Failed to set Dock icon: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function startDesktop() {
  const target = await resolveNextTarget();
  const proxyEnv = target.shouldSpawn ? await resolveDesktopProxyEnvironment() : {};
  if (target.shouldSpawn) spawnNextService(target.port, proxyEnv);
  await waitForNext(target.url);
  await configureLocalSessionProxy();
  createWindow(target.url);
}

app.setName(APP_NAME);
installApplicationMenu();
app.setPath(
  "userData",
  process.env.POSTER_LAB_DESKTOP_USER_DATA || path.join(app.getPath("appData"), APP_NAME),
);

app.whenReady().then(() => {
  installDockIcon();
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
