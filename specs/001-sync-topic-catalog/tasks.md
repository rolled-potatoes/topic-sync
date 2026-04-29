# Tasks: Topic Catalog Synchronization

**Plan**: `specs/001-sync-topic-catalog/plan.md`
**Spec**: `specs/001-sync-topic-catalog/spec.md`
**Generated**: 2026-04-29

## Phase 1: Setup

- [x] T001 Create topic catalog module scaffold in `src/topicCatalog.ts`
- [x] T002 Add catalog domain types (`ServiceTopicCatalog`, `CatalogTopicItem`) in `src/types.ts`

## Phase 2: Foundational

- [x] T003 Implement `createTopicCatalog(manifest, scope)` with uniqueness validation in `src/topicCatalog.ts`
- [x] T004 Implement `loadTopicCatalog(options?)` using `loadManifest` in `src/service.ts`
- [x] T005 Export new catalog APIs from public surface in `src/index.ts`

## Phase 3: Keep Service Topics Consistent (P1)

**Story Goal**: 설정 토픽을 서비스 런타임에서 그대로 주입 가능한 카탈로그로 제공해 사용 토픽을 항상 일치시킨다.
**Independent Test**: 설정 토픽 목록으로 카탈로그를 생성한 뒤 `byRef`/`byName`/`list`가 동일 집합을 가리키고 설정 토픽과 1:1로 일치하는지 확인한다.

- [x] T006 [US1] Map `manifest.topics` to `topicRef` and full topic name entries in `src/topicCatalog.ts`
- [x] T007 [US1] Preserve topic spec fields (`partitions`, `replicationFactor`, `config`) in catalog items in `src/topicCatalog.ts`
- [x] T008 [US1] Document service injection usage for `loadTopicCatalog` in `README.md`
- [x] T009 [P] [US1] Add API contract notes for catalog loading examples in `specs/001-sync-topic-catalog/contracts/programmatic-api.md`

## Phase 4: Detect and Prevent Topic Drift (P2)

**Story Goal**: 설정과 서비스 사용 토픽 간 drift를 조기에 식별하고 조치 가능한 정보로 보고한다.
**Independent Test**: 설정/런타임 불일치(누락, 초과, 이름 불일치)를 만들고 `plan` 결과에서 대상 항목과 이유가 명확히 식별되는지 확인한다.

- [x] T010 [US2] Add catalog-based drift interpretation helper for `PlanResult` in `src/service.ts`
- [x] T011 [US2] Standardize actionable reason messaging for topic/schema diff output in `src/planner.ts`
- [x] T012 [US2] Align CLI plan/sync output wording with drift contract semantics in `src/cli.ts`
- [x] T013 [P] [US2] Update CLI contract with finalized drift reason conventions in `specs/001-sync-topic-catalog/contracts/cli-contract.md`

## Final Phase: Polish & Cross-Cutting

- [x] T014 Update rollout and migration notes for replacing hardcoded topic strings in `specs/001-sync-topic-catalog/plan.md`
- [x] T015 Add backwards-compatibility note for additive exports in `README.md`

## Dependencies

- Setup -> Foundational -> US1 -> US2 -> Polish
- `T001` -> `T003`
- `T002` -> `T003`, `T004`
- `T003` -> `T004`, `T006`, `T007`
- `T004` -> `T005`, `T008`, `T010`
- `T011` -> `T012`, `T013`

## Parallel Execution Opportunities

- After `T004`, `T008` and `T009` can run in parallel (different files: `README.md`, `contracts/programmatic-api.md`).
- After `T011`, `T012` and `T013` can run in parallel when contract update is documentation-only.
- In polish phase, `T014` and `T015` can run in parallel (different files: `plan.md`, `README.md`).

## Implementation Strategy

- MVP scope: Phase 3 (US1)까지 우선 완료해 서비스 주입 가능한 topic catalog를 먼저 제공한다.
- Incremental delivery: US1 배포 후 운영 환경에서 카탈로그 주입 전환을 시작하고, 다음 릴리스에서 US2 drift 해석/출력 고도화를 적용한다.
