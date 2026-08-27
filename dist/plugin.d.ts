export interface SoksakPluginModule {
    readonly controller?: unknown;
    readonly commands?: Readonly<Record<string, unknown>>;
    readonly views?: Readonly<Record<string, unknown>>;
    readonly fileViewers?: Readonly<Record<string, unknown>>;
    readonly overlays?: Readonly<Record<string, unknown>>;
}
export declare function defineSoksakPlugin(module: SoksakPluginModule): SoksakPluginModule;
