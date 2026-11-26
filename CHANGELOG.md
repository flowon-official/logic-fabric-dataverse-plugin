# Changelog

Each release is tagged `v<version>`. Releases before 0.10.0 were made from
[flowon-official/ai-plugins](https://github.com/flowon-official/ai-plugins) (then named claude-plugins), tagged
`logic-fabric-dataverse-v<version>`; this repository keeps their history and tags them `v<version>`.

## 0.14.1 (2026-11-26)

- The requirements document gives the current values of the reference data its logic reads, such as limits, rates or
  policy parameters: the documenter agent now has Logic Foundry's `lookup` tool. Before, it couldn't read rows, so it
  could only give the values a change had loaded, or none. It reads no business records, such as customers or
  applications.

## 0.14.0 (2026-11-26)

- The requirements document comes as Markdown, Word or PDF: add `word` or `pdf` to `document`, for example
  `/logic-fabric-dataverse:document pdf`. The Markdown is still written first, as the source, and the `.docx` or
  `.pdf` goes next to it. The plugin builds the Word file itself. Microsoft Edge, Google Chrome or Chromium prints the
  PDF without opening a window; with none of them, the plugin writes an HTML page that you print to PDF from a browser.

## 0.13.3 (2026-11-26)

- Codex: the workflow's checks also cover Logic Foundry when Codex reaches it through ChatGPT, as a ChatGPT app with
  "Foundry" in its name (Codex names its tools `mcp__codex_apps__<app>__<tool>`). Before, the gate hook and the export
  of saved artifacts didn't run for those calls. Codex doesn't run a plugin's changed hooks until you trust them
  again, so trust them in `/hooks` after updating.

## 0.13.2 (2026-11-25)

- Business units and teams are made like security roles: with the Logic Fabric CLI's security file (`import -sf
  security.xml`), which also takes them to test and production, as a `Tool: flowon-dynamics` task of the plan. The
  authoring skill says how to write them into the file (a business unit by its path from the root, a team with its
  business unit, type and administrator). The gate hook refuses a Foundry `record` save or delete of a business unit,
  team, role, user or their memberships: Foundry would make them as plain rows in this environment only, outside the
  solution. A test can still create a business unit as a fixture.

## 0.13.1 (2026-11-25)

- An approval of the spec, plan or acceptance goes to Logic Foundry only with the change's file as saved: the gate hook
  compares `options.text` with `spec.md`, `plan.md` or `acceptance.md`, as their hash normalizes them (line endings,
  ticked task boxes, `Blocked:` lines), and refuses a placeholder, a summary or part of the file, saying where it
  differs. An agent sent the placeholder `__SPEC__` and two partial specs for approval, and the owner approved them.
- The authoring skill says not to hash an approved file to check Foundry's hash (both are of the normalized text, so
  a raw hash differs), never to write one, and to ask for one approval per version of the file. An agent that
  compared raw hashes asked for the same plan approval three times.

## 0.13.0 (2026-11-25)

- Autonumber columns: the schema reference describes `autoNumber` on text columns and on a table's primary column
  (Logic Foundry 2.4.0), for business keys Dataverse fills in when a row is created, such as `SUP-{SEQNUM:5}`; how
  flows read the number and tests treat it; the next number per environment as a deployment task; and, with an
  earlier Foundry, a plain text column whose format the owner sets in the maker portal.

## 0.12.0 (2026-11-25)

- When a stage is done, the agent offers the next step as a choice (ask Logic Foundry for your approval, commit the
  change folder, start the next stage) and takes it when you pick it, in Claude Code and GitHub Copilot; Codex names
  the step and takes it when you answer yes. A commit takes only `logic-fabric/` and is never pushed. The agent can
  now run the stage commands (`spec`, `plan`, `build`, `review`, `accept`) in Copilot and Codex too.
- GitHub Copilot: the gate and the export of saved artifacts now also run when the Foundry server's name has capitals
  (`Logic-Fabric-Foundry`, as you might name it in the Copilot app); they ran only for a lowercase `foundry`, and
  Foundry's own gate was the only check left.
- The README gives the GitHub Copilot app's command names (`/plan approve`) and how to sign in to Foundry in the app.

## 0.11.0 (2026-11-24)

- Logic Foundry keeps each change's record in Dataverse (Logic Foundry 2.3.0 and the Logic Fabric Foundry solution
  1.0.0.47): approving the spec and the plan passes their requirements and tasks as data, `submit` passes the review,
  and a blocked task is recorded with `release` `block` and closed with `unblock`. Foundry refuses `submit` while one
  is open.
- Review findings the owner chooses not to fix stay open and are accepted as risks with the change; an open blocker
  needs a reviewer on Foundry's approval page first.
- `govern` and `secure` record their run and findings in Foundry. `govern` lists the rules a reviewer waived.
- A `waive` command asks a reviewer to waive a governance rule for the project or one artifact.
- The testing skill says how a business unit fixture is created and torn down.

## 0.10.0 (2026-11-24)

- The plugin installs in Codex and GitHub Copilot from the same marketplace: the commands as skills you run by name, the
  agents (`logic_fabric_<agent>` in Codex), and the checks as each client's hooks. A `setup` skill connects Codex or
  Copilot to Logic Foundry.
- The review submits the change to Logic Foundry for its owner's acceptance, and `accept` records the owner's decision
  through Foundry: accept, or send it back to its build or its spec with a reason (Logic Foundry 2.2.0 and the Logic
  Fabric Foundry solution 1.0.0.46).

## 0.9.1 (2026-11-23)

- Approving through Logic Foundry passes the plugin's checks in every stage.
- A clearer message when a change retires another change's tests.

## 0.9.0 (2026-11-23)

- Approvals through Logic Foundry: the owner approves the spec and the plan in the client's dialog or on Foundry's
  approval page, and Foundry keeps them.

## 0.8.5 (2026-11-23)

- Business processes branch through gateways.

## 0.8.4 (2026-11-23)

- The dashboard has the Flowon logo as its tab icon.

## 0.8.3 (2026-11-23)

- Connection strings stay out of the conversation, and changes go through Logic Foundry only.

## 0.8.2 (2026-11-22)

- Lists the artifacts that use an artifact before changing or deleting it; activity tables.

## 0.8.1 (2026-11-22)

- Wide tables in the dashboard, reading a table's or column's settings before changing them, inactive fixtures.

## 0.8.0 (2026-11-21)

- The dashboard: every change as a card, with its spec, plan, tests and saved artifacts.

## 0.7.3 (2026-11-21)

- Variables, clearing columns, empty results and column ranges.

## 0.7.2 (2026-11-20)

- A link to every saved artifact; rule precedence, probes, Switch and fixtures.

## 0.7.1 (2026-11-20)

- Conditions on IDs and lookups.

## 0.7.0 (2026-11-20)

- New projects, a check on commands that change Dataverse outside Logic Foundry, table features, a connection per
  environment in `workspace.yaml`, and the expression functions table generated from Logic Foundry's grammar.

## 0.6.0 (2026-11-20)

- Named `logic-fabric-dataverse`, for Logic Fabric for Dataverse.
