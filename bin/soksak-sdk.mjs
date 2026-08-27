#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import {
  createComponentBuildReceipt,
  inspectComponentRoot,
  packageComponent,
  packageSidecarRelease,
  packSidecarTarget,
  scaffoldComponent,
  writeComponentBuildReceipt,
} from "../dist/component-tools.js";

const usage = "soksak-sdk <inspect|verify|receipt|scaffold|pack-target|package> [named options]";

function fail(code, message, status = 1) {
  process.stderr.write(`${code}: ${message}\n`);
  process.exit(status);
}

function options(args, allowed, repeated = new Set()) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]; const value = args[index + 1];
    if (!allowed.has(key) || value === undefined || value.startsWith("--")) fail("SDK_USAGE", usage, 2);
    if (repeated.has(key)) values.set(key, [...(values.get(key) ?? []), value]);
    else if (values.has(key)) fail("SDK_USAGE", `duplicate option ${key}`, 2);
    else values.set(key, value);
  }
  return values;
}

function required(values, names) {
  for (const name of names) if (!values.has(name)) fail("SDK_USAGE", `${name} is required`, 2);
}

function regular(path, label) {
  if (!isAbsolute(path)) fail("SDK_PATH_INVALID", `${label} must be absolute`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) fail("SDK_PATH_INVALID", `${label} must be a regular file`);
  return readFileSync(path);
}

function json(path, label) {
  try { return JSON.parse(regular(path, label).toString("utf8")); }
  catch (error) { fail("SDK_DOCUMENT_INVALID", `${label}: ${error instanceof Error ? error.message : String(error)}`); }
}

function toolVersions(values) {
  const tools = {};
  for (const entry of values ?? []) {
    const matched = /^([a-z0-9][a-z0-9-]{0,127})=(.+)$/.exec(entry);
    if (!matched || tools[matched[1]] !== undefined) fail("SDK_USAGE", `invalid or duplicate --tool ${entry}`, 2);
    tools[matched[1]] = matched[2];
  }
  return tools;
}

function inspect(args) {
  const values = options(args, new Set(["--root"])); required(values, ["--root"]);
  process.stdout.write(`${JSON.stringify(inspectComponentRoot(values.get("--root")))}\n`);
}

function receipt(args) {
  const values = options(args, new Set([
    "--release", "--spec", "--tooling", "--mode", "--platform", "--architecture", "--tool", "--out",
  ]), new Set(["--tool"]));
  required(values, ["--release", "--spec", "--tooling", "--mode", "--platform", "--architecture", "--tool", "--out"]);
  const releasePath = values.get("--release"); const specPath = values.get("--spec"); const toolingPath = values.get("--tooling");
  const created = createComponentBuildReceipt({
    release: json(releasePath, "release"),
    spec: { document: json(specPath, "Spec release"), bytes: regular(specPath, "Spec release") },
    tooling: { document: json(toolingPath, "SDK release"), bytes: regular(toolingPath, "SDK release") },
    execution: { mode: values.get("--mode"), platform: values.get("--platform"), architecture: values.get("--architecture") },
    tools: toolVersions(values.get("--tool")),
  });
  const out = values.get("--out");
  try { writeComponentBuildReceipt(out, created); }
  catch (error) { fail("SDK_RECEIPT_WRITE_FAILED", error instanceof Error ? error.message : String(error)); }
  process.stdout.write(`${JSON.stringify({ receipt: out, subject: created.subject })}\n`);
}

function verify(args) {
  const values = options(args, new Set(["--validator", "--receipt", "--release"]));
  required(values, ["--validator", "--receipt", "--release"]);
  const validator = values.get("--validator"); const receiptPath = values.get("--receipt"); const releasePath = values.get("--release");
  regular(validator, "validator"); regular(receiptPath, "receipt"); regular(releasePath, "release");
  const result = spawnSync(process.execPath, [validator, "component-build-receipt", receiptPath, "--release", releasePath], { encoding: "utf8" });
  if (result.error) fail("SDK_VALIDATOR_FAILED", result.error.message);
  if (result.status !== 0) {
    process.stderr.write(result.stdout); process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  process.stdout.write(`${JSON.stringify({ verified: true, receipt: receiptPath, release: releasePath })}\n`);
}

function scaffold(args) {
  const values = options(args, new Set(["--kind", "--id", "--version", "--out"]));
  required(values, ["--kind", "--id", "--version", "--out"]);
  try {
    const out = scaffoldComponent({ kind: values.get("--kind"), id: values.get("--id"), version: values.get("--version"), out: values.get("--out") });
    process.stdout.write(`${JSON.stringify({ scaffolded: true, kind: values.get("--kind"), id: values.get("--id"), version: values.get("--version"), out })}\n`);
  } catch (error) { fail("SDK_SCAFFOLD_FAILED", error instanceof Error ? error.message : String(error)); }
}

function packageRelease(args) {
  const values = options(args, new Set(["--root", "--spec-root", "--commit", "--artifacts", "--out"]));
  required(values, ["--root", "--spec-root", "--commit", "--out"]);
  try {
    const inspected = inspectComponentRoot(values.get("--root"));
    const common = { root: values.get("--root"), specRoot: values.get("--spec-root"), commit: values.get("--commit"), out: values.get("--out") };
    if (inspected.kind === "sidecar") {
      required(values, ["--artifacts"]);
      process.stdout.write(`${JSON.stringify(packageSidecarRelease({ ...common, artifacts: values.get("--artifacts") }))}\n`);
    } else {
      if (values.has("--artifacts")) fail("SDK_USAGE", "--artifacts is only valid for a Sidecar", 2);
      process.stdout.write(`${JSON.stringify(packageComponent(common))}\n`);
    }
  } catch (error) { fail("SDK_PACKAGE_FAILED", error instanceof Error ? error.message : String(error)); }
}

function packTarget(args) {
  const values = options(args, new Set(["--root", "--spec-root", "--target", "--source", "--out"]));
  required(values, ["--root", "--spec-root", "--target", "--source", "--out"]);
  try {
    process.stdout.write(`${JSON.stringify(packSidecarTarget({
      root: values.get("--root"), specRoot: values.get("--spec-root"), target: values.get("--target"),
      source: values.get("--source"), out: values.get("--out"),
    }))}\n`);
  } catch (error) { fail("SDK_TARGET_PACKAGE_FAILED", error instanceof Error ? error.message : String(error)); }
}

const [command, ...args] = process.argv.slice(2);
if (command === "--help" || command === "help") { process.stdout.write(`${usage}\n`); process.exit(0); }
if (command === "inspect") inspect(args);
else if (command === "receipt") receipt(args);
else if (command === "verify") verify(args);
else if (command === "scaffold") scaffold(args);
else if (command === "pack-target") packTarget(args);
else if (command === "package") packageRelease(args);
else fail("SDK_COMMAND_REQUIRED", usage, 2);
