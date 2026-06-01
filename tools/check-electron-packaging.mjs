import { existsSync, readFileSync } from "node:fs";

const issues = [];

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required file`);
    return "";
  }
}

const pkg = read("package.json");
const nextConfig = read("next.config.mjs");
const main = read("electron/main.cjs");
const prepare = read("tools/prepare-electron-dist.mjs");
const mac = read("tools/pack-electron-mac.mjs");
const portable = read("tools/pack-electron-portable.mjs");
const uploadRoute = read("app/uploads/[...path]/route.ts");
const localBinaryStore = read("src/assets/local-binary-store.ts");
const roadmap = read("ROADMAP.md");
const decisions = read("DECISIONS.md");
const testing = read("TESTING.md");
const desktopTesting = read("DESKTOP_TESTING.md");

for (const token of [
  '"desktop:prepare"',
  '"desktop:pack"',
  '"electron-packaging:check"',
  "tools/pack-electron-portable.mjs",
]) {
  if (!pkg.includes(token)) issues.push(`package.json: missing ${token}`);
}

if (!nextConfig.includes('output: "standalone"')) {
  issues.push("next.config.mjs: missing standalone output");
}

for (const [file, source] of [
  ["app/uploads/[...path]/route.ts", uploadRoute],
  ["src/assets/local-binary-store.ts", localBinaryStore],
]) {
  if (!source.includes("turbopackIgnore: true")) {
    issues.push(`${file}: missing Turbopack trace guard around runtime upload directory fallback`);
  }
}

for (const token of [
  "usesPackagedNext",
  "packagedNextServerPath",
  "packagedNextEnvironment",
  "spawnPackagedNext",
  "ELECTRON_RUN_AS_NODE",
  "POSTER_LAB_PACKAGED_NEXT_DIR",
  "process.resourcesPath",
  "sharp-libvips-win32-x64",
]) {
  if (!main.includes(token)) issues.push(`electron/main.cjs: missing ${token}`);
}

for (const token of [".next", "standalone", ".next/static", "public", "PACKAGED_NEXT_READY"]) {
  if (!prepare.includes(token)) issues.push(`tools/prepare-electron-dist.mjs: missing ${token}`);
}

if (!prepare.includes(".dll")) {
  issues.push("tools/prepare-electron-dist.mjs: missing sharp libvips DLL colocation");
}

for (const token of ["release", "win-unpacked", "productName", "resources", "POSTER_LAB_PORTABLE_READY"]) {
  if (!portable.includes(token)) issues.push(`tools/pack-electron-portable.mjs: missing ${token}`);
}

for (const token of ["CFBundleShortVersionString", "CFBundleVersion", "pkg.version", "POSTER_LAB_MAC_READY"]) {
  if (!mac.includes(token)) issues.push(`tools/pack-electron-mac.mjs: missing ${token}`);
}

for (const [file, source] of [
  ["ROADMAP.md", roadmap],
  ["DECISIONS.md", decisions],
  ["TESTING.md", testing],
  ["DESKTOP_TESTING.md", desktopTesting],
]) {
  if (!source.includes("Electron Packaging")) {
    issues.push(`${file}: missing Electron Packaging update`);
  }
}

const shouldCheckWindowsSharpAssets = process.platform === "win32" || existsSync("release/win-unpacked");

if (existsSync("dist-desktop/next/standalone")) {
  for (const target of [
    "dist-desktop/next/standalone/server.js",
    "dist-desktop/next/standalone/.next/static",
  ]) {
    if (!existsSync(target)) issues.push(`${target}: missing prepared package asset`);
  }

  if (shouldCheckWindowsSharpAssets) {
    for (const target of [
      "dist-desktop/next/standalone/node_modules/@img/sharp-win32-x64/lib/libvips-42.dll",
      "dist-desktop/next/standalone/node_modules/@img/sharp-win32-x64/lib/libvips-cpp-8.17.3.dll",
    ]) {
      if (!existsSync(target)) issues.push(`${target}: missing prepared package asset`);
    }
  }
}

if (existsSync("release/win-unpacked")) {
  for (const target of [
    "release/win-unpacked/Poster Lab Pro.exe",
    "release/win-unpacked/resources/app/package.json",
    "release/win-unpacked/resources/app/electron/main.cjs",
    "release/win-unpacked/resources/next/standalone/server.js",
  ]) {
    if (!existsSync(target)) issues.push(`${target}: missing portable app asset`);
  }
}

if (issues.length > 0) {
  console.error("Electron packaging checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Electron packaging checks passed.");
