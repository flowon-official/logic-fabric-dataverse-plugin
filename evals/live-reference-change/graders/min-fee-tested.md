---
type: regex
target: trace
pattern: 'foundry__test","input":\{[^\n]*"EstimatedLoss":(?:\{"money":)?(?:[0-9]{1,3}|1[0-9]{3}|2[0-4][0-9]{2})(?:\.[0-9]+)?[,}]'
match: contains
weight: 1
---

Passes when a test ran with an estimated loss under 2,500 (the minimum fee applies).
