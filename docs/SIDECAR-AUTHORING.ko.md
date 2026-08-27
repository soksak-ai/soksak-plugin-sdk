# Sidecar authoring 소유권

SDK는 Sidecar kind tooling인 discovery, scaffold 구조, build receipt, validation, packaging
orchestration, release evidence를 소유합니다. Sidecar runtime protocol은 소유하지 않습니다.

Sidecar는 `sidecar.json`에 선언한 공개 Contract를 구현합니다. 재사용 가능한 runtime 동작은
그 Contract를 구현하는 domain Kit가 소유합니다. 예를 들어 terminal engine은 terminal Sidecar
Kit를 통해 mirror와 service runtime을 공유하고, PTY service는 PTY·control Contract를 직접
사용합니다.

SDK는 generic Sidecar runtime adapter를 노출하면 안 됩니다. 그런 adapter는 Contract를
중복하거나, domain 동작을 author tooling에 숨기거나, 하나의 JavaScript package가 Rust·Go 등
서로 다른 Sidecar 언어의 runtime library인 것처럼 만들게 됩니다. SDK는 각 언어가 선언한
build command를 실행할 수 있지만 결과 process를 link하거나 구현을 알지 않습니다.

동일 언어의 대표 Sidecar들이 contract-neutral runtime 경계를 실제로 공유한다고 증명한 뒤에만
language adapter를 별도 Kit로 만듭니다. API는 공개 Spec 또는 Contract에서 파생되어야 하며,
자기 저장소에서 검증하고 release identity로 참조해야 합니다. 하나의 Sidecar나 하나의 domain은
generic adapter의 근거가 아닙니다.

