export function defineSoksakPlugin(module) {
    return module;
}
export function pluginModuleInventory(module) {
    const keys = (record) => record ? Object.keys(record).sort() : [];
    return {
        commands: keys(module.commands),
        views: keys(module.views),
        fileViewers: keys(module.fileViewers),
        overlays: keys(module.overlays),
    };
}
/**
 * The real parsed PluginManifest owns the command inventory. Service-bound
 * declarations are implemented by the service bridge, never by JS handlers.
 */
export function derivePluginCommandInventory(contributions) {
    const seen = new Set();
    const runtime = [];
    const service = [];
    for (const command of contributions.commands) {
        if (seen.has(command.name))
            throw new TypeError(`duplicate manifest command: ${command.name}`);
        seen.add(command.name);
        (command.bind === "service" ? service : runtime).push(command.name);
    }
    return { runtime: runtime.sort(), service: service.sort() };
}
export function selectSoksakPluginProvider(module, selector) {
    const kind = selector.role === "preview" ? selector.previewKind : selector.role;
    if (!kind)
        throw new Error("preview provider kind is required");
    const table = kind === "view"
        ? module.views
        : kind === "file-viewer"
            ? module.fileViewers
            : module.overlays;
    const provider = table?.[selector.contributionId];
    if (!provider)
        throw new Error(`declared ${kind} provider not found: ${selector.contributionId}`);
    return provider;
}
