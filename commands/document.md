---
description: Write a business requirements document (BRD) of a Logic Fabric project from its artifacts - the as-built description, section by section.
argument-hint: [project] [sections...]
---

Read-only; runs any time. Write the business requirements document for the project in `workspace.yaml` (or the one
given): $ARGUMENTS

Hand the work to the `logic-fabric-dataverse:documenter` agent with the project and the sections wanted (default:
all eleven). It reads the artifacts with `find` and `get` (with dependencies) and writes
`logic-fabric/reports/document/<yyyy-mm-dd>.md`. When it is done, summarize what the document covers, list
anything it could not describe, and link the file. If a previous document exists, list what changed since it.
