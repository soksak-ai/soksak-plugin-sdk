import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function regularFile(path: string, label: string): string {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`${label} must be a regular file`);
  return path;
}

function treeSha256(root: string, at = root, prefix = "", hash = createHash("sha256")): string {
  for (const entry of readdirSync(at, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (prefix === "" && (entry.name === ".soksak-dependency.json" || entry.name === ".soksak-release.json")) continue;
    const path = join(at, entry.name); const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`materialized Spec contains a symbolic link: ${relative}`);
    if (stat.isDirectory()) treeSha256(root, path, relative, hash);
    else if (stat.isFile() && realpathSync(path) === path) hash.update(relative).update("\0").update(readFileSync(path)).update("\0");
    else throw new Error(`materialized Spec contains a non-regular entry: ${relative}`);
  }
  return prefix === "" ? hash.digest("hex") : "";
}

function metadata(specRoot: string): { marker: Record<string, any>; pkg: Record<string, any> } {
  if (!isAbsolute(specRoot) || !existsSync(specRoot)) throw new Error("Spec root must be an absolute directory");
  const stat = lstatSync(specRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(specRoot) !== specRoot) throw new Error("Spec root must be a regular directory");
  const pkg = JSON.parse(readFileSync(regularFile(join(specRoot, "package.json"), "Spec package manifest"), "utf8"));
  const marker = JSON.parse(readFileSync(regularFile(join(specRoot, ".soksak-dependency.json"), "Spec release marker"), "utf8"));
  if (
    pkg.name !== "@soksak/soksak-spec" || typeof pkg.version !== "string" ||
    marker?.release?.kind !== "spec" || marker.release.id !== "soksak-spec" || marker.release.version !== pkg.version ||
    !SHA256.test(marker.release.sha256) || !SHA256.test(marker.artifactSha256) ||
    !SHA256.test(marker.treeSha256) || !COMMIT.test(marker.sourceCommit) || treeSha256(specRoot) !== marker.treeSha256
  ) throw new Error("materialized Spec release identity is invalid");
  return { marker, pkg };
}

export function materializedSpecRelease(specRoot: string): {
  path: string; document: Record<string, unknown>; bytes: Buffer; reference: Record<string, unknown>;
} {
  const { marker } = metadata(specRoot);
  const path = regularFile(join(specRoot, ".soksak-release.json"), "Spec release document");
  const bytes = readFileSync(path);
  if (bytes.length !== marker.release.size || createHash("sha256").update(bytes).digest("hex") !== marker.release.sha256) {
    throw new Error("materialized Spec release document differs from its exact reference");
  }
  const document = JSON.parse(bytes.toString("utf8"));
  if (document.kind !== "spec" || document.id !== "soksak-spec" || document.version !== marker.release.version) {
    throw new Error("materialized Spec release document identity is invalid");
  }
  return { path, document, bytes, reference: marker.release };
}

export function materializedSpecScript(specRoot: string, relative: string): string {
  metadata(specRoot);
  return regularFile(join(specRoot, ...relative.split("/")), "Spec tooling entrypoint");
}
