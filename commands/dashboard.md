---
description: Write logic-fabric/dashboard.html - every change as a card, with its spec, plan, tests and saved artifacts - and keep it current.
---

Run the dashboard script from the repository, with Bash:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/dashboard.mjs"
```

If the path above still shows `${CLAUDE_PLUGIN_ROOT}`, the script is `scripts/dashboard.mjs` in this plugin's folder
(`logic-fabric-dataverse`, under `~/.claude/plugins/`): find it with Glob and run it the same way.

The script finds `logic-fabric/` itself, only reads the workspace, and writes `logic-fabric/dashboard.html`, which it
adds to `logic-fabric/.gitignore`. It needs no network. Then tell the user, in two or three lines:

- the file's full path, and that it opens in any browser;
- that the plugin rewrites it at the end of every turn that changed `logic-fabric/`, so it stays current, and that this
  command refreshes it at once;
- what it shows: every change as a card (stage, tasks, tests, findings, approvals, what needs them), and for each change
  its requirements traced to tasks, tests and artifacts, the documents, the plan's tasks, the test cases and the saved
  artifacts' sources.

Change nothing else. If the script reports no workspace, say that the repository has no `logic-fabric/workspace.yaml`
yet and that `/logic-fabric-dataverse:start` sets one up.
