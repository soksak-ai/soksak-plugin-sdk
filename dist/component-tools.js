import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
export const COMPONENT_KINDS = ["plugin", "sidecar", "kit", "contract", "spec"];
const ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;
function document(path, label) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path)
        throw new Error(`${label} must be a regular file`);
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${label} must be an object`);
    return value;
}
function identity(value, kind) {
    if (typeof value.id !== "string" || !ID.test(value.id) || typeof value.version !== "string" || !VERSION.test(value.version)) {
        throw new Error(`${kind} manifest identity is invalid`);
    }
    return { kind, id: value.id, version: value.version };
}
export function inspectComponentRoot(root) {
    if (!isAbsolute(root) || !existsSync(root))
        throw new Error("component root must be an absolute directory");
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== root)
        throw new Error("component root must be a regular directory");
    const manifests = COMPONENT_KINDS.flatMap((kind) => {
        const path = join(root, `${kind}.json`);
        return existsSync(path) ? [{ kind, path }] : [];
    });
    if (manifests.length !== 1)
        throw new Error("component root must contain exactly one component manifest");
    const selected = manifests[0];
    const found = identity(document(selected.path, `${selected.kind} manifest`), selected.kind);
    const packages = [join(root, "package.json"), join(root, "frontend", "package.json")].filter(existsSync);
    if (packages.length > 1)
        throw new Error("component root must contain at most one package manifest");
    if (packages.length === 1) {
        const pkg = document(packages[0], "package manifest");
        if (pkg.version !== found.version)
            throw new Error("component and package versions differ");
    }
    return { root, ...found, manifest: selected.path, package: packages[0] ?? null };
}
function releaseInput(value, kind, id) {
    const raw = value.document;
    if (raw.kind !== kind || raw.id !== id || typeof raw.version !== "string" || !VERSION.test(raw.version)) {
        throw new Error(`${id} release identity is invalid`);
    }
    return {
        kind, id, version: raw.version,
        size: value.bytes.byteLength,
        sha256: createHash("sha256").update(value.bytes).digest("hex"),
    };
}
function exactTools(value) {
    if (Object.keys(value).length === 0)
        throw new Error("component tools must not be empty");
    const result = {};
    for (const name of Object.keys(value).sort()) {
        if (!ID.test(name) || !VERSION.test(value[name]))
            throw new Error("component tool version is invalid");
        result[name] = value[name];
    }
    return Object.freeze(result);
}
export function createComponentBuildReceipt(input) {
    const release = input.release;
    if (!COMPONENT_KINDS.includes(release.kind) || typeof release.id !== "string" || !ID.test(release.id) ||
        typeof release.version !== "string" || !VERSION.test(release.version))
        throw new Error("component release identity is invalid");
    if (!release.source || typeof release.source !== "object" || !release.manifest || typeof release.manifest !== "object" || !Array.isArray(release.artifacts)) {
        throw new Error("component release is incomplete");
    }
    const source = release.source;
    const manifest = release.manifest;
    if (typeof source.repository !== "string" || typeof source.commit !== "string" || typeof manifest.file !== "string" ||
        typeof manifest.size !== "number" || typeof manifest.sha256 !== "string" || !SHA256.test(manifest.sha256)) {
        throw new Error("component release source or manifest is invalid");
    }
    const artifacts = release.artifacts.map((value) => {
        const item = value;
        if (typeof item.target !== "string" || typeof item.sha256 !== "string" || !SHA256.test(item.sha256))
            throw new Error("component release artifact is invalid");
        return { target: item.target, sha256: item.sha256 };
    });
    const execution = input.execution;
    if (!["native", "container", "cross"].includes(execution.mode) ||
        !["darwin", "linux", "win32"].includes(execution.platform) ||
        !["arm64", "x64"].includes(execution.architecture))
        throw new Error("component execution is invalid");
    return {
        schema: "soksak-component-build-receipt-v1",
        subject: { kind: release.kind, id: release.id, version: release.version },
        source: { repository: source.repository, commit: source.commit },
        manifest: { file: manifest.file, size: manifest.size, sha256: manifest.sha256 },
        spec: releaseInput(input.spec, "spec", "soksak-spec"),
        tooling: releaseInput(input.tooling, "kit", "soksak-sdk"),
        command: "make verify",
        execution: { ...execution },
        tools: exactTools(input.tools),
        artifacts: Object.freeze(artifacts),
    };
}
export function writeComponentBuildReceipt(path, receipt) {
    if (!isAbsolute(path))
        throw new Error("component build receipt path must be absolute");
    if (existsSync(path))
        throw new Error("component build receipt already exists");
    const parent = dirname(path);
    const stat = lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(parent) !== parent)
        throw new Error("component build receipt parent must be a regular directory");
    writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
}
