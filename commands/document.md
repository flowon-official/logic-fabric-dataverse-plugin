---
description: Write a business requirements document (BRD) of a Logic Fabric project from its artifacts - the as-built description, section by section - as Markdown, Word or PDF.
argument-hint: "[project] [sections...] [markdown|word|pdf]"
---

Read-only; runs any time. Write the business requirements document for the project in `workspace.yaml` (or the one
given): $ARGUMENTS

The document is Markdown unless the arguments name another format: `word` (or `docx`) or `pdf`. Hand the work to the
`logic-fabric-dataverse:documenter` agent with the project and the sections wanted (default: all eleven). It reads the
artifacts with `find` and `get` (with dependencies) and writes `logic-fabric/reports/document/<yyyy-mm-dd>.md`, the
document's source in every format.

For Word or PDF, then turn that file into the format, with Bash:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/document.mjs" "<the .md file>" --format <word or pdf>
```

If the path above still shows `${CLAUDE_PLUGIN_ROOT}`, the script is `scripts/document.mjs` in this plugin's folder
(`logic-fabric-dataverse`, under `~/.claude/plugins/`): find it with Glob and run it the same way.

The script writes the `.docx` or `.pdf` next to the Markdown, with the same name, and changes nothing else; it needs no
network. Microsoft Edge, Google Chrome or Chromium prints the PDF without opening a window. When none of them can, the
script writes the document as an `.html` page instead: tell the user to open it in a browser and print it to PDF. If it
says the file is open, ask the user to close it in Word or their PDF viewer, then run the script again.

When it is done, summarize what the document covers, list anything it could not describe, and link the file: the Word
or PDF file and the Markdown it came from. If a previous document exists, list what changed since it.
