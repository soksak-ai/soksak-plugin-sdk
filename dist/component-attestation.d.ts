import { type ComponentBuildExecution, type ComponentBuildReceipt } from "./component-tools.js";
export interface ComponentAttestationResult {
    state: "created" | "unchanged";
    receipt: string;
    subject: ComponentBuildReceipt["subject"];
}
export declare function attestComponentRelease(input: {
    releaseDir: string;
    specRoot: string;
    toolingRelease: string;
    sdkVersion: string;
    execution: ComponentBuildExecution;
    tools: Record<string, string>;
}): ComponentAttestationResult;
