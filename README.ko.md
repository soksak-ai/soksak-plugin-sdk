# soksak SDK

Plugin, Sidecar, Kit, Contract, Spec 제작자에게 각 component 종류에 맞는 build·검증·패키징
도구를 제공하는 공개 author tooling Kit입니다.

- `@soksak/soksak-sdk/plugin`은 isolated Plugin author API를 제공합니다.
- `@soksak/soksak-sdk/component-tools`는 5종 component 공통 타입을 제공합니다.
- `soksak-sdk` CLI는 inspect, verify, receipt, scaffold, package command를 제공합니다.

규칙과 wire는 soksak-spec이 소유합니다. SDK는 exact Spec release를 소비하는 구현이며 release
identity가 아닙니다. Component publication은 SDK dependency 이름이 아니라 manifest, artifact,
conformance, `soksak-component-build-receipt-v1` receipt를 검증합니다.

## Plugin author API

Plugin 코드는 opaque-origin document에서 실행됩니다. Confidentiality와 integrity는 sandbox가,
availability는 host가 독립적으로 종료할 수 있는 dedicated native runtime이 보장합니다. SDK는
Command Registry, bounded event·resource, static provider를 노출하며 Core 내부나 raw host IPC를
노출하지 않습니다. preview는 immutable input만 받고 host capability는 받지 않습니다.

TypeScript test는 native isolation을 증명하지 않습니다. native conformance gate가 bootstrap,
CSP, wrapper, positive/attack probe를 exact artifact digest에 묶습니다. 해당 target이 gate를
통과하기 전에는 third-party Plugin을 활성화하지 않습니다.

```sh
make verify
make package
```

GitHub Actions도 위 owner command를 그대로 사용합니다. `make verify`는 선언된 Node, pnpm, lock,
materialized Spec byte가 다르면 중단합니다. `make package`는 그 검증을 실행한 뒤 exact Spec
package에 release 생성을 위임하며, 재실행 시 byte가 완전히 같은 결과만 재사용합니다. 현재
portable packager는 Kit와 Contract를 지원합니다. 다른 component kind는 대표 저장소에서
Spec 소유 packager 연결을 증명하기 전까지 사용할 수 없습니다.
