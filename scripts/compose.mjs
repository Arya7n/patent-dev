import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

const localAppData = process.env.LOCALAPPDATA ?? "";
const bundled = join(
  localAppData,
  "Programs",
  "DockerDesktop",
  "resources",
  "bin",
);

const env = { ...process.env };
if (existsSync(bundled)) {
  env.PATH = `${bundled}${delimiter}${env.PATH ?? ""}`;
}

const result = spawnSync("docker", ["compose", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
