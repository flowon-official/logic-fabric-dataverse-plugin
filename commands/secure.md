---
description: Security analysis of a Logic Fabric project - who can run what, attack paths, privilege escalation, segregation of duties, secrets and missing preconditions.
argument-hint: [project]
---

Read-only; runs any time. Security analysis of the project in `workspace.yaml` (or the one given): $ARGUMENTS

1. Run `analyze` `kind: "security"` for the project: the security graph (roles, teams, users, artifacts, tables) and
   the detectors' findings, each with its evidence verified against the metadata.
2. Hand the result to the `logic-fabric-dataverse:security-reviewer` agent: it reviews each finding, prunes false
   positives, writes attack scenarios for the serious ones and a conclusion per security role.
3. Write `logic-fabric/reports/secure/<yyyy-mm-dd>.md`: ranked findings (risk 0 to 100, evidence, remediation),
   scenarios, per-role conclusions, and the difference from the previous report.
4. Offer to start a change for the findings that need one (most often: entry points without preconditions).
