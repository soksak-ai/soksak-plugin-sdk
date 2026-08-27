export declare function materializedSpecRelease(specRoot: string): {
    path: string;
    document: Record<string, unknown>;
    bytes: Buffer;
    reference: Record<string, unknown>;
};
export declare function materializedSpecScript(specRoot: string, relative: string): string;
