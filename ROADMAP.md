# Roadmap

ClosureProbe rc2 deliberately stops at executable measurement and localization.
It does not pre-announce a fixed P6 or mechanically force earlier projects into
one architecture.

The next primitive should be selected by evidence from actual ClosureProbe use:

| Observed bottleneck | High-leverage next primitive |
| --- | --- |
| guard loss clusters in adapters or clients | preservation adapters or a runtime decision gate |
| trace capture is the dominant cost | target-specific capture and normalization kits |
| new producer semantics dominate failures | a reviewed profile registry and profile-authoring verifier |
| absence-dependent actions need accountable review | signed evidence packets, policy hooks, and recourse-aware decision records |
| none of these produces real demand | do not build the sequel yet |

A runtime gate remains one candidate, not a foregone conclusion. Any later
integration with decision state, legal process, or recourse must occur at a real
decision boundary and add enforceable semantics—not simply concatenate schemas
or project names.
