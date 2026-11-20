---
description: Independent review of the change's artifacts against the spec, the plan and the rule catalog; writes review.md.
argument-hint: "[artifact names, to review only those]"
---

Stage 5 (Review) for the change in `logic-fabric/.active`, or a review of the named artifacts: $ARGUMENTS

1. Check `status.yaml`: `stage: review` (for a change). Outside a change, review what was named and skip the gates.
2. Hand the review to the `logic-fabric-dataverse:reviewer` agent with: the project, the change folder, and the
   artifacts the change created or changed (from `build-log.md`). Don't pass it your own opinion of them.
3. If the change adds or changes a business process, also run `analyze` `kind: "process"` on it and hand the result
   to the `logic-fabric-dataverse:process-analyst` agent. If it touches who can run what (preconditions, exposed
   tools, service connections, security), run `analyze` `kind: "security"` on the changed artifacts and hand it to
   the `logic-fabric-dataverse:security-reviewer` agent.
4. Merge their findings into `review.md` (template in the `authoring` skill), one row per finding with severity,
   artifact, path, rule, evidence and fix. Update `findings_*` in `status.yaml`.
5. Each blocker or major finding becomes a fix task in `plan.md` (`F-n`); the build fixes them
   (`/logic-fabric-dataverse:build`), then review again: only the changed artifacts, closing or reopening each
   finding. With no blocker or major open, set `stage: acceptance`.
