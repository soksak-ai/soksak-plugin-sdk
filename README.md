# soksak SDK

Public author-tooling Kit that provides build, verification, and packaging tools for each of the
Plugin, Sidecar, Kit, Contract, and Spec component kinds.

- `@soksak/soksak-sdk/plugin` is the isolated Plugin author API.
- `@soksak/soksak-sdk/component-tools` exposes the common five-kind types.
- The `soksak-sdk` CLI exposes inspect, verify, receipt, scaffold, and package commands.

soksak-spec owns rules and wire formats. The SDK is an implementation consuming one exact Spec
release, not release identity. Component publication verifies manifests, artifacts, conformance,
and the `soksak-component-build-receipt-v1` receipt rather than trusting an SDK dependency name.

```sh
make verify
```
