import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const tweaksDir = path.join(process.env.APPDATA, "codex-plusplus", "tweaks");

const TWEAKS = [
  { id: "co.bennett.custom-keyboard-shortcuts", repo: "b-nnett/codex-plusplus-keyboard-shortcuts" },
  { id: "co.bennett.ui-improvements", repo: "b-nnett/codex-plusplus-bennett-ui" },
];

function findRoot(dir) {
  if (fs.existsSync(path.join(dir, "manifest.json"))) return dir;
  for (const name of fs.readdirSync(dir)) {
    const child = path.join(dir, name);
    if (!fs.statSync(child).isDirectory()) continue;
    const found = findRoot(child);
    if (found) return found;
  }
  return null;
}

for (const tweak of TWEAKS) {
  const target = path.join(tweaksDir, tweak.id);
  if (fs.existsSync(target)) {
    console.log(`[skip] Already installed: ${tweak.id}`);
    continue;
  }

  try {
    console.log(`[fetch] ${tweak.repo} releases...`);
    const res = await fetch(`https://api.github.com/repos/${tweak.repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "codex-plusplus-installer" },
    });
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    const release = await res.json();
    console.log(`[download] ${release.tag_name}...`);

    const tarRes = await fetch(release.tarball_url, { redirect: "follow" });
    if (!tarRes.ok) throw new Error(`Download failed: ${tarRes.status}`);
    const buffer = Buffer.from(await tarRes.arrayBuffer());

    const work = fs.mkdtempSync(path.join(os.tmpdir(), "codexpp-"));
    const archive = path.join(work, "tweak.tgz");
    const extractDir = path.join(work, "extract");

    try {
      fs.writeFileSync(archive, buffer);
      fs.mkdirSync(extractDir, { recursive: true });
      execSync(`tar xzf "${archive}" -C "${extractDir}"`, { stdio: "pipe" });

      const source = findRoot(extractDir) || findRoot(work);
      if (!source) throw new Error("No manifest.json found in release");

      fs.cpSync(source, target, { recursive: true });
      console.log(`[done] Installed: ${tweak.id}`);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  } catch (e) {
    console.log(`[error] ${tweak.id}: ${e.message}`);
  }
}

console.log("\nInstalled tweaks:");
for (const name of fs.readdirSync(tweaksDir)) {
  const mf = path.join(tweaksDir, name, "manifest.json");
  if (fs.existsSync(mf)) {
    const m = JSON.parse(fs.readFileSync(mf, "utf8"));
    console.log(`  - ${m.name} v${m.version}`);
  }
}
