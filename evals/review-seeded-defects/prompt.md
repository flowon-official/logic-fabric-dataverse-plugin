---
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
tags: [offline, review]
---

Review this logic flow as the Logic Fabric reviewer would, and report findings with severity, path and fix. The
flow is exposed to agents through Logic Conductor.

```json
{"def": {
  "input": {"ClaimNumber": {"type": "String", "list": false, "required": true, "metaInfo": {}}},
  "output": {"Status": {"type": "String", "list": false, "metaInfo": {}}},
  "action": {"type": "Sequential", "metaInfo": {}, "actions": {
    "Find Claim": {"type": "ExecuteQuery", "metaInfo": {}, "multiplicity": "Single",
      "query": {"entityName": "fodemos_claim", "columnSet": ["fodemos_claimid", "fodemos_stage"],
        "filter": {"logicalOperator": 0, "filters": [], "conditions": [{"attributeName": "fodemos_name",
          "attributeType": "Microsoft.Dynamics.CRM.StringAttributeMetadata", "operator": "Equal",
          "values": {"operand": [{"type": "context", "var": "input#ClaimNumber", "prop": []}]}}]}}},
    "Is Closed": {"type": "Condition", "metaInfo": {},
      "condition": {"type": "isEqualTo", "args": [
        {"type": "context", "var": "Find Claim#query_result", "prop": ["fodemos_stage"]},
        {"type": "const", "tc": "String", "value": "Closed"}]},
      "true": {"actions": {"Stop": {"type": "Halt", "metaInfo": {}}}},
      "false": {"actions": {}}},
    "Notify Insurer": {"type": "CallRestApi", "metaInfo": {}, "serviceName": "InsurerGateway", "projectName": "Claims",
      "operation": {"id": "notify", "path": "/notify", "httpMethod": "POST"}, "parameters": [], "request": {"actions": {}},
      "responses": {"200": {"actions": {}}}}
  }},
  "dataFetchers": {}
}}
```

`fodemos_stage` is a choice column (option set `fodemos_claim_fodemos_stage`; Closed = 100000004).
