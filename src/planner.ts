import { buildTopicName } from "./naming";
import type {
  CompatibilityLevel,
  KrsyncManifest,
  PlanResult,
  RuntimeScope,
  SchemaPlanItem,
  TopicManifest,
  TopicPlanItem
} from "./types";
import { isDesiredConfigSatisfied } from "./utils";

export interface TopicRuntimeState {
  partitions: number;
  config?: Record<string, string>;
}

export interface SchemaRuntimeState {
  schema?: string;
  compatibility?: CompatibilityLevel;
}

export interface DesiredTopicTarget {
  name: string;
  ref: string;
  spec: TopicManifest;
}

export interface DesiredSchemaTarget {
  topicRef: string;
  subject: string;
  schema: string;
  compatibility?: CompatibilityLevel;
}

export interface PlanInput {
  scope: RuntimeScope;
  desiredTopics: Map<string, DesiredTopicTarget>;
  desiredSchemas: Map<string, DesiredSchemaTarget>;
  currentTopics: Map<string, TopicRuntimeState>;
  currentSchemas: Map<string, SchemaRuntimeState>;
  includeDeletes: boolean;
}

export interface PlannedResources {
  plan: PlanResult;
}

export function createDesiredTopics(
  manifest: KrsyncManifest,
  scope: RuntimeScope
): Map<string, DesiredTopicTarget> {
  const byName = new Map<string, DesiredTopicTarget>();
  for (const topic of manifest.topics) {
    const name = buildTopicName({
      tenant: scope.tenant,
      env: scope.env,
      project: topic.project,
      service: topic.service,
      subservices: topic.subservices
    });
    const ref = topicRefFromManifestTopic(topic);
    if (byName.has(name)) {
      throw new Error(`Duplicate resolved topic name: ${name}`);
    }
    byName.set(name, { name, ref, spec: topic });
  }
  return byName;
}

export function createPlan(input: PlanInput): PlannedResources {
  const topicPlan: TopicPlanItem[] = [];
  const schemaPlan: SchemaPlanItem[] = [];

  for (const [topicName, topicTarget] of input.desiredTopics) {
    const current = input.currentTopics.get(topicName);
    if (!current) {
      topicPlan.push({
        name: topicName,
        action: "create",
        reason: "Missing in runtime; create topic from manifest"
      });
      continue;
    }

    if (current.partitions < topicTarget.spec.partitions) {
      topicPlan.push({
        name: topicName,
        action: "update",
        reason: `Runtime partitions lower than desired (${current.partitions} -> ${topicTarget.spec.partitions}); increase required`
      });
      continue;
    }

    if (current.partitions > topicTarget.spec.partitions) {
      topicPlan.push({
        name: topicName,
        action: "update",
        reason: `Runtime partitions exceed desired (${current.partitions} > ${topicTarget.spec.partitions}); decrease is not auto-applied`
      });
      continue;
    }

    if (!isDesiredConfigSatisfied(current.config, topicTarget.spec.config)) {
      topicPlan.push({
        name: topicName,
        action: "update",
        reason: "Runtime config differs from manifest config; update required"
      });
      continue;
    }

    topicPlan.push({ name: topicName, action: "noop", reason: "Aligned with manifest" });
  }

  if (input.includeDeletes) {
    for (const currentTopicName of input.currentTopics.keys()) {
      if (!belongsToTopicScope(currentTopicName, input.scope)) {
        continue;
      }
      if (!input.desiredTopics.has(currentTopicName)) {
        topicPlan.push({
          name: currentTopicName,
          action: "delete",
          reason: "Present in runtime scope but absent in manifest; delete candidate"
        });
      }
    }
  }

  for (const [subject, desired] of input.desiredSchemas) {
    const current = input.currentSchemas.get(subject);
    if (!current) {
      schemaPlan.push({
        subject,
        action: "create",
        reason: "Missing in runtime; create subject from manifest"
      });
      continue;
    }

    if (normalizeJson(current.schema) !== normalizeJson(desired.schema)) {
      schemaPlan.push({
        subject,
        action: "update",
        reason: "Runtime schema differs from manifest schema; update required"
      });
      continue;
    }

    if (desired.compatibility && current.compatibility !== desired.compatibility) {
      schemaPlan.push({
        subject,
        action: "update",
        reason: `Compatibility differs (${current.compatibility ?? "undefined"} -> ${desired.compatibility}); update required`
      });
      continue;
    }

    schemaPlan.push({ subject, action: "noop", reason: "Aligned with manifest" });
  }

  if (input.includeDeletes) {
    for (const currentSubject of input.currentSchemas.keys()) {
      if (!belongsToSubjectScope(currentSubject, input.scope)) {
        continue;
      }
      if (!input.desiredSchemas.has(currentSubject)) {
          schemaPlan.push({
            subject: currentSubject,
            action: "delete",
            reason: "Present in runtime scope but absent in manifest; delete candidate"
          });
        }
      }
  }

  return { plan: { topics: topicPlan, schemas: schemaPlan } };
}

export function topicRefFromManifestTopic(topic: TopicManifest): string {
  return [topic.project, topic.service, ...(topic.subservices ?? [])].join(".");
}

export function buildSubject(topicName: string): string {
  return `${topicName}-value`;
}

function belongsToTopicScope(topicName: string, scope: RuntimeScope): boolean {
  return topicName.startsWith(`${scope.tenant}.${scope.env}.`);
}

function belongsToSubjectScope(subject: string, scope: RuntimeScope): boolean {
  return subject.startsWith(`${scope.tenant}.${scope.env}.`) && subject.endsWith("-value");
}

function normalizeJson(payload: string | undefined): string | undefined {
  if (!payload) {
    return payload;
  }
  try {
    return JSON.stringify(JSON.parse(payload));
  } catch {
    return payload;
  }
}
