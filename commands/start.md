---
description: Start a Logic Fabric change from a request - discover what exists, ask the questions that matter, and write request.md.
argument-hint: <what the business needs>
---

Follow the `logic-fabric-dataverse:authoring` skill. This is stage 1 (Prompt) for the request: $ARGUMENTS

1. Read `logic-fabric/workspace.yaml`. If it doesn't exist, create it from the skill's
   `templates/workspace.yaml`, asking the user only for the project (list them with `find` `kinds: ["project"]`),
   and fill the solution and prefix from `get` `kind: "project"`.
2. Create `logic-fabric/changes/<yyyy-mm-dd>-<slug>/` with `status.yaml` (stage `prompt`) from the template, and
   write the folder name to `logic-fabric/.active`.
3. Discover, read-only: what the project has (`find`), the artifacts the request touches (`get`, with
   dependencies), the tables and choices involved (`schema`), the teams and roles that matter (`security`,
   `lookup`). Use the `logic-fabric-dataverse:explorer` agent for a broad sweep so this session stays small.
4. Write `request.md` from the template: the request as given, what exists today (including what could be reused),
   and the questions. Mark a question blocking when the spec can't be written without its answer: who may run
   what, thresholds, which records, what happens on failure.
5. Ask the blocking questions now, in one message, and record the answers. When none is open, set `stage: spec`
   and tell the user to run `/logic-fabric-dataverse:spec`.

Don't write any metadata or save anything in this stage.
