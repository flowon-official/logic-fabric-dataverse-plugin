---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
tags: [offline, document]
---

Write the "Business processes" section of the requirements document for this process (don't call tools):

```json
{"def": {"processEntity": "fodemos_coveragedecision", "startStage": "adjusterReview",
 "title": {"type": "const", "tc": "String", "value": "Coverage Exception Review"},
 "stages": [
  {"uniqueName": "adjusterReview", "title": {"type": "const", "tc": "String", "value": "Adjuster coverage review"},
   "owner": {"type": "const", "tc": "Team", "value": {"displayName": "Coverage Adjusters"}},
   "dueDate": {"type": "addDays", "args": [{"type": "utcNow"}, {"type": "const", "tc": "Integer", "value": 2}]},
   "escalation": {"target": "supervisorApproval"}},
  {"uniqueName": "supervisorApproval", "title": {"type": "const", "tc": "String", "value": "Supervisor approval"},
   "owner": {"type": "const", "tc": "Team", "value": {"displayName": "Claims Supervisors"}},
   "dueDate": {"type": "addDays", "args": [{"type": "utcNow"}, {"type": "const", "tc": "Integer", "value": 1}]}}],
 "ends": [{"uniqueName": "covered", "metaInfo": {"title": "Covered"}}, {"uniqueName": "denied", "metaInfo": {"title": "Denied"}}],
 "transitions": [
  {"source": "adjusterReview", "target": "covered", "guard": {"type": "isTrueFunc"}},
  {"source": "adjusterReview", "target": "supervisorApproval", "isDefault": true},
  {"source": "supervisorApproval", "target": "covered", "guard": {"type": "isTrueFunc"}},
  {"source": "supervisorApproval", "target": "denied", "isDefault": true}]}}
```
