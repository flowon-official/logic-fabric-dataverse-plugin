# Changelog

Each release is tagged `v<version>`. Releases before 0.10.0 were made from
[flowon-official/ai-plugins](https://github.com/flowon-official/ai-plugins) (then named claude-plugins), tagged
`logic-fabric-dataverse-v<version>`; this repository keeps their history and tags them `v<version>`.

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
