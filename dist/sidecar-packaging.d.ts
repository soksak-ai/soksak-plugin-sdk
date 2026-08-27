import { type ComponentPackageResult } from "./component-packaging.js";
export declare function packSidecarTarget(input: {
    root: string;
    specRoot: string;
    target: string;
    source: string;
    out: string;
}): Record<string, unknown>;
export declare function packageSidecarRelease(input: {
    root: string;
    specRoot: string;
    commit: string;
    artifacts: string;
    target?: string;
    out: string;
}): ComponentPackageResult;
