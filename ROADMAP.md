# Roadmap

ClosureProbe v0.1 deliberately stops at measurement and localization.

The next runtime primitive is **ClosureGate**: a policy-enforcement point that
consumes a receiver-revalidated closure assessment before an agent may stop,
assert absence, or take an absence-dependent action. A gate could preserve
unknown, continue pagination, retry, request broader authority, escalate, or
block the action. ClosureProbe supplies its conformance contract and regression
corpus; it does not pretend that measurement itself is enforcement.

Longer-term work may combine closure integrity with decision-state and recourse
signals. That integration should happen only at a real decision boundary, not
by mechanically concatenating schemas from separate projects.
