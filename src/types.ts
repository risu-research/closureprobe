export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ExecutionStatus = "success" | "denied" | "failed" | "unknown";
export type CardinalityStatus = "zero" | "nonzero" | "unavailable";
export type CoverageStatus = "complete" | "partial" | "unknown";
export type ContinuationStatus = "exhausted" | "present" | "unknown";
export type ScopeBindingStatus = "exact" | "narrower" | "mismatch" | "unbound";
export type ValidationStatus =
  | "profile_validated"
  | "declared_only"
  | "invalid"
  | "unavailable";

export interface QueryBinding {
  algorithm: "closureprobe-canonical-json-v1";
  requestDigest: string;
  status: ScopeBindingStatus;
}

export interface ClosureObservation {
  profileId: string;
  profileVersion: string;
  queryBinding: QueryBinding;
  execution: ExecutionStatus;
  cardinality: CardinalityStatus;
  observedCount?: number;
  coverage: CoverageStatus;
  continuation: ContinuationStatus;
  scopeBinding: ScopeBindingStatus;
  validation: ValidationStatus;
  evidencePointers: string[];
  notes?: string[];
}

export type AssessmentBranch =
  | "positive_observed"
  | "negative_candidate"
  | "no_result_claim";
export type NegativeLicense = "licensed" | "not_licensed" | "not_applicable";
export type Blocker =
  | "execution_not_success"
  | "cardinality_not_zero"
  | "coverage_not_complete"
  | "continuation_not_exhausted"
  | "scope_not_exact"
  | "validation_not_profile_validated";

export interface ClosureAssessment {
  observation: ClosureObservation;
  branch: AssessmentBranch;
  negativeLicense: NegativeLicense;
  blockers: Blocker[];
}

export type StageKind =
  | "source"
  | "adapter"
  | "mcp_wire"
  | "client"
  | "model_projection"
  | "agent_claim"
  | "other";
export type StageClaim = "none" | "unknown" | "some" | "no_claim";

export interface TraceStage {
  stageId: string;
  kind: StageKind;
  observation: ClosureObservation;
  claim: StageClaim;
  introducedValidatedEvidence: boolean;
  rawDigest?: string;
}

export interface ClosureTrace {
  traceId: string;
  request: JsonValue;
  stages: TraceStage[];
}

export type FindingCode =
  | "guard_signal_loss"
  | "dangerous_mutation"
  | "unlicensed_negative"
  | "unsupported_upgrade"
  | "query_binding_mismatch";

export interface TraceFinding {
  code: FindingCode;
  severity: "info" | "warning" | "error";
  stageId: string;
  boundary?: string;
  axis?:
    | "execution"
    | "cardinality"
    | "coverage"
    | "continuation"
    | "scopeBinding"
    | "validation"
    | "queryBinding"
    | "negativeLicense"
    | "claim";
  upstream?: string;
  downstream?: string;
  message: string;
}

export interface TraceAnalysis {
  traceId: string;
  stages: Array<{
    stageId: string;
    assessment: ClosureAssessment;
    claim: StageClaim;
  }>;
  findings: TraceFinding[];
  firstGuardSignalLoss?: TraceFinding;
  firstUnlicensedNegative?: TraceFinding;
  conformant: boolean;
}

export interface SourceProfile {
  readonly id: string;
  readonly version: string;
  assess(request: JsonValue, response: JsonValue): ClosureObservation;
}

export interface ExpectedAssessment {
  branch: AssessmentBranch;
  negativeLicense: NegativeLicense;
  blockers: string[];
}

export interface ObservationCase {
  id: string;
  kind: "observation";
  title: string;
  profileId: string;
  request: JsonValue;
  response: JsonValue;
  expected: ExpectedAssessment;
}

export interface TraceCase {
  id: string;
  kind: "trace";
  title: string;
  trace: ClosureTrace;
  expectedFindingCodes: FindingCode[];
}

export interface FrozenCorpus {
  corpusVersion: string;
  profileVersion: string;
  cases: Array<ObservationCase | TraceCase>;
}

export interface CaseResult {
  id: string;
  kind: "observation" | "trace";
  title: string;
  passed: boolean;
  expected: JsonValue;
  actual: JsonValue;
  diagnostics: string[];
}

export interface CorpusResult {
  tool: "closureprobe";
  toolVersion: string;
  corpusVersion: string;
  profileVersion: string;
  total: number;
  passed: number;
  failed: number;
  results: CaseResult[];
}
