export interface ComponentPackageResult {
    state: "created" | "unchanged";
    out: string;
    release: {
        kind: string;
        id: string;
        version: string;
    };
}
export declare function assertRegularDirectory(path: string, label: string): string;
export declare function assertRegularFile(path: string, label: string): string;
export declare function runPackagingCommand(command: string, args: string[], cwd: string): string;
export declare function assertCleanSourceCheckout(root: string, commit?: string): string;
export declare function finalizePackageOutput(stage: string, out: string): ComponentPackageResult;
export declare function packageComponent(input: {
    root: string;
    specRoot: string;
    commit: string;
    out: string;
}): ComponentPackageResult;
