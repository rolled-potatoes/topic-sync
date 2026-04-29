# Implementation Plan: Topic Catalog Synchronization

## Plan Context

- **Feature**: `001-sync-topic-catalog`
- **Spec**: `specs/001-sync-topic-catalog/spec.md`
- **Constitution gate**: `specs/constitution.md` 파일이 없어 별도 헌장 제약 없음

## Technical Context

- **Language/Runtime**: TypeScript, Node.js
- **Core libraries**: `kafkajs`, `@kafkajs/confluent-schema-registry`, `zod`, `jiti`, `commander`
- **Current architecture**:
  - Manifest 로딩/검증: `src/manifest.ts`
  - Desired state 및 diff 계산: `src/planner.ts`
  - Command orchestration: `src/service.ts`
  - CLI entrypoint: `src/cli.ts`
- **Operational constraints**:
  - delete는 opt-in(`allowDelete`) 정책
  - prod/production sync는 explicit confirm 필요

## Architecture Overview

- `manifest.topics`를 단일 소스로 유지한다.
- 신규 topic catalog API(`loadTopicCatalog`, `createTopicCatalog`)를 통해 서비스 런타임 주입 경로를 제공한다.
- plan/sync는 기존 계산 경로(`createPlan`)를 그대로 사용하여 drift 판정 일관성을 보장한다.
- CLI 계약은 호환성을 유지하고, 필요한 경우 후속 단계에서 opt-in JSON 모드를 추가 가능하게 설계한다.

## Phase 0: Research Outcome Applied

- 단일 소스 유지, additive API 확장, 안전 가드 유지, 계약 문서 분리 원칙을 채택한다.
- 구현 시 중복 로직 생성보다 기존 naming/planner 유틸 재사용을 우선한다.

## Phase 1: Design and Contracts

- 완료 산출물:
  - `research.md`
  - `data-model.md`
  - `contracts/cli-contract.md`
  - `contracts/programmatic-api.md`

## Phase 2: Implementation Tasks (for /spec.tasks)

### P1 - Service topic consistency

1. `src/service.ts` 또는 신규 모듈에 topic catalog 생성 API 추가
2. 기존 naming 규칙(`buildTopicName`, `topicRefFromManifestTopic`) 기반으로 catalog 인덱스 구현
3. public export surface(`src/index.ts`)에 신규 API 노출
4. 문서(`README.md`)에 서비스 주입 사용 예시 추가

### P2 - Drift detection and prevention

1. `planCommand` 결과를 catalog 관점에서도 해석 가능한 헬퍼 추가(필요 시)
2. CLI 출력 reason의 조치 가능성(식별 정보) 검증 및 보강
3. 테스트 추가:
   - catalog 생성 정합성 테스트
   - 설정 변경 반영 테스트
   - 불일치 검출(create/update/delete/noop) 테스트

## Testing Strategy

- **Unit tests**:
  - catalog 생성 함수의 key 매핑(`byRef`, `byName`, `list`) 검증
  - 중복 topic name 예외 및 scope 적용 검증
- **Integration-level tests**:
  - `planCommand`가 manifest 변경을 올바른 action으로 반환하는지 검증
  - prod confirm guard 동작 검증
- **Regression tests**:
  - 기존 CLI 명령(`validate/plan/sync/status`) 시그니처 및 텍스트 출력 형식 유지 확인

## Risks and Mitigations

- **Risk**: 신규 catalog API와 plan 계산 로직 간 이름 규칙 불일치
  - **Mitigation**: 공통 naming 유틸만 사용, 중복 문자열 조합 금지
- **Risk**: 기존 사용자 코드에 export 변경 영향
  - **Mitigation**: additive export만 수행, 기존 API 변경 금지
- **Risk**: 운영자가 drift 결과를 조치로 연결하기 어려움
  - **Mitigation**: reason 메시지 규칙 명확화 및 계약 문서에 action semantics 고정

## Rollout Notes

- 우선 라이브러리 API 확장을 minor change로 배포한다.
- 기존 CLI 워크플로우는 변경 없이 유지한다.
- 서비스팀은 점진적으로 하드코딩 토픽 문자열을 catalog 주입 방식으로 대체한다.
- 마이그레이션 순서 권장:
  1. 신규 서비스부터 `loadTopicCatalog` 기반 토픽 참조를 기본 적용
  2. 기존 서비스는 하드코딩 문자열을 `topicRef` 조회(`catalog.byRef`)로 치환
  3. 배포 파이프라인에서 `plan` drift summary를 점검 게이트로 사용
  4. 안정화 후 공통 유틸에서 문자열 상수 export를 제거
