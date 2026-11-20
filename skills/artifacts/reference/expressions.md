# FoL expressions

Every value in a block or flow - a condition, an output, an input binding, a query operand - is an expression: a
JSON object with a `type`. Everything here is used in a deployed solution, except the forms marked *(not yet
used in a deployed example)*: validate those with a preview call before relying on them.

## Values

| Form | Meaning |
|---|---|
| `{"type":"const","tc":"String","value":"Open"}` | Constant. `tc`: `String`, `Integer`, `Decimal`, `Money`, `Boolean`, `OptionSet` |
| `{"type":"const","tc":"OptionSet","value":{"optionSetLogicalName":"fodemos_claimstage","isGlobal":true,"isTwoOptions":false,"optionSetValue":326950010}}` | Choice constant, global choice |
| `{"type":"const","tc":"OptionSet","value":{"optionSetLogicalName":"fodemos_task_fodemos_outcome","isGlobal":false,"isTwoOptions":false,"entityLogicalName":"fodemos_task","propertyLogicalName":"fodemos_outcome","optionSetValue":326950001}}` | Choice constant, local choice: name `<table>_<column>` plus table and column |
| `{"type":"const","tc":"Team","value":{"entityId":"<guid>","entityLogicalName":"team","displayName":"Claims Adjusters"}}` | Team constant (process assignment) |
| `{"type":"entityReference","logicalName":"fodemos_claim","value":<guid expression>}` | Record reference from an ID |
| `{"type":"utcNow"}` | Current time |
| `{"type":"configurationValue","name":"Handling.DefaultEvidenceDueDays","valueType":"Integer","projectName":"<project>"}` | Configuration value |

## Context: inputs, variables, results

`{"type":"context","var":"<path>","prop":["<column>", ...]}` reads a value. `prop` walks into a record or object
(empty for a plain value).

| `var` | Is |
|---|---|
| `input#<Name>` | Block or flow input |
| `<Variable>` | Flow variable created by `NewVariable` |
| `data_queries#<Fetcher>` / `data_entities#<Fetcher>` | Block data fetcher result (query / record by ID) |
| `<Action>#query_result` | Result of an `ExecuteQuery` action (record, or list when multiplicity is `All`) |
| `<Action>#entity` | Record loaded by `GetEntityById` |
| `<Action>#output:<Name>` | Output of `RunLogicBlock`, `RunLogicFlow` or `AggregateQuery` (aggregate output `value`) |
| `<Iterator>#current_item` | Current item inside an `Iterator` |
| `<TryCatch>#error` | Error message inside a `TryCatch` catch branch |
| `<RestCall>#response` | Response body inside a `CallRestApi` response handler |
| `@Process.Entity` | (processes) the record the process runs on |
| `@Process.Stage.Instance.Task` | (processes) the current stage's task |
| `Event#<Property>` | (event handlers) an event property |

Example: claim number of a loaded claim - `{"type":"context","var":"Get Claim#entity","prop":["fodemos_name"]}`.

## Functions

Binary functions use `args`; unary ones use `arg`.

| Group | Functions |
|---|---|
| Compare | `isEqualTo`, `isNotEqualTo`, `isGreaterThan`, `isGreaterThanOrEqualTo`, `isLessThan`, `isLessThanOrEqualTo` (args) |
| Null and truth | `null`, `notNull`, `notNullOrEmptyString`, `isTrue`, `isFalse` (arg) |
| Logic | `{"type":"lop","operator":"And"|"Or","args":[...]}` |
| Branch | `{"type":"if","cond":c,"true":a,"false":b}`; `{"type":"switch","value":v,"cases":[{"when":w,"then":t}],"default":d}` |
| Math | `add`, `sub`, `mul`, `div`, `max`, `min`, `round` (`[value, digits]`) |
| Dates | `addDays`, `addHours` (`[date, n]`), `daysDif`, `hoursDif` *(not yet used in a deployed example)* |
| Text | `concat` (any number of args), `toString` (`[value, format]`), `length` (arg), `join` (`[list, separator]`), `optionLabel` (`[choice]`) |
| Conversion | `toInteger` (`[value, default]`), `toDecimal` (`[value, default]`). Money from a number: `mul(money 1, x)` |
| Collections | `collectionCount` (arg); `collectionSum` over a `projection`; `any`, `filter` *(not yet used in a deployed example)* |
| Security | `userHasRole` (`[user, "<role name>", true]`); `userInTeam` (`[user, "<team name>"]`) *(not yet used in a deployed example)* |
| Records | `recordUrl` (`[reference]`) *(not yet used in a deployed example)* |
| Blocks inline | `{"type":"runLogicBlock","logicBlockName":"<block>","projectName":"<project>","outputName":"result","outputType":{"list":false,"type":"Decimal"},"arg":{"<Input>":<expr>}}` |

`toString` formats: .NET format strings - `"N2"` (1,234.50), `"G"`, `"yyyy-MM-dd"`, `"D"` (GUID of a reference).

### Projection and filter over a query result

```json
{"type":"collectionSum","arg":{"type":"projection","collection":<list expr>,
  "selectedElementType":{"type":"QueryResult","multiplicity":"All","properties":[
    {"entityLogicalName":"fodemos_payment","propertyLogicalName":"fodemos_amount","entityAlias":""}]},
  "selector":{"type":{"type":"Money"},"expression":{"type":"context","var":"p.Element","prop":["fodemos_amount"]}},
  "elementSelectorName":"p"}}
```

`filter` has the same shape with `"filter": <condition over "<alias>.Element">` instead of `selector`.

## Row conditions (decision tables and trees)

Cells in decision tables and edges in decision trees take *condition functions* applied to the column value:
`isEqualToFunc`, `isNotEqualToFunc`, `isGreaterThanFunc`, `isGreaterThanOrEqualToFunc`, `isLessThanFunc`,
`isLessThanOrEqualToFunc` (each `{"type":..., "arg": <expr>}`), and `isTrueFunc`, `isFalseFunc`, `nullFunc`,
`notNullFunc` (no arg). Use `notNullFunc` as the "any value" cell - it does not match an empty value, so make
the column's input required or give it a default.
