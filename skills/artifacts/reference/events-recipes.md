# Events, handlers, recipes, schedules, configurations

## Business events and handlers

An event definition names something that happened (`ClaimReported`, `SettlementApproved`) and its properties.
Flows publish it with `PublishEvent`; handlers run a flow for each publish, synchronously or asynchronously.
Producers never know their consumers.

`save` with `kind: "eventDefinition"`, `project`, `name`, `metadata`, `title`, `description`:

```json
{"optionSets":{},
 "entityTypes":{
   "fodemos_claim":{"primaryIdAttribute":"fodemos_claimid","nameAttribute":"fodemos_name",
     "properties":{"fodemos_claimid":{"propertyType":"UniqueIdentifier"},
                   "fodemos_name":{"propertyType":"SingleLineOfText","required":false,"maxLength":1000}}},
   "team":{"primaryIdAttribute":"teamid","nameAttribute":"name","properties":{}},
   "systemuser":{"primaryIdAttribute":"systemuserid","nameAttribute":"fullname","properties":{}}},
 "objectTypes":{"EventDefinition":{"properties":{
   "Claim":{"propertyType":"Lookup","required":true,"target":"fodemos_claim","referenceKind":"Target"},
   "Claim Number":{"propertyType":"SingleLineOfText","required":false},
   "Loss Date":{"propertyType":"DateTime","required":false,"dateTimeBehavior":"DateOnly"}}}},
 "processActions":{}}
```

Every `Lookup` property needs its table in `entityTypes` with the ID and name columns.

`save` with `kind: "eventHandler"`, `name`, `metadata`, and `options` `eventDefinition` (name), `logicFlow` (name),
`async`. The metadata binds the flow's inputs to event properties; Foundry adds the
types:

```json
{"InputBindings":{"Claim":{"type":"context","var":"Event#Claim","prop":[]}}}
```

Use `async: true` for follow-up work (start a process, notify, call a service) and `false` when the publisher must
see the result in the same transaction (for example an audit record).

## Logic recipes

A recipe attaches blocks and flows to a table's create, update and delete messages - the no-code equivalent of a
Dataverse plug-in. `save` with `kind: "logicRecipe"`, `name`, `metadata`, and `options.entity` (the table).
A new recipe is saved enabled; switch it with `release` `enable` / `disable`, as a go-live task. Metadata `def`:

```json
{"entity":"fodemos_claim",
 "create":{"entityProperties":["fodemos_claimid","fodemos_claimstage", ...],
           "validation":[{"logicBlockName":"Intake_ValidateFNOL","projectName":"<project>",
                          "inputBindings":{"PolicyNumber":{"type":"context","var":"fodemos_claim","prop":["fodemos_policynumber"]}},
                          "guard":<optional Boolean expr>}],
           "preOperation":[],
           "postOperation":[{"isAsync":true,"objectName":"Intake_ProcessFNOL","type":"Flow","projectName":"<project>",
                             "inputBindings":{"Claim":{"type":"context","var":"fodemos_claim","prop":["fodemos_claimid"]}},
                             "guard":<optional>}]},
 "update":{"entityProperties":[...],"preEntityProperties":[...],"validation":[],"preOperation":[],"postOperation":[]},
 "delete":{"entityProperties":[],"validation":[],"preOperation":[],"postOperation":[]}}
```

- In recipe expressions, `<table>` (for example `fodemos_claim`) is the record being saved - on update only the
  columns that changed - and `pre_<table>` is the record before the change (pre-image).
- `entityProperties` on update are the **filtering columns**: the recipe runs only when one of them changes.
  `preEntityProperties` are the pre-image columns.
- "Value after the update" = `if(notNull(<table>.col), <table>.col, pre_<table>.col)`.
- "Changed to X" = the new value is X and the pre-image value is not X - guard on it so a step runs once per change.
- Validation runs at PreValidation (before the transaction), so `modifiedby` and other system values are not set
  yet. A failed validation set blocks the save and shows its messages.
- Changing the filtering columns or pre-image of an existing recipe: delete and recreate the recipe if the update
  does not take effect.

## Schedules

`save` with `kind: "schedule"`, `name`, and `options` `logicFlow` (name), `frequency` (`Minute`, `Hour`, `Day`,
`Week`, `Month`), `interval`, `startDate` (omit for now), `timeZoneCode`. Enable or disable it with `release`. The flow takes no inputs and should be
safe to run twice (it looks for work to do, for example overdue tasks or aging payments).

## Configurations

`save` with `kind: "configuration"`, `name` (`Area.Name`), and `options` `type` (`Integer`, `Decimal`, `String`,
`Boolean`, ...), `value` (as text, invariant culture), `cacheEntryStrategy` (`Volatile`, `Ephemeral`, `Constant`),
`timeToLive` (minutes). Read it with the `configurationValue` expression; change the value by saving again.
Use configurations for values an administrator changes (default due days, rates), and parameter tables read by
blocks for values that are effective-dated or audited.
