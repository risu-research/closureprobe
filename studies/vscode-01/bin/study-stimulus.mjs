import { createProbePayload } from "../../../dist/src/probe.js";

export function createStudyStimulus(condition, request, grounding) {
  const payload = createProbePayload(condition.scenario, request, grounding);
  return {
    format: "closureprobe-evidence-status-v1",
    request: payload.request,
    grounding: payload.grounding,
    observation: payload.observation,
  };
}
