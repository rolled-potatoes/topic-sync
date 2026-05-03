import { ConfigResourceTypes, Kafka, KafkaJSAggregateError, KafkaJSProtocolError, type KafkaConfig } from "kafkajs";
import type { TopicManifest } from "./types";

export interface KafkaTopicState {
  name: string;
  partitions: number;
  config: Record<string, string>;
}

// brokers is required; all other kafkajs KafkaConfig options are supported.
export type KafkaClientConfig = { brokers: string[] } & Omit<KafkaConfig, "brokers">;

export class KafkaProvider {
  private readonly kafka: Kafka;

  /**
   * Accepts either:
   * - A config object (`KafkaClientConfig`) — supports all kafkajs KafkaConfig
   *   options: ssl, sasl, retry, timeouts, etc.
   * - An already-constructed `Kafka` instance — the caller's instance is reused
   *   as-is, so connection settings and authentication are fully controlled by
   *   the host application.
   */
  constructor(configOrInstance: KafkaClientConfig | Kafka) {
    if (configOrInstance instanceof Kafka) {
      this.kafka = configOrInstance;
    } else {
      this.kafka = new Kafka({
        ...configOrInstance,
        brokers: configOrInstance.brokers,
        clientId: configOrInstance.clientId ?? "krsync"
      });
    }
  }

  async listTopics(): Promise<string[]> {
    const admin = this.kafka.admin();
    await admin.connect();
    try {
      return await admin.listTopics();
    } finally {
      await admin.disconnect();
    }
  }

  async getTopicStates(topics: string[]): Promise<Map<string, KafkaTopicState>> {
    if (topics.length === 0) {
      return new Map();
    }
    const admin = this.kafka.admin();
    await admin.connect();
    try {
      const metadata = await admin.fetchTopicMetadata({ topics });
      const configs = await admin.describeConfigs({
        includeSynonyms: false,
        resources: topics.map((name) => ({
          type: ConfigResourceTypes.TOPIC,
          name
        }))
      });

      const configByTopic = new Map<string, Record<string, string>>();
      for (const resource of configs.resources) {
        configByTopic.set(
          resource.resourceName,
          Object.fromEntries(
            (resource.configEntries ?? [])
              .filter((entry) => entry.configValue !== undefined)
              .map((entry) => [entry.configName, entry.configValue as string])
          )
        );
      }

      const state = new Map<string, KafkaTopicState>();
      for (const topic of metadata.topics) {
        state.set(topic.name, {
          name: topic.name,
          partitions: topic.partitions.length,
          config: configByTopic.get(topic.name) ?? {}
        });
      }
      return state;
    } finally {
      await admin.disconnect();
    }
  }

  async createTopics(items: Array<{ name: string; spec: TopicManifest }>): Promise<void> {
    if (items.length === 0) {
      return;
    }
    const admin = this.kafka.admin();
    await admin.connect();
    try {
      await admin.createTopics({
        waitForLeaders: true,
        topics: items.map((item) => ({
          topic: item.name,
          numPartitions: item.spec.partitions,
          replicationFactor: item.spec.replicationFactor,
          configEntries: Object.entries(item.spec.config ?? {}).map(([name, value]) => ({
            name,
            value
          }))
        }))
      });
    } catch (error) {
      // Concurrent sync: if all topics already exist, treat as idempotent success.
      if (
        error instanceof KafkaJSAggregateError &&
        error.errors.every(
          (e) => e instanceof KafkaJSProtocolError && e.type === "TOPIC_ALREADY_EXISTS"
        )
      ) {
        return;
      }
      throw error;
    } finally {
      await admin.disconnect();
    }
  }

  async increasePartitions(items: Array<{ name: string; count: number }>): Promise<void> {
    if (items.length === 0) {
      return;
    }
    const admin = this.kafka.admin();
    await admin.connect();
    try {
      await admin.createPartitions({
        topicPartitions: items.map((item) => ({
          topic: item.name,
          count: item.count
        }))
      });
    } catch (error) {
      // Concurrent sync: if partition count is already at target, treat as idempotent success.
      if (error instanceof KafkaJSProtocolError && error.type === "INVALID_PARTITIONS") {
        return;
      }
      throw error;
    } finally {
      await admin.disconnect();
    }
  }

  async deleteTopics(names: string[]): Promise<void> {
    if (names.length === 0) {
      return;
    }
    const admin = this.kafka.admin();
    await admin.connect();
    try {
      await admin.deleteTopics({ topics: names });
    } finally {
      await admin.disconnect();
    }
  }

  async updateTopicConfigs(items: Array<{ name: string; config: Record<string, string> }>): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const admin = this.kafka.admin();
    await admin.connect();
    try {
      await admin.alterConfigs({
        validateOnly: false,
        resources: items.map((item) => ({
          type: ConfigResourceTypes.TOPIC,
          name: item.name,
          configEntries: Object.entries(item.config).map(([name, value]) => ({
            name,
            value
          }))
        }))
      });
    } catch (error) {
      // Concurrent sync: if config is already at desired state, treat as idempotent success.
      if (error instanceof KafkaJSProtocolError && error.type === "INVALID_CONFIG") {
        return;
      }
      throw error;
    } finally {
      await admin.disconnect();
    }
  }
}
