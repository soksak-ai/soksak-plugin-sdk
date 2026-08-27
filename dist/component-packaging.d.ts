export interface ComponentPackageResult {
    state: "created" | "unchanged";
    out: string;
    release: {
        kind: string;
        id: string;
        version: string;
    };
}
export declare function packageComponent(input: {
    root: string;
    specRoot: string;
    commit: string;
    out: string;
}): ComponentPackageResult;
