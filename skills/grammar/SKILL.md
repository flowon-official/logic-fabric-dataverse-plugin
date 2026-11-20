---
name: grammar
description: How to write FoL (Logic Fabric) expressions and reference context - expression types, constants, context variables per host, types and conversions - using the Logic Foundry reference tool. Use when writing or fixing an expression, a condition, a formula, a binding or a guard.
---

# FoL expressions

Every value in Logic Fabric metadata is an expression: a JSON object with a `type`. The Logic Foundry server has
154 expression types and 47 flow actions; ask it instead of guessing.

| You need | Ask `reference` |
|---|---|
| The list of expression types by category | `topic: "expressions"` |
| One expression's arguments and examples | `topic: "expressions"`, `name: "<type>"` (for example `isEqualTo`, `addDays`, `toString`) |
| A flow action's shape | `topic: "actions"`, `name: "<action>"` |
| What a host can read | `topic: "context"` |
| Rules that are easy to get wrong | `topic: "notes"` |
| A canonical example | `topic: "examples"`, `name: "<construct>"` |

Patterns you will use most are in [the expressions cheat sheet](../artifacts/reference/expressions.md).

## The shapes

- **Constant**: `{"type": "const", "tc": "<type code>", "value": ...}`. Type codes: `String`, `Integer`,
  `Decimal`, `Double`, `Float`, `Money`, `Boolean`, `DateTime`, `UniqueIdentifier`, `EntityReference`,
  `OptionSet`, `Entity`, `List`, `Team`, `User`, `Owner`, ...
- **Choice constant**: `{"type": "const", "tc": "OptionSet", "value": {"optionSetValue": 100000001,
  "optionSetLogicalName": "<from schema>", "isGlobal": false, "isTwoOptions": false}}`.
- **Context**: `{"type": "context", "var": "<variable>", "prop": ["<column>", ...]}`.
- **Function**: `{"type": "<name>", "args": [<expression>, ...]}`, for example
  `{"type": "addDays", "args": [{"type": "utcNow"}, {"type": "const", "tc": "Integer", "value": 2}]}`.

## Context by host

| Host | Variables |
|---|---|
| Logic block | `input#<name>`, `data_entities#<fetcher>`, `data_queries#<fetcher>` |
| Logic flow | the block's, plus `<action>#entity`, `<action>#query_result`, `<action>#output:<name>`, `<iterator>#current_item`, `<action>#error`, `<action>#response#<status>`, variables by name |
| Logic recipe | `<table>` (changed columns), `pre_<table>` (before the change) |
| Business process | `@Process.Entity`, `@Process.Instance.*`, `@Process.Stage.Instance.Task` |
| Event handler | `Event#<property>` |
| Logic API | `@User` |
| Precondition | `currentUser` |

Configuration values and localized text are expressions (`configurationValue`, `localizedResource`).

## Checking your work

`validate` type-checks every expression and returns each error with its `path`, for example
`/def/action/actions/Close/condition`. A type error usually means a wrong type code, a choice compared with text,
a Money value used as Decimal, or a context `prop` that isn't loaded (a recipe's `entityProperties`, a process's
`processEntityProperties` or `taskProperties`).
