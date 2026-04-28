import path from "node:path";

export function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function resolveMaybeRelative(baseDir: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(baseDir, filePath);
}

export function isProdEnv(env: string): boolean {
  const normalized = env.toLowerCase();
  return normalized === "prod" || normalized === "production";
}

export function compareStringRecord(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined
): boolean {
  const keysA = Object.keys(a ?? {}).sort();
  const keysB = Object.keys(b ?? {}).sort();
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (let i = 0; i < keysA.length; i += 1) {
    const keyA = keysA[i];
    if (keyA !== keysB[i]) {
      return false;
    }
    if ((a ?? {})[keyA] !== (b ?? {})[keyA]) {
      return false;
    }
  }
  return true;
}

export function isDesiredConfigSatisfied(
  current: Record<string, string> | undefined,
  desired: Record<string, string> | undefined
): boolean {
  const desiredEntries = Object.entries(desired ?? {});
  if (desiredEntries.length === 0) {
    return true;
  }
  const currentRecord = current ?? {};
  return desiredEntries.every(([key, value]) => currentRecord[key] === value);
}
