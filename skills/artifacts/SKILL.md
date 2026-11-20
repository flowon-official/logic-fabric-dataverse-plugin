---
name: artifacts
description: Metadata shapes, patterns and deployed examples for every Logic Fabric artifact kind - logic blocks, logic flows, business processes, events and handlers, recipes, schedules, configurations, service connections and REST calls, Logic APIs, preconditions, agent tools and Dataverse schema definitions. Use when writing or reviewing the metadata of one of them.
---

# Logic Fabric artifacts

Open the reference for the kind you are writing. The server's `reference` tool has the authoritative shapes
(`topic: "schemas"`, `"actions"`, `"expressions"`); these files add the patterns and the mistakes to avoid.

| Kind | Reference | Deployed example |
|---|---|---|
| Logic blocks (formula, decision table, decision tree, validation, validation set) | [blocks.md](reference/blocks.md) | [formula](examples/block-formula.json), [decision table](examples/block-decision-table.json), [validation set](examples/block-validation-set.json) |
| Logic flows (actions, queries, writing rows) | [flows.md](reference/flows.md) | [flow](examples/flow-close-claim.json) |
| Business processes (stages, tasks, gateways, escalation) | [processes.md](reference/processes.md) | [process](examples/process-coverage-review.json) |
| Events, handlers, recipes, schedules, configurations | [events-recipes.md](reference/events-recipes.md) | |
| Expressions | [expressions.md](reference/expressions.md) | |
| Preconditions | [preconditions.md](reference/preconditions.md) | |
| Service connections and REST calls | [service-connections.md](reference/service-connections.md) | |
| Logic APIs | [logic-apis.md](reference/logic-apis.md) | |
| Dataverse schema (tables, columns, choices, relationships, reference rows) | [schema.md](reference/schema.md) | |
| Agent tools (Logic Conductor) | [agent-tools.md](reference/agent-tools.md) | |

The examples come from the deployed claims demo; their project name is `<project>` and their team IDs are zeros.
Look real names and IDs up before you use any of it.
