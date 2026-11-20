---
description: Analyze a project's business processes - metrics, anti-patterns, design defects, standards, SLA simulation and redesign opportunities.
argument-hint: "[project] [process names...]"
---

Read-only; runs any time. Process analysis for the project in `workspace.yaml` (or the processes given): $ARGUMENTS

1. Run `analyze` `kind: "process"` for the project (or each process): stage graph, metrics, path analysis,
   anti-patterns, design defects, standards audit and SLA simulation.
2. Hand the result to the `logic-fabric-dataverse:process-analyst` agent for duration estimates where stages have no
   SLA, benchmarks, regulatory mapping, redesign proposals and an executive summary. Ask the user first whether
   they want benchmark and regulatory sections (they are judgment, not measurement).
3. Write `logic-fabric/reports/insights/<yyyy-mm-dd>.md`: per process, then the portfolio. Where the server returned
   a process view, mention that it can be opened in Claude on the web or desktop.
4. Offer to start a change for design defects.
