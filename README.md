# @rolled-potatoes/kafka-registry-sync

Kafka topic + Schema Registry sync package.

## Goals

- Keep topic and schema declarations in service repositories.
- Enforce naming scope with `tenant` and `env`.
- Sync create/update/delete (delete guarded by explicit flag).

## Naming Rules

- Topic: `{tenant}.{env}.{project}.{service}[.{subservice...}]`
- GroupId: `{tenant}.{env}.{action}`
- Subject: `<topic>-value`

## Environment Variables

- `KRS_TENANT`
- `KRS_ENV`

`tenant` and `env` can also be set directly in config (`tenant`, `env`).

## Config

Supported config file names:

- `krsync.config.ts`
- `krsync.config.js`
- `krsync.config.mjs`
- `krsync.config.cjs`

Minimal example is provided at `krsync.config.ts`.

## CLI

- `krsync validate [-c <path>]`
- `krsync plan [-c <path>] [--allow-delete]`
- `krsync sync [-c <path>] [--allow-delete] [--confirm <env>]`
- `krsync status [-c <path>]`

### Safety

- Delete is disabled by default.
- Delete only applies with `--allow-delete`.
- For prod-like env (`prod`, `production`), `sync` requires `--confirm <env>`.

## Build Targets

- ESM: `dist/index.mjs`, `dist/cli.mjs`
- CJS: `dist/index.cjs`, `dist/cli.cjs`
- Types: `dist/index.d.ts`

## Package Usage

Install and consume either `import` or `require`.

```js
const { buildTopicName } = require("@rolled-potatoes/kafka-registry-sync");
```

```js
import { buildTopicName } from "@rolled-potatoes/kafka-registry-sync";
```

## Publish to GitHub Packages

Set token and publish:

```bash
export NODE_AUTH_TOKEN=<github_pat_with_packages_write>
npm run publish:github
```
