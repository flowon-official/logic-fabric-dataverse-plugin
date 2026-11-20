---
type: regex
target: trace
pattern: '"name":"(?:Write|Edit)","input":\{[^\n]*?"file_path":"[^"]*baseline[\\/]+tests[\\/]+[^"]*"[^\n]*?"(?:content|new_string)":"(?:[^"\\]|\\.)*retired: '
match: contains
weight: 1
---

Passes when a regression test in logic-fabric/baseline/tests was retired by editing it.
