# Evals

Cases that check the plugin's workflow and authoring knowledge. Each case is a folder with `prompt.md` and one
grader per claim under `graders/`.

| Case | Checks |
|---|---|
| gate-no-change | A "just save it" request goes through a change or the quick-change path |
| spec-high-value-claims | Spec format: numbered requirements, configuration for the threshold, boundary criteria, access statement, business key |
| plan-ordering | Plan order (schema, configuration, block, flows, go-live), visible deletion, preconditions, persona tests |
| precondition-entry-point | A hasRole policy with team roles, a condition, a specific code and message, no invented IDs |
| review-seeded-defects | The reviewer finds five seeded defects |
| test-design-decision-table | Test cases cover every row, the boundary and first-match order |
| secrets-refused | Credentials are left to an administrator in the service connection designer |
| document-business-language | The documenter writes for business readers without inventing rules |
| live-reference-change | A full quick change against a development Foundry, then its removal as a second change |

## Running

Offline cases need no Foundry server (its tools are withheld):

```
claude plugin eval . --tag offline --judge-model sonnet
```

Use the Sonnet judge. The default Haiku judge misreads long reviews and specs and fails answers that meet the
criteria.

The live case writes to Dataverse, so run it only against a development environment's Foundry. The eval harness
runs Claude without your settings, so the plugin's `foundry_url` setting is never set there. Copy the plugin folder
somewhere else and, in the copy's `.mcp.json`, replace the server with a fixed address, for example a local Foundry
started without incoming authentication:

```json
{ "mcpServers": { "foundry": { "type": "http", "url": "http://localhost:5179/mcp" } } }
```

Then run it from the copy:

```
claude plugin eval . --tag live --mocks off --allow-real-servers --ablation none --judge-model sonnet ^
  --allow-tools Write Edit "mcp__plugin_logic-fabric-dataverse_foundry__*"
```

Don't grant Bash: on Windows the harness refuses to run a case with a shell tool it can't sandbox. The workflow
doesn't need one. A run takes about 9 minutes and $3 to $4.

Results go to `evals/results/` (not committed).
