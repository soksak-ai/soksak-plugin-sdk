# soksak plugin SDK 0.0.1

This public repository owns the author-facing SDK for isolated soksak plugins. It does not
own the platform wire, a runtime plugin, or any plugin-specific domain contract. The public
wire is released by `soksak-spec`; this SDK consumes its exact GitHub Release manifest and
artifact bytes.

Nothing in this repository is published to npm. GitHub Release assets are the distribution
source. `platform-dependencies.json` pins the spec manifest URL and SHA-256, while the
checked-in `soksak-spec-release.lock.json` is the exact manifest byte stream used to build
and test this revision.

## Local verification before the first remote release

An explicit local override may supply already-built bytes. Both paths must be absolute and
regular files; their SHA-256 must match the committed dependency lock.

```sh
node scripts/prepare-spec.mjs \
  --manifest /absolute/path/to/soksak-spec-release.json \
  --artifact /absolute/path/to/soksak-ai-plugin-spec-0.0.1.tgz
pnpm test
```

Without the override, `prepare-spec.mjs` fetches exactly the two immutable GitHub Release
URLs in the verified manifest. It never resolves a branch, `latest`, npm package, guessed
relative path, or symlink.
