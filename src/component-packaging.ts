import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";

export interface ComponentPackageResult {
  state: "created" | "unchanged";
  out: string;
  release: { kind: string; id: string; version: string };
}

const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function regularDirectory(path: string, label: string): string {
  if (!isAbsolute(path) || !existsSync(path)) throw new Error(`${label} must be an absolute directory`);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`${label} must be a regular directory`);
  return path;
}

function regularFile(path: string, label: string): string {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`${label} must be a regular file`);
  return path;
}

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

function verifySource(root: string, commit: string): void {
  if (!COMMIT.test(commit)) throw new Error("package commit must be an exact lowercase Git SHA");
  let head: string;
  try { head = run("git", ["rev-parse", "--verify", "HEAD"], root); }
  catch { throw new Error("release packaging requires a Git source checkout"); }
  if (head !== commit) throw new Error("package commit does not equal source HEAD");
  if (run("git", ["status", "--porcelain=v1", "--untracked-files=all"], root) !== "") {
    throw new Error("release packaging requires a clean source checkout");
  }
}

function verifySpec(specRoot: string): string {
  const pkg = JSON.parse(readFileSync(regularFile(join(specRoot, "package.json"), "Spec package manifest"), "utf8"));
  const marker = JSON.parse(readFileSync(regularFile(join(specRoot, ".soksak-dependency.json"), "Spec release marker"), "utf8"));
  if (
    pkg.name !== "@soksak/soksak-spec" || typeof pkg.version !== "string" ||
    marker?.release?.kind !== "spec" || marker.release.id !== "soksak-spec" || marker.release.version !== pkg.version ||
    !SHA256.test(marker.release.sha256) || !SHA256.test(marker.artifactSha256) || !COMMIT.test(marker.sourceCommit)
  ) throw new Error("materialized Spec release identity is invalid");
  return regularFile(join(specRoot, "release-template/build-portable-release.mjs"), "Spec package builder");
}

function inventory(root: string, at = root, prefix = "", files = new Map<string, string>()): Map<string, string> {
  for (const entry of readdirSync(at, { withFileTypes: true })) {
    const path = join(at, entry.name); const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`package output contains a symbolic link: ${relative}`);
    if (stat.isDirectory()) inventory(root, path, relative, files);
    else if (stat.isFile() && realpathSync(path) === path) {
      files.set(relative, createHash("sha256").update(readFileSync(path)).digest("hex"));
    } else throw new Error(`package output contains a non-regular entry: ${relative}`);
  }
  return files;
}

function sameInventory(left: Map<string, string>, right: Map<string, string>): boolean {
  if (left.size !== right.size) return false;
  for (const [name, digest] of left) if (right.get(name) !== digest) return false;
  return true;
}

export function packageComponent(input: { root: string; specRoot: string; commit: string; out: string }): ComponentPackageResult {
  const root = regularDirectory(input.root, "component root");
  const specRoot = regularDirectory(input.specRoot, "Spec root");
  if (!isAbsolute(input.out)) throw new Error("package output must be absolute");
  const parent = regularDirectory(dirname(input.out), "package output parent");
  verifySource(root, input.commit);
  const builder = verifySpec(specRoot);
  const stage = mkdtempSync(join(parent, `.${basename(input.out)}.package-`));
  try {
    run(process.execPath, [builder, "--commit", input.commit, "--out", stage], root);
    const release = JSON.parse(readFileSync(regularFile(join(stage, "release.json"), "generated release"), "utf8"));
    if (existsSync(input.out)) {
      regularDirectory(input.out, "package output");
      const current = inventory(input.out); const generated = inventory(stage);
      if (current.size === 0) {
        rmdirSync(input.out); renameSync(stage, input.out);
        return { state: "created", out: input.out, release: { kind: release.kind, id: release.id, version: release.version } };
      }
      if (!sameInventory(current, generated)) throw new Error("package output differs from the canonical release");
      return { state: "unchanged", out: input.out, release: { kind: release.kind, id: release.id, version: release.version } };
    }
    renameSync(stage, input.out);
    return { state: "created", out: input.out, release: { kind: release.kind, id: release.id, version: release.version } };
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
}
