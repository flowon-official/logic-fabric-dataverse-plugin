# Business processes

A business process (Logic Fabric Orchestrator) runs on one record - a coverage decision, a settlement, an
investigation - and moves it through **stages**. Each stage creates a **task** for a team or user; when the task
is completed and the stage's completion criteria hold, the process follows the first transition whose guard is
true. Full example: [../examples/process-coverage-review.json](../examples/process-coverage-review.json)
(adjuster review, its outcome as an exclusive gateway, evidence wait, supervisor approval, escalation). Its team IDs are zeros: look up real teams with `security` `query: "teams"` or `lookup`.

## Tools

1. `save` with `kind: "businessProcess"`, `name`, `options.entity` (the record's table), `options.isAction`,
   `options.enableTracing`, `title`, `description`. Creates the process with an empty draft.
2. `validate`, then `save` again with the draft `metadata`. A process must exist before its metadata validates.
3. `release` with `action: "publish"` (activates by default). Instances started after this
   use the new version.
4. `find` and `get` (`version: "draft"` or `"active"`, `include: ["versions"]`).

Start a process from a flow with `RunBusinessProcess` (`businessProcessName`, `projectName`, `entityId`).

## Metadata

```json
{"def":{
  "processEntity":"fodemos_coveragedecision",
  "processEntityProperties":["fodemos_coveragedecisionid","fodemos_name","fodemos_claimid"],
  "title":{"type":"const","tc":"String","value":"Coverage Exception Review"},
  "owner":<team const>, "dueDate":<DateTime expr>,
  "startStage":"adjusterReview",
  "stages":[<stage>, ...],
  "gateways":[{"uniqueName":"split","kind":"parallel","metaInfo":{}}],
  "ends":[{"uniqueName":"covered","metaInfo":{"title":"Covered"}}],
  "transitions":[{"source":"adjusterReview","target":"covered","guard":<Boolean expr>}, ...]}}
```

In process expressions, `@Process.Entity` is the record (only the `processEntityProperties` columns) and
`@Process.Stage.Instance.Task` is the current stage's task.

### Stage

```json
{"uniqueName":"adjusterReview",
 "title":{"type":"const","tc":"String","value":"Adjuster coverage review"},
 "owner":<team const>, "dueDate":{"type":"addDays","args":[{"type":"utcNow"},{"type":"const","tc":"Integer","value":2}]},
 "assignmentOptions":{"title":<String expr>, "dueDate":<DateTime expr>,
   "assignmentStrategy":{"type":"Team","team":<team const>},
   "taskEntity":"fodemos_claimtask",
   "taskProperties":["activityid","statecode","fodemos_outcome","fodemos_outcomecomments","modifiedby"]},
 "completionCriteria":<Boolean expr over the task>,
 "onActivate":[<flow hook>], "onComplete":[<flow hook>],
 "escalation":{"target":"overdueReview"},
 "metaInfo":{}}
```

- `taskEntity` is an activity table with an outcome choice; `taskProperties` are the task columns that criteria,
  guards and hooks read. Include `statecode` and the outcome columns.
- `completionCriteria` is usually "an outcome is set and is not Pending".
- **The stage moves on only when its task is completed** (task state changes to Completed). Setting the outcome
  alone does nothing. From a flow: update the outcome, then `SetRecordState` with `state` 1 and `status` 2.
- `escalation.target`: the stage to move to when the stage is overdue (an escalation job checks due dates).

### Flow hook

```json
{"name":"applyReview","objectName":"Handling_ApplyCoverageReviewOutcome","type":"Flow","projectName":"<project>",
 "inputBindings":{"CoverageDecision":{"type":"context","var":"@Process.Entity","prop":["fodemos_coveragedecisionid"]},
                  "Outcome":{"type":"context","var":"@Process.Stage.Instance.Task","prop":["fodemos_outcome"]}},
 "outputs":{}, "guard":<optional Boolean expr>}
```

`onActivate` hooks run when the stage starts (prepare data, notify); `onComplete` hooks run when it completes
(apply the decision to the business record).

### Gateways and transitions

| `kind` | Split | Merge |
|---|---|---|
| `exclusive` | first transition whose guard is true, or the default | passes every arrival |
| `parallel` | every outgoing transition, no guards | waits for every incoming transition |
| `inclusive` | every transition whose guard is true, or the default | waits until no other active branch can arrive |

A transition is `{"source","target","guard"}`. A transition leaving an exclusive or inclusive gateway can instead be
the fallback: `"isDefault": true`, with no guard. Every path must reach an `end`.

**Branch with a gateway, not from the stage.** A stage has one outgoing transition, to the next stage, an `end` or
a gateway, with the guard `{"type":"const","tc":"Boolean","value":true}`: the stage only moves on when its task is
completed and its criteria hold. Where the task's outcome decides the path, the stage leads to an `exclusive`
gateway, and the gateway's transitions carry the guards on the outcome, as in the example. The designer and the
process viewer then show the decision as a decision. An exclusive gateway sees the task of the stages leading into
it (`@Process.Stage.Instance.Task`) when they share the task table and columns, as a review stage and its overdue
stage do.

- Give a gateway a default only for a real "anything else" path. Without one, an outcome no guard matches stops the
  process with an error.
- Use `parallel` for work that happens at the same time, and `inclusive` for optional work that can run alongside.

## Design notes

- Put the decision logic in flows the hooks call, not in guards: guards only route on the outcome.
- Assign to teams, not users, and set due dates on every stage; add an escalation stage for reviews that can stall.
- Rework loops (back to an earlier stage) are normal: "More Information" → wait for evidence → review again.
