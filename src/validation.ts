import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";

import type {
  ClosureAssessment,
  ClosureObservation,
  ClosureTrace,
  FrozenCorpus,
  JsonValue,
} from "./types.js";

const assetRoot = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as FormatsPlugin;

function loadSchema(fileName: string): object {
  return JSON.parse(
    readFileSync(`${assetRoot}schemas/${fileName}`, "utf8"),
  ) as object;
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true,
});
addFormats(ajv);

const observationSchema = loadSchema("closure-observation.schema.json");
const assessmentSchema = loadSchema("closure-assessment.schema.json");
const traceSchema = loadSchema("closure-trace.schema.json");
const sourceProfileSchema = loadSchema("source-profile.schema.json");
const corpusSchema = loadSchema("corpus.schema.json");

ajv.addSchema(observationSchema);
ajv.addSchema(assessmentSchema);
ajv.addSchema(traceSchema);
ajv.addSchema(sourceProfileSchema);
ajv.addSchema(corpusSchema);

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (errors === null || errors === undefined || errors.length === 0) {
    return "unknown schema error";
  }
  return errors
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");
}

function requireValid<T>(validator: ValidateFunction, value: unknown, label: string): T {
  if (!validator(value)) {
    throw new Error(`${label} failed schema validation: ${formatErrors(validator.errors)}`);
  }
  return value as T;
}

const validateObservationSchema = ajv.getSchema(
  "https://risu-research.org/closureprobe/schemas/closure-observation.schema.json",
)!;
const validateAssessmentSchema = ajv.getSchema(
  "https://risu-research.org/closureprobe/schemas/closure-assessment.schema.json",
)!;
const validateTraceSchema = ajv.getSchema(
  "https://risu-research.org/closureprobe/schemas/closure-trace.schema.json",
)!;
const validateCorpusSchema = ajv.getSchema(
  "https://risu-research.org/closureprobe/schemas/corpus.schema.json",
)!;
const validateSourceProfileSchema = ajv.getSchema(
  "https://risu-research.org/closureprobe/schemas/source-profile.schema.json",
)!;

export function validateObservation(value: unknown): ClosureObservation {
  return requireValid(validateObservationSchema, value, "Closure observation");
}

export function validateAssessment(value: unknown): ClosureAssessment {
  return requireValid(validateAssessmentSchema, value, "Closure assessment");
}

export function validateTrace(value: unknown): ClosureTrace {
  return requireValid(validateTraceSchema, value, "Closure trace");
}

export function validateCorpus(value: unknown): FrozenCorpus {
  return requireValid(validateCorpusSchema, value, "Frozen corpus");
}

export function validateSourceProfileDescriptor(value: unknown): JsonValue {
  return requireValid(validateSourceProfileSchema, value, "Source profile descriptor");
}
