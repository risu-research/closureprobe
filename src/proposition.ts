import { sha256Digest } from "./canonical.js";
import type {
  NegativeProposition,
  PropositionBinding,
  SourceContextIdentity,
} from "./types.js";

export function bindProposition(
  proposition: NegativeProposition,
  sourceContext: SourceContextIdentity,
): PropositionBinding {
  const sourceContextDigest = sha256Digest({
    algorithm: "closureprobe-grounding-v1",
    sourceContext,
  });
  return {
    algorithm: "closureprobe-proposition-v2",
    sourceContextDigest,
    propositionDigest: sha256Digest({
      algorithm: "closureprobe-proposition-v2",
      sourceContext,
      proposition,
    }),
  };
}
