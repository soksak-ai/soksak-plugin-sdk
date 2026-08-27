export { packageComponent, type ComponentPackageResult } from "./component-packaging.js";
export declare const COMPONENT_KINDS: readonly ["plugin", "sidecar", "kit", "contract", "spec"];
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
    source: {
        repository: string;
        commit: string;
    };
    manifest: {
        file: string;
        size: number;
        sha256: string;
    };
    spec: ReleaseReference & {
        kind: "spec";
    };
    tooling: ReleaseReference & {
        kind: "kit";
    };
    command: "make verify";
    execution: {
        mode: "native" | "container" | "cross";
        platform: "darwin" | "linux" | "win32";
        architecture: "arm64" | "x64";
    };
    tools: Readonly<Record<string, string>>;
    artifacts: readonly {
        target: string;
        sha256: string;
    }[];
}
export declare function inspectComponentRoot(root: string): InspectedComponent;
export declare function createComponentBuildReceipt(input: {
    release: Record<string, unknown>;
    spec: {
        document: Record<string, unknown>;
        bytes: Uint8Array;
    };
    tooling: {
        document: Record<string, unknown>;
        bytes: Uint8Array;
    };
    execution: ComponentBuildReceipt["execution"];
    tools: Record<string, string>;
}): ComponentBuildReceipt;
export declare function writeComponentBuildReceipt(path: string, receipt: ComponentBuildReceipt): void;
export declare function scaffoldComponent(input: {
    kind: ComponentKind;
    id: string;
    version: string;
    out: string;
}): string;
