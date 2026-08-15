# Positioning

ClosureProbe does not claim discovery of the general rule that absence requires
complete evidence, nor of semantic laundering across agent boundaries.

## Adjacent work

`When Absence Is Evidence` introduces CROWN-QA and measures whether language
models distinguish certified negatives from unknown when query-relative
coverage changes. It studies model reasoning under controlled evidence
conditions.

`Semantic Laundering in AI Agent Architectures` formalizes the architectural
problem of epistemic status increasing across trusted interfaces without new
warrant.

The official MCP conformance project tests protocol lifecycle, wire-schema, SDK,
authentication, and related specification behavior.

## ClosureProbe's wedge

ClosureProbe asks a narrower systems question:

> Given receiver-reconstructed root evidence, where in an observable
> source → adapter → protocol → client → model → claim path did the exact
> negative-evidence state change, and was any strengthening licensed?

Its unit is neither a model answer alone nor protocol validity alone. It is a
context-, scope-, query-, traversal-, profile-, and proposition-bound evidence
chain with an executable transition oracle.

In compressed form:

- completeness-sensitive reasoning asks whether a model interprets coverage;
- protocol conformance asks whether messages obey the protocol; and
- ClosureProbe asks whether the same negative conclusion remains warranted
  after the message crosses observed system boundaries.

## References

- Min et al., [When Absence Is Evidence: Evaluating Completeness-Sensitive Negative Reasoning in Large Language Models](https://arxiv.org/abs/2608.04591), 2026.
- Romanchuk and Bondar, [Semantic Laundering in AI Agent Architectures: Why Tool Boundaries Do Not Confer Epistemic Warrant](https://arxiv.org/abs/2601.08333), 2026.
- Model Context Protocol, [Conformance Test Framework](https://github.com/modelcontextprotocol/conformance).
