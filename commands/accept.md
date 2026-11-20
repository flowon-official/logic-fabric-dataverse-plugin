---
description: Run the acceptance scenarios on fresh fixtures, show the evidence to the owner and record the decision.
argument-hint: [accept | reject spec | reject build]
---

Follow the `logic-fabric-dataverse:testing` skill. Stage 6 (Acceptance) for the change in `logic-fabric/.active`.

If the argument is `accept`: record `accepted_by` and `accepted_at` in `status.yaml` and `acceptance.md`, set
`stage: accepted`, merge the glossary additions into `logic-fabric/glossary.md`, copy the change's tests into
`logic-fabric/baseline/tests/` (the regression set), update the as-built requirements document with the
`logic-fabric-dataverse:documenter` agent, clear `logic-fabric/.active`, and tell the owner the change is ready
for ALM (export the solution and run the pipeline). Stop there.

If the argument is `reject spec` or `reject build`: only when the owner rejects. Record the reason in `acceptance.md`,
and `rejected_by` and `rejected_reason` (a new reason) in `status.yaml` in the same edit that sets the stage back to
`spec` or `build`; the stage hook refuses the move without them. Accepting a change closes it: work after that,
undoing it included, is a new change.

Otherwise:

1. Check `status.yaml`: `stage: acceptance`, no open blocker or major finding.
2. Run every test of the change and the regression set on fresh fixtures (retired cases are skipped), and check that the exported sources in
   `artifacts/` match the environment (`get` with `include: ["source"]`).
3. Write `acceptance.md`: each acceptance criterion with its evidence (records and their links, outputs), the test
   totals and the review verdict.
4. Walk the owner through it and ask them to accept or reject.
