---
name: testing
description: How to design, write and run Logic Fabric tests - the test case format, fixtures, triggers, assertions, personas for precondition tests, the definition of done per artifact kind, and the acceptance criteria for a change. Use when writing tests in the plan stage, running them in build, or judging whether a change is done.
---

# Testing Logic Fabric changes

Tests are written in the plan stage, from the spec's acceptance criteria, before any artifact exists. They live in
`tests/<id>.yaml` and run on the server through Foundry's `test` tool. Every acceptance criterion traces to at
least one test case.

## Test case format

```yaml
id: TC-3.1                       # unique in the change
covers: [AC-3.1]                 # the acceptance criteria it proves
level: unit                      # unit | integration | acceptance
target: { kind: logicBlock, name: Intake_RoutingRules }
runAs: adjuster                  # optional: a persona from workspace.yaml
fixtures:                        # rows created before the test, deleted after
  - create: { table: fodemos_claim, as: claim, values: { fodemos_name: "TST-{run}-C1", fodemos_estimatedloss: { money: 50000.01 } } }
given:
  input: { ClaimNumber: "TST-{run}-C1" }   # run the target (block or flow) with these inputs
when:                            # or trigger the way production does (integration)
  update: { ref: claim, values: { fodemos_stage: { choice: 100000002 } } }
expect:
  output: { QueueCode: HIGH-VALUE }        # the target's outputs
  error: { code: CLAIM_NOT_OPEN }          # or an expected error
  records:
    - { ref: claim, columns: { fodemos_queuecode: HIGH-VALUE }, within: 60s }
    - { table: task, where: { regardingobjectid: "{claim}" }, count: 1, within: 60s }
teardown: delete-created
```

- `{run}` is the run's tag; `{alias}` is the ID of a fixture row (`as: claim`). Every fixture's primary name
  carries `TST-{run}`.
- Who does what: fixtures are created as Foundry's signed-in user (they set the scene, so a persona without create
  rights can still be tested); `when` and the target run as the case's `runAs` persona; `records` are checked as
  Foundry's user. A fixture that a persona must own (an assessment owned by the analyst, an application prepared by
  someone else) carries its own `runAs`: `- create: {...}` with `runAs: credit_analyst` next to `create`.
- A flow's `RaiseError` or a refused precondition is a failed run with its code (`expect.error`), whatever step it
  comes from.
- Values: text, numbers, `true`/`false`, `{choice: n}`, `{money: n}`, `{lookup: {table, id}}`, `"{alias}"` for a
  lookup to a fixture.
- Assertions: `output` (equals; numbers compare to two decimals for Currency; dates by value, so `"2026-11-27"`
  matches any time that day and `"2026-11-27T10:00:00Z"` the same instant: never write .NET's
  `"2026-11-27T00:00:00.0000000"` into a case), `error` (`code`, `message` contains),
  `records` (`ref` or `table` + `where`; `columns` equal, `count`, `exists: false`, `within` for asynchronous work),
  `absent: true` (the target artifact no longer exists; nothing is run). A missing required input or a value of the
  wrong type fails the run with the platform's message: assert it with `error: { message: <input name> }`.
- `retired: <change>` at the top of a case: a later change removed or replaced what it tests. The case stays in its
  file and is reported as skipped, not run. Retire a case by editing it; never delete test files. A change never
  retires its own tests (the stage hook refuses it): a failing test means fixing the artifact, or a plan amendment
  the owner approves.

## Running

`test` with the change's test cases (read the YAML files and pass them as JSON), the personas from
`workspace.yaml`, and `changeId`. It returns one result per case: passed, failed (expected and actual), errored
(the message) or skipped (retired), with timings. A `when` that Dataverse refuses (a validation recipe, a column's
range or required level) is the case's outcome, checked against `expect.error`. Write `test-report.md` from it, including the traceability matrix.

Tests run only where `workspace.yaml` has `tests_allowed: true`. Never against production.

The same files run in a pipeline with the command-line tools, so the release runs the tests Claude ran:
`flowon-dynamics test --foundry-url <url>/mcp --project <Project> --tests logic-fabric/changes/<change>/tests
--workspace logic-fabric/workspace.yaml --junit test-results.xml` (bearer token in `FOUNDRY_TOKEN`; exits non-zero
when a case fails). When the user asks for a pipeline, add this step after the import into the test environment.

## Designing the cases

| Kind | Cases you need |
|---|---|
| Formula block | each output, nulls, boundaries |
| Decision table | every row hit, the catch-all row, each boundary on both sides |
| Decision tree | every leaf |
| Validation set | each message triggered once, plus one all-valid case |
| Logic flow | happy path, each `Condition` branch, each `RaiseError`, writes asserted on rows, each REST call's failure |
| Logic recipe | each guard true and false; an update to a non-filtering column does not trigger it; a failed validation blocks the save (with every other column inside its range: Dataverse checks ranges first) |
| Business process | every transition and end, escalation with a past due date, hook effects, published and active |
| Event and handler | publishing produces the handler's effect within the budget |
| Schedule | its flow run twice does the work once |
| Service connection | each operation used, against the sandbox, including one error status |
| Precondition (any protected artifact) | an allowed persona succeeds; a refused persona gets `UNAUTHORIZED_ACCESS` and nothing changes; the condition true and false |
| Agent tool | one call by business key succeeds |
| Removal (a delete in the plan) | `expect: { absent: true }` for each removed artifact; and in the same change, `retired: <this change>` added to every regression test in `logic-fabric/baseline/tests/` that targets it |

## A change is accepted when

1. A clean run of every test in the change and the regression set passes.
2. `test-report.md` shows every requirement with acceptance criteria, and every criterion with passing tests.
3. The review has no open blocker or major finding.
4. The exported sources in `artifacts/` match the environment.
5. The owner has seen the acceptance run's evidence and signed `acceptance.md`.
