# CLI Contract: Topic Catalog Synchronization

## Scope

- 기존 `krsync` CLI 계약을 유지하면서 topic catalog 동기화 요구를 충족하기 위한 출력/옵션 규칙을 정의한다.

## Commands

### 1) `krsync validate`

- **Purpose**: manifest의 구조 및 참조 무결성 검증.
- **Input**: `-c, --config <path>` (optional)
- **Output**:
  - success: `Manifest validation passed.`
  - failure: 에러 메시지 출력 + non-zero exit
- **Catalog relation**:
  - topic definitions로 catalog를 구성할 수 있는지 사전 검증.

### 2) `krsync plan`

- **Purpose**: 선언 상태와 런타임 상태 차이를 계산.
- **Input**:
  - `-c, --config <path>` (optional)
  - `--allow-delete` (default: false)
- **Output (text mode)**:
  - `Topics:` 섹션: `- [action] <topicName> (<reason>)`
  - `Schemas:` 섹션: `- [action] <subject> (<reason>)`
  - `Drift summary: topics=<count>, schemas=<count>`
- **Behavior rules**:
  - `--allow-delete` 미지정 시 delete 항목은 포함하지 않음.

### 3) `krsync sync`

- **Purpose**: plan 결과를 실제 Kafka/Schema Registry에 적용.
- **Input**:
  - `-c, --config <path>` (optional)
  - `--allow-delete` (default: false)
  - `--confirm <env>` (protected env에서 required)
- **Output (text mode)**:
  - `plan`과 동일한 항목 출력 후 `Sync completed.`
  - `plan` 출력 직후 drift summary 출력
- **Safety rules**:
  - prod/production scope일 때 `--confirm <env>` 없으면 실패.
  - delete는 `--allow-delete`가 true일 때만 수행.

### 4) `krsync status`

- **Purpose**: 현재 scope 리소스 개수 확인.
- **Input**: `-c, --config <path>` (optional)
- **Output**:
  - `Topics in scope: <number>`
  - `Schema subjects in scope: <number>`

### 5) `krsync catalog`

- **Purpose**: manifest 기반 서비스 주입용 topic catalog를 조회.
- **Input**: `-c, --config <path>` (optional)
- **Output**:
  - `Scope: <tenant>.<env>`
  - 항목별 매핑: `- <topicRef> => <fullTopicName>`

## Exit Code Contract

- `0`: 정상 완료
- `!= 0`: 입력/검증/런타임 오류

## Action Vocabulary Contract

- `create | update | noop | delete`
- action과 reason은 운영자가 조치 대상을 식별할 수 있어야 한다.
- reason 문구는 아래 의미를 포함해야 한다:
  - create: runtime 누락, manifest 기준 생성 필요
  - update: runtime/manifest 불일치, 업데이트 필요
  - delete: runtime에만 존재, 삭제 후보
  - noop: manifest와 정합

## JSON Mode Policy

- **Current**: 공식 JSON 출력 옵션은 없음.
- **Policy for this feature**:
  - 텍스트 출력 형식의 backward compatibility를 보장한다.
  - 추후 JSON 모드 도입 시, text 모드를 기본값으로 유지하고 opt-in 플래그로 제공한다.
  - JSON 모드가 도입되더라도 action vocabulary 및 의미론은 동일해야 한다.
