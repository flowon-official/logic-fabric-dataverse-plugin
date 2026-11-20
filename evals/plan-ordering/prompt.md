---
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
tags: [offline, workflow, plan]
---

You are in the plan stage of a Logic Fabric change whose spec was approved. Write the task list of `plan.md` and
the list of test case IDs you would create; don't call tools other than skills.

The approved spec, in short:
- REQ-1: new column `fodemos_claim.fodemos_queuecode` (text, 50).
- REQ-2: configuration `Claims.HighValueThreshold` (Currency, default 50,000).
- REQ-3: decision table block `Intake_RoutingRules` (inputs EstimatedLoss, Threshold, PotentialDuplicate; outputs
  QueueCode, AssignToTeam), called only by `Intake_ProcessFNOL`.
- REQ-4: change the existing flow `Intake_ProcessFNOL` to call the block and assign the claim.
- REQ-5: new flow `Claims_RerouteClaim` (input ClaimNumber), an entry point for the Claims Supervisor role and
  agents through Logic Conductor; refuses closed claims with code CLAIM_NOT_OPEN.
- REQ-6: the recipe `Claim_OnCreate` that runs `Intake_ProcessFNOL` must be enabled again after the change.
- REQ-7: delete the old block `Intake_LegacyRouting`, replaced by REQ-3.
- Acceptance criteria AC-3.1 to AC-3.4 and AC-5.1 to AC-5.3.
