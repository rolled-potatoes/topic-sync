# Programming API Contract: Topic Catalog Synchronization

## Scope

- 서비스 런타임이 manifest 기반 topic catalog를 직접 생성/주입하고, 기존 plan/sync 흐름과 동일한 정합성 판단을 사용하도록 API 계약을 정의한다.

## Existing APIs (must remain compatible)

### `validateCommand(configPath?) => Promise<void>`

- manifest 검증 수행.
- 실패 시 예외 throw.

### `planCommand(options) => Promise<PlanResult>`

- `options`:
  - `config?: string`
  - `allowDelete?: boolean`
- 반환 타입:
  - `PlanResult = { topics: TopicPlanItem[]; schemas: SchemaPlanItem[] }`

### `syncCommand(options) => Promise<PlanResult>`

- `options`:
  - `config?: string`
  - `allowDelete?: boolean`
  - `confirm?: string`
- 보호 환경(prod/production)에서는 confirm 가드 적용.

### `statusCommand(configPath?) => Promise<{ topicCount: number; subjectCount: number }>`

- scope 내 리소스 개수 반환.

## New APIs for this feature

### `loadTopicCatalog(options?) => Promise<ServiceTopicCatalog>`

- **Purpose**: 서비스 코드에서 즉시 사용 가능한 topic catalog 생성.
- **Input**:
  - `config?: string`
- **Output**:
  - `ServiceTopicCatalog`

```ts
interface ServiceTopicCatalog {
  scope: { tenant: string; env: string };
  byRef: Record<string, CatalogTopicItem>;
  byName: Record<string, CatalogTopicItem>;
  list: CatalogTopicItem[];
}

interface CatalogTopicItem {
  ref: string;
  name: string;
  partitions: number;
  replicationFactor: number;
  config: Record<string, string>;
}
```

- **Errors**:
  - manifest 미존재/파싱 실패
  - tenant/env 미결정
  - 중복 topic name

### `createTopicCatalog(manifest, scope) => ServiceTopicCatalog`

- **Purpose**: 이미 로딩된 manifest 객체로 카탈로그 생성(테스트/고급 주입 시나리오).
- **Input**:
  - `manifest: KrsyncManifest`
  - `scope: { tenant: string; env: string }`
- **Output**:
  - `ServiceTopicCatalog`

### `explainDrift(plan) => { topicDrift, schemaDrift }`

- **Purpose**: `PlanResult`에서 drift 항목만 추출해 운영 알림/검토에 사용.
- **Input**:
  - `plan: PlanResult`
- **Output**:
  - `topicDrift: Array<{ name: string; action: "create" | "update" | "delete"; reason: string }>`
  - `schemaDrift: Array<{ subject: string; action: "create" | "update" | "delete"; reason: string }>`

## Behavior Contract

- catalog의 topic name 계산은 plan/sync와 동일한 naming 규칙을 사용해야 한다.
- catalog는 manifest의 `topics`를 1:1 반영해야 하며, 임의 토픽을 추가하지 않는다.
- `byRef`, `byName`, `list`는 동일한 데이터 집합의 서로 다른 조회 뷰다.
- API는 불변 데이터로 취급 가능한 구조(읽기 중심)로 제공한다.

## Drift Detection Contract

- `planCommand` 결과는 catalog 기준 desired state와 런타임 state 비교 결과와 의미적으로 동일해야 한다.
- action 의미:
  - `create`: catalog에는 있으나 런타임에 없음
  - `update`: 양쪽 존재하나 속성 불일치
  - `noop`: 일치
  - `delete`: 런타임에만 존재(`allowDelete=true`일 때)

## Backward Compatibility

- 기존 exported API 시그니처를 변경하지 않는다.
- 신규 API는 additive change로 제공한다.
- 기존 소비자 코드는 수정 없이 동작해야 한다.
