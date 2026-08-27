import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";

export { packageComponent, type ComponentPackageResult } from "./component-packaging.js";
export { packagePluginRelease } from "./plugin-packaging.js";
export { packageSidecarRelease, packSidecarTarget } from "./sidecar-packaging.js";

export const COMPONENT_KINDS = ["plugin", "sidecar", "kit", "contract", "spec"] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export interface ComponentToolingIdentity {
  kind: ComponentKind;
  id: string;
  version: string;
}

export interface InspectedComponent extends ComponentToolingIdentity {
  root: string;
  manifest: string;
  package: string | null;
}

export interface ReleaseReference {
  kind: "spec" | "kit";
  id: string;
  version: string;
  size: number;
  sha256: string;
}

export interface ComponentBuildReceipt {
  schema: "soksak-component-build-receipt-v1";
  subject: ComponentToolingIdentity;
  source: { repository: string; commit: string };
  manifest: { file: string; size: number; sha256: string };
  spec: ReleaseReference & { kind: "spec" };
  tooling: ReleaseReference & { kind: "kit" };
  command: "make verify";
  execution: { mode: "native" | "container" | "cross"; platform: "darwin" | "linux" | "win32"; architecture: "arm64" | "x64" };
  tools: Readonly<Record<string, string>>;
  artifacts: readonly { target: string; sha256: string }[];
}

const ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;

function document(path: string, label: string): Record<string, unknown> {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`${label} must be a regular file`);
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function identity(value: Record<string, unknown>, kind: ComponentKind): ComponentToolingIdentity {
  if (typeof value.id !== "string" || !ID.test(value.id) || typeof value.version !== "string" || !VERSION.test(value.version)) {
    throw new Error(`${kind} manifest identity is invalid`);
  }
  return { kind, id: value.id, version: value.version };
}

export function inspectComponentRoot(root: string): InspectedComponent {
  if (!isAbsolute(root) || !existsSync(root)) throw new Error("component root must be an absolute directory");
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== root) throw new Error("component root must be a regular directory");
  const manifests = COMPONENT_KINDS.flatMap((kind) => {
    const path = join(root, `${kind}.json`);
    return existsSync(path) ? [{ kind, path }] : [];
  });
  if (manifests.length !== 1) throw new Error("component root must contain exactly one component manifest");
  const selected = manifests[0];
  const found = identity(document(selected.path, `${selected.kind} manifest`), selected.kind);
  const packages = [join(root, "package.json"), join(root, "frontend", "package.json")].filter(existsSync);
  if (packages.length > 1) throw new Error("component root must contain at most one package manifest");
  if (packages.length === 1) {
    const pkg = document(packages[0], "package manifest");
    if (pkg.version !== found.version) throw new Error("component and package versions differ");
  }
  return { root, ...found, manifest: selected.path, package: packages[0] ?? null };
}

function releaseInput(value: { document: Record<string, unknown>; bytes: Uint8Array }, kind: "spec" | "kit", id: string): ReleaseReference {
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

function exactTools(value: Record<string, string>): Readonly<Record<string, string>> {
  if (Object.keys(value).length === 0) throw new Error("component tools must not be empty");
  const result: Record<string, string> = {};
  for (const name of Object.keys(value).sort()) {
    if (!ID.test(name) || !VERSION.test(value[name])) throw new Error("component tool version is invalid");
    result[name] = value[name];
  }
  return Object.freeze(result);
}

export function createComponentBuildReceipt(input: {
  release: Record<string, unknown>;
  spec: { document: Record<string, unknown>; bytes: Uint8Array };
  tooling: { document: Record<string, unknown>; bytes: Uint8Array };
  execution: ComponentBuildReceipt["execution"];
  tools: Record<string, string>;
}): ComponentBuildReceipt {
  const release = input.release;
  if (!COMPONENT_KINDS.includes(release.kind as ComponentKind) || typeof release.id !== "string" || !ID.test(release.id) ||
      typeof release.version !== "string" || !VERSION.test(release.version)) throw new Error("component release identity is invalid");
  if (!release.source || typeof release.source !== "object" || !release.manifest || typeof release.manifest !== "object" || !Array.isArray(release.artifacts)) {
    throw new Error("component release is incomplete");
  }
  const source = release.source as { repository?: unknown; commit?: unknown };
  const manifest = release.manifest as { file?: unknown; size?: unknown; sha256?: unknown };
  if (typeof source.repository !== "string" || typeof source.commit !== "string" || typeof manifest.file !== "string" ||
      typeof manifest.size !== "number" || typeof manifest.sha256 !== "string" || !SHA256.test(manifest.sha256)) {
    throw new Error("component release source or manifest is invalid");
  }
  const artifacts = release.artifacts.map((value) => {
    const item = value as { target?: unknown; sha256?: unknown };
    if (typeof item.target !== "string" || typeof item.sha256 !== "string" || !SHA256.test(item.sha256)) throw new Error("component release artifact is invalid");
    return { target: item.target, sha256: item.sha256 };
  });
  const execution = input.execution;
  if (!(["native", "container", "cross"] as const).includes(execution.mode) ||
      !(["darwin", "linux", "win32"] as const).includes(execution.platform) ||
      !(["arm64", "x64"] as const).includes(execution.architecture)) throw new Error("component execution is invalid");
  return {
    schema: "soksak-component-build-receipt-v1",
    subject: { kind: release.kind as ComponentKind, id: release.id, version: release.version },
    source: { repository: source.repository, commit: source.commit },
    manifest: { file: manifest.file, size: manifest.size, sha256: manifest.sha256 },
    spec: releaseInput(input.spec, "spec", "soksak-spec") as ComponentBuildReceipt["spec"],
    tooling: releaseInput(input.tooling, "kit", "soksak-sdk") as ComponentBuildReceipt["tooling"],
    command: "make verify",
    execution: { ...execution },
    tools: exactTools(input.tools),
    artifacts: Object.freeze(artifacts),
  };
}

export function writeComponentBuildReceipt(path: string, receipt: ComponentBuildReceipt): void {
  if (!isAbsolute(path)) throw new Error("component build receipt path must be absolute");
  if (existsSync(path)) throw new Error("component build receipt already exists");
  const parent = dirname(path);
  const stat = lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(parent) !== parent) throw new Error("component build receipt parent must be a regular directory");
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
}

function componentManifest(kind: ComponentKind, id: string, version: string): Record<string, unknown> {
  if (kind === "plugin") {
    return {
      id, name: id.split("-").slice(2).join(" ") || id, version,
      appVersionRequirement: "0.0.1", description: `${id} Plugin`, entry: "main.js",
      permissions: [], contributes: {},
    };
  }
  if (kind === "sidecar") {
    const domain = id.replace(/^soksak-sidecar-/, "");
    return { id, version, interface: { id: `soksak-spec-sidecar-${domain}`, version: "0.0.1" }, process: `dist/${id}` };
  }
  return { id, version };
}

function write(path: string, value: string | Record<string, unknown> | readonly string[]): void {
  const body = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, body, { flag: "wx" });
}

export function scaffoldComponent(input: { kind: ComponentKind; id: string; version: string; out: string }): string {
  if (!COMPONENT_KINDS.includes(input.kind) || !ID.test(input.id) || !VERSION.test(input.version)) throw new Error("scaffold identity is invalid");
  if (!isAbsolute(input.out) || existsSync(input.out)) throw new Error("scaffold output must be a new absolute directory");
  const parent = dirname(input.out); const stat = lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(parent) !== parent) throw new Error("scaffold parent must be a regular directory");
  const stage = join(parent, `.${basename(input.out)}.next-${process.pid}`);
  if (existsSync(stage)) throw new Error("scaffold staging directory already exists");
  mkdirSync(stage);
  try {
    write(join(stage, `${input.kind}.json`), componentManifest(input.kind, input.id, input.version));
    write(join(stage, "README.md"), `# ${input.id}\n\n${input.kind} component ${input.version}.\n`);
    write(join(stage, "README.ko.md"), `# ${input.id}\n\n${input.kind} component ${input.version}.\n`);
    write(join(stage, "Makefile"), "SHELL := /bin/sh\n.PHONY: preflight verify\npreflight:\n\t@soksak-sdk inspect --root \"$(CURDIR)\"\nverify: preflight\n");
    if (input.kind === "plugin") {
      mkdirSync(join(stage, "src"));
      write(join(stage, "src/main.ts"), "import { defineSoksakPlugin } from \"@soksak/soksak-sdk/plugin\";\n\nexport default defineSoksakPlugin({});\n");
      write(join(stage, ".node-version"), "26.7.0\n");
      write(join(stage, "package.json"), {
        name: `@soksak/${input.id}`, version: input.version, private: true,
        engines: { node: "26.7.0" }, packageManager: "pnpm@11.22.0",
        devEngines: { runtime: { name: "node", version: "26.7.0", onFail: "error" } },
        type: "module", scripts: { build: "tsc -p tsconfig.json" },
        peerDependencies: { "@soksak/soksak-sdk": "0.0.5", "@soksak/soksak-spec": "0.0.37" },
      });
      write(join(stage, "pnpm-workspace.yaml"), "engineStrict: true\npmOnFail: error\nverifyDepsBeforeRun: error\n");
      write(join(stage, "tsconfig.json"), {
        compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", declaration: true, outDir: "dist", rootDir: "src", strict: true },
        include: ["src/**/*.ts"],
      });
    }
    renameSync(stage, input.out);
    return input.out;
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}
