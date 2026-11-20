---
type: regex
target: trace
pattern: 'foundry__test","input":\{[^\n]*"absent":true'
match: contains
weight: 1
---

Passes when the removal was tested with expect absent.
