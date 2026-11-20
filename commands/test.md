---
description: Run the change's tests (or some of them) through Logic Foundry and update test-report.md.
argument-hint: "[test case IDs]"
---

Follow the `logic-fabric-dataverse:testing` skill. For the change in `logic-fabric/.active`, run the test cases
given ($ARGUMENTS), or all of them: read `tests/*.yaml`, pass them to `test` with the personas from
`workspace.yaml` and the change ID, and update `test-report.md` and the `tests_*` fields in `status.yaml`. For each
failure show expected and actual and the likely cause. Running tests creates and deletes fixture rows in the
development environment; the gate hook allows it only during build and review.
