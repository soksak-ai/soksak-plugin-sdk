export declare const COMPONENT_KINDS: readonly ["plugin", "sidecar", "kit", "contract", "spec"];
export type ComponentKind = (typeof COMPONENT_KINDS)[number];
export interface ComponentToolingIdentity {
    kind: ComponentKind;
    id: string;
    version: string;
}
