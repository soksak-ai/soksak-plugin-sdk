export const COMPONENT_KINDS = ["plugin", "sidecar", "kit", "contract", "spec"] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export interface ComponentToolingIdentity {
  kind: ComponentKind;
  id: string;
  version: string;
}
