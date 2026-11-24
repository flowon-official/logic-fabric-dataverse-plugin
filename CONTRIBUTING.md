# Maintaining the Logic Fabric for Dataverse plugin

The plugin is written once, for Claude Code: its skills, commands, agents and hooks. Flowon's
[plugin-tools](https://github.com/flowon-official/plugin-tools) build what Codex and GitHub Copilot need from that
source, check it, and release it to the `flowon` marketplace,
[flowon-official/ai-plugins](https://github.com/flowon-official/ai-plugins). The repository is the plugin: everything in
it is installed.

## Layout

```
.claude-plugin/plugin.json    name, version, repository, license, foundry_url setting, privacy policy, network hosts
.claude-plugin/icon.png       listing icon (1024 px), also Codex's
.codex-plugin/plugin.json     Codex's manifest (generated)
.github/plugin/plugin.json    Copilot's manifest (generated)
.github/workflows/            CI on pull requests; release on main (plugin-tools' workflows)
.mcp.json                     Foundry server for Claude Code: URL from the setting, client ID, callback port 47823
README.md                     the plugin's documentation, for its users
CHANGELOG.md                  one entry per release: the release notes
skills/                       authoring (workflow, rules, templates), artifacts (reference per kind, examples),
                              grammar (expressions and context), testing (test format, definition of done)
commands/                     one per stage, status, dashboard, test, document, govern, insights, secure, agent-tools
agents/                       reviewer, explorer, documenter, process-analyst, security-reviewer
hooks/                        hooks.json and the checks; client.mjs reads each client's payloads and answers in its format
ports/                        Codex and Copilot: command skills, hooks, agents (generated); config.json and
                              skills/setup/ (connects Codex or Copilot to Logic Foundry) are hand-written
scripts/                      dashboard.mjs and its page template (the dashboard command); sync-expressions.mjs
tests/                        node --test: the hooks on each client, the dashboard generator
evals/                        eval cases (see evals/README.md)
```

## Changing the plugin

- After changing a command, an agent, the hooks configuration or the manifest, write the Codex and Copilot packages
  and commit them with the change: `node <plugin-tools>/bin/build-ports.mjs .`. CI fails while they're out of date.
  What the Claude manifest doesn't say about them is in `ports/config.json`.
- Write skills, commands and agents so they read right in all three clients: name Logic Foundry's tools by their short
  names (`save`, `release`), and mark what only Claude Code has (`AskUserQuestion`, `!` commands) as such.
- The functions table in `skills/artifacts/reference/expressions.md` is generated from the grammar Logic Foundry
  serves. After the grammar changes in `flowon-xrm`, run
  `node scripts/sync-expressions.mjs <flowon-xrm>/src/server/src/ai/platform/Flowon.Xrm.AI.Agents.Assist/Assets/grammar/fol-grammar.json`;
  `--check` fails when the table is out of date.
- The client ID must be written into `.mcp.json`: Claude Code fills plugin settings into the server address but not
  into the sign-in settings.
- Check a change as CI does: `claude plugin validate --strict .`, `node --test tests/*.test.mjs` (Node 20 or later),
  and `PLUGIN_DIR=. node --test <plugin-tools>/checks/plugin.test.mjs`.
- Run the offline evals before a release: `claude plugin eval . --tag offline --judge-model sonnet --runs 1 --ablation none`
  (about $2). Without `--runs 1 --ablation none` each case runs three times with and without the plugin, at about six
  times the cost.

## Releasing

1. In a pull request, raise the version and add its changelog entry:
   `node <plugin-tools>/bin/bump-version.mjs . minor --note "What changed."` (it rewrites the packages too).
   Installed copies update only when the version changes.
2. Merging it to `main` tags the commit `v<version>`, publishes a GitHub release with the changelog entry, and opens a
   pull request in the catalog that points the plugin at the new tag and commit.
3. A release owner merges that pull request: the release then reaches everyone who installed the plugin, in Claude
   Code, Codex and GitHub Copilot. Reverting it rolls the release back.
