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

import { materializedSpecScript } from "./materialized-spec.js";

export interface ComponentPackageResult {
  state: "created" | "unchanged";
  out: string;
  release: { kind: string; id: string; version: string };
}

const COMMIT = /^[a-f0-9]{40}$/;

export function assertRegularDirectory(path: string, label: string): string {
  if (!isAbsolute(path) || !existsSync(path)) throw new Error(`${label} must be an absolute directory`);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`${label} must be a regular directory`);
  return path;
}

export function assertRegularFile(path: string, label: string): string {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`${label} must be a regular file`);
  return path;
}

export function runPackagingCommand(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

export function assertCleanSourceCheckout(root: string, commit?: string): string {
  if (commit !== undefined && !COMMIT.test(commit)) throw new Error("package commit must be an exact lowercase Git SHA");
  let head: string;
  try { head = runPackagingCommand("git", ["rev-parse", "--verify", "HEAD"], root); }
  catch { throw new Error("release packaging requires a Git source checkout"); }
  if (commit !== undefined && head !== commit) throw new Error("package commit does not equal source HEAD");
  if (runPackagingCommand("git", ["status", "--porcelain=v1", "--untracked-files=all"], root) !== "") {
    throw new Error("release packaging requires a clean source checkout");
  }
  return head;
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

export function finalizePackageOutput(stage: string, out: string): ComponentPackageResult {
  const release = JSON.parse(readFileSync(assertRegularFile(join(stage, "release.json"), "generated release"), "utf8"));
  if (existsSync(out)) {
    assertRegularDirectory(out, "package output");
    const current = inventory(out); const generated = inventory(stage);
    if (current.size === 0) {
      rmdirSync(out); renameSync(stage, out);
      return { state: "created", out, release: { kind: release.kind, id: release.id, version: release.version } };
    }
    if (!sameInventory(current, generated)) throw new Error("package output differs from the canonical release");
    return { state: "unchanged", out, release: { kind: release.kind, id: release.id, version: release.version } };
  }
  renameSync(stage, out);
  return { state: "created", out, release: { kind: release.kind, id: release.id, version: release.version } };
}

export function packageComponent(input: { root: string; specRoot: string; commit: string; out: string }): ComponentPackageResult {
  const root = assertRegularDirectory(input.root, "component root");
  if (!isAbsolute(input.out)) throw new Error("package output must be absolute");
  const parent = assertRegularDirectory(dirname(input.out), "package output parent");
  assertCleanSourceCheckout(root, input.commit);
  const builder = materializedSpecScript(input.specRoot, "release-template/build-portable-release.mjs");
  const stage = mkdtempSync(join(parent, `.${basename(input.out)}.package-`));
  try {
    runPackagingCommand(process.execPath, [builder, "--commit", input.commit, "--out", stage], root);
    return finalizePackageOutput(stage, input.out);
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
}
