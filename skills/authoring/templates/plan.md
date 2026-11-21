# Build plan: <title>

**Spec SHA-256:** <spec_sha256 from status.yaml> · **Environment:** development · **Project:** <project>
**Solution:** <solution> · **Prefix:** <prefix>

## Summary for approval
- New: <n> blocks, <n> flows, ... · Changed: <artifacts> (their consumers: <...>)
- Data model: <tables and columns added or changed>
- Deletions: <none, or one line each: "Delete <kind> <name>: <reason>">
- Goes live in: <task IDs> · Risks: <...>

## Tasks
- [ ] T-01 Create solution `<solution>`                                          (a new project only)
      Publisher: `<publisher>` (existing), or new: `<publisher>` with prefix `<prefix>`
      Done when: validates, saved; `get` of the solution shows the publisher and prefix

- [ ] T-02 Create project `<project>` in solution `<solution>`                   (a new project only)
      Done when: validates, saved; `new:` removed from workspace.yaml

- [ ] T-03 Create table `<prefix>_<name>` (schema)                                REQ-1
      Definition: <columns>; features: <notes, activities, ... from how it is used, or none>
      Done when: validates, saved, published (T-04)

- [ ] T-07 Create logic block `<Area_VerbNoun>` (<block type>)                   REQ-3
      Inputs:  <Name (Type, required)>, ...
      Outputs: <Name (Type)>, ...
      Precondition: none, internal (called only by T-09 <flow>)
      Depends on: <task IDs>
      Tests: TC-3.1, TC-3.2
      Done when: validates, saved, exported, all tests pass

- [ ] T-12 Create logic flow `<Area_VerbNoun>`                                   REQ-6
      Precondition: entry point (<callers>)
                    <policy: any of role X, team Y>
                    condition: <business condition>, else <CODE>
      Tests: TC-6.1 (allowed), TC-6.2 (refused: UNAUTHORIZED_ACCESS), TC-6.3 (condition: <CODE>)

- [ ] T-20 Go live: enable recipe `<name>`, publish process `<name>`              (after all unit tests pass)
