import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneSource = path.join(root, ".next", "standalone");
const staticSource = path.join(root, ".next", "static");
const publicSource = path.join(root, "public");
const outputRoot = path.join(root, "dist-desktop");
const nextOutput = path.join(outputRoot, "next", "standalone");

function requirePath(target, message) {
  if (!existsSync(target)) {
    console.error(message);
    process.exit(1);
  }
}

requirePath(standaloneSource, "Missing .next/standalone. Run npm run build:next first.");
requirePath(path.join(standaloneSource, "server.js"), "Missing standalone server.js.");
requirePath(staticSource, "Missing .next/static. Run npm run build:next first.");

rmSync(path.join(outputRoot, "next"), { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

cpSync(standaloneSource, nextOutput, { recursive: true });
cpSync(staticSource, path.join(nextOutput, ".next", "static"), { recursive: true });

if (existsSync(publicSource)) {
  cpSync(publicSource, path.join(nextOutput, "public"), { recursive: true });
}

const sharpNativeDir = path.join(nextOutput, "node_modules", "@img", "sharp-win32-x64", "lib");
const rootSharpNativeDir = path.join(root, "node_modules", "@img", "sharp-win32-x64", "lib");
if (existsSync(rootSharpNativeDir) && existsSync(sharpNativeDir)) {
  for (const entry of readdirSync(rootSharpNativeDir)) {
    if (entry.toLowerCase().endsWith(".dll")) {
      cpSync(path.join(rootSharpNativeDir, entry), path.join(sharpNativeDir, entry));
    }
  }
}

writeFileSync(
  path.join(outputRoot, "PACKAGED_NEXT_READY.txt"),
  `Poster Lab Pro packaged Next payload prepared at ${new Date().toISOString()}\n`,
);

console.log(`Prepared Electron Next payload: ${path.relative(root, nextOutput)}`);
