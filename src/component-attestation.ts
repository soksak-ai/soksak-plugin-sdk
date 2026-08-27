import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createComponentBuildReceipt, type ComponentBuildExecution, type ComponentBuildReceipt } from "./component-tools.js";
import { assertRegularDirectory, assertRegularFile, runPackagingCommand } from "./component-packaging.js";
import { materializedSpecRelease, materializedSpecScript } from "./materialized-spec.js";

export interface ComponentAttestationResult {
  state: "created" | "unchanged";
  receipt: string;
  subject: ComponentBuildReceipt["subject"];
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function toolingRelease(path: string, sdkVersion: string): { document: Record<string, unknown>; bytes: Buffer } {
  const bytes = readFileSync(assertRegularFile(path, "SDK release document"));
  const document = JSON.parse(bytes.toString("utf8"));
  if (document.kind !== "kit" || document.id !== "soksak-sdk" || document.version !== sdkVersion) {
    throw new Error("SDK release document does not identify the executing SDK");
  }
  return { document, bytes };
}

export function attestComponentRelease(input: {
  releaseDir: string;
  specRoot: string;
  toolingRelease: string;
  sdkVersion: string;
  execution: ComponentBuildExecution;
  tools: Record<string, string>;
}): ComponentAttestationResult {
  const releaseDir = assertRegularDirectory(input.releaseDir, "release directory");
  const releasePath = assertRegularFile(join(releaseDir, "release.json"), "release document");
  const release = JSON.parse(readFileSync(releasePath, "utf8"));
  const spec = materializedSpecRelease(input.specRoot);
  const tooling = toolingRelease(input.toolingRelease, input.sdkVersion);
  const validator = materializedSpecScript(input.specRoot, "bin/validate.mjs");
  for (const path of [spec.path, input.toolingRelease, releasePath]) {
    runPackagingCommand(process.execPath, [validator, "release", path], releaseDir);
  }
  const receipt = createComponentBuildReceipt({
    release,
    spec: { document: spec.document, bytes: spec.bytes },
    tooling,
    execution: input.execution,
    tools: input.tools,
  });
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  const receiptName = "component-build-receipt.json";
  const receiptPath = join(releaseDir, receiptName);
  const reference = { file: receiptName, size: receiptBytes.length, sha256: sha256(receiptBytes) };
  const previous = Array.isArray(release.evidence) ? release.evidence.find((item: { file?: unknown }) => item?.file === receiptName) : undefined;
  if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(reference)) {
    throw new Error("attached component build receipt reference differs");
  }
  if (existsSync(receiptPath) && !readFileSync(receiptPath).equals(receiptBytes)) {
    throw new Error("component build receipt differs from the canonical receipt");
  }
  const evidence = [...(release.evidence ?? []).filter((item: { file?: unknown }) => item?.file !== receiptName), reference]
    .sort((left, right) => left.file.localeCompare(right.file));
  const nextRelease = { ...release, evidence };
  const releaseBytes = Buffer.from(`${JSON.stringify(nextRelease, null, 2)}\n`);
  const currentBytes = readFileSync(releasePath);
  if (previous !== undefined && existsSync(receiptPath) && currentBytes.equals(releaseBytes)) {
    runPackagingCommand(process.execPath, [validator, "component-build-receipt", receiptPath, "--release", releasePath], releaseDir);
    return { state: "unchanged", receipt: receiptPath, subject: receipt.subject };
  }
  const receiptNext = join(releaseDir, `.component-build-receipt.next-${process.pid}`);
  const releaseNext = join(releaseDir, `.release.next-${process.pid}`);
  try {
    writeFileSync(receiptNext, receiptBytes, { flag: "wx" });
    writeFileSync(releaseNext, releaseBytes, { flag: "wx" });
    runPackagingCommand(process.execPath, [validator, "release", releaseNext], releaseDir);
    runPackagingCommand(process.execPath, [validator, "component-build-receipt", receiptNext, "--release", releaseNext], releaseDir);
    if (!existsSync(receiptPath)) renameSync(receiptNext, receiptPath);
    else rmSync(receiptNext);
    renameSync(releaseNext, releasePath);
    return { state: "created", receipt: receiptPath, subject: receipt.subject };
  } finally {
    rmSync(receiptNext, { force: true }); rmSync(releaseNext, { force: true });
  }
}
