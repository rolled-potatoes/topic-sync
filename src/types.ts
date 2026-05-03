import type { KafkaConfig } from "kafkajs";

export type CompatibilityLevel =
  | "NONE"
  | "BACKWARD"
  | "BACKWARD_TRANSITIVE"
  | "FORWARD"
  | "FORWARD_TRANSITIVE"
  | "FULL"
  | "FULL_TRANSITIVE";

export interface TopicManifest {
  project: string;
  service: string;
  subservices?: string[];
  partitions: number;
  replicationFactor: number;
  config?: Record<string, string>;
}

export interface SchemaManifest {
  topicRef: string;
  avro?: string;
  avroFile?: string;
  compatibility?: CompatibilityLevel;
}

export interface ConsumerManifest {
  action: string;
}

export interface KrsyncManifest {
  tenant?: string;
  env?: string;
  // brokers is required when providing kafka config inline.
  // All other KafkaConfig options (ssl, sasl, retry, timeouts, etc.) are
  // passed through directly to the kafkajs Kafka constructor.
  kafka?: { brokers: string[] } & Omit<KafkaConfig, "brokers">;
  schemaRegistry?: {
    url: string;
    auth?: {
      username: string;
      password: string;
    };
  };
  defaults?: {
    compatibility?: CompatibilityLevel;
  };
  topics: TopicManifest[];
  schemas?: SchemaManifest[];
  consumers?: ConsumerManifest[];
}

export interface RuntimeScope {
  tenant: string;
  env: string;
}

export interface CatalogTopicItem {
  ref: string;
  name: string;
  partitions: number;
  replicationFactor: number;
  config: Record<string, string>;
}

export interface ServiceTopicCatalog {
  scope: RuntimeScope;
  byRef: Record<string, CatalogTopicItem>;
  byName: Record<string, CatalogTopicItem>;
  list: CatalogTopicItem[];
}

export interface TopicPlanItem {
  name: string;
  action: "create" | "update" | "noop" | "delete";
  reason: string;
}

export interface SchemaPlanItem {
  subject: string;
  action: "create" | "update" | "noop" | "delete";
  reason: string;
}

export interface PlanResult {
  topics: TopicPlanItem[];
  schemas: SchemaPlanItem[];
}
