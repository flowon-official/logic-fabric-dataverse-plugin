---
description: Write the change's spec in Logic Fabric terms, check it, and take the owner's approval.
argument-hint: "[approve]"
---

Follow the `logic-fabric-dataverse:authoring` skill. Stage 2 (Spec) for the change in `logic-fabric/.active`.

If the argument is `approve`: ask Foundry for the owner's approval (`release`, `action: "approve"`, `options.gate:
"spec"`, `options.text` the full `spec.md`, and `options.quick: true` for a quick change whose spec carries its task
list; see the authoring skill). Once Foundry reports it approved, record `spec_approved_by` and `spec_approved_at` in
`status.yaml` with `spec_sha256` empty (the approval hook stamps it), set `stage: plan` (or, for a quick change, go
straight to the build), and ask the owner to commit the change folder. If the owner declined, ask what to change.
Stop there.

Otherwise:

1. Check `status.yaml`: the stage must be `spec` (no blocking question open in `request.md`).
2. Write `spec.md` from the template, using the business's words and Logic Fabric terms:
   - the data model, with every table, column and choice value checked with `schema` or declared new, and each
     table's features worked out from how the requirements use it (notes, activities, queues, audit: the schema
     reference's table), checked with `schema` `query: "features"` for existing tables;
   - one requirement per behaviour (`REQ-n`), each naming its artifact kind and proposed `Area_VerbNoun` name;
   - an **access statement** for every entry point (who may run it, under which condition, what a refused user is
     told), and "internal, called only by ..." for the rest;
   - acceptance criteria (`AC-n.m`) as Given / When / Then with concrete values.
   Choose artifact kinds as the `authoring` skill and the `artifacts` skill describe; reuse what exists.
3. Run the spec checks: every requirement has criteria with concrete values; every table, column and choice exists
   or is declared new; every entry point has an access statement whose roles, teams, business units and queues
   exist; names are unique; no TBD. Fix what fails.
4. Show the owner a short summary (requirements, what is new and changed, the access rules) and ask for approval
   with `/logic-fabric-dataverse:spec approve`.

A **quick change** (at most two artifacts, no data model change): set `quick: true` in `status.yaml`, add the
plan's task list at the end of `spec.md`, and ask for one approval that covers both.
