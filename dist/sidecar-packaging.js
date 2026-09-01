import { copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { assertCleanSourceCheckout, assertRegularDirectory, assertRegularFile, finalizePackageOutput, runPackagingCommand, } from "./component-packaging.js";
import { materializedSpecScript } from "./materialized-spec.js";
function manifest(path) {
    const value = JSON.parse(readFileSync(assertRegularFile(path, "Sidecar manifest"), "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.id !== "string" ||
        typeof value.version !== "string" || !Array.isArray(value.interface) || value.interface.length === 0 ||
        value.interface.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry) ||
            typeof entry.id !== "string" || typeof entry.version !== "string") ||
        typeof value.process !== "string") {
        throw new Error("Sidecar manifest identity is invalid");
    }
    return value;
}
function sameIdentity(left, right, target) {
    const process = `dist/${left.id}${target.includes("windows") ? ".exe" : ""}`;
    return left.id === right.id && left.version === right.version &&
        JSON.stringify(left.interface) === JSON.stringify(right.interface) && right.process === process;
}
export function packSidecarTarget(input) {
    const root = assertRegularDirectory(input.root, "Sidecar root");
    const source = assertRegularDirectory(input.source, "staged Sidecar root");
    if (!isAbsolute(input.out))
        throw new Error("target archive output must be absolute");
    assertRegularDirectory(dirname(input.out), "target archive output parent");
    assertCleanSourceCheckout(root);
    if (!sameIdentity(manifest(join(root, "sidecar.json")), manifest(join(source, "sidecar.json")), input.target)) {
        throw new Error("staged Sidecar identity differs from the source manifest");
    }
    const packer = materializedSpecScript(input.specRoot, "release-template/sidecar/pack-target.mjs");
    const output = runPackagingCommand(process.execPath, [packer, "--source", source, "--target", input.target, "--out", input.out], root);
    return JSON.parse(output);
}
export function packageSidecarRelease(input) {
    const root = assertRegularDirectory(input.root, "Sidecar root");
    const artifacts = assertRegularDirectory(input.artifacts, "Sidecar target artifacts");
    if (!isAbsolute(input.out))
        throw new Error("package output must be absolute");
    const parent = assertRegularDirectory(dirname(input.out), "package output parent");
    assertCleanSourceCheckout(root, input.commit);
    const identity = manifest(join(root, "sidecar.json"));
    const builder = materializedSpecScript(input.specRoot, "release-template/sidecar/build-release.mjs");
    const validator = materializedSpecScript(input.specRoot, "release-template/sidecar/validate-with-spec.mjs");
    const stage = mkdtempSync(join(parent, `.${basename(input.out)}.sidecar-package-`));
    try {
        const buildArgs = [
            builder, "--commit", input.commit, "--tag", `v${identity.version}`,
            "--artifacts", artifacts, "--out", stage,
            ...(input.target ? ["--target", input.target] : []),
            ...(input.store ? ["--store", input.store] : []),
        ];
        runPackagingCommand(process.execPath, buildArgs, root);
        runPackagingCommand(process.execPath, [validator, "--spec-package", input.specRoot, "--release-dir", stage], root);
        const release = JSON.parse(readFileSync(assertRegularFile(join(stage, "release.json"), "Sidecar release"), "utf8"));
        if (release.kind !== "sidecar" || release.id !== identity.id || release.version !== identity.version || !Array.isArray(release.artifacts)) {
            throw new Error("generated Sidecar release identity is invalid");
        }
        for (const item of release.artifacts) {
            if (!item || typeof item.file !== "string")
                throw new Error("generated Sidecar artifact reference is invalid");
            const source = assertRegularFile(join(artifacts, item.file), `Sidecar artifact ${item.file}`);
            const destination = join(stage, item.file);
            if (existsSync(destination))
                throw new Error(`duplicate Sidecar release file: ${item.file}`);
            copyFileSync(source, destination);
            if (realpathSync(destination) !== destination)
                throw new Error(`Sidecar release file is not regular: ${item.file}`);
        }
        return finalizePackageOutput(stage, input.out, input.specRoot);
    }
    finally {
        if (existsSync(stage))
            rmSync(stage, { recursive: true, force: true });
    }
}
