---
description: Start a Logic Fabric change from a request - discover what exists, ask the questions that matter, and write request.md.
argument-hint: "<what the business needs>"
---

Follow the `logic-fabric-dataverse:authoring` skill. This is stage 1 (Prompt) for the request: $ARGUMENTS

1. Read `logic-fabric/workspace.yaml`. If it doesn't exist, create it from the skill's
   `templates/workspace.yaml`, asking the user only for the project (list them with `find` `kinds: ["project"]`),
   and fill the solution, publisher and prefix from `get` `kind: "project"` and `get` `kind: "solution"`. If it
   exists without `offering`, add `offering: dataverse`; if it names another offering, stop and say that
   offering's own plugin works in this repository.

   **A new project.** When the user's project doesn't exist yet, ask in one message for its name, its solution
   (an existing unmanaged one from `find` `kinds: ["solution"]`, or a new unique name) and, for a new solution, its
   publisher: an existing one (list them with `lookup`, FetchXML on `publisher` with `uniquename` and
   `customizationprefix`) or a new one with a unique name and a prefix (2 to 8 lowercase letters and digits).
   Record them in `workspace.yaml`, with `new:` listing what doesn't exist yet (`project`, `solution`,
   `publisher`). Create nothing now: the plan's first tasks create them in the build.
2. Create `logic-fabric/changes/<yyyy-mm-dd>-<slug>/` with `status.yaml` (stage `prompt`) from the template, and
   write the folder name to `logic-fabric/.active`.
3. Discover, read-only: what the project has (`find`), the artifacts the request touches (`get`, with
   dependencies), the tables and choices involved (`schema`), the teams and roles that matter (`security`,
   `lookup`). Use the `logic-fabric-dataverse:explorer` agent for a broad sweep so this session stays small.
4. Write `request.md` from the template: the request as given, what exists today (including what could be reused),
   and the questions. Mark a question blocking when the spec can't be written without its answer: who may run
   what, thresholds, which records, what happens on failure.
5. Ask the blocking questions now, in one message, and record the answers. When none is open, set `stage: spec`
   and offer the next step as a choice in your question tool: write the spec (`/logic-fabric-dataverse:spec`;
   "Offer the next step" in the authoring skill says how).

Don't write any metadata or save anything in this stage.
