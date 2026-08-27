# soksak SDK

Public author-tooling Kit that provides build, verification, and packaging tools for each of the
Plugin, Sidecar, Kit, Contract, and Spec component kinds.

- `@soksak/soksak-sdk/plugin` is the isolated Plugin author API.
- `@soksak/soksak-sdk/component-tools` exposes the common five-kind types.
- The `soksak-sdk` CLI exposes inspect, verify, receipt, scaffold, and package commands.

soksak-spec owns rules and wire formats. The SDK is an implementation consuming one exact Spec
release, not release identity. Component publication verifies manifests, artifacts, conformance,
and the `soksak-component-build-receipt-v1` receipt rather than trusting an SDK dependency name.

## Plugin author API

Plugin code runs in an opaque-origin document. Confidentiality and integrity come from that
sandbox; availability comes from a dedicated native runtime the host can terminate independently.
The SDK exposes the Command Registry, bounded events and resources, and static providers. It does
not expose Core internals or raw host IPC. A preview receives immutable input and no host capability.

TypeScript tests do not prove native isolation. The native conformance gate binds the bootstrap,
CSP, wrapper, and positive/attack probes to exact artifact digests. Third-party Plugins remain
disabled for a target until that target passes the gate.

```sh
make verify
make package
```

These are the owner commands used by GitHub Actions. `make verify` fails closed when the declared
Node, pnpm, lock, or materialized Spec bytes differ. `make package` runs that proof and delegates
release construction to the exact Spec package; rerunning it accepts only byte-identical output.
Each version owns `artifacts/<version>/`, so creating a later release never deletes or overwrites an
earlier candidate.
The current portable packager covers Kit and Contract. Other component kinds remain unavailable
until their Spec-owned packager is connected and proven by a representative repository.
