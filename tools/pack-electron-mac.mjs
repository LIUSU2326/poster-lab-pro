import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const productName = "Poster Lab Pro";
const bundleId = "com.posterlab.pro";
const electronApp = path.resolve(path.dirname(electronPath), "..", "..");
const outputDir = process.env.POSTER_LAB_MAC_OUTPUT
  ? path.resolve(root, process.env.POSTER_LAB_MAC_OUTPUT)
  : path.join(root, "release", "mac");
const outputApp = path.join(outputDir, `${productName}.app`);
const contentsDir = path.join(outputApp, "Contents");
const resourcesDir = path.join(contentsDir, "Resources");
const appDir = path.join(resourcesDir, "app");
const nextPayload = path.join(root, "dist-desktop", "next");
const appIconName = "poster-lab-pro.icns";
const appIconPath = path.join(resourcesDir, appIconName);
const runtimeIconName = "poster-lab-pro.png";
const runtimeIconPath = path.join(resourcesDir, runtimeIconName);

function requirePath(target, message) {
  if (!existsSync(target)) {
    console.error(message);
    process.exit(1);
  }
}

function patchInfoPlist(filePath) {
  let plist = readFileSync(filePath, "utf8");
  const replacements = {
    CFBundleDisplayName: productName,
    CFBundleExecutable: productName,
    CFBundleIconFile: appIconName,
    CFBundleIdentifier: bundleId,
    CFBundleName: productName,
  };

  for (const [key, value] of Object.entries(replacements)) {
    plist = plist.replace(
      new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`),
      `$1${value}$3`,
    );
  }

  writeFileSync(filePath, plist, "utf8");
}

async function createMacIcon(iconPath, pngPath) {
  const sharp = (await import("sharp")).default;
  const iconSetDir = path.join(outputDir, "PosterLabPro.iconset");
  rmSync(iconSetDir, { recursive: true, force: true });
  mkdirSync(iconSetDir, { recursive: true });

  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#080808"/>
          <stop offset="1" stop-color="#232323"/>
        </linearGradient>
        <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#FFFFFF"/>
          <stop offset="1" stop-color="#9DB7FF"/>
        </linearGradient>
      </defs>
      <rect x="72" y="72" width="880" height="880" rx="220" fill="url(#bg)"/>
      <circle cx="512" cy="512" r="300" fill="none" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="28"/>
      <text x="512" y="574" text-anchor="middle"
        font-family="Inter, Arial, Helvetica, sans-serif" font-size="268" font-weight="800"
        letter-spacing="-12" fill="url(#mark)">PL</text>
    </svg>
  `);
  await sharp(svg).resize(1024, 1024).png().toFile(pngPath);

  const entries = [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024],
  ];

  for (const [fileName, size] of entries) {
    await sharp(svg).resize(size, size).png().toFile(path.join(iconSetDir, fileName));
  }
  try {
    execFileSync("iconutil", ["-c", "icns", iconSetDir, "-o", iconPath]);
  } catch (error) {
    const fallbackIcon = path.join(resourcesDir, "electron.icns");
    if (!existsSync(fallbackIcon)) throw error;
    cpSync(fallbackIcon, iconPath);
    console.warn("Fell back to the Electron app icon because iconutil rejected the generated iconset.");
  }
  rmSync(iconSetDir, { recursive: true, force: true });
}

requirePath(path.join(nextPayload, "standalone", "server.js"), "Missing prepared Next payload. Run npm run desktop:prepare first.");
requirePath(electronApp, "Missing Electron.app runtime. Run npm install and install the Electron binary first.");

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
cpSync(electronApp, outputApp, { recursive: true, verbatimSymlinks: true });

const executablePath = path.join(contentsDir, "MacOS", "Electron");
const productExecutablePath = path.join(contentsDir, "MacOS", productName);
if (existsSync(executablePath)) renameSync(executablePath, productExecutablePath);
patchInfoPlist(path.join(contentsDir, "Info.plist"));
await createMacIcon(appIconPath, runtimeIconPath);

rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
cpSync(path.join(root, "electron"), path.join(appDir, "electron"), { recursive: true });
writeFileSync(
  path.join(appDir, "package.json"),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      type: pkg.type,
      main: pkg.main,
    },
    null,
    2,
  ),
);

rmSync(path.join(resourcesDir, "next"), { recursive: true, force: true });
cpSync(nextPayload, path.join(resourcesDir, "next"), { recursive: true });

writeFileSync(
  path.join(outputDir, "POSTER_LAB_MAC_READY.txt"),
  `Poster Lab Pro macOS desktop build prepared at ${new Date().toISOString()}\n`,
);

execFileSync("codesign", ["--force", "--deep", "--sign", "-", outputApp], { stdio: "inherit" });

console.log(`Prepared macOS Electron app: ${path.relative(root, outputApp)}`);
