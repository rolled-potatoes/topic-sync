import { buildTopicName } from "./naming";
import { topicRefFromManifestTopic } from "./planner";
import type {
  CatalogTopicItem,
  KrsyncManifest,
  RuntimeScope,
  ServiceTopicCatalog
} from "./types";

export function createTopicCatalog(
  manifest: KrsyncManifest,
  scope: RuntimeScope
): ServiceTopicCatalog {
  const byRef: Record<string, CatalogTopicItem> = {};
  const byName: Record<string, CatalogTopicItem> = {};
  const list: CatalogTopicItem[] = [];

  for (const topic of manifest.topics) {
    const ref = topicRefFromManifestTopic(topic);
    const name = buildTopicName({
      tenant: scope.tenant,
      env: scope.env,
      project: topic.project,
      service: topic.service,
      subservices: topic.subservices
    });

    if (byRef[ref]) {
      throw new Error(`Duplicate topicRef in manifest: ${ref}`);
    }
    if (byName[name]) {
      throw new Error(`Duplicate resolved topic name: ${name}`);
    }

    const item: CatalogTopicItem = {
      ref,
      name,
      partitions: topic.partitions,
      replicationFactor: topic.replicationFactor,
      config: { ...(topic.config ?? {}) }
    };

    byRef[ref] = item;
    byName[name] = item;
    list.push(item);
  }

  return {
    scope: { tenant: scope.tenant, env: scope.env },
    byRef,
    byName,
    list
  };
}
