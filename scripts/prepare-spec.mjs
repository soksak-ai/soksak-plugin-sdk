#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_ID = "soksak-spec";
const SPEC_PACKAGE = "@soksak/soksak-spec";
const SPEC_REPOSITORY = "https://github.com/soksak-ai/soksak-spec";
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const packageArchiveName = (version) => `soksak-soksak-spec-${version}.tgz`;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: object required`);
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort(); const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label}: keys must be exactly ${wanted.join(",")}`);
  }
}

function regularFile(path, label) {
  if (!isAbsolute(path)) throw new Error(`${label}: absolute path required`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`${label}: regular file required`);
  return readFileSync(path);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

function assertRegularTree(at, prefix = "") {
  for (const entry of readdirSync(at, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(at, entry.name); const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`symbolic link in Spec package: ${relative}`);
    if (stat.isDirectory()) assertRegularTree(path, relative);
    else if (!stat.isFile() || realpathSync(path) !== path) throw new Error(`non-regular Spec package entry: ${relative}`);
  }
}

function regularTreeSha256(at, prefix = "", hash = createHash("sha256")) {
  for (const entry of readdirSync(at, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (prefix === "" && (entry.name === ".soksak-dependency.json" || entry.name === ".soksak-release.json")) continue;
    const path = join(at, entry.name); const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`symbolic link in Spec package: ${relative}`);
    if (stat.isDirectory()) regularTreeSha256(path, relative, hash);
    else if (stat.isFile() && realpathSync(path) === path) hash.update(relative).update("\0").update(readFileSync(path)).update("\0");
    else throw new Error(`non-regular Spec package entry: ${relative}`);
  }
  return prefix === "" ? hash.digest("hex") : "";
}

function parseLockReference(lockValue) {
  const lock = object(lockValue, "SDK Spec lock"); exactKeys(lock, ["reference", "schema"], "SDK Spec lock");
  if (lock.schema !== "soksak-sdk-spec-lock-v1") throw new Error("unexpected SDK Spec lock schema");
  const reference = object(lock.reference, "SDK Spec reference");
  exactKeys(reference, ["id", "kind", "sha256", "size", "version"], "SDK Spec reference");
  if (reference.kind !== "spec" || reference.id !== SPEC_ID || typeof reference.version !== "string" || !VERSION.test(reference.version) ||
      !Number.isSafeInteger(reference.size) || reference.size < 1 || !SHA256.test(reference.sha256)) {
    throw new Error("SDK Spec release reference mismatch");
  }
  return { kind: "spec", id: SPEC_ID, version: reference.version, size: reference.size, sha256: reference.sha256 };
}

export function validateArchiveEntries(verbose, names) {
  if (names.length === 0 || new Set(names).size !== names.length) throw new Error("Spec archive entries must be non-empty and unique");
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]; const type = verbose[index]?.[0]; const segments = name.split("/").filter(Boolean);
    if ((type !== "-" && type !== "d") || !name.startsWith("package/") || name.startsWith("/") ||
        segments.some((segment) => segment === "." || segment === "..")) {
      throw new Error(`unsafe Spec archive entry: ${name}`);
    }
  }
  return names;
}

export function parseSpecLock(lockValue, releaseBytes) {
  const reference = parseLockReference(lockValue);
  if (
      releaseBytes.length !== reference.size || sha256(releaseBytes) !== reference.sha256) {
    throw new Error("SDK Spec release reference mismatch");
  }
  let release;
  try { release = object(JSON.parse(releaseBytes.toString("utf8")), "Spec release"); }
  catch (error) { throw new Error(`invalid Spec release JSON: ${error.message}`); }
  exactKeys(release, ["artifacts", "evidence", "id", "kind", "manifest", "source", "version"], "Spec release");
  if (release.kind !== "spec" || release.id !== SPEC_ID || release.version !== reference.version) throw new Error("SDK Spec release identity mismatch");
  const source = object(release.source, "Spec release source"); exactKeys(source, ["commit", "repository"], "Spec release source");
  if (source.repository !== SPEC_REPOSITORY || !COMMIT.test(source.commit)) throw new Error("SDK Spec release source mismatch");
  if (!Array.isArray(release.artifacts) || release.artifacts.length !== 1) throw new Error("SDK Spec release requires one artifact");
  const artifact = object(release.artifacts[0], "Spec release artifact");
  exactKeys(artifact, ["file", "format", "manifest", "sha256", "size", "target"], "Spec release artifact");
  if (artifact.target !== "any" || artifact.format !== "tgz" || artifact.manifest !== "spec.json" ||
      artifact.file !== packageArchiveName(reference.version) || !Number.isSafeInteger(artifact.size) || artifact.size < 1 || !SHA256.test(artifact.sha256)) {
    throw new Error("SDK Spec release artifact mismatch");
  }
  return {
    reference: { kind: "spec", id: SPEC_ID, version: reference.version, size: reference.size, sha256: reference.sha256 },
    source: { repository: source.repository, commit: source.commit },
    artifact: { target: "any", file: artifact.file, size: artifact.size, sha256: artifact.sha256, format: "tgz", manifest: "spec.json" },
    package: { name: SPEC_PACKAGE, version: reference.version },
  };
}

function markerFor(resolved, treeSha256) {
  return {
    release: resolved.reference,
    artifactSha256: resolved.artifact.sha256,
    sourceCommit: resolved.source.commit,
    treeSha256,
  };
}

function sameMarker(destination, marker, releaseBytes) {
  const path = join(destination, ".soksak-dependency.json");
  if (!existsSync(path)) return false;
  try {
    return JSON.stringify(JSON.parse(regularFile(path, "Spec dependency marker"))) === JSON.stringify(marker) &&
      regularTreeSha256(destination) === marker.treeSha256 &&
      regularFile(join(destination, ".soksak-release.json"), "Spec release document").equals(releaseBytes);
  }
  catch { return false; }
}

export function readPreparedSpecDependency({ root, lock }) {
  try {
    if (!isAbsolute(root) || !existsSync(root) || lstatSync(root).isSymbolicLink() || realpathSync(root) !== root) return null;
    const lockValue = JSON.parse(regularFile(lock, "SDK Spec lock"));
    const reference = parseLockReference(lockValue);
    const destination = join(root, ".dependencies", "soksak-spec");
    if (!existsSync(destination) || lstatSync(destination).isSymbolicLink() || realpathSync(destination) !== destination) return null;
    const marker = JSON.parse(regularFile(join(destination, ".soksak-dependency.json"), "Spec dependency marker"));
    exactKeys(marker, ["artifactSha256", "release", "sourceCommit", "treeSha256"], "Spec dependency marker");
    if (JSON.stringify(marker.release) !== JSON.stringify(reference) || !SHA256.test(marker.artifactSha256) ||
        !COMMIT.test(marker.sourceCommit) || !SHA256.test(marker.treeSha256)) return null;
    assertRegularTree(destination);
    if (regularTreeSha256(destination) !== marker.treeSha256) return null;
    const releaseBytes = regularFile(join(destination, ".soksak-release.json"), "Spec release document");
    const resolved = parseSpecLock(lockValue, releaseBytes);
    if (resolved.artifact.sha256 !== marker.artifactSha256 || resolved.source.commit !== marker.sourceCommit) return null;
    const pkg = JSON.parse(regularFile(join(destination, "package.json"), "Spec package manifest"));
    if (pkg.name !== SPEC_PACKAGE || pkg.version !== reference.version) return null;
    return { destination, ...marker };
  } catch { return null; }
}

export async function prepareSpecDependency({ root, lock, manifest, artifact }) {
  if (!isAbsolute(root) || !existsSync(root) || lstatSync(root).isSymbolicLink() || realpathSync(root) !== root) {
    throw new Error("SDK root must be an absolute regular directory");
  }
  const releaseBytes = regularFile(manifest, "Spec release");
  const resolved = parseSpecLock(JSON.parse(regularFile(lock, "SDK Spec lock")), releaseBytes);
  const artifactBytes = regularFile(artifact, "Spec artifact");
  if (artifactBytes.length !== resolved.artifact.size || sha256(artifactBytes) !== resolved.artifact.sha256) {
    throw new Error("Spec artifact SHA-256 or size mismatch");
  }
  const dependencies = join(root, ".dependencies"); mkdirSync(dependencies, { recursive: true });
  const destination = join(dependencies, "soksak-spec");
  const stage = mkdtempSync(join(dependencies, ".prepare-")); const unpack = join(stage, "unpack"); mkdirSync(unpack);
  try {
    const verbose = run("tar", ["-tvzf", artifact], root).split("\n").filter(Boolean);
    const names = run("tar", ["-tzf", artifact], root).split("\n").filter(Boolean);
    validateArchiveEntries(verbose, names);
    run("tar", ["-xzf", artifact, "-C", unpack], root);
    const candidate = join(unpack, "package"); assertRegularTree(candidate);
    const pkg = JSON.parse(regularFile(join(candidate, "package.json"), "Spec package manifest"));
    if (pkg.name !== SPEC_PACKAGE || pkg.version !== resolved.reference.version) throw new Error("Spec package identity mismatch");
    run(process.execPath, [join(candidate, "bin/validate.mjs"), "release", manifest], root);
    const marker = markerFor(resolved, regularTreeSha256(candidate));
    if (existsSync(destination) && sameMarker(destination, marker, releaseBytes)) return { destination, ...marker };
    writeFileSync(join(candidate, ".soksak-release.json"), releaseBytes, { flag: "wx" });
    writeFileSync(join(candidate, ".soksak-dependency.json"), `${JSON.stringify(marker, null, 2)}\n`, { flag: "wx" });
    if (existsSync(destination)) {
      const previous = join(dependencies, `.previous-${process.pid}`); renameSync(destination, previous);
      try { renameSync(candidate, destination); rmSync(previous, { recursive: true, force: true }); }
      catch (error) { if (!existsSync(destination) && existsSync(previous)) renameSync(previous, destination); throw error; }
    } else renameSync(candidate, destination);
    return { destination, ...marker };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

export function parseArgs(argv) {
  if (argv.length === 0) return {};
  if (argv.length !== 4) throw new Error("--manifest and --artifact must be supplied together");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if ((key !== "--manifest" && key !== "--artifact") || values.has(key) || !isAbsolute(value)) throw new Error("usage: prepare-spec.mjs [--manifest <absolute> --artifact <absolute>]");
    values.set(key, value);
  }
  if (!values.has("--manifest") || !values.has("--artifact")) throw new Error("--manifest and --artifact must be supplied together");
  return { manifest: values.get("--manifest"), artifact: values.get("--artifact") };
}

async function fetchBytes(url, label) {
  let current = url;
  for (let count = 0; count <= 5; count += 1) {
    const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location"); if (!location) throw new Error(`${label}: redirect without location`);
      const next = new URL(location, current);
      if (next.protocol !== "https:" || (next.hostname !== "github.com" && !next.hostname.endsWith(".githubusercontent.com"))) throw new Error(`${label}: disallowed redirect`);
      current = next.toString(); continue;
    }
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
    const content = Buffer.from(await response.arrayBuffer());
    if (content.length > MAX_DOWNLOAD_BYTES) throw new Error(`${label}: size exceeds limit`);
    return content;
  }
  throw new Error(`${label}: too many redirects`);
}

export async function prepareSpec(argv = process.argv.slice(2)) {
  const options = parseArgs(argv); const lockPath = join(sdkRoot, "sdk-spec.lock.json");
  if (!options.manifest) {
    const prepared = readPreparedSpecDependency({ root: realpathSync(sdkRoot), lock: lockPath });
    if (prepared) return prepared;
  }
  const lock = JSON.parse(regularFile(lockPath, "SDK Spec lock")); const reference = lock.reference;
  const releaseURL = `https://github.com/soksak-ai/soksak-spec/releases/download/v${reference.version}/release.json`;
  const manifestBytes = options.manifest ? regularFile(options.manifest, "Spec release") : await fetchBytes(releaseURL, "Spec release");
  const resolved = parseSpecLock(lock, manifestBytes);
  const artifactURL = `https://github.com/soksak-ai/soksak-spec/releases/download/v${reference.version}/${resolved.artifact.file}`;
  const artifactBytes = options.artifact ? regularFile(options.artifact, "Spec artifact") : await fetchBytes(artifactURL, "Spec artifact");
  const stage = mkdtempSync(join(realpathSync(sdkRoot), ".spec-input-"));
  try {
    const manifest = join(stage, "release.json"); const artifact = join(stage, resolved.artifact.file);
    writeFileSync(manifest, manifestBytes); writeFileSync(artifact, artifactBytes);
    return await prepareSpecDependency({ root: realpathSync(sdkRoot), lock: lockPath, manifest, artifact });
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await prepareSpec())}\n`); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
