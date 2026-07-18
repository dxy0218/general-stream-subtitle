import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";

const root = process.cwd();
const releaseDir = path.join(root, ".release");
if (!fs.existsSync(releaseDir)) throw new Error("Missing staged release archive");

const parts = fs.readdirSync(releaseDir)
  .filter((name) => /^project\.b64\.part\d+$/.test(name))
  .sort();
if (!parts.length) throw new Error("No release archive parts found");

const encoded = parts.map((name) => fs.readFileSync(path.join(releaseDir, name), "utf8")).join("");
const zipPath = "/tmp/gss-v040.zip";
const unpackPath = "/tmp/gss-v040-project";
fs.writeFileSync(zipPath, Buffer.from(encoded, "base64"));
fs.rmSync(unpackPath, { recursive: true, force: true });
fs.mkdirSync(unpackPath, { recursive: true });
execFileSync("unzip", ["-q", zipPath, "-d", unpackPath], { stdio: "inherit" });

for (const entry of fs.readdirSync(root)) {
  if (entry === ".git") continue;
  fs.rmSync(path.join(root, entry), { recursive: true, force: true });
}
for (const entry of fs.readdirSync(unpackPath)) {
  fs.cpSync(path.join(unpackPath, entry), path.join(root, entry), { recursive: true });
}

execSync("npm run build", { stdio: "inherit" });
execSync("npm test", { stdio: "inherit" });
execSync('git config user.name "github-actions[bot]"');
execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
execSync("git add -A", { stdio: "inherit" });
execSync('git commit -m "Release General Stream Subtitle v0.4.0"', { stdio: "inherit" });
execSync("git push", { stdio: "inherit" });
