# Research: Topic Catalog Synchronization

## Decision 1: Topic catalog의 단일 소스는 기존 `manifest.topics`를 유지한다

- **Decision**: 새로운 별도 설정 구조를 만들지 않고, 현재 `krsync.config.*`의 `topics`를 단일 기준 소스로 유지한다.
- **Rationale**:
  - 이미 `manifest` 로딩/검증(`zod`)과 이름 생성 규칙이 안정적으로 동작 중이다.
  - 추가 DSL을 도입하면 운영팀 학습 비용과 마이그레이션 비용이 커진다.
  - 스펙의 핵심 요구는 “일관된 제공/주입”이며, 소스 교체가 아니라 소스 재사용이 본질이다.
- **Alternatives considered**:
  - `serviceTopics` 전용 섹션 신설: 표현력은 늘지만 중복/드리프트 가능성 증가.
  - 런타임 DB/원격 설정으로 이동: 동적성은 높지만 현재 툴의 정적 선언 모델과 어긋남.

## Decision 2: 서비스 주입용 API를 라이브러리 레벨에서 제공한다

- **Decision**: CLI 중심 접근 외에, Node 런타임에서 직접 호출 가능한 catalog 생성 API를 추가한다.
- **Rationale**:
  - 사용자는 서비스 코드에서 토픽을 실제 참조해야 하므로 런타임 접근점이 필요하다.
  - 기존 `planCommand`/`syncCommand` 패턴과 동일하게 프로그래밍 API를 확장하는 것이 자연스럽다.
  - 서비스 부트스트랩 단계에서 catalog를 생성/주입하면 drift를 조기에 차단할 수 있다.
- **Alternatives considered**:
  - CLI 출력(JSON)을 서비스가 재파싱: 프로세스 경계 비용이 크고 타입 안정성이 낮다.
  - 코드 생성 파일만 제공: 빌드 단계 의존성이 생기고 hot reload 시 반영 지연.

## Decision 3: 카탈로그 키는 `topicRef`와 `full topic name`을 모두 제공한다

- **Decision**: 카탈로그는 `topicRef` 기반 조회와 full topic name 기반 조회를 동시에 지원한다.
- **Rationale**:
  - 스키마/설정 참조는 `topicRef` 중심이고, Kafka 프로듀서/컨슈머 사용은 full name 중심이다.
  - 양방향 조회를 제공하면 서비스 계층과 운영 계층의 사용성을 모두 만족한다.
  - 기존 `topicRefFromManifestTopic`, `buildTopicName` 유틸을 그대로 활용 가능하다.
- **Alternatives considered**:
  - full name only: 설정 파일의 의미 단위(project/service/subservices) 추적이 어려워짐.
  - topicRef only: 실제 Kafka API 호출 직전에 매번 이름 변환 필요.

## Decision 4: Drift 검출은 기존 plan 엔진을 재사용하고 분류를 명확화한다

- **Decision**: 불일치 검출 로직은 `createPlan` 계산 결과를 기반으로 하되, 보고 형식을 catalog 관점으로 보강한다.
- **Rationale**:
  - `create`/`update`/`delete`/`noop` 분류가 이미 운영적으로 검증됨.
  - 중복 로직 없이 동일 계산 경로를 유지하면 결과 일관성이 높아진다.
  - 사용자 요구의 “검증 가능한 형태”와 “조치 가능한 식별 정보”를 reason 필드로 충족 가능.
- **Alternatives considered**:
  - 별도 drift 전용 비교기 작성: 유지보수 지점 증가.
  - 단순 boolean 일치 여부만 제공: 운영 조치 정보 부족.

## Decision 5: 삭제/프로덕션 가드는 기존 정책을 그대로 적용한다

- **Decision**: `--allow-delete`, prod `--confirm` 가드를 catalog 관련 동작에도 일관되게 유지한다.
- **Rationale**:
  - 토픽/스키마 관리 작업은 파괴적 변경 가능성이 있어 안전장치가 필수다.
  - 기존 사용자 문서/운영 플로우와의 호환성을 깨지 않는다.
- **Alternatives considered**:
  - catalog 전용 완화 정책: 예외 규칙 증가로 운영 혼란 가능.

## Decision 6: 계약 문서는 CLI와 프로그래밍 API를 분리한다

- **Decision**: 계약 정의를 `contracts/cli-contract.md`, `contracts/programmatic-api.md`로 분리한다.
- **Rationale**:
  - 소비자(운영자 vs 애플리케이션 개발자)가 다르므로 변경 영향 분석이 명확해진다.
  - 향후 JSON 출력 모드/타입 시그니처 확장 시 문서 diff가 읽기 쉽다.
- **Alternatives considered**:
  - 단일 계약 문서: 초기엔 간단하지만 확장 시 가독성 저하.
