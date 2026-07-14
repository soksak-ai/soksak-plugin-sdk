#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
const SHA256_RE = /^[a-f0-9]{64}$/;
const COMMIT_RE = /^[a-f0-9]{40}$/;
const STRICT_SEMVER_RE = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const DEPENDENCY_LOCK_SCHEMA = "soksak-platform-dependency-lock@0.0.1";
const PLATFORM_RELEASE_SCHEMA = "soksak-spec-platform-release@0.0.1";
const PLATFORM_SPEC_ID = "soksak-spec";
const PLATFORM_SPEC_PACKAGE = "@soksak-ai/plugin-spec";
const PLATFORM_SPEC_REPOSITORY = "https://github.com/soksak-ai/soksak-spec";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function object(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}: object required`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label}: keys must be exactly ${wanted.join(",")}`);
  }
}

function canonicalReleaseAsset(url, expected) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const path = parsed.pathname.split("/").filter(Boolean);
  return parsed.protocol === "https:" &&
    parsed.hostname === "github.com" &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.search === "" &&
    parsed.hash === "" &&
    parsed.toString() === url &&
    path.length === 6 &&
    path[0] === expected.owner &&
    path[1] === expected.repository &&
    path[2] === "releases" &&
    path[3] === "download" &&
    path[4] === expected.tag &&
    path[5] === expected.asset;
}

function strictSemver(value, label) {
  if (typeof value !== "string" || value.length > 256 || !STRICT_SEMVER_RE.test(value)) {
    throw new Error(`${label}: strict SemVer required`);
  }
  return value;
}

function packageArchiveName(name, version) {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

export function parseArgs(argv) {
  if (argv.length === 0) return {};
  if (argv.length !== 4) {
    throw new Error("--manifest and --artifact must be supplied together");
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if ((flag !== "--manifest" && flag !== "--artifact") || values.has(flag)) {
      throw new Error("usage: prepare-spec.mjs [--manifest <absolute> --artifact <absolute>]");
    }
    if (!isAbsolute(value)) throw new Error(`${flag} path must be absolute`);
    values.set(flag, value);
  }
  if (!values.has("--manifest") || !values.has("--artifact")) {
    throw new Error("--manifest and --artifact must be supplied together");
  }
  return { manifest: values.get("--manifest"), artifact: values.get("--artifact") };
}

export function resolveLockedSpec(lockValue, manifestBytes) {
  const lock = object(lockValue, "dependency lock");
  exactKeys(lock, ["dependencies", "schema"], "dependency lock");
  if (lock.schema !== DEPENDENCY_LOCK_SCHEMA) {
    throw new Error("unexpected dependency lock schema");
  }
  if (!Array.isArray(lock.dependencies) || lock.dependencies.length !== 1) {
    throw new Error("dependency lock must contain exactly one spec dependency");
  }
  const dependency = object(lock.dependencies[0], "dependency");
  exactKeys(dependency, ["id", "kind", "manifest", "source", "version"], "dependency");
  if (dependency.kind !== "spec" || dependency.id !== PLATFORM_SPEC_ID) {
    throw new Error("unexpected platform dependency identity");
  }
  const dependencyVersion = strictSemver(dependency.version, "dependency.version");
  const source = object(dependency.source, "dependency.source");
  exactKeys(source, ["commit", "repository"], "dependency.source");
  if (source.repository !== PLATFORM_SPEC_REPOSITORY || !COMMIT_RE.test(source.commit)) {
    throw new Error("unexpected dependency source");
  }
  const manifestReference = object(dependency.manifest, "dependency.manifest");
  exactKeys(manifestReference, ["sha256", "url"], "dependency.manifest");
  if (!SHA256_RE.test(manifestReference.sha256)) throw new Error("invalid manifest SHA-256");
  if (sha256(manifestBytes) !== manifestReference.sha256) {
    throw new Error("manifest SHA-256 mismatch");
  }

  let manifest;
  try {
    manifest = object(JSON.parse(manifestBytes.toString("utf8")), "spec manifest");
  } catch (error) {
    throw new Error(`invalid spec manifest JSON: ${error.message}`);
  }
  if (
    manifest.spec !== PLATFORM_RELEASE_SCHEMA ||
    manifest.kind !== dependency.kind ||
    manifest.id !== dependency.id ||
    manifest.version !== dependencyVersion ||
    manifest.releaseTag !== `${dependency.id}-v${dependencyVersion}`
  ) {
    throw new Error("unexpected spec manifest identity");
  }
  if (
    manifest.source?.repository !== source.repository ||
    manifest.source?.commit !== source.commit
  ) {
    throw new Error("unexpected spec source commit");
  }
  if (!canonicalReleaseAsset(manifestReference.url, {
    owner: "soksak-ai",
    repository: "soksak-spec",
    tag: manifest.releaseTag,
    asset: "soksak-spec-release.json",
  })) {
    throw new Error("unexpected spec manifest URL");
  }
  if (!Array.isArray(manifest.dependencies) || manifest.dependencies.length !== 0) {
    throw new Error("spec manifest dependency closure must be empty");
  }
  if (!Array.isArray(manifest.packages)) throw new Error("spec package inventory required");
  const matches = manifest.packages.filter(
    (item) => item?.ecosystem === "javascript" && item?.name === PLATFORM_SPEC_PACKAGE,
  );
  if (matches.length !== 1) throw new Error("exactly one plugin-spec package required");
  const packageEntry = matches[0];
  if (packageEntry.version !== dependencyVersion || packageEntry.artifact?.format !== "tgz") {
    throw new Error("unexpected plugin-spec package version or format");
  }
  if (!SHA256_RE.test(packageEntry.artifact.sha256)) throw new Error("invalid artifact SHA-256");
  if (!canonicalReleaseAsset(packageEntry.artifact.url, {
    owner: "soksak-ai",
    repository: "soksak-spec",
    tag: manifest.releaseTag,
    asset: packageArchiveName(PLATFORM_SPEC_PACKAGE, dependencyVersion),
  })) {
    throw new Error("unexpected plugin-spec artifact URL");
  }
  return {
    commit: source.commit,
    version: dependencyVersion,
    packageName: PLATFORM_SPEC_PACKAGE,
    releaseSchema: manifest.spec,
    releaseTag: manifest.releaseTag,
    manifest: { url: manifestReference.url, sha256: manifestReference.sha256 },
    artifact: { url: packageEntry.artifact.url, sha256: packageEntry.artifact.sha256 },
  };
}

export function validateArchiveEntries(verbose, names) {
  const nonRegular = verbose.find((line) => line.length > 0 && !line.startsWith("-"));
  if (nonRegular) throw new Error(`non-regular archive entry: ${nonRegular}`);
  if (names.length === 0) throw new Error("empty archive");
  if (new Set(names).size !== names.length) throw new Error("duplicate archive entry");
  for (const name of names) {
    const segments = name.split("/");
    if (
      !name.startsWith("package/") ||
      name.startsWith("/") ||
      segments.some((segment) => segment === "" || segment === "." || segment === "..")
    ) {
      throw new Error(`unsafe archive path: ${name}`);
    }
  }
  return names;
}

function regularFile(path, label) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label}: regular file required`);
  return readFileSync(path);
}

async function fetchBytes(url, label) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "error" });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error(`${label}: declared size exceeds limit`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error(`${label}: size exceeds limit`);
  return bytes;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
  return result.stdout.trim();
}

function assertRegularTree(at, prefix = "") {
  for (const entry of readdirSync(at, { withFileTypes: true })) {
    const path = join(at, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`symbolic link in dependency: ${relative}`);
    if (stat.isDirectory()) assertRegularTree(path, relative);
    else if (!stat.isFile()) throw new Error(`non-regular dependency entry: ${relative}`);
  }
}

function installPreparedPackage(artifactBytes, manifestBytes, resolvedSpec) {
  if (sha256(artifactBytes) !== resolvedSpec.artifact.sha256) {
    throw new Error("artifact SHA-256 mismatch");
  }
  const dependencies = join(root, ".dependencies");
  mkdirSync(dependencies, { recursive: true });
  const stage = mkdtempSync(join(dependencies, ".prepare-"));
  const archive = join(stage, "plugin-spec.tgz");
  const manifest = join(stage, "soksak-spec-release.json");
  const unpack = join(stage, "unpack");
  mkdirSync(unpack);
  writeFileSync(archive, artifactBytes);
  writeFileSync(manifest, manifestBytes);
  try {
    const verbose = run("tar", ["-tvzf", archive]).split("\n").filter(Boolean);
    const names = run("tar", ["-tzf", archive]).split("\n").filter(Boolean);
    validateArchiveEntries(verbose, names);
    run("tar", ["-xzf", archive, "-C", unpack]);
    const candidate = join(unpack, "package");
    assertRegularTree(candidate);
    const packageJson = JSON.parse(regularFile(join(candidate, "package.json"), "plugin-spec package").toString("utf8"));
    if (
      packageJson.name !== PLATFORM_SPEC_PACKAGE ||
      packageJson.version !== resolvedSpec.version ||
      packageJson.private !== true ||
      packageJson.publishConfig !== undefined
    ) {
      throw new Error("unexpected plugin-spec package identity or publication policy");
    }
    run(process.execPath, [join(candidate, "bin/validate.mjs"), "platform-release", manifest]);
    writeFileSync(
      join(candidate, ".soksak-dependency.json"),
      `${JSON.stringify({
        manifestSha256: resolvedSpec.manifest.sha256,
        artifactSha256: resolvedSpec.artifact.sha256,
        sourceCommit: resolvedSpec.commit,
      }, null, 2)}\n`,
    );

    const destination = join(dependencies, "plugin-spec");
    if (existsSync(destination)) {
      assertRegularTree(destination);
      const markerPath = join(destination, ".soksak-dependency.json");
      if (existsSync(markerPath)) {
        const marker = JSON.parse(regularFile(markerPath, "dependency marker").toString("utf8"));
        if (
          marker.manifestSha256 === resolvedSpec.manifest.sha256 &&
          marker.artifactSha256 === resolvedSpec.artifact.sha256 &&
          marker.sourceCommit === resolvedSpec.commit
        ) {
          return destination;
        }
      }
      const backup = join(dependencies, `.previous-${process.pid}`);
      if (existsSync(backup)) throw new Error(`dependency backup already exists: ${backup}`);
      renameSync(destination, backup);
      try {
        renameSync(candidate, destination);
        rmSync(backup, { recursive: true, force: true });
      } catch (error) {
        if (!existsSync(destination) && existsSync(backup)) renameSync(backup, destination);
        throw error;
      }
    } else {
      renameSync(candidate, destination);
    }
    return destination;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

export async function prepareSpec(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const lock = JSON.parse(readFileSync(join(root, "platform-dependencies.json"), "utf8"));
  const lockedManifestBytes = regularFile(
    join(root, "soksak-spec-release.lock.json"),
    "locked spec manifest",
  );
  const locked = resolveLockedSpec(lock, lockedManifestBytes);
  const manifestBytes = options.manifest
    ? regularFile(options.manifest, "local spec manifest")
    : await fetchBytes(locked.manifest.url, "spec manifest");
  const resolved = resolveLockedSpec(lock, manifestBytes);
  const artifactBytes = options.artifact
    ? regularFile(options.artifact, "local spec artifact")
    : await fetchBytes(resolved.artifact.url, "plugin-spec artifact");
  const destination = installPreparedPackage(artifactBytes, manifestBytes, resolved);
  return {
    destination,
    sourceCommit: resolved.commit,
    manifestSha256: resolved.manifest.sha256,
    artifactSha256: resolved.artifact.sha256,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareSpec();
  console.log(JSON.stringify(result));
}
