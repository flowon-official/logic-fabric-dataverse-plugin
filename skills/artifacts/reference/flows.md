# Logic flows

A flow is `{"def": {"input": {...}, "output": {...}, "action": <Sequential>, "dataFetchers": {}}}`. Foundry adds
`types` when it saves. Full example: [../examples/flow-close-claim.json](../examples/flow-close-claim.json).

## Inputs and outputs

```json
"input": {
  "ClaimNumber": {"type":"String","list":false,"required":true,"metaInfo":{"description":"Claim number, e.g. CLM-001014."}},
  "Claim":       {"type":"EntityReference","entityLogicalName":"fodemos_claim","list":false,"required":true,"metaInfo":{}},
  "LossDate":    {"type":"DateTime","dateTimeBehavior":"DateOnly","list":false,"required":false,"metaInfo":{}},
  "Outcome":     {"type":"OptionSet","optionSetLogicalName":"fodemos_task_fodemos_outcome","isGlobal":false,"isTwoOptions":false,
                  "entityLogicalName":"fodemos_task","propertyLogicalName":"fodemos_outcome","list":false,"required":true,"metaInfo":{}}
},
"output": {"Stage": {"type":"String","list":false,"metaInfo":{}}}
```

Types: `String`, `Integer`, `Decimal`, `Money`, `Boolean`, `DateTime`, `OptionSet`, `EntityReference`, `Entity`
(with `entityLogicalName` and `properties`). `list: true` makes a list.

## Actions

`action` is a `Sequential` whose `actions` is an object: key = action name (unique in the flow), value = action.
Actions run in key order. Every action has `"metaInfo": {}`.

| Action | Shape (besides `type`, `metaInfo`) | Result |
|---|---|---|
| `Sequential` | `actions: {name: action}` | |
| `Condition` | `condition: expr`, `true: {actions}`, `false: {actions}` | |
| `Iterator` | `collection: expr`, `actions: {...}` | `<name>#current_item` inside |
| `TryCatch` | `try: {actions}`, `catch: {actions}`, `finally: {actions}` | `<name>#error` in catch |
| `NewVariable` | `typeMetadata: {typeCode, list, entityLogicalName?, properties?}` | variable `<name>` |
| `UpdateVariable` | see below | |
| `ExecuteQuery` | `query: <query>`, `multiplicity: "Single"|"All"` | `<name>#query_result` |
| `AggregateQuery` | `query`, `function: "count"|"sum"|...`, `column?` | `<name>#output:value` |
| `GetEntityById` | `entityLogicalName`, `entityId: <reference expr>`, `properties: [...]` | `<name>#entity` |
| `SaveEntity` | `entity: <Entity variable>`, `reloadEntityAfterSave: true` | creates, or updates when the ID is set |
| `SetRecordState` | `entityLogicalName`, `entityId`, `state: Integer expr`, `status: Integer expr` | |
| `AssignRecord` | `entityLogicalName`, `entityId`, `owner: <user or team reference>` | |
| `RunLogicBlock` | `logicBlockName`, `projectName`, `inputBindings: {In: {"expression": e}}`, `outputs: {result: {type, list, metaInfo}}` | `<name>#output:<Out>` |
| `RunLogicFlow` | `logicFlowName`, `projectName`, `inputBindings`, `outputs` | `<name>#output:<Out>` |
| `RunBusinessProcess` | `businessProcessName`, `projectName`, `entityId` | starts a process on the record |
| `PublishEvent` | `eventDefinitionName`, `projectName`, `inputBindings` | |
| `CreateEmail` | `to`, `regarding`, `subject`, `body`, `send: false` | |
| `CallRestApi` | `serviceName`, `projectName`, `operation: {id, path, httpMethod}`, `security`, `parameters`, `request`, `responses: {"200": {actions}}`, `errorHandler`, `timeout` | `<name>#response` |
| `RaiseError` | `errorCode: "CODE"`, `errorMessage: expr` | stops the flow with an error |
| `Halt` | | stops the flow normally |
| `SetOutput` | `outputs: {Out: {"expression": e}}` | |

Validation set outputs (`RunLogicBlock` on a `ValidationSet`): `isValid` (Boolean) and `failedValidations`
(list of messages) or `failedValidation` (first message), depending on the block's setting.

### Writing a record

Create a typed variable, set its columns, save it. To update, set the record's ID column too:

```json
"Close":      {"type":"NewVariable","metaInfo":{},"typeMetadata":{"typeCode":"Entity","list":false,"entityLogicalName":"fodemos_claim",
               "properties":["fodemos_claimid","fodemos_claimstage","fodemos_name"]}},
"Set Close":  {"type":"UpdateVariable","metaInfo":{},"variableName":"Close","value":{"isPrimitive":false,
               "type":{"list":false,"type":"Entity","entityLogicalName":"fodemos_claim","properties":["fodemos_claimid","fodemos_claimstage"]},
               "propertySet":{
                 "fodemos_claimid":   {"operators":[{"operator":"set","args":{"value":<reference expr>}}],"properties":{}},
                 "fodemos_claimstage":{"operators":[{"operator":"set","args":{"value":<choice const>}}],"properties":{}}}}},
"Save Close": {"type":"SaveEntity","metaInfo":{},"entity":{"type":"context","var":"Close","prop":[]},"reloadEntityAfterSave":true}
```

The variable's `properties` must include the ID column and the primary name column (`subject` and `activityid`
for activity tables). A plain variable is set with
`{"isPrimitive":true,"type":{"list":false,"type":"<tc>"},"property":{"value":{"operators":[{"operator":"set","args":{"value":e}}],"properties":{}}}}`.

### Queries

```json
{"entityName":"fodemos_claim","columnSet":["fodemos_claimid","fodemos_name"],
 "filter":{"logicalOperator":0,"filters":[],"conditions":[
   {"attributeName":"fodemos_name","attributeType":"Microsoft.Dynamics.CRM.StringAttributeMetadata","operator":"Equal",
    "values":{"operand":[{"type":"context","var":"input#ClaimNumber","prop":[]}]}}]},
 "linkedEntities":[],"orders":[{"attributeName":"createdon","entityLogicalName":"fodemos_claim","descending":true}]}
```

- `logicalOperator`: `0` = And, `1` = Or. Nest groups in `filters` (same shape, no `entityName`).
- `attributeType` is the column's metadata type: `String`, `Memo`, `Integer`, `Decimal`, `Money`, `Boolean`,
  `DateTime`, `Picklist`, `Lookup`, `State`, `Uniqueidentifier` + `AttributeMetadata`, prefixed with
  `Microsoft.Dynamics.CRM.`. Primary keys are `Uniqueidentifier`; `statecode` is `State`.
- An operand has the column's type. An **ID (primary key) or lookup column compares with a record reference**: a
  record input, a lookup value or a record's ID column (`<Action>#entity` with `prop: ["<table>id"]`), never text
  (`toString(..., "D")` fails with "Type mismatch ... Expected type: EntityReference, Actual type: String"). A GUID
  can't be made into a record reference in an expression (`guid` and `entityReference` around a GUID stay text).
- An **empty operand turns the condition into "is empty"**. Pass an optional record input as it is: when it's empty
  the ID condition matches nothing (an ID is never empty), so `ID = <Application> OR number = <ApplicationNumber>`
  needs no fallback value. For a lookup column, "is empty" matches the rows without one: guard the query instead.
- Operators in use: `Equal`, `NotEqual`, `GreaterThan`, `Like` (with `%`), `In`, `Null`, `OnOrBefore`, `OnOrAfter`.
- With `multiplicity: "Single"` a missing record gives nulls: check `null` on the ID column and `RaiseError`.

## Patterns

- **Look up by business key**: `ExecuteQuery` (Single) on the number/name → `Condition` on `null` of the ID →
  `RaiseError` with a message that names the key. Agent-facing flows should take keys, not IDs.
- **Validate, then act**: run a `ValidationSet` block first; when `isValid` is false, `SetOutput` the messages and `Halt`.
- **Business numbers in blocks**: keep thresholds and amounts in blocks or configurations, call them with
  `RunLogicBlock`, and record which rule version applied.
- **External calls**: wrap `CallRestApi` in `TryCatch`; log `#error` on a record so failures are visible.
- **Hand off to people**: create the record that a business process runs on, then `RunBusinessProcess`, or let a
  recipe or event handler start it.
