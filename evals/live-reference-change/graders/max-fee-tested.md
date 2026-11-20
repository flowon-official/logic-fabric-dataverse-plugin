---
type: regex
target: trace
pattern: 'foundry__test","input":\{[^\n]*"EstimatedLoss":(?:\{"money":)?[1-9][0-9]{5,}'
match: contains
weight: 1
---

Passes when a test ran with an estimated loss of 100,000 or more (the maximum fee applies).
