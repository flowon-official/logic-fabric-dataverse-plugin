---
description: Check a Logic Fabric project against the governance rule catalog and the project's own rules; writes a findings report.
argument-hint: [project] [sections...]
---

Read-only; runs any time. Governance review of the project in `workspace.yaml` (or the one given): $ARGUMENTS

1. Run `analyze` `kind: "governance"` for the project: the rules Foundry checks by code, with findings.
2. Hand the project and that result to the `logic-fabric-dataverse:reviewer` agent in governance mode: it applies the
   rules that need judgment (`reference` `topic: "rules"`), honouring `logic-fabric/rules.yaml` (rules switched off,
   severities changed, the project's own rules in plain language).
3. Write `logic-fabric/reports/govern/<yyyy-mm-dd>.md`: findings by section and severity with rule, artifact,
   path, evidence and fix, and what changed since the previous report.
4. Offer to start a change for the blocker and major findings (`/logic-fabric-dataverse:start --from <report>#<finding>`).
