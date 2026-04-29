# @rolled-potatoes/kafka-registry-sync

Kafka 토픽 및 Schema Registry 동기화 툴킷.

설정 파일에 토픽과 스키마를 선언하고, `krsync` 명령어로 환경별로 안전하게 생성·업데이트·삭제할 수 있습니다.

---

## 목차

- [설치](#설치)
- [빠른 시작](#빠른-시작)
- [네이밍 규칙](#네이밍-규칙)
- [설정 파일](#설정-파일)
  - [kafka](#kafka)
  - [schemaRegistry](#schemaregistry)
  - [topics](#topics)
  - [schemas](#schemas)
  - [defaults](#defaults)
- [환경 변수](#환경-변수)
- [CLI 명령어](#cli-명령어)
- [프로그래밍 API](#프로그래밍-api)
- [Express 연동](#express-연동)
- [로컬 개발 환경 (Docker)](#로컬-개발-환경-docker)
- [패키지 배포](#패키지-배포)

---

## 설치

```bash
npm install @rolled-potatoes/kafka-registry-sync \
  --registry https://npm.pkg.github.com
```

> **주의:** GitHub 개인 액세스 토큰(`read:packages` 권한)이 필요합니다.
> 프로젝트 루트 또는 홈 디렉토리의 `.npmrc`에 아래 내용을 추가하세요:
>
> ```
> @rolled-potatoes:registry=https://npm.pkg.github.com
> //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
> ```

---

## 빠른 시작

**1. 설정 파일 생성** (프로젝트 루트):

```ts
// krsync.config.ts
import type { KrsyncManifest } from "@rolled-potatoes/kafka-registry-sync";

const config: KrsyncManifest = {
  kafka: { brokers: ["localhost:19092"] },
  schemaRegistry: { url: "http://localhost:8081" },
  topics: [
    {
      project: "platform",
      service: "orders",
      subservices: ["events", "v1"],
      partitions: 3,
      replicationFactor: 1,
    },
  ],
  schemas: [
    {
      topicRef: "platform.orders.events.v1",
      avroFile: "./schemas/order-event.avsc",
    },
  ],
};

export default config;
```

**2. 필수 환경 변수 설정:**

```bash
export KRS_TENANT=mycompany
export KRS_ENV=dev
```

**3. 실행:**

```bash
npx krsync plan    # 변경 사항 미리 확인
npx krsync sync    # 변경 사항 적용
```

---

## 네이밍 규칙

모든 리소스는 `tenant`와 `env`로 스코프가 지정되어, 환경 간 실수로 인한 쓰기 작업을 방지합니다.

| 리소스  | 패턴 |
|---------|------|
| 토픽    | `{tenant}.{env}.{project}.{service}[.{subservice...}]` |
| Subject | `{topic}-value` |
| GroupId | `{tenant}.{env}.{action}` |

**예시:** `tenant=mycompany`, `env=dev` 환경에서 아래와 같이 토픽을 선언하면:

```ts
{ project: "platform", service: "orders", subservices: ["events", "v1"] }
```

실제 생성되는 토픽 이름: `mycompany.dev.platform.orders.events.v1`

---

## 설정 파일

설정 파일은 런타임에 [jiti](https://github.com/unjs/jiti)로 로드되므로, 별도의 컴파일 없이 TypeScript 파일을 바로 사용할 수 있습니다.

**지원하는 파일명** (아래 순서로 탐색):

```
krsync.config.ts
krsync.config.js
krsync.config.mjs
krsync.config.cjs
```

### `kafka`

```ts
kafka: {
  brokers: string[];   // 필수 — 브로커 주소 목록
  clientId?: string;   // 선택 — 기본값: "krsync"
}
```

### `schemaRegistry`

```ts
schemaRegistry: {
  url: string;         // 필수
  auth?: {
    username: string;
    password: string;
  };
}
```

### `topics`

각 항목이 토픽 하나를 선언합니다. `project`와 `service`는 필수이며, `subservices`로 토픽 이름을 더 세분화할 수 있습니다.

```ts
topics: [
  {
    project: "platform",            // 필수
    service: "orders",              // 필수
    subservices: ["events", "v1"],  // 선택 — 토픽 이름에 순서대로 추가됨
    partitions: 3,                  // 필수
    replicationFactor: 1,           // 필수
    config: {                       // 선택 — Kafka 토픽 설정
      "cleanup.policy": "delete",
      "retention.ms": "604800000",
    },
  },
]
```

### `schemas`

각 스키마 항목은 `topicRef`를 통해 토픽과 연결됩니다. Schema Registry에 등록되는 Subject 이름은 `{full-topic-name}-value` 형식입니다.

Avro 스키마는 파일 경로 또는 인라인 JSON 문자열로 지정할 수 있습니다:

```ts
schemas: [
  // 파일로 지정
  {
    topicRef: "platform.orders.events.v1",  // project.service[.subservices...]
    avroFile: "./schemas/order-event.avsc",
    compatibility: "BACKWARD",              // 선택 — defaults 설정을 덮어씀
  },

  // 인라인으로 지정
  {
    topicRef: "platform.orders.events.v1",
    avro: JSON.stringify({
      type: "record",
      name: "OrderEvent",
      namespace: "platform.orders",
      fields: [
        { name: "orderId", type: "string" },
        { name: "eventType", type: "string" },
        { name: "eventTimestamp", type: "long" },
      ],
    }),
  },
]
```

`topicRef` 형식: `{project}.{service}[.{subservice...}]` — 토픽 선언에서 사용한 것과 동일한 suffix.

### `defaults`

```ts
defaults: {
  compatibility?: "NONE" | "BACKWARD" | "BACKWARD_TRANSITIVE"
                | "FORWARD" | "FORWARD_TRANSITIVE"
                | "FULL" | "FULL_TRANSITIVE";
}
```

스키마별 `compatibility` 필드가 있으면 이 기본값을 덮어씁니다.

### 설정 파일에서 `tenant` / `env` 직접 지정

환경 변수 대신(또는 함께) 설정 파일에 직접 지정할 수도 있습니다. 환경 변수가 우선합니다.

```ts
const config: KrsyncManifest = {
  tenant: "mycompany",
  env: "staging",
  // ...
};
```

---

## 환경 변수

| 변수          | 설명                                     | 설정 파일 대응 |
|---------------|------------------------------------------|----------------|
| `KRS_TENANT`  | 모든 리소스 이름의 tenant 접두어         | `tenant`       |
| `KRS_ENV`     | 리소스 이름의 환경(env) 세그먼트         | `env`          |

---

## CLI 명령어

```
krsync <명령어> [옵션]
```

### `validate`

설정 파일을 스키마에 따라 검증합니다. 오류가 있으면 비정상 종료합니다.

```bash
krsync validate [-c <경로>]
```

### `plan`

선언된 리소스와 실제 상태를 비교해 변경 예정 내역을 출력합니다. 실제 변경은 적용하지 않습니다.

```bash
krsync plan [-c <경로>] [--allow-delete]
```

출력 예시:

```
Topics:
  - [create] mycompany.dev.platform.orders.events.v1 (topic does not exist)
Schemas:
  - [create] mycompany.dev.platform.orders.events.v1-value (subject does not exist)
```

### `sync`

plan 결과를 Kafka와 Schema Registry에 실제로 적용합니다(create / update / delete).

```bash
krsync sync [-c <경로>] [--allow-delete] [--confirm <env>]
```

**안전 규칙:**

- **삭제는 기본적으로 비활성화.** `--allow-delete` 플래그를 명시해야 삭제가 허용됩니다.
- **프로덕션 보호:** `env`가 `prod` 또는 `production`인 경우, `--confirm <env>` 옵션이 반드시 필요합니다 (예: `--confirm prod`).

### `status`

현재 스코프 내에 실제로 존재하는 토픽 수와 Schema Subject 수를 출력합니다.

```bash
krsync status [-c <경로>]
```

### 공통 옵션

```
-c, --config <경로>   설정 파일 경로 (기본값: 자동 탐색)
```

---

## 프로그래밍 API

`planCommand`, `syncCommand`, `validateCommand`, `statusCommand`, `loadTopicCatalog`, `explainDrift`를 Node.js 코드에서 직접 사용할 수 있습니다.

```ts
// ESM
import {
  explainDrift,
  loadTopicCatalog,
  planCommand,
  syncCommand,
  validateCommand,
  statusCommand,
} from "@rolled-potatoes/kafka-registry-sync";
```

```js
// CommonJS
const { planCommand, syncCommand } = require("@rolled-potatoes/kafka-registry-sync");
```

### `loadTopicCatalog(options?)`

manifest의 `topics`를 기준으로 서비스에서 바로 사용할 수 있는 카탈로그를 생성합니다.

```ts
const catalog = await loadTopicCatalog({
  config: "./krsync.config.ts", // 선택
});

const topicByRef = catalog.byRef["platform.orders.events.v1"];
const topicByName = catalog.byName[topicByRef.name];
// topicByRef와 topicByName은 같은 토픽 엔트리를 가리킵니다.
```

### `planCommand(options?)`

실제 변경 없이 토픽·스키마의 예정 액션 목록을 담은 `PlanResult`를 반환합니다.

```ts
const plan = await planCommand({
  config: "./krsync.config.ts", // 선택
  allowDelete: false,           // 선택
});

// plan.topics: TopicPlanItem[]
// plan.schemas: SchemaPlanItem[]
```

### `syncCommand(options?)`

plan을 적용하고, 실제로 수행된 액션 목록을 담은 `PlanResult`를 반환합니다.

```ts
const result = await syncCommand({
  config: "./krsync.config.ts",
  allowDelete: false,
  confirm: "prod", // env가 prod/production일 때 필수
});
```

### `PlanResult` 타입

```ts
interface PlanResult {
  topics: TopicPlanItem[];
  schemas: SchemaPlanItem[];
}

interface TopicPlanItem {
  name: string;
  action: "create" | "update" | "noop" | "delete";
  reason: string;
}

interface SchemaPlanItem {
  subject: string;
  action: "create" | "update" | "noop" | "delete";
  reason: string;
}
```

### `explainDrift(plan)`

`PlanResult`에서 `noop` 항목을 제외한 drift 항목만 분리해 운영 점검에 활용할 수 있습니다.

```ts
const plan = await planCommand({ allowDelete: false });
const drift = explainDrift(plan);

// drift.topicDrift / drift.schemaDrift
```

---

## Express 연동

서버 기동 전에 `planCommand`로 변경 여부를 먼저 확인하고, 실제 변경이 있을 때만 `syncCommand`를 호출하는 것을 권장합니다. 변경이 없는 배포에서는 sync를 완전히 건너뛰어 기동 시간을 단축할 수 있습니다.

```js
// index.js
const express = require("express");
const { planCommand, syncCommand } = require("@rolled-potatoes/kafka-registry-sync");

async function bootstrap() {
  if (process.env.KRSYNC_SKIP !== "true") {
    console.log("[krsync] 변경 사항 확인 중...");
    const plan = await planCommand({ allowDelete: false });

    const hasChanges =
      plan.topics.some((t) => t.action !== "noop") ||
      plan.schemas.some((s) => s.action !== "noop");

    if (hasChanges) {
      console.log("[krsync] 변경 감지, 동기화 실행...");
      await syncCommand({ allowDelete: false });
      console.log("[krsync] 동기화 완료");
    } else {
      console.log("[krsync] 변경 없음, 동기화 생략");
    }
  }

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.listen(3000, () => console.log("서버 시작: http://localhost:3000"));
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**런타임 제어용 환경 변수:**

| 변수                        | 효과                              |
|-----------------------------|-----------------------------------|
| `KRSYNC_SKIP=true`          | plan + sync 전체 생략             |
| `KRSYNC_ALLOW_DELETE=true`  | `allowDelete: true` 전달          |
| `KRSYNC_CONFIRM=prod`       | `confirm: "prod"` 전달            |
| `KRSYNC_CONFIG_PATH`        | 설정 파일 경로 지정               |

---

## 변경 호환성 메모

- 이번 변경은 additive export만 포함합니다. 기존 `planCommand`/`syncCommand`/`validateCommand`/`statusCommand` 시그니처와 동작은 유지됩니다.
- 신규 API(`loadTopicCatalog`, `explainDrift`, `createTopicCatalog`)는 선택적으로 도입할 수 있으며 기존 코드 수정 없이 업그레이드 가능합니다.

## 로컬 개발 환경 (Docker)

[Redpanda](https://redpanda.com/) 단일 컨테이너를 사용하는 `docker-compose.yml`이 포함되어 있습니다.  
Kafka 호환 브로커와 Schema Registry가 하나의 이미지(~250 MB)에 내장되어 있어 가볍게 로컬 테스트가 가능합니다.

```bash
docker compose up -d
```

| 서비스          | 주소                          |
|-----------------|-------------------------------|
| Kafka 브로커    | `localhost:19092`             |
| Schema Registry | `http://localhost:8081`       |

헬스 체크 확인:

```bash
docker compose ps   # Healthy: true 확인
```

실행 예시:

```bash
KRS_TENANT=mycompany KRS_ENV=dev npx krsync plan
KRS_TENANT=mycompany KRS_ENV=dev npx krsync sync
```

---

## 패키지 배포

패키지는 [GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)에 배포됩니다.

**자동 배포 (CI):** `main` 브랜치에 커밋이 push(머지)되면 `.github/workflows/publish-github-packages.yml`이 실행됩니다.

- `npm ci` → `npm run prepublishOnly`(build + typecheck) 실행
- `semantic-release`가 커밋 메시지를 분석해 다음 버전을 계산
- Git 태그 생성, GitHub Release 생성, GitHub Packages 배포를 자동으로 수행

### 커밋 메시지 규칙 (Conventional Commits)

- `feat:` → minor 버전 증가
- `fix:` → patch 버전 증가
- `BREAKING CHANGE:` 또는 `!` 포함 커밋 → major 버전 증가

예시:

```text
feat: add topic drift summary API
fix: handle empty schema subjects
feat!: drop legacy config loader
```

### 수동 점검 (배포 없이 계산 확인)

아래 명령어로 다음 버전 계산 결과를 로컬에서 미리 확인할 수 있습니다.

```bash
npm run release:dry-run
```

### 비상 수동 실행

워크플로우에는 `workflow_dispatch`가 유지되어 있어 GitHub Actions 화면에서 수동 실행도 가능합니다.
