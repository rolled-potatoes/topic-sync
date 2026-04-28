import {
  MAX_GROUP_ID_LENGTH,
  MAX_TOPIC_LENGTH,
  TOPIC_SEGMENT_REGEX
} from "./constants";

interface TopicNameInput {
  tenant: string;
  env: string;
  project: string;
  service: string;
  subservices?: string[];
}

interface GroupIdInput {
  tenant: string;
  env: string;
  action: string;
}

export function buildTopicName(input: TopicNameInput): string {
  const segments = [
    input.tenant,
    input.env,
    input.project,
    input.service,
    ...(input.subservices ?? [])
  ];
  validateSegments(segments, "topic");
  const topic = segments.join(".");
  if (topic.length > MAX_TOPIC_LENGTH) {
    throw new Error(`Topic is too long (${topic.length} > ${MAX_TOPIC_LENGTH}): ${topic}`);
  }
  return topic;
}

export function buildGroupId(input: GroupIdInput): string {
  const segments = [input.tenant, input.env, input.action];
  validateSegments(segments, "groupId");
  const groupId = segments.join(".");
  if (groupId.length > MAX_GROUP_ID_LENGTH) {
    throw new Error(
      `GroupId is too long (${groupId.length} > ${MAX_GROUP_ID_LENGTH}): ${groupId}`
    );
  }
  return groupId;
}

function validateSegments(segments: string[], kind: string): void {
  if (segments.length === 0) {
    throw new Error(`${kind} must have at least one segment.`);
  }
  for (const segment of segments) {
    if (!segment || segment.trim() !== segment) {
      throw new Error(`${kind} has an empty or malformed segment.`);
    }
    if (!TOPIC_SEGMENT_REGEX.test(segment)) {
      throw new Error(
        `${kind} segment "${segment}" includes unsupported characters. Allowed: [a-z0-9-]`
      );
    }
  }
}
