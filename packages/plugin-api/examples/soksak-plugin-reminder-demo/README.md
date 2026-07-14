# Reminder demo

This is the executable SDK and conformance fixture used by `plugin.dev.create`. It is a
headless plugin: activation registers one deterministic hourly job through the public
Command Registry, and the scheduled invocation enters the plugin again through its declared
`fire` command before calling `notify.show` with the inherited invocation context.

`src/main.ts` imports SDK types only. The compiled `dist/main.js` is standalone and contains
no npm or other language-registry runtime dependency. The repository build compiles it and
the platform validator checks `plugin.json`; the SDK GitHub Release archive contains both
source and compiled fixture.
