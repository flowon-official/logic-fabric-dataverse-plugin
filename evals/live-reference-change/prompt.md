---
max_turns: 200
timeout_seconds: 2400
runs: 1
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill, mcp__plugin_logic-fabric-dataverse_foundry__*]
tags: [live]
---

This case needs a development Logic Foundry with the claims demo project (run it with --mocks off
--allow-real-servers and --tag live, never against production).

In this repository, take a quick change through the whole workflow for project InsuranceClaimsManagement: "Add a
formula block `Financials_CalculateHandlingFee` that returns 2% of an estimated loss (Currency input
`EstimatedLoss`), at least 50 and at most 2,000." Act as the owner too: approve the spec and plan, and accept the
change, when asked. Build it, test it (including both caps and a value in between), review it and accept it.

Then remove the block again so the development environment is left as it was, following the workflow for that
too.
