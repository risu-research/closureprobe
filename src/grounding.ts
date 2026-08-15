import { sha256Digest } from "./canonical.js";
import type {
  GroundingBinding,
  JsonValue,
  SourceContextIdentity,
  SourceGrounding,
} from "./types.js";

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isValidGrounding(
  grounding: SourceGrounding,
  expectedProducer?: string,
): boolean {
  const { sourceContext, propositionScope } = grounding;
  return typeof sourceContext.producer === "string" &&
    sourceContext.producer.length > 0 &&
    (expectedProducer === undefined || sourceContext.producer === expectedProducer) &&
    isRecord(sourceContext.instance) &&
    Object.keys(sourceContext.instance).length > 0 &&
    isRecord(sourceContext.authority) &&
    Object.keys(sourceContext.authority).length > 0 &&
    isRecord(propositionScope) &&
    Object.keys(propositionScope).length > 0;
}

export function bindGrounding(grounding: SourceGrounding): GroundingBinding {
  return {
    algorithm: "closureprobe-grounding-v1",
    sourceContextDigest: sha256Digest({
      algorithm: "closureprobe-grounding-v1",
      sourceContext: grounding.sourceContext,
    }),
    propositionScopeDigest: sha256Digest({
      algorithm: "closureprobe-grounding-v1",
      propositionScope: grounding.propositionScope,
    }),
  };
}

export function groundingFor(
  sourceContext: SourceContextIdentity,
  propositionScope: JsonValue,
): SourceGrounding {
  return { sourceContext, propositionScope };
}
