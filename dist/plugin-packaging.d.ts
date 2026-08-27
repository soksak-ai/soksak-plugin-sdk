import { type ComponentPackageResult } from "./component-packaging.js";
export declare function packagePluginRelease(input: {
    root: string;
    specRoot: string;
    commit: string;
    store?: string;
    out: string;
}): ComponentPackageResult;
