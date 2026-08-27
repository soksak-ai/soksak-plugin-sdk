# Sidecar authoring ownership

The SDK owns Sidecar kind tooling: discovery, scaffold structure, build receipts, validation,
packaging orchestration, and release evidence. It does not own a Sidecar's runtime protocol.

A Sidecar implements the public Contract it declares in `sidecar.json`. Reusable runtime behavior
belongs to the domain Kit that implements that Contract. For example, terminal engines share their
mirror and service runtime through the terminal Sidecar Kit, while a PTY service consumes its PTY
and control Contracts directly.

The SDK must not expose a generic Sidecar runtime adapter. Such an adapter would either duplicate a
Contract, hide domain behavior in author tooling, or pretend one JavaScript package is a runtime
library for Rust, Go, and other Sidecar languages. The SDK may invoke each language's declared build
command, but it does not link the resulting process or know its implementation.

A language adapter becomes a separate Kit only after representative Sidecars in that language prove
the same contract-neutral runtime boundary. Its API must be derived from a public Spec or Contract,
tested in its own repository, and referenced by release identity. One Sidecar or one domain is not
evidence for a generic adapter.

