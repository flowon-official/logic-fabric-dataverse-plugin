---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
tags: [offline, preconditions]
---

Write the `precondition` object for the logic flow `Claims_ApproveSettlement`. Its access statement in the spec
says: "Only members of the Claims Supervisor role, directly or through a team, may approve a settlement, and only
when the settlement amount is at most the approver's authority limit (input `Amount` compared with data fetcher
`Authority`'s column `fodemos_limit`). A refused user is told the amount is over their authority."

You can't call Foundry in this exercise. Show the JSON and say how you would fill in anything you can't know here.
