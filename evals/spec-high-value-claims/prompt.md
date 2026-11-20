---
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
tags: [offline, workflow, spec]
---

You are in the spec stage of a Logic Fabric change. Write the spec (the content of `spec.md`) in your reply; don't
call any tools other than skills.

The request: "When a claim with an estimated loss over the high-value threshold is reported, assign it to the Senior
Adjusters team and set its queue code to HIGH-VALUE. Supervisors and the intake agent (through Logic Conductor) can
re-route a claim by claim number."

What the prompt stage found and the owner confirmed:
- Project InsuranceClaimsManagement, solution prefix `fodemos`.
- Table `fodemos_claim`: `fodemos_name` (claim number, text), `fodemos_estimatedloss` (Currency),
  `fodemos_queuecode` (text, 50), `ownerid`.
- Teams: Senior Adjusters, General Adjusters. Role: Claims Supervisor.
- The threshold is 50,000 and administrators must be able to change it.
- Claims are reported by creating the row; the intake flow `Intake_ProcessFNOL` already runs on create.
