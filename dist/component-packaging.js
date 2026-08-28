import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { materializedSpecScript } from "./materialized-spec.js";
const COMMIT = /^[a-f0-9]{40}$/;
export function assertRegularDirectory(path, label) {
    if (!isAbsolute(path) || !existsSync(path))
        throw new Error(`${label} must be an absolute directory`);
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path)
        throw new Error(`${label} must be a regular directory`);
    return path;
}
export function assertRegularFile(path, label) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path)
        throw new Error(`${label} must be a regular file`);
    return path;
}
export function runPackagingCommand(command, args, cwd) {
    const result = spawnSync(command, args, { cwd, encoding: "utf8" });
    if (result.error)
        throw result.error;
    if (result.status !== 0)
        throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}${result.stderr}`);
    return result.stdout.trim();
}
export function assertCleanSourceCheckout(root, commit) {
    if (commit !== undefined && !COMMIT.test(commit))
        throw new Error("package commit must be an exact lowercase Git SHA");
    let head;
    try {
        head = runPackagingCommand("git", ["rev-parse", "--verify", "HEAD"], root);
    }
    catch {
        throw new Error("release packaging requires a Git source checkout");
    }
    if (commit !== undefined && head !== commit)
        throw new Error("package commit does not equal source HEAD");
    if (runPackagingCommand("git", ["status", "--porcelain=v1", "--untracked-files=all"], root) !== "") {
        throw new Error("release packaging requires a clean source checkout");
    }
    return head;
}
export function finalizePackageOutput(stage, out, specRoot) {
    const release = JSON.parse(readFileSync(assertRegularFile(join(stage, "release.json"), "generated release"), "utf8"));
    const publisher = materializedSpecScript(specRoot, "release-template/verified-release-output.mjs");
    const result = JSON.parse(runPackagingCommand(process.execPath, [
        publisher, "--candidate", stage, "--output", out,
    ], dirname(out)));
    if (result.state !== "created" && result.state !== "unchanged")
        throw new Error("Spec returned an invalid package output state");
    return { state: result.state, out, release: { kind: release.kind, id: release.id, version: release.version } };
}
export function packageComponent(input) {
    const root = assertRegularDirectory(input.root, "component root");
    if (!isAbsolute(input.out))
        throw new Error("package output must be absolute");
    const parent = assertRegularDirectory(dirname(input.out), "package output parent");
    assertCleanSourceCheckout(root, input.commit);
    const builder = materializedSpecScript(input.specRoot, "release-template/build-portable-release.mjs");
    const stage = mkdtempSync(join(parent, `.${basename(input.out)}.package-`));
    try {
        runPackagingCommand(process.execPath, [builder, "--commit", input.commit, "--out", stage], root);
        return finalizePackageOutput(stage, input.out, input.specRoot);
    }
    finally {
        if (existsSync(stage))
            rmSync(stage, { recursive: true, force: true });
    }
}
