---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
tags: [offline, testing]
---

Write the test cases (YAML, in the plugin's test case format) for the decision table block `Intake_RoutingRules`
in project InsuranceClaimsManagement. Its rows, first match wins:

| Row | PotentialDuplicate | EstimatedLoss vs Threshold | QueueCode | Team |
|---|---|---|---|---|
| 1 | true | any | DUPLICATE-REVIEW | Fraud Team |
| 2 | false | greater than | HIGH-VALUE | Senior Adjusters |
| 3 | any | any (catch-all) | STANDARD | General Adjusters |

Acceptance criteria: AC-3.1 high value goes to Senior Adjusters; AC-3.2 at or under the threshold goes to General
Adjusters; AC-3.3 a potential duplicate goes to fraud review whatever the amount.
