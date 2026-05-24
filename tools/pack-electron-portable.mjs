import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const productName = "Poster Lab Pro";
const electronDist = path.dirname(electronPath);
const outputDir = path.join(root, "release", "win-unpacked");
const resourcesDir = path.join(outputDir, "resources");
const appDir = path.join(resourcesDir, "app");
const nextPayload = path.join(root, "dist-desktop", "next");

function requirePath(target, message) {
  if (!existsSync(target)) {
    console.error(message);
    process.exit(1);
  }
}

requirePath(path.join(nextPayload, "standalone", "server.js"), "Missing prepared Next payload. Run npm run desktop:prepare first.");
requirePath(path.join(electronDist, "electron.exe"), "Missing Electron runtime. Run npm install first.");

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(path.dirname(outputDir), { recursive: true });

cpSync(electronDist, outputDir, { recursive: true });
renameSync(path.join(outputDir, "electron.exe"), path.join(outputDir, `${productName}.exe`));

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
  path.join(outputDir, "POSTER_LAB_PORTABLE_READY.txt"),
  `Poster Lab Pro portable desktop build prepared at ${new Date().toISOString()}\n`,
);

console.log(`Prepared portable Electron app: ${path.relative(root, path.join(outputDir, `${productName}.exe`))}`);
