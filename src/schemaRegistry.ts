import type { CompatibilityLevel } from "./types";

export interface SchemaRegistryConfig {
  url: string;
  auth?: {
    username: string;
    password: string;
  };
}

interface SubjectLatestResponse {
  subject: string;
  version: number;
  id: number;
  schema: string;
}

export class SchemaRegistryProvider {
  private readonly baseUrl: string;
  private readonly authHeader?: string;

  constructor(config: SchemaRegistryConfig) {
    this.baseUrl = config.url.replace(/\/$/, "");
    if (config.auth) {
      const token = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString("base64");
      this.authHeader = `Basic ${token}`;
    }
  }

  async listSubjects(): Promise<string[]> {
    return this.request<string[]>("/subjects");
  }

  async getLatestSchema(subject: string): Promise<string | undefined> {
    try {
      const response = await this.request<SubjectLatestResponse>(
        `/subjects/${encodeURIComponent(subject)}/versions/latest`
      );
      return response.schema;
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async registerSchema(subject: string, schema: string): Promise<void> {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.request(`/subjects/${encodeURIComponent(subject)}/versions`, {
          method: "POST",
          body: JSON.stringify({ schema })
        });
        return;
      } catch (error) {
        // Conflict (409) or incompatibility (422): check if existing schema is identical.
        // This handles the concurrent sync case where another process already registered
        // the same schema.
        if (isConflict(error)) {
          const existing = await this.getLatestSchema(subject);
          if (existing !== undefined && normalizeSchema(existing) === normalizeSchema(schema)) {
            return;
          }
          // Genuine incompatibility — do not retry.
          throw error;
        }

        // Transient error: retry with exponential backoff.
        if (attempt < maxRetries) {
          await sleep(Math.pow(2, attempt - 1) * 100);
          continue;
        }

        throw error;
      }
    }
  }

  async getCompatibility(subject: string): Promise<CompatibilityLevel | undefined> {
    try {
      const response = await this.request<{ compatibilityLevel: CompatibilityLevel }>(
        `/config/${encodeURIComponent(subject)}`
      );
      return response.compatibilityLevel;
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async updateCompatibility(subject: string, level: CompatibilityLevel): Promise<void> {
    await this.request(`/config/${encodeURIComponent(subject)}`, {
      method: "PUT",
      body: JSON.stringify({ compatibility: level })
    });
  }

  async deleteSubject(subject: string): Promise<void> {
    await this.request(`/subjects/${encodeURIComponent(subject)}`, {
      method: "DELETE"
    });
  }

  private async request<T = unknown>(
    endpoint: string,
    init?: { method?: string; body?: string }
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: init?.method ?? "GET",
      headers: {
        "Content-Type": "application/vnd.schemaregistry.v1+json",
        ...(this.authHeader ? { Authorization: this.authHeader } : {})
      },
      body: init?.body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Schema Registry ${response.status}: ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.includes("404");
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("Schema Registry 409") || error.message.includes("Schema Registry 422"))
  );
}

function normalizeSchema(schema: string): string {
  try {
    return JSON.stringify(JSON.parse(schema));
  } catch {
    return schema;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
