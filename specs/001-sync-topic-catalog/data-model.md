# Data Model: Topic Catalog Synchronization

## 1) Topic Definition

- **Purpose**: 설정 파일에서 관리되는 토픽 선언의 원본 엔티티.
- **Source**: `KrsyncManifest.topics[]`
- **Fields**:
  - `project: string` (required, non-empty)
  - `service: string` (required, non-empty)
  - `subservices?: string[]` (optional, each non-empty)
  - `partitions: number` (required, positive int)
  - `replicationFactor: number` (required, positive int)
  - `config?: Record<string,string>` (optional)
- **Derived fields**:
  - `topicRef = project.service[.subservices...]`
  - `topicName = tenant.env.project.service[.subservices...]`
- **Validation rules**:
  - 최소 1개 이상 topic 필요
  - 동일 `topicName` 중복 금지
  - scope(`tenant`, `env`)가 결정되어야 최종 이름 생성 가능

## 2) Service Topic Catalog

- **Purpose**: 서비스 코드가 직접 참조/주입받는 토픽 인덱스.
- **Source**: Topic Definition 집합 + Runtime Scope
- **Fields**:
  - `scope: { tenant: string; env: string }`
  - `byRef: Record<string, CatalogTopicItem>`
  - `byName: Record<string, CatalogTopicItem>`
- **CatalogTopicItem fields**:
  - `ref: string`
  - `name: string`
  - `partitions: number`
  - `replicationFactor: number`
  - `config: Record<string,string>`
- **Invariants**:
  - `byRef[*].name`와 `byName[*].name`는 동일 객체를 가리키는 논리적 동일 엔트리
  - 한 scope 내 `name`은 유일
  - 카탈로그 생성 시점의 manifest 상태를 완전히 반영

## 3) Desired Schema Target

- **Purpose**: schema sync/검증을 위한 선언형 목표 상태.
- **Source**: `KrsyncManifest.schemas[]` + Topic Definition 매핑
- **Fields**:
  - `topicRef: string`
  - `subject: string` (`{topicName}-value`)
  - `schema: string` (valid JSON)
  - `compatibility?: CompatibilityLevel`
- **Validation rules**:
  - `topicRef`는 반드시 기존 Topic Definition과 매칭
  - `avro` 또는 `avroFile` 중 최소 하나 필요

## 4) Runtime Topic State

- **Purpose**: Kafka 클러스터에서 조회한 현재 토픽 상태.
- **Source**: Kafka Admin API 조회 결과
- **Fields**:
  - `partitions: number`
  - `config?: Record<string,string>`
- **Scope rule**:
  - `tenant.env.` prefix를 만족하는 토픽만 비교 대상

## 5) Runtime Schema State

- **Purpose**: Schema Registry에서 조회한 현재 subject 상태.
- **Source**: Subject 목록 + latest schema + compatibility 조회
- **Fields**:
  - `schema?: string`
  - `compatibility?: CompatibilityLevel`
- **Scope rule**:
  - `tenant.env.` prefix and `-value` suffix subject만 비교 대상

## 6) Synchronization Status

- **Purpose**: 선언 상태와 런타임 상태의 정합성 결과.
- **Source**: 계획 계산 엔진(createPlan)
- **Representations**:
  - Topic item: `{ name, action, reason }`
  - Schema item: `{ subject, action, reason }`
- **Action domain**:
  - `create`: 선언에만 존재, 런타임에 없음
  - `update`: 선언/런타임 모두 존재하나 속성 불일치
  - `noop`: 완전 일치
  - `delete`: 런타임에만 존재(삭제 허용 시)

## 7) Command Options (Behavior Controls)

- **Plan options**:
  - `config?: string`
  - `allowDelete?: boolean`
- **Sync options**:
  - `config?: string`
  - `allowDelete?: boolean`
  - `confirm?: string`
- **Rules**:
  - `allowDelete !== true` 이면 `delete`는 실행 계획/적용에서 제외
  - prod/production scope에서는 `confirm === env`가 아니면 sync 차단

## 8) Entity Relationships

- Topic Definition `1..N` -> Service Topic Catalog Item
- Topic Definition `1..N` -> Desired Schema Target(`topicRef`를 통해 참조)
- Desired Topic/Schema + Runtime Topic/Schema -> Synchronization Status
- Command Options -> Synchronization Status 생성/적용 방식 제어
