---
description: Ask a reviewer to waive a governance rule for the project, or for one artifact of it, recorded in Foundry.
argument-hint: "<rule> [artifact] [until yyyy-mm-dd] - <reason>"
---

Follow the `logic-fabric-dataverse:authoring` skill. Waive a governance rule: $ARGUMENTS

1. A waiver is approved within a change Foundry knows: use the change in `logic-fabric/.active`. Without one, ask the
   user to start one (`/logic-fabric-dataverse:start`) and stop.
2. Take the rule ID (such as `LF-011`), the artifact when the waiver is for one (`<kind> <name>`), an end date when
   given, and the reason in the user's words. Without a reason, ask for one. Never waive a rule the user didn't name.
3. Call `release` with `action: "approve"`, `options.gate: "exception"`, `options.rule`, `options.reason`, and
   `options.artifact` and `options.expiresOn` (`yyyy-mm-dd`) when given, with the `changeId` and `project`. A waiver
   needs a reviewer (the Logic Fabric Foundry Reviewer role): Foundry asks the user in the client's dialog when they
   are one, else answers with a link to its approval page. Give the user the link to pass to a reviewer; you can't
   answer it. When the user says it's answered, call again with the same options: it reports the waiver, or asks
   again if the reviewer declined.
4. Note the waiver in the change's `build-log.md`. From then on `analyze` `kind: "governance"` skips the rule there
   and lists it under `waived`, and `/logic-fabric-dataverse:govern` reports it with its reason.
