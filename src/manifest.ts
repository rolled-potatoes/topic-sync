import fs from "node:fs/promises";
import path from "node:path";
import { createJiti } from "jiti";
import { z } from "zod";
import { ENV_ENV, ENV_TENANT } from "./constants";
import type { CompatibilityLevel, KrsyncManifest, RuntimeScope } from "./types";

const compatibilitySchema = z.enum([
  "NONE",
  "BACKWARD",
  "BACKWARD_TRANSITIVE",
  "FORWARD",
  "FORWARD_TRANSITIVE",
  "FULL",
  "FULL_TRANSITIVE"
]);

const topicSchema = z.object({
  project: z.string().min(1),
  service: z.string().min(1),
  subservices: z.array(z.string().min(1)).optional(),
  partitions: z.number().int().positive(),
  replicationFactor: z.number().int().positive(),
  config: z.record(z.string()).optional()
});

const schemaSchema = z
  .object({
    topicRef: z.string().min(1),
    avro: z.string().optional(),
    avroFile: z.string().optional(),
    compatibility: compatibilitySchema.optional()
  })
  .superRefine((value, ctx) => {
    if (!value.avro && !value.avroFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "schema item must include either avro or avroFile"
      });
    }
  });

const manifestSchema = z.object({
  tenant: z.string().optional(),
  env: z.string().optional(),
  kafka: z
    .object({
      brokers: z.array(z.string().min(1)).min(1),
      clientId: z.string().optional()
    })
    .passthrough() // allow all kafkajs KafkaConfig options (ssl, sasl, retry, timeouts, etc.)
    .optional(),
  schemaRegistry: z
    .object({
      url: z.string().url(),
      auth: z
        .object({
          username: z.string(),
          password: z.string()
        })
        .optional()
    })
    .optional(),
  defaults: z
    .object({
      compatibility: compatibilitySchema.optional()
    })
    .optional(),
  topics: z.array(topicSchema).min(1),
  schemas: z.array(schemaSchema).optional(),
  consumers: z
    .array(
      z.object({
        action: z.string().min(1)
      })
    )
    .optional()
});

const configFileCandidates = [
  "krsync.config.ts",
  "krsync.config.js",
  "krsync.config.mjs",
  "krsync.config.cjs"
];

export interface LoadedManifest {
  filePath: string;
  baseDir: string;
  scope: RuntimeScope;
  manifest: KrsyncManifest;
}

export async function loadManifest(configPath?: string): Promise<LoadedManifest> {
  const resolvedPath = configPath
    ? path.resolve(configPath)
    : await resolveConfigFromCwd(process.cwd());

  const jiti = createJiti(process.cwd());
  const loaded = (await jiti.import(resolvedPath)) as { default?: unknown } | unknown;
  const raw =
    loaded && typeof loaded === "object" && "default" in loaded
      ? (loaded as { default?: unknown }).default
      : loaded;

  const parsed = manifestSchema.parse(raw);
  const baseDir = path.dirname(resolvedPath);

  const tenant = parsed.tenant ?? process.env[ENV_TENANT];
  const env = parsed.env ?? process.env[ENV_ENV];

  if (!tenant) {
    throw new Error(`Missing tenant. Set manifest.tenant or env ${ENV_TENANT}.`);
  }
  if (!env) {
    throw new Error(`Missing env. Set manifest.env or env ${ENV_ENV}.`);
  }

  return {
    filePath: resolvedPath,
    baseDir,
    scope: { tenant, env },
    manifest: parsed
  };
}

export async function readAvroSchema(
  baseDir: string,
  schema: { avro?: string; avroFile?: string }
): Promise<string> {
  if (schema.avro) {
    assertValidJson(schema.avro);
    return schema.avro;
  }
  if (!schema.avroFile) {
    throw new Error("schema declaration must include avro or avroFile");
  }
  const resolved = path.isAbsolute(schema.avroFile)
    ? schema.avroFile
    : path.resolve(baseDir, schema.avroFile);
  const content = await fs.readFile(resolved, "utf-8");
  assertValidJson(content);
  return content;
}

export function resolveCompatibility(
  item: { compatibility?: CompatibilityLevel },
  fallback?: CompatibilityLevel
): CompatibilityLevel | undefined {
  return item.compatibility ?? fallback;
}

async function resolveConfigFromCwd(cwd: string): Promise<string> {
  for (const candidate of configFileCandidates) {
    const full = path.resolve(cwd, candidate);
    try {
      await fs.access(full);
      return full;
    } catch {
      // continue
    }
  }
  throw new Error(
    `Could not find config file. Tried: ${configFileCandidates.join(", ")} in ${cwd}`
  );
}

function assertValidJson(payload: string): void {
  try {
    JSON.parse(payload);
  } catch (error) {
    throw new Error(`Invalid Avro JSON payload: ${(error as Error).message}`);
  }
}
