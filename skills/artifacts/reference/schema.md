# Dataverse schema

Foundry makes the schema changes a plan needs with `validate`, `save` and `delete` and the kinds below; read back
with `schema`. Every component is created in the project's solution with the publisher's prefix.

| Kind | `name` | Definition (`metadata`) |
|---|---|---|
| `table` | `<prefix>_<name>` | `displayName`, `pluralName`, `description`, `ownership` (`user`/`organization`), `primaryName` {`name`, `displayName`, `maxLength`}, `features` {`notes`, `activities`, `queues`, `audit`, `changeTracking`, `connections`, `duplicateDetection`, `quickCreate`: true/false}, `columns` [ ... ] |
| `column` | `<prefix>_<name>`, with `options.table` | `type` (`text`, `memo`, `integer`, `decimal`, `currency`, `boolean`, `date`, `datetime`, `choice`, `choices`, `lookup`), `displayName`, `description`, `required` (`none`/`recommended`/`required`), `maxLength`, `precision`, `min`, `max`, `trueLabel`/`falseLabel`, `choice` {`global`: name} or {`options`: [{`value`, `label`}]}, `target` and `relationshipName` (lookup), `cascade` |
| `choice` | `<prefix>_<name>` | a global choice: `displayName`, `description`, `options` [{`value`, `label`}] |
| `relationship` | `<prefix>_<name>` | many-to-many: `referenced`, `referencing`, `intersect` (one-to-many: save a lookup column) |
| `record` | a label, with `options.table` | reference rows: `key` (an ID or {column: value}), `values` {column: value}. Each value takes its column's type: numbers for number and currency columns (`{"money": n}` also works), `"2026-01-01"` for a date, `"2026-01-01T09:00:00Z"` for a date and time, `{"choice": n}` or the choice's label, `[n, ...]` for a multi-choice, `{"lookup": {"table", "id"}}` (or the ID, for a lookup to one table) |

Foundry refuses a setting it doesn't know instead of ignoring it, and names the right one.

## Table features: decide them from how the table is used

A table only allows what its features allow, and Dataverse refuses the rest at run time, for example "Creating
Entity with an invalid parent. Entity: Annotation" for a note about a row of a table without notes. Work the
features out when you design the table, from every requirement that touches it, and put them in the spec's data
model and the table's `features`:

| When the spec or a design ... | the table needs |
|---|---|
| writes a note or attachment about a row (`annotation` with `objectid`), or users attach documents | `notes` |
| sends an email, creates a task, appointment or phone call about a row (the activity's regarding is the row), or a process assigns tasks for it | `activities` |
| routes rows through queues (`Queue` action, queue items, a work queue) | `queues` |
| needs an audit trail (approvals, money, decisions, compliance) | `audit` (auditing also has to be on for the environment) |
| synchronizes rows out to another system | `changeTracking` |
| relates rows to other rows with connections | `connections` |

Notes and activities can't be turned off once on. For an **existing** table the change uses this way, read its
features with `schema` (`query: "features"`, `table`) and, when one is missing, plan a task that saves the table
with that feature on: it's a data model change that goes in the spec.

Rules:

- **One schema save at a time, never in parallel.** Dataverse applies one customization at a time and refuses a
  second one while the first runs ("Cannot start another [EntityCustomization]"). Foundry queues its own saves and
  retries briefly, but parallel calls still wait or fail.
- **A table with many columns comes back in parts.** Dataverse takes seconds per column and a tool call has about a
  minute, so a table save stops starting new columns after 40 seconds and returns the rest in `pending` with a
  `note`. Save each pending column with kind `column` and `options.table`, one call at a time. Saving the whole
  table again also works: columns already saved and unchanged are skipped.
- **Change a table, column or choice from what it is now.** A save replaces the labels, required level and settings
  it isn't given, so `get` it first: `kind: "column"` with `table` (or `name: "<table>.<column>"`), `kind: "table"`,
  `kind: "choice"` or `kind: "relationship"`. It comes back as the definition `save` takes: change what the plan says
  and save the whole definition. A `note` says when Foundry can't save it (a status or owner column, a one-to-many
  relationship, which changes through its lookup column). For what this change created, `artifacts/schema/` has
  the same definition.
- **After a timeout or a "busy" error, read before you save again.** The change may have gone through: read the
  table with `schema` (`query: "table"`), then save only what is missing.
- Save the schema tasks first, then `release` `action: "publishCustomizations"`. Publishing often takes Dataverse
  several minutes: Foundry waits up to 40 seconds and otherwise returns the system job. Carry on with tasks that
  don't need it and check it with `release` `action: "publishStatus"` and `options.jobId` before a go-live task.
- A type change or a shorter length that could lose data is refused unless the plan line approves it and you pass
  `options.allowDataLoss`.
- Deleting a table, column, choice (or one value with `options.value`), relationship or record needs an approved
  deletion line in the plan, and is refused while something depends on it.
- Choice values: use the publisher's option value range (for example 100000000 and up) and keep values stable once
  data exists.
- **A column's `min`/`max` is checked before any logic runs.** Dataverse refuses a value outside the range with its own
  message ("The value 0 of 'fodemos_termmonths' ... is outside the valid range") before a recipe or process sees the
  row. So a business rule that checks the same range never fires. Keep each range in one place: in the column (Dataverse's
  message, also shown on the form), or in a rule with a friendlier message and a column range wide enough to let the
  value through. The spec says which, and its acceptance criteria use values the column accepts.
