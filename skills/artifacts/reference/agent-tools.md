# Agent tools (Logic Conductor)

Logic Conductor serves exposed blocks, flows and business processes as MCP tools for AI agents. The tool name comes
from the artifact name, its description from the artifact's description, and its parameters from the inputs (a
process's tool takes the record).

Make an artifact a good tool:

- **Description** written for an agent: what it does, when to use it (and when not), what it returns, which tool
  to call before or after it. Two to five sentences.
- **Every input** documented in `metaInfo.description`; for a choice input list the values
  (`326950000 = Collision; ...`); for a record input say how to find it, or take a business key instead.
- **Coarse operations** ("close claim", "request settlement") rather than many small steps.
- **A precondition** (it is an entry point) and a `RaiseError` message an agent can act on.
- **Tests** of the agent path: one scripted call by business key succeeds.

Expose it with `release` `action: "expose"` in development (`hide` to withdraw). In test and production an
administrator switches on **Expose as MCP tool**.
