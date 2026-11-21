# Spec: <title>

**Change:** <change folder> · **Owner:** <name> · **Request:** request.md

## 1. Context
<problem, who it serves, in scope, out of scope, project and environment>

## 2. Glossary additions
| Business term | Logic Fabric name |
|---|---|

## 3. Data model
| Table | Column | Type | New or existing | Purpose |
|---|---|---|---|---|

Table features (from how each table is used; see the schema reference): <table: notes (REQ-n writes notes about
it), activities (REQ-n emails about it), queues, audit, ... or none>

Choice values: <table.column: value = label, ...>

## 4. Requirements
### REQ-1 <name>
Kind: <artifact kind> `<Area_VerbNoun>`
When <trigger>, <the system> shall <behaviour>.

**Access** (entry points only): who may run it <roles, teams, business units, queues, permission>,
under which condition <business condition>, and what a refused user is told <message>.
Internal artifacts: "internal, called only by <artifacts>".

AC-1.1 Given <concrete values>, when <action>, then <concrete result>.
AC-1.2 ...

## 5. Non-functional requirements
- Synchronous time budget, audit, error messages, idempotency, agent exposure.

## 6. Assumptions and open questions
