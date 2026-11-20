# Logic blocks

Blocks hold business rules. They read data but never change it, so they are safe to call anywhere: from flows,
recipes, other blocks (the inline `runLogicBlock` expression), forms and agents. Every block is
`{"def": {"input": {...}, ..., "dataFetchers": {...}}}`; inputs use the same shape as flow inputs
([flows.md](flows.md)).

`logicBlockType` on create/preview: `Formula`, `DecisionTable`, `DecisionTree`, `Validation`, `ValidationSet`.

## Data fetchers

Blocks load data through named fetchers, read as `data_queries#<name>` and `data_entities#<name>`:

```json
"dataFetchers": {
  "Effective Parameter": {"type":"Query","multiplicity":"Single","query":<query, see flows.md>,"metaInfo":{}},
  "Claim": {"type":"Entity","entityLogicalName":"fodemos_claim","entityId":{"type":"context","var":"input#Claim","prop":[]},
            "properties":["fodemos_name","fodemos_claimstage"],"metaInfo":{}}
}
```

## Formula

One expression, one typed result (output name `result`):

```json
{"def":{"input":{...},"type":{"typeCode":"Money"},"formula":<expr>,"dataFetchers":{}}}
```

Example: [../examples/block-formula.json](../examples/block-formula.json) - settlement = eligible amount less
deductible, capped by the remaining limit, never below zero.

## Decision table

Columns are named conditions over expressions; each row has one cell per column and one value per output. Rows
are checked in order and the first full match wins, so put the catch-all row (all `notNullFunc`) last.

```json
{"def":{"input":{...},
  "conditions":{"Duplicate":{"metaInfo":{},"type":"Boolean","value":{"type":"context","var":"input#PotentialDuplicate","prop":[]}}, ...},
  "output":{"QueueCode":{"type":"String","list":false,"metaInfo":{}}, ...},
  "rows":[{"conditions":[{"condition":{"type":"isTrueFunc"}}, ...],"output":[{"value":{"type":"const","tc":"String","value":"DUPLICATE-REVIEW"}}, ...]}],
  "dataFetchers":{}}}
```

The `conditions` object order is the column order, and each row lists cells and outputs in that order.
Example: [../examples/block-decision-table.json](../examples/block-decision-table.json) (intake routing).

## Decision tree

Named conditions, then a tree of `Value` nodes (test a condition, follow the first matching edge) and `Output`
leaves:

```json
{"def":{"input":{...},
  "conditions":[{"name":"Severity","type":"OptionSet","expression":<expr>,"metaInfo":{}}],
  "output":{"Decision":{"type":"String","list":false,"metaInfo":{}}},
  "tree":{"type":"Value","name":"Severity","value":<same expr>,"edges":[
     {"condition":{"type":"isEqualToFunc","arg":<choice const>},"node":{"type":"Output","output":{"Decision":<expr>}}},
     {"condition":{"type":"notNullFunc"},"node":{...}}]},
  "dataFetchers":{}}}
```

## Validation set

Named checks; the key is the message shown when the condition is **false**:

```json
{"def":{"input":{...},"returnFisrtValidationError":false,
  "validations":{"Enter the policy number.":{"condition":{"type":"notNullOrEmptyString","arg":{"type":"context","var":"input#PolicyNumber","prop":[]}}}, ...},
  "dataFetchers":{...}}}
```

- The setting is spelled `returnFisrtValidationError` (sic). `false` returns every failed message
  (`failedValidations`), `true` only the first (`failedValidation`). Both return `isValid`.
- Make inputs optional (`required: false`) and check them in the set, so a missing value produces your message
  instead of a platform error.
- Recipes run validation sets before a record is saved and show the messages to the user.

Example: [../examples/block-validation-set.json](../examples/block-validation-set.json) (first notice of loss).

## Design notes

- One rule per block, named for the business (`Financials_SettlementAuthorityRules`), with a title and description
  a business analyst understands.
- Effective-dated parameters (limits, thresholds) belong in a table read by a formula block, so a rule change is
  data, not a redeploy - and the block can return the rule version for audit.
- Decision tables are the right form for authority matrices and routing; keep them small enough to read.
