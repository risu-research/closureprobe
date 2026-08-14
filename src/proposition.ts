import { sha256Digest } from "./canonical.js";
import type {
  NegativeProposition,
  PropositionBinding,
} from "./types.js";

export function bindProposition(
  proposition: NegativeProposition,
): PropositionBinding {
  return {
    algorithm: "closureprobe-proposition-v1",
    propositionDigest: sha256Digest({
      algorithm: "closureprobe-proposition-v1",
      proposition,
    }),
  };
}
