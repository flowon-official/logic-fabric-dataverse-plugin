# Logic APIs

A Logic API publishes REST (and GraphQL) endpoints over Dataverse tables, Dataverse actions and queries, for
external callers. It is built in API Studio in the Logic Fabric app and needs the API Builder solution. Foundry
lists and reads Logic APIs (`find`/`get` with `kind: "logicApi"`) but does not save them: when a spec needs a new
operation, the plan lists it as a task for API Studio, and the flow behind it is built and tested as usual.

What an API version holds (`flwn_apiversion.flwn_metadata`): `user`, `roles`, `optionSets`, and `modules` of
`entities` (create, read, update, delete, upload, download), `actions` (bound to a Dataverse process action) and
`queries`. Each item can carry `accessControl`, `authorization`, a `precondition` and `dataFetchers`. In API
expressions the web user is `@User`.

Flows behind API actions are entry points: give them preconditions, and test them as the API's connection user.
