import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function regularFile(path: string, label: string): string {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`${label} must be a regular file`);
  return path;
}

export function materializedSpecScript(specRoot: string, relative: string): string {
  if (!isAbsolute(specRoot) || !existsSync(specRoot)) throw new Error("Spec root must be an absolute directory");
  const stat = lstatSync(specRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(specRoot) !== specRoot) throw new Error("Spec root must be a regular directory");
  const pkg = JSON.parse(readFileSync(regularFile(join(specRoot, "package.json"), "Spec package manifest"), "utf8"));
  const marker = JSON.parse(readFileSync(regularFile(join(specRoot, ".soksak-dependency.json"), "Spec release marker"), "utf8"));
  if (
    pkg.name !== "@soksak/soksak-spec" || typeof pkg.version !== "string" ||
    marker?.release?.kind !== "spec" || marker.release.id !== "soksak-spec" || marker.release.version !== pkg.version ||
    !SHA256.test(marker.release.sha256) || !SHA256.test(marker.artifactSha256) ||
    !SHA256.test(marker.treeSha256) || !COMMIT.test(marker.sourceCommit)
  ) throw new Error("materialized Spec release identity is invalid");
  return regularFile(join(specRoot, ...relative.split("/")), "Spec tooling entrypoint");
}

