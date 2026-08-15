const requiredEntryFields = [
  "cellId",
  "conditionId",
  "runOrderPosition",
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

export function validateInvalidRunsLedger(ledger, study, matrix, runOrder) {
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

  const attemptsByCell = new Map();
  for (const [index, entry] of ledger.entries.entries()) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`invalid-runs entry ${index + 1} must be an object`);
    }
    for (const field of requiredEntryFields) {
      if (!Object.hasOwn(entry, field)) {
        throw new Error(`invalid-runs entry ${index + 1} is missing ${field}`);
      }
    }
    const cell = matrix.cells.find(({ id }) => id === entry.cellId);
    const order = runOrder.entries.find(({ cellId }) => cell?.id === cellId);
    if (cell === undefined || order === undefined) {
      throw new Error(`invalid-runs entry ${index + 1} references an unknown cell`);
    }
    if (
      entry.conditionId !== cell.conditionId ||
      entry.runOrderPosition !== order.position
    ) {
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
    const attempts = attemptsByCell.get(cell.id) ?? new Set();
    if (attempts.has(entry.attempt)) {
      throw new Error(`invalid-runs contains duplicate attempt ${entry.attempt} for ${cell.id}`);
    }
    attempts.add(entry.attempt);
    attemptsByCell.set(cell.id, attempts);
  }

  for (const [cellId, attempts] of attemptsByCell) {
    if (attempts.has(2) && !attempts.has(1)) {
      throw new Error(`invalid-runs attempt 2 for ${cellId} has no retained attempt 1`);
    }
  }

  return {
    attemptCount: ledger.entries.length,
    attemptsByCell,
    invalidExhaustedCellIds: [...attemptsByCell]
      .filter(([, attempts]) => attempts.has(1) && attempts.has(2))
      .map(([cellId]) => cellId)
      .sort(),
  };
}
