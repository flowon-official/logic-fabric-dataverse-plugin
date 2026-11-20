---
description: Turn the approved spec into an ordered build plan and its test cases, and take the owner's approval.
argument-hint: "[approve]"
---

Follow the `logic-fabric-dataverse:authoring` and `logic-fabric-dataverse:testing` skills. Stage 3 (Build plan)
for the change in `logic-fabric/.active`.

If the argument is `approve`: confirm the owner is approving, record `plan_approved_by` and `plan_approved_at` in
`status.yaml` with `plan_sha256` empty (the approval hook stamps it), set `stage: build`, and ask the owner to
commit. Stop there.

Otherwise:

1. Check `status.yaml`: `stage: plan`, and the context hook reports that `spec.md` matches its approval. If the
   spec changed since approval, say so and stop.
2. Write `plan.md` from the template: the spec's hash (`spec_sha256`), the summary for approval, then one task per artifact or
   schema component, in this order: schema (then publish customizations), configurations, localized resources and
   service connections (credentials are an administrator task), blocks (leaves first), flows (callees first), event
   definitions, processes (draft), event handlers, and **go-live tasks last** (enable recipes, publish processes,
   enable schedules, expose agent tools).
3. Each task: inputs and outputs, the `Precondition:` line (entry point with its policy, condition and code, or
   internal and why), dependencies, test case IDs, done-when. Changes to existing artifacts list their consumers
   (`get` with dependencies) and add those consumers' tests to the regression set. Every deletion gets its own line
   in the summary: `Delete <kind> <name>: <reason>`, a task that checks nothing depends on it (`get` with
   dependencies), an `absent` test, and a task retiring the regression tests in `logic-fabric/baseline/tests/`
   that target it (add `retired: <this change>` to each; never delete test files).
4. Write `tests/<id>.yaml` for every acceptance criterion and every case the `testing` skill's table asks for,
   including allowed and refused personas for each precondition.
5. Show the owner the summary (what will exist, what changes, what goes live and when, deletions, risks) and ask
   for approval with `/logic-fabric-dataverse:plan approve`.
