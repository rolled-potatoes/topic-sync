import { KafkaProvider } from "./kafka";
import { loadManifest, readAvroSchema, resolveCompatibility } from "./manifest";
import { buildGroupId } from "./naming";
import {
  buildSubject,
  createDesiredTopics,
  createPlan,
  topicRefFromManifestTopic,
  type DesiredSchemaTarget,
  type DesiredTopicTarget,
  type SchemaRuntimeState,
  type TopicRuntimeState
} from "./planner";
import { SchemaRegistryProvider } from "./schemaRegistry";
import type { PlanResult } from "./types";
import { isProdEnv } from "./utils";

export interface PlanCommandOptions {
  config?: string;
  allowDelete?: boolean;
}

export interface SyncCommandOptions extends PlanCommandOptions {
  confirm?: string;
}

export async function validateCommand(configPath?: string): Promise<void> {
  const loaded = await loadManifest(configPath);
  const desiredTopics = createDesiredTopics(loaded.manifest, loaded.scope);

  for (const consumer of loaded.manifest.consumers ?? []) {
    buildGroupId({
      tenant: loaded.scope.tenant,
      env: loaded.scope.env,
      action: consumer.action
    });
  }

  const knownRefs = new Set(
    loaded.manifest.topics.map((topic) => topicRefFromManifestTopic(topic))
  );

  for (const schema of loaded.manifest.schemas ?? []) {
    if (!knownRefs.has(schema.topicRef)) {
      throw new Error(
        `schema topicRef "${schema.topicRef}" does not match any topic. Use project.service[.subservice...]`
      );
    }
    await readAvroSchema(loaded.baseDir, schema);
  }

  if (desiredTopics.size === 0) {
    throw new Error("No topics resolved from manifest");
  }
}

export async function planCommand(options: PlanCommandOptions): Promise<PlanResult> {
  const loaded = await loadManifest(options.config);
  const desiredTopics = createDesiredTopics(loaded.manifest, loaded.scope);
  const desiredSchemas = await createDesiredSchemas(
    loaded.manifest,
    loaded.baseDir,
    desiredTopics
  );

  const { kafka, schemaRegistry } = createProviders(loaded.manifest);

  const currentTopics = await loadTopicRuntimeState(kafka, desiredTopics, loaded.scope);
  const currentSchemas = await loadSchemaRuntimeState(schemaRegistry, loaded.scope);

  const result = createPlan({
    scope: loaded.scope,
    desiredTopics,
    desiredSchemas,
    currentTopics,
    currentSchemas,
    includeDeletes: Boolean(options.allowDelete)
  });

  return result.plan;
}

export async function syncCommand(options: SyncCommandOptions): Promise<PlanResult> {
  const loaded = await loadManifest(options.config);
  if (isProdEnv(loaded.scope.env) && options.confirm !== loaded.scope.env) {
    throw new Error(
      `Prod sync guard: pass --confirm ${loaded.scope.env} to apply changes in this environment.`
    );
  }

  const desiredTopics = createDesiredTopics(loaded.manifest, loaded.scope);
  const desiredSchemas = await createDesiredSchemas(
    loaded.manifest,
    loaded.baseDir,
    desiredTopics
  );

  const { kafka, schemaRegistry } = createProviders(loaded.manifest);
  const currentTopics = await loadTopicRuntimeState(kafka, desiredTopics, loaded.scope);
  const currentSchemas = await loadSchemaRuntimeState(schemaRegistry, loaded.scope);

  const planned = createPlan({
    scope: loaded.scope,
    desiredTopics,
    desiredSchemas,
    currentTopics,
    currentSchemas,
    includeDeletes: Boolean(options.allowDelete)
  });

  await applyTopics(kafka, planned.plan, desiredTopics, currentTopics, Boolean(options.allowDelete));
  await applySchemas(
    schemaRegistry,
    planned.plan,
    desiredSchemas,
    Boolean(options.allowDelete)
  );

  return planned.plan;
}

export async function statusCommand(configPath?: string): Promise<{
  topicCount: number;
  subjectCount: number;
}> {
  const loaded = await loadManifest(configPath);
  const { kafka, schemaRegistry } = createProviders(loaded.manifest);

  const topics = await kafka.listTopics();
  const subjects = await schemaRegistry.listSubjects();

  const topicCount = topics.filter((name) =>
    name.startsWith(`${loaded.scope.tenant}.${loaded.scope.env}.`)
  ).length;

  const subjectCount = subjects.filter(
    (subject) =>
      subject.startsWith(`${loaded.scope.tenant}.${loaded.scope.env}.`) && subject.endsWith("-value")
  ).length;

  return { topicCount, subjectCount };
}

function createProviders(manifest: Awaited<ReturnType<typeof loadManifest>>["manifest"]): {
  kafka: KafkaProvider;
  schemaRegistry: SchemaRegistryProvider;
} {
  if (!manifest.kafka) {
    throw new Error("manifest.kafka is required for plan/sync/status commands");
  }
  if (!manifest.schemaRegistry) {
    throw new Error("manifest.schemaRegistry is required for plan/sync/status commands");
  }
  return {
    kafka: new KafkaProvider(manifest.kafka),
    schemaRegistry: new SchemaRegistryProvider(manifest.schemaRegistry)
  };
}

async function createDesiredSchemas(
  manifest: Awaited<ReturnType<typeof loadManifest>>["manifest"],
  baseDir: string,
  desiredTopics: Map<string, DesiredTopicTarget>
): Promise<Map<string, DesiredSchemaTarget>> {
  const topicNameByRef = new Map<string, string>();
  for (const topic of desiredTopics.values()) {
    topicNameByRef.set(topic.ref, topic.name);
  }

  const desiredSchemas = new Map<string, DesiredSchemaTarget>();
  for (const schema of manifest.schemas ?? []) {
    const topicName = topicNameByRef.get(schema.topicRef);
    if (!topicName) {
      throw new Error(`schema topicRef "${schema.topicRef}" does not map to any topic`);
    }
    const subject = buildSubject(topicName);
    const avro = await readAvroSchema(baseDir, schema);
    desiredSchemas.set(subject, {
      topicRef: schema.topicRef,
      subject,
      schema: avro,
      compatibility: resolveCompatibility(schema, manifest.defaults?.compatibility)
    });
  }
  return desiredSchemas;
}

async function loadTopicRuntimeState(
  kafka: KafkaProvider,
  desiredTopics: Map<string, DesiredTopicTarget>,
  scope: { tenant: string; env: string }
): Promise<Map<string, TopicRuntimeState>> {
  const inScopeTopicNames = (await kafka.listTopics()).filter((name) =>
    name.startsWith(`${scope.tenant}.${scope.env}.`)
  );
  const states = await kafka.getTopicStates(inScopeTopicNames);
  const result = new Map<string, TopicRuntimeState>();
  for (const [name, state] of states) {
    result.set(name, {
      partitions: state.partitions,
      config: state.config
    });
  }

  for (const desiredName of desiredTopics.keys()) {
    if (!result.has(desiredName)) {
      continue;
    }
  }

  return result;
}

async function loadSchemaRuntimeState(
  schemaRegistry: SchemaRegistryProvider,
  scope: { tenant: string; env: string }
): Promise<Map<string, SchemaRuntimeState>> {
  const subjects = await schemaRegistry.listSubjects();
  const inScope = subjects.filter(
    (subject) => subject.startsWith(`${scope.tenant}.${scope.env}.`) && subject.endsWith("-value")
  );
  const result = new Map<string, SchemaRuntimeState>();
  for (const subject of inScope) {
    const schema = await schemaRegistry.getLatestSchema(subject);
    const compatibility = await schemaRegistry.getCompatibility(subject);
    result.set(subject, {
      schema,
      compatibility
    });
  }
  return result;
}

async function applyTopics(
  kafka: KafkaProvider,
  plan: PlanResult,
  desiredTopics: Map<string, DesiredTopicTarget>,
  currentTopics: Map<string, TopicRuntimeState>,
  allowDelete: boolean
): Promise<void> {
  const creates = plan.topics.filter((item) => item.action === "create");
  await kafka.createTopics(
    creates
      .map((item) => desiredTopics.get(item.name))
      .filter((item): item is DesiredTopicTarget => Boolean(item))
      .map((item) => ({ name: item.name, spec: item.spec }))
  );

  const partitionIncreases = plan.topics
    .filter((item) => item.action === "update")
    .map((item) => {
      const desired = desiredTopics.get(item.name);
      const current = currentTopics.get(item.name);
      if (!desired || !current) {
        return undefined;
      }
      if (desired.spec.partitions > current.partitions) {
        return { name: item.name, count: desired.spec.partitions };
      }
      return undefined;
    })
    .filter((item): item is { name: string; count: number } => Boolean(item));

  await kafka.increasePartitions(partitionIncreases);

  const configUpdates = plan.topics
    .filter((item) => item.action === "update")
    .map((item) => {
      const desired = desiredTopics.get(item.name);
      const current = currentTopics.get(item.name);
      if (!desired || !current) {
        return undefined;
      }
      const desiredConfig = desired.spec.config ?? {};
      const currentConfig = current.config ?? {};
      const changed = Object.keys(desiredConfig).some(
        (key) => currentConfig[key] !== desiredConfig[key]
      );
      if (!changed) {
        return undefined;
      }
      return { name: item.name, config: desiredConfig };
    })
    .filter((item): item is { name: string; config: Record<string, string> } => Boolean(item));

  await kafka.updateTopicConfigs(configUpdates);

  if (allowDelete) {
    const deletions = plan.topics
      .filter((item) => item.action === "delete")
      .map((item) => item.name);
    await kafka.deleteTopics(deletions);
  }
}

async function applySchemas(
  schemaRegistry: SchemaRegistryProvider,
  plan: PlanResult,
  desiredSchemas: Map<string, DesiredSchemaTarget>,
  allowDelete: boolean
): Promise<void> {
  const upserts = plan.schemas.filter((item) => item.action === "create" || item.action === "update");
  for (const item of upserts) {
    const desired = desiredSchemas.get(item.subject);
    if (!desired) {
      continue;
    }
    await schemaRegistry.registerSchema(item.subject, desired.schema);
    if (desired.compatibility) {
      await schemaRegistry.updateCompatibility(item.subject, desired.compatibility);
    }
  }

  if (allowDelete) {
    const deletions = plan.schemas.filter((item) => item.action === "delete");
    for (const deletion of deletions) {
      await schemaRegistry.deleteSubject(deletion.subject);
    }
  }
}
