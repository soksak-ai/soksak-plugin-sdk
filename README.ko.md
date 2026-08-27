# soksak SDK

Plugin, Sidecar, Kit, Contract, Spec 제작자가 같은 build·검증·패키징 경계를 사용하도록 하는
공개 author tooling Kit입니다.

- `@soksak/soksak-sdk/plugin`은 isolated Plugin author API를 제공합니다.
- `@soksak/soksak-sdk/component-tools`는 5종 component 공통 타입을 제공합니다.
- `soksak-sdk` CLI는 inspect, verify, receipt, scaffold, package command를 제공합니다.

규칙과 wire는 soksak-spec이 소유합니다. SDK는 exact Spec release를 소비하는 구현이며 release
identity가 아닙니다. Component publication은 SDK dependency 이름이 아니라 manifest, artifact,
conformance, `soksak-component-build-receipt-v1` receipt를 검증합니다.

```sh
make verify
```
