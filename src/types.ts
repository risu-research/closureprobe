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
export type TraversalStatus =
  | "single_page_complete"
  | "aggregate_complete"
  | "continued"
  | "segment_only"
  | "unknown";

export interface QueryBinding {
  algorithm: "closureprobe-canonical-json-v1";
  requestDigest: string;
  status: ScopeBindingStatus;
}

export interface TraversalBinding {
  algorithm: "closureprobe-traversal-v1";
  rootRequestDigest: string;
  segmentRequestDigest: string;
  status: TraversalStatus;
  pageCount: number;
}

export interface ClosureObservation {
  profileId: string;
  profileVersion: string;
  queryBinding: QueryBinding;
  traversalBinding: TraversalBinding;
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
  | "traversal_not_query_complete"
  | "binding_inconsistent"
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
export type StageClaimStatus = "none" | "unknown" | "some" | "no_claim";

export interface NegativeProposition {
  subject: JsonValue;
  predicate: JsonValue;
  scope: JsonValue;
}

export interface PropositionBinding {
  algorithm: "closureprobe-proposition-v1";
  propositionDigest: string;
}

export interface StageClaim {
  status: StageClaimStatus;
  propositionBinding?: PropositionBinding;
  artifactDigest?: string;
}

export interface EvidenceIntroduction {
  profileId: string;
  profileVersion: string;
  request: JsonValue;
  response: JsonValue;
  requestDigest: string;
  responseDigest: string;
}

export interface TraceStage {
  stageId: string;
  kind: StageKind;
  observation: ClosureObservation;
  claim: StageClaim;
  evidenceIntroduction?: EvidenceIntroduction;
  rawDigest?: string;
}

export interface ClosureTrace {
  traceId: string;
  request: JsonValue;
  proposition: NegativeProposition;
  stages: TraceStage[];
}

export type FindingCode =
  | "guard_signal_loss"
  | "dangerous_mutation"
  | "unlicensed_negative"
  | "unsupported_upgrade"
  | "query_binding_mismatch"
  | "claim_binding_missing"
  | "claim_binding_mismatch"
  | "unverified_evidence_introduction";

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
    | "traversalBinding"
    | "scopeBinding"
    | "validation"
    | "queryBinding"
    | "propositionBinding"
    | "evidenceIntroduction"
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
