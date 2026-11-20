---
type: regex
target: trace
pattern: 'foundry__validate"[\s\S]*foundry__save"'
match: contains
weight: 1
---

Passes when the block was validated before it was saved.
