export {
  explainDrift,
  loadTopicCatalog,
  planCommand,
  statusCommand,
  syncCommand,
  validateCommand,
  type ExternalProviders,
  type PlanCommandOptions,
  type SyncCommandOptions
} from "./service";

export {
  createTopicCatalog
} from "./topicCatalog";

export {
  buildGroupId,
  buildTopicName
} from "./naming";

export {
  loadManifest,
  readAvroSchema,
  resolveCompatibility,
  type LoadedManifest
} from "./manifest";

export {
  buildSubject,
  createDesiredTopics,
  createPlan,
  topicRefFromManifestTopic,
  type DesiredSchemaTarget,
  type DesiredTopicTarget,
  type PlanInput,
  type PlannedResources,
  type SchemaRuntimeState,
  type TopicRuntimeState
} from "./planner";

export type { KafkaClientConfig, KafkaTopicState } from "./kafka";

export type {
  CatalogTopicItem,
  CompatibilityLevel,
  ConsumerManifest,
  KrsyncManifest,
  PlanResult,
  RuntimeScope,
  ServiceTopicCatalog,
  SchemaManifest,
  SchemaPlanItem,
  TopicManifest,
  TopicPlanItem
} from "./types";
