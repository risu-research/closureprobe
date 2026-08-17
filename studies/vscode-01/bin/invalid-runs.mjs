const requiredEntryFields = [
  "phase",
  "cellId",
  "conditionId",
  "position",
  "attempt",
  "startedAt",
  "invalidatedAt",
  "specimenId",
  "reasonCode",
  "privateArtifactHashes",
];

function requireTimestamp(value, name) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} must be an ISO-compatible timestamp`);
  }
}

function requireNonemptyString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a nonempty string`);
  }
}

function attemptKey(phase, cellId) {
  return `${phase}:${cellId}`;
}

export function validateInvalidRunsLedger(
  ledger,
  study,
  matrix,
  runOrder,
  commissioning,
) {
  if (
    ledger === null ||
    typeof ledger !== "object" ||
    Array.isArray(ledger) ||
    ledger.studyId !== study.studyId ||
    !Array.isArray(ledger.entries)
  ) {
    throw new Error("invalid-runs.json does not match the study ledger");
  }
  if (
    !Array.isArray(ledger.requiredEntryFields) ||
    JSON.stringify(ledger.requiredEntryFields) !== JSON.stringify(requiredEntryFields)
  ) {
    throw new Error("invalid-runs.json requiredEntryFields differs from the frozen contract");
  }
  const policy = study.design.invalidRunPolicy;
  if (
    policy?.maxAttemptsPerCell !== 2 ||
    policy?.secondInvalidStatus !== "invalid_exhausted" ||
    policy?.thirdAttemptPermitted !== false ||
    policy?.continueAfterInvalidExhausted !== true
  ) {
    throw new Error("study invalid-run policy is missing or unsupported");
  }

  if (
    commissioning === null ||
    typeof commissioning !== "object" ||
    Array.isArray(commissioning) ||
    commissioning.studyId !== study.studyId ||
    !Array.isArray(commissioning.cells)
  ) {
    throw new Error("commissioning.json does not match the study");
  }

  const attemptsByCell = new Map();
  const attemptCountByPhase = { commissioning: 0, primary: 0 };
  for (const [index, entry] of ledger.entries.entries()) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`invalid-runs entry ${index + 1} must be an object`);
    }
    for (const field of requiredEntryFields) {
      if (!Object.hasOwn(entry, field)) {
        throw new Error(`invalid-runs entry ${index + 1} is missing ${field}`);
      }
    }
    if (!Object.hasOwn(attemptCountByPhase, entry.phase)) {
      throw new Error(
        `invalid-runs entry ${index + 1}.phase must be commissioning or primary`,
      );
    }
    const primaryCell = matrix.cells.find(({ id }) => id === entry.cellId);
    const commissioningCell = commissioning.cells.find(({ id }) => id === entry.cellId);
    const cell = entry.phase === "primary" ? primaryCell : commissioningCell;
    const position = entry.phase === "primary"
      ? runOrder.entries.find(({ cellId }) => primaryCell?.id === cellId)?.position
      : commissioningCell?.commissioningPosition;
    if (cell === undefined || position === undefined) {
      throw new Error(
        `invalid-runs entry ${index + 1} references a cell outside its declared phase`,
      );
    }
    if (entry.conditionId !== cell.conditionId || entry.position !== position) {
      throw new Error(`invalid-runs entry ${index + 1} contradicts the frozen cell mapping`);
    }
    if (!Number.isSafeInteger(entry.attempt) || entry.attempt < 1 || entry.attempt > 2) {
      throw new Error(`invalid-runs entry ${index + 1} attempt must be 1 or 2`);
    }
    requireTimestamp(entry.startedAt, `invalid-runs entry ${index + 1}.startedAt`);
    requireTimestamp(entry.invalidatedAt, `invalid-runs entry ${index + 1}.invalidatedAt`);
    if (Date.parse(entry.invalidatedAt) < Date.parse(entry.startedAt)) {
      throw new Error(`invalid-runs entry ${index + 1} invalidatedAt precedes startedAt`);
    }
    requireNonemptyString(entry.specimenId, `invalid-runs entry ${index + 1}.specimenId`);
    requireNonemptyString(entry.reasonCode, `invalid-runs entry ${index + 1}.reasonCode`);
    if (
      entry.privateArtifactHashes === null ||
      typeof entry.privateArtifactHashes !== "object" ||
      Array.isArray(entry.privateArtifactHashes)
    ) {
      throw new Error(`invalid-runs entry ${index + 1}.privateArtifactHashes must be an object`);
    }
    const key = attemptKey(entry.phase, cell.id);
    const attempts = attemptsByCell.get(key) ?? new Set();
    if (attempts.has(entry.attempt)) {
      throw new Error(
        `invalid-runs contains duplicate attempt ${entry.attempt} for ${entry.phase} ${cell.id}`,
      );
    }
    attempts.add(entry.attempt);
    attemptsByCell.set(key, attempts);
    attemptCountByPhase[entry.phase] += 1;
  }

  for (const [key, attempts] of attemptsByCell) {
    if (attempts.has(2) && !attempts.has(1)) {
      throw new Error(`invalid-runs attempt 2 for ${key} has no retained attempt 1`);
    }
  }

  const invalidExhaustedCellIds = (phase) => [...attemptsByCell]
    .filter(([key, attempts]) =>
      key.startsWith(`${phase}:`) && attempts.has(1) && attempts.has(2)
    )
    .map(([key]) => key.slice(phase.length + 1))
    .sort();

  return {
    attemptCount: ledger.entries.length,
    attemptCountByPhase,
    attemptsByCell,
    invalidExhaustedCommissioningCellIds: invalidExhaustedCellIds("commissioning"),
    invalidExhaustedPrimaryCellIds: invalidExhaustedCellIds("primary"),
  };
}
