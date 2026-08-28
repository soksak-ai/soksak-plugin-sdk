# Change log

This file records completed changes. Current behavior is defined by the SDK documentation and the
exact Spec reference in `sdk-spec.lock.json`.

## 0.0.11 — 2026-08-28

- Package output publication delegates to the Spec-owned verified-output transaction.
- Repackaging an equal base after Component Tooling attestation is unchanged and preserves the
  receipt.
- Component Tooling consumes the exact Spec 0.0.45 artifact.

## 0.0.10 — 2026-08-28

- Component Tooling consumes the exact Spec 0.0.43 artifact.
- Sidecar packaging supports one addressed local native target and preserves canonical public
  release shape.
- Repeating package creation for the same source and dependency bytes is unchanged; different bytes
  at an existing output are refused.
