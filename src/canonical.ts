import { createHash } from "node:crypto";

import type { JsonValue } from "./types.js";

function assertJsonValue(value: unknown, path: string): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} contains a non-finite number`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }

  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} is not a plain JSON object`);
    }
    for (const [key, child] of Object.entries(value)) {
      assertJsonValue(child, `${path}.${key}`);
    }
    return;
  }

  throw new TypeError(`${path} contains a non-JSON value`);
}

function serialize(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => serialize(item)).join(",")}]`;
  }

  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serialize(value[key]!)}`);
  return `{${entries.join(",")}}`;
}

export function canonicalizeJson(value: unknown): string {
  assertJsonValue(value, "$");
  return serialize(value);
}

export function sha256Digest(value: unknown): string {
  const canonical = canonicalizeJson(value);
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}
