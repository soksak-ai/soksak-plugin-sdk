# soksak SDK

Public author-tooling Kit that provides build, verification, and packaging tools for each of the
Plugin, Sidecar, Kit, Contract, and Spec component kinds.

- `@soksak/soksak-sdk/plugin` is the isolated Plugin author API.
- `@soksak/soksak-sdk/component-tools` exposes the common five-kind types.
- The `soksak-sdk` CLI exposes prepare, validate, inspect, verify, receipt, attest, scaffold, pack-target, and package commands.
- [Sidecar authoring ownership](docs/SIDECAR-AUTHORING.md) keeps runtime APIs in Contracts and domain Kits.

soksak-spec owns rules and wire formats. The SDK is an implementation consuming one exact Spec
release, not release identity. Component publication verifies manifests, artifacts, conformance,
and the `soksak-component-build-receipt-v1` receipt rather than trusting an SDK dependency name.
An extracted SDK release runs `soksak-sdk prepare` to materialize the exact Spec release pinned by
`sdk-spec.lock.json`; explicit `--manifest` and `--artifact` inputs use the same validation path.
`soksak-sdk validate` invokes that prepared Spec validator by its verified install path and never
resolves an ambient `soksak-validate` executable.
For a Sidecar, `pack-target` uses the same Spec target packer as the Actions build job. `package`
without `--target` requires the publication matrix; `package --target <declared-target>` uses the
same canonical builder and validator for one local development target.

## Plugin author API

Plugin code runs in an opaque-origin document. Confidentiality and integrity come from that
sandbox; availability comes from a dedicated native runtime the host can terminate independently.
The SDK exposes the Command Registry, bounded events and resources, and static providers. It does
not expose Core internals or raw host IPC. A preview receives immutable input and no host capability.

TypeScript tests do not prove native isolation. The native conformance gate binds the bootstrap,
CSP, wrapper, and positive/attack probes to exact artifact digests. Third-party Plugins remain
disabled for a target until that target passes the gate.

After the Plugin owner runs `make verify`, the SDK delegates release construction and conformance
validation to the exact Spec package:

```sh
soksak-sdk package --root <absolute-plugin-root> --spec-root <absolute-spec-package> \
  --commit <exact-git-sha> --out <absolute-release-directory>
```

A Plugin with runtime dependencies also supplies `--store <absolute-local-release-store>` so the
Spec composer resolves exact release bytes without reading another repository's implementation.

```sh
make verify REGISTRY=http://host:port/
make package REGISTRY=http://host:port/
```

These are the owner commands used by GitHub Actions. `REGISTRY` is a Make command-line input because
the SDK consumes one exact `@soksak/soksak-spec`; no ambient registry or cached selection is a build
input. `make verify` fails closed when the declared
Node, pnpm, lock, or materialized Spec bytes differ. `make package` runs that proof and delegates
release construction to the exact Spec package; rerunning it accepts only byte-identical output.
Each version owns `artifacts/<version>/`, so creating a later release never deletes or overwrites an
earlier candidate.

Before that Spec release is public, local verification supplies its exact completed release inputs
without changing the SDK source or lock shape:

```sh
make verify REGISTRY=http://host:port/ \
  SPEC_RELEASE=/absolute/spec-release/release.json \
  SPEC_ARTIFACT=/absolute/spec-release/soksak-soksak-spec-<version>.tgz
```

Both inputs are required together and must be absolute. Omitting both selects the immutable public
release named by `sdk-spec.lock.json`; a failed lookup has no local-path fallback.

The login profile selects `soksak-sdk` on `PATH`. `TOOLING_SDK_VERSION` in the Makefile names the
prior SDK release permitted to attest this SDK version; Make compares both the installed
`package.json` and `release.json` before attestation. An SDK upgrade installs a new version directory
and changes the profile selection, while an older release remains reproducible by selecting the
version it declares.

The portable packager covers Kit and Contract. Plugin and Sidecar use their kind-specific Spec
packagers. Spec remains the owner of its own release pipeline.

Before publication, `attest` adds the build receipt to the release evidence and verifies it with the
materialized Spec. `--tooling-release` is the exact release document of the SDK executing the build.

```sh
soksak-sdk attest --release-dir <absolute-release-directory> --spec-root <absolute-spec-package> \
  --tooling-release <absolute-sdk-release.json> --mode <native|container|cross> \
  --platform <darwin|linux|win32> --architecture <arm64|x64> --tool node=<version>
```
