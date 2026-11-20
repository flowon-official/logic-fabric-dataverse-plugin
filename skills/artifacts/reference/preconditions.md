# Preconditions

Blocks, flows and business processes accept a precondition in their `def`:

```json
"precondition": {
  "authorization": { "type": "any", "policies": [
    { "type": "hasRole", "role": { "id": "<looked up>", "name": "Claims Supervisor" }, "includeTeamRoles": true },
    { "type": "inTeam", "team": { "id": "<looked up>", "name": "Senior Adjusters" } } ] },
  "condition": { "type": "isEqualTo", "args": [
    { "type": "context", "var": "data_entities#Claim", "prop": ["statecode"] },
    { "type": "const", "tc": "OptionSet", "value": { "optionSetValue": 0, "optionSetLogicalName": "<from schema>", "isGlobal": false, "isTwoOptions": false } } ] },
  "code": "CLAIM_NOT_OPEN",
  "message": "Only open claims can be closed. Reopen the claim first."
}
```

How it is checked, for the Dataverse user the call runs as:

1. `authorization` first, before any data is fetched. A user who fails it gets `UNAUTHORIZED_ACCESS`; `code` and
   `message` don't apply to it.
2. `condition` after inputs and data fetchers load. It reads the inputs, the data fetchers and `currentUser`; for a
   business process, `@Process.Entity` and the definition values (not the instance), on every start. False gives
   `code` and `message` (default `CONDITION_VIOLATION`).
3. Nested runs check again: a protected block called by a flow, process, handler, recipe or `runLogicBlock`
   expression is checked for the same user.

## Policies

| `type` | Fields | Use for |
|---|---|---|
| `hasPermission` | `table`, `access` (`Read`, `Write`, `Create`, `Delete`, `Append`, `AppendTo`, `Assign`, `Share`) | "whoever may change claims" - mirrors Dataverse security, names no rows |
| `hasRole` | `role` {`id`, `name`}, `includeTeamRoles` | a job |
| `inTeam` | `team` {`id`, `name`} | a group that owns the work |
| `inBusinessUnit` | `businessUnit` {`id`, `name`}, `includeChildUnits` | a region or division |
| `queueMember` | `queue` {`id`, `name`} | the people who work a queue |
| `inEntraGroup` | `groupId`, `name` | Entra-managed membership (online only) |
| `all`, `any` | `policies` [ ... ] | combinations, one level of nesting |

## Generation rules

1. **Entry points** (called by people, agents through Conductor, a Logic API, as a Dataverse action, by another
   project, or a process people start) get a precondition from the spec's access statement.
2. **Internal artifacts** get none, unless the spec gives them their own rule.
3. Prefer `hasPermission` when it states the rule. Roles, teams, business units and queues are stored with ID and
   name and resolved by name in each environment; look them up with `security` and `lookup`, never invent an ID.
4. A business condition that decides whether the operation may run at all goes in `condition`, with a specific
   code and a message that says what to do. Input checks with several messages stay in a validation set; failures
   found halfway through a flow stay `RaiseError`.
5. The precondition must admit every legitimate caller: people, schedules, asynchronous recipe steps and handlers,
   agents' signed-in users, the Logic API's connection.

## Tests

For each protected artifact: an allowed persona succeeds; a refused persona gets `UNAUTHORIZED_ACCESS` and nothing
changes; the condition is tested true and false with its own code. Personas are in `workspace.yaml`.
