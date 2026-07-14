#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parsePlatformReleaseManifest } from "../.dependencies/plugin-spec/dist/spec.js";
import { resolveLockedSpec } from "./prepare-spec.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT_SEMVER_RE = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const DEPENDENCY_LOCK_SCHEMA = "soksak-platform-dependency-lock@0.0.1";

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

function tryRun(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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

export function sdkReleaseIdentity(workspace, sdk) {
  const release = workspace?.soksakRelease;
  if (
    release === null || typeof release !== "object" || Array.isArray(release) ||
    release.kind !== "sdk" ||
    typeof release.id !== "string" || !/^soksak-[a-z0-9-]+$/.test(release.id) ||
    typeof release.repository !== "string" ||
    typeof release.manifest !== "string" || release.manifest !== `${release.id}-release.json`
  ) {
    throw new Error("workspace soksakRelease metadata is invalid");
  }
  const version = strictSemver(workspace.version, "workspace.version");
  if (sdk?.version !== version || typeof sdk?.name !== "string") {
    throw new Error("workspace and SDK package versions must match");
  }
  return {
    kind: release.kind,
    id: release.id,
    repository: release.repository,
    manifest: release.manifest,
    version,
    packageName: sdk.name,
  };
}

export function resolveSourceCommit(explicit, checkoutHead = tryRun(
  "git",
  ["rev-parse", "--verify", "HEAD"],
)) {
  if (explicit !== undefined && (typeof explicit !== "string" || !/^[a-f0-9]{40}$/.test(explicit))) {
    throw new Error("--source-commit requires an exact lowercase 40-character commit");
  }
  if (checkoutHead !== null && !/^[a-f0-9]{40}$/.test(checkoutHead)) {
    throw new Error("checkout HEAD is not an exact lowercase 40-character commit");
  }
  if (explicit !== undefined && checkoutHead !== null && explicit !== checkoutHead) {
    throw new Error("--source-commit does not equal checkout HEAD");
  }
  const commit = checkoutHead ?? explicit;
  if (!commit) throw new Error("source commit is unavailable");
  return commit;
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

function parseArgs(argv) {
  if (argv.length === 0) return {};
  if (argv.length === 2 && argv[0] === "--source-commit") return { sourceCommit: argv[1] };
  throw new Error("usage: release-verify.mjs [--source-commit <40-character-sha>]");
}

function assertCleanCheckoutIfCommitted(head) {
  if (head === null) return;
  const status = run("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") throw new Error(`release source checkout is dirty:\n${status}`);
}

function projectDependencies(lock) {
  if (
    lock?.schema !== DEPENDENCY_LOCK_SCHEMA ||
    !Array.isArray(lock.dependencies) ||
    lock.dependencies.length !== 1
  ) {
    throw new Error("exact platform dependency lock required");
  }
  const dependency = lock.dependencies[0];
  return [{
    kind: dependency.kind,
    id: dependency.id,
    version: dependency.version,
    manifest: dependency.manifest,
  }];
}

export function buildSdkRelease({ commit, archiveName, archiveDigest, dependencyLock, releaseSchema, identity }) {
  const version = strictSemver(identity?.version, "release identity version");
  const releaseTag = `${identity.id}-v${version}`;
  return {
    spec: releaseSchema,
    kind: identity.kind,
    id: identity.id,
    version,
    source: { repository: identity.repository, commit },
    releaseTag,
    dependencies: projectDependencies(dependencyLock),
    packages: [{
      ecosystem: "javascript",
      name: identity.packageName,
      version,
      artifact: {
        url: `${identity.repository}/releases/download/${releaseTag}/${archiveName}`,
        sha256: archiveDigest,
        format: "tgz",
      },
    }],
  };
}

function packOnce(destination) {
  mkdirSync(destination, { recursive: true });
  run("pnpm", [
    "--filter",
    "@soksak-ai/plugin-api",
    "pack",
    "--pack-destination",
    destination,
  ]);
  const archives = readdirSync(destination).filter((name) => name.endsWith(".tgz"));
  if (archives.length !== 1) throw new Error(`expected one SDK archive, found: ${archives.join(", ")}`);
  return join(destination, archives[0]);
}

function verifyArchive(path, identity, specVersion) {
  const verbose = run("tar", ["-tvzf", path]).split("\n").filter(Boolean);
  const names = run("tar", ["-tzf", path]).split("\n").filter(Boolean);
  validateArchiveEntries(verbose, names);
  const packed = JSON.parse(run("tar", ["-xOzf", path, "package/package.json"]));
  if (
    packed.name !== identity.packageName ||
    packed.version !== identity.version ||
    packed.private !== true ||
    packed.publishConfig !== undefined ||
    JSON.stringify(packed.peerDependencies) !== JSON.stringify({ "@soksak-ai/plugin-spec": specVersion })
  ) {
    throw new Error("packed SDK identity, version, dependency, or publication policy is invalid");
  }
  for (const required of [
    "package/dist/index.js",
    "package/dist/index.d.ts",
    "package/examples/soksak-plugin-reminder-demo/README.md",
    "package/examples/soksak-plugin-reminder-demo/dist/main.js",
    "package/examples/soksak-plugin-reminder-demo/plugin.json",
    "package/examples/soksak-plugin-reminder-demo/src/main.ts",
    "package/examples/soksak-plugin-reminder-demo/tsconfig.json",
    "package/package.json",
  ]) {
    if (!names.includes(required)) throw new Error(`packed SDK is missing ${required}`);
  }
  return { names, packed };
}

function assertPreparedDependency(lock, manifestBytes) {
  const resolved = resolveLockedSpec(lock, manifestBytes);
  const marker = JSON.parse(readFileSync(join(root, ".dependencies/plugin-spec/.soksak-dependency.json"), "utf8"));
  if (
    marker.manifestSha256 !== resolved.manifest.sha256 ||
    marker.artifactSha256 !== resolved.artifact.sha256 ||
    marker.sourceCommit !== resolved.commit
  ) {
    throw new Error("prepared plugin-spec does not match the committed dependency lock");
  }
  return resolved;
}

export function verifyRelease(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const checkoutHead = tryRun("git", ["rev-parse", "--verify", "HEAD"]);
  const commit = resolveSourceCommit(options.sourceCommit, checkoutHead);
  assertCleanCheckoutIfCommitted(checkoutHead);

  const workspace = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const sdk = JSON.parse(readFileSync(join(root, "packages/plugin-api/package.json"), "utf8"));
  const identity = sdkReleaseIdentity(workspace, sdk);
  const dependencyLock = JSON.parse(readFileSync(join(root, "platform-dependencies.json"), "utf8"));
  const manifestBytes = readFileSync(join(root, "soksak-spec-release.lock.json"));
  const resolvedSpec = assertPreparedDependency(dependencyLock, manifestBytes);

  run("pnpm", ["build"]);
  const artifacts = join(root, "artifacts");
  const work = join(artifacts, ".work");
  rmSync(artifacts, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  try {
    const first = packOnce(join(work, "first"));
    const second = packOnce(join(work, "second"));
    if (!readFileSync(first).equals(readFileSync(second))) {
      throw new Error("SDK archive is not byte-reproducible");
    }
    const { names } = verifyArchive(first, identity, resolvedSpec.version);
    verifyArchive(second, identity, resolvedSpec.version);
    const archiveName = basename(first);
    if (archiveName !== packageArchiveName(identity.packageName, identity.version)) {
      throw new Error(`unexpected SDK archive name: ${archiveName}`);
    }
    const archiveDigest = sha256(first);
    const manifest = buildSdkRelease({
      commit,
      archiveName,
      archiveDigest,
      dependencyLock,
      releaseSchema: resolvedSpec.releaseSchema,
      identity,
    });
    const parsed = parsePlatformReleaseManifest(manifest);
    if (!parsed.ok) throw new Error(`generated SDK release is invalid:\n${parsed.errors.join("\n")}`);

    const finalArchive = join(artifacts, archiveName);
    const manifestPath = join(artifacts, identity.manifest);
    copyFileSync(first, finalArchive);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    run(process.execPath, [
      join(root, ".dependencies/plugin-spec/bin/validate.mjs"),
      "platform-release",
      manifestPath,
    ]);
    if (sha256(finalArchive) !== archiveDigest) throw new Error("copied SDK archive digest changed");
    return {
      archive: finalArchive,
      archiveDigest,
      entries: names.length,
      manifest: manifestPath,
      sourceCommit: commit,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyRelease()));
}
