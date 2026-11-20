# Dataverse schema

Foundry makes the schema changes a plan needs with `validate`, `save` and `delete` and the kinds below; read back
with `schema`. Every component is created in the project's solution with the publisher's prefix.

| Kind | `name` | Definition (`metadata`) |
|---|---|---|
| `table` | `<prefix>_<name>` | `displayName`, `pluralName`, `description`, `ownership` (`user`/`organization`), `primaryName` {`name`, `displayName`, `maxLength`}, `columns` [ ... ] |
| `column` | `<prefix>_<name>`, with `options.table` | `type` (`text`, `memo`, `integer`, `decimal`, `currency`, `boolean`, `date`, `datetime`, `choice`, `choices`, `lookup`), `displayName`, `description`, `required` (`none`/`recommended`/`required`), `maxLength`, `precision`, `min`, `max`, `trueLabel`/`falseLabel`, `choice` {`global`: name} or {`options`: [{`value`, `label`}]}, `target` and `relationshipName` (lookup), `cascade` |
| `choice` | `<prefix>_<name>` | a global choice: `displayName`, `description`, `options` [{`value`, `label`}] |
| `relationship` | `<prefix>_<name>` | many-to-many: `referenced`, `referencing`, `intersect` (one-to-many: save a lookup column) |
| `record` | a label, with `options.table` | reference rows: `key` (an ID or {column: value}), `values` {column: value, `{"choice": n}`, `{"money": n}`, `{"lookup": {"table", "id"}}`} |

Rules:

- Save the schema tasks first, then `release` `action: "publishCustomizations"`.
- A type change or a shorter length that could lose data is refused unless the plan line approves it and you pass
  `options.allowDataLoss`.
- Deleting a table, column, choice (or one value with `options.value`), relationship or record needs an approved
  deletion line in the plan, and is refused while something depends on it.
- Choice values: use the publisher's option value range (for example 100000000 and up) and keep values stable once
  data exists.
