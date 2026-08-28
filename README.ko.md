# soksak SDK

Plugin, Sidecar, Kit, Contract, Spec 제작자에게 각 component 종류에 맞는 build·검증·패키징
도구를 제공하는 공개 author tooling Kit입니다.

- `@soksak/soksak-sdk/plugin`은 isolated Plugin author API를 제공합니다.
- `@soksak/soksak-sdk/component-tools`는 5종 component 공통 타입을 제공합니다.
- `soksak-sdk` CLI는 prepare, inspect, verify, receipt, attest, scaffold, pack-target, package command를 제공합니다.
- [Sidecar authoring 소유권](docs/SIDECAR-AUTHORING.ko.md)은 runtime API를 Contract와 domain Kit에 둡니다.

규칙과 wire는 soksak-spec이 소유합니다. SDK는 exact Spec release를 소비하는 구현이며 release
identity가 아닙니다. Component publication은 SDK dependency 이름이 아니라 manifest, artifact,
conformance, `soksak-component-build-receipt-v1` receipt를 검증합니다.
압축을 푼 SDK release는 `soksak-sdk prepare`로 `sdk-spec.lock.json`이 고정한 exact Spec release를
materialize합니다. 명시적인 `--manifest`와 `--artifact`도 같은 검증 경로를 사용합니다.
Sidecar의 `pack-target`은 Actions build job과 같은 Spec target packer를 사용합니다. `package`에서
`--target`을 생략하면 publication matrix 전체를 요구하고, `package --target <declared-target>`은
같은 canonical builder와 validator로 local development target 하나를 만듭니다.

## Plugin author API

Plugin 코드는 opaque-origin document에서 실행됩니다. Confidentiality와 integrity는 sandbox가,
availability는 host가 독립적으로 종료할 수 있는 dedicated native runtime이 보장합니다. SDK는
Command Registry, bounded event·resource, static provider를 노출하며 Core 내부나 raw host IPC를
노출하지 않습니다. preview는 immutable input만 받고 host capability는 받지 않습니다.

TypeScript test는 native isolation을 증명하지 않습니다. native conformance gate가 bootstrap,
CSP, wrapper, positive/attack probe를 exact artifact digest에 묶습니다. 해당 target이 gate를
통과하기 전에는 third-party Plugin을 활성화하지 않습니다.

Plugin owner가 `make verify`를 실행한 뒤 SDK는 exact Spec package에 release 생성과 conformance
validation을 위임합니다.

```sh
soksak-sdk package --root <absolute-plugin-root> --spec-root <absolute-spec-package> \
  --commit <exact-git-sha> --out <absolute-release-directory>
```

runtime dependency가 있는 Plugin은 `--store <absolute-local-release-store>`도 전달합니다. Spec
composer는 다른 저장소 구현을 읽지 않고 exact release byte를 해석합니다.

```sh
make verify REGISTRY=http://host:port/
make package REGISTRY=http://host:port/
```

GitHub Actions도 위 owner command를 그대로 사용합니다. SDK가 정확한
`@soksak/soksak-spec` 하나를 소비하므로 `REGISTRY`는 Make 명령줄 입력입니다. ambient registry나
cache 선택은 build input이 아닙니다. `make verify`는 선언된 Node, pnpm, lock,
materialized Spec byte가 다르면 중단합니다. `make package`는 그 검증을 실행한 뒤 exact Spec
package에 release 생성을 위임하며, 재실행 시 byte가 완전히 같은 결과만 재사용합니다. 현재
각 version은 `artifacts/<version>/`을 소유하므로 새 release가 이전 candidate를 삭제하거나
덮어쓰지 않습니다.

그 Spec release가 공개되기 전의 로컬 검증은 SDK source나 lock 형태를 바꾸지 않고 정확한 완성 release
입력을 전달합니다.

```sh
make verify REGISTRY=http://host:port/ \
  SPEC_RELEASE=/absolute/spec-release/release.json \
  SPEC_ARTIFACT=/absolute/spec-release/soksak-soksak-spec-<version>.tgz
```

두 입력은 함께 제공해야 하며 절대 경로여야 합니다. 둘 다 생략하면 `sdk-spec.lock.json`이 이름 붙인
불변 공개 release를 선택하고, 조회 실패에는 local-path fallback이 없습니다.

로그인 프로필이 `PATH`의 `soksak-sdk`를 선택합니다. Makefile의 `TOOLING_SDK_VERSION`은 이 SDK
version을 attest할 수 있는 직전 SDK release를 이름 붙이며, Make는 attestation 전에 설치된
`package.json`과 `release.json`을 모두 비교합니다. SDK 업그레이드는 새 version directory를 설치하고
프로필 선택을 바꾸며, 과거 release는 자신이 선언한 version을 선택하면 다시 만들 수 있습니다.

portable packager는 Kit와 Contract를 지원합니다. Plugin과 Sidecar는 각 kind의 Spec packager를
사용하고, Spec은 자기 release pipeline을 직접 소유합니다.

publication 전에 `attest`가 build receipt를 release evidence에 추가하고 materialized Spec으로
검증합니다. `--tooling-release`는 해당 build를 실행한 SDK의 exact release document입니다.

```sh
soksak-sdk attest --release-dir <absolute-release-directory> --spec-root <absolute-spec-package> \
  --tooling-release <absolute-sdk-release.json> --mode <native|container|cross> \
  --platform <darwin|linux|win32> --architecture <arm64|x64> --tool node=<version>
```
