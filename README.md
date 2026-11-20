# Logic Fabric for Dataverse

Build Logic Fabric for Dataverse solutions the way software is built. You describe what the business needs; Claude
writes a spec in Logic Fabric terms for you to approve, then a build plan with its tests for you to approve, then
builds the logic blocks, flows, business processes, recipes, events, schedules, service connections and Dataverse
tables, tests them, has them reviewed, and shows you the results to accept. It can also document, govern, analyze
and security-review the projects you already have.

Claude works through your organization's **Logic Foundry** server, signed in as you. It can only see and change
what your Dataverse user can, and it builds only in development: test and production change through your
solutions and pipelines.

## Before you start

You need:

- **The address of your Logic Foundry server**, ending in `/mcp`, for example
  `https://<app>.<region>.azurecontainerapps.io/mcp`. Your administrator can give it to you.
- **A Dataverse user** with Logic Fabric author privileges in the development environment.
- **Claude Code** and **Node.js 18 or later** (the workflow's hooks run on Node.js).
- **A git repository** for your Logic Fabric work, usually your solution's ALM repository.
- **The Logic Fabric CLI plugin** (`flowon-dynamics`), optional: Claude uses it to export, import and deploy
  solutions and to set up your pipelines.

Your administrator also needs to set up sign-in once for your organization: see
[Set up sign-in](#set-up-sign-in-administrators).

## Install

1. Add the marketplace and install the plugin, and the Logic Fabric CLI plugin if you deploy with the CLI:

   ```bash
   claude plugin marketplace add flowon-official/claude-plugins
   claude plugin install logic-fabric-dataverse@flowon
   claude plugin install flowon-dynamics@flowon
   ```

2. When Claude Code asks for the **Logic Foundry MCP endpoint**, enter your server's address. You can change it
   later in `/config`.
3. Restart Claude Code, run `/mcp`, select **plugin:logic-fabric-dataverse:foundry** and choose to sign in. Sign in
   with your work account in the browser window that opens.

## How a change is built

Every change goes through six stages, the way a software change does. Claude does the work in each stage and stops
at the gates for you: nothing is built until you approve what will be built, and nothing is finished until you
accept it.

```mermaid
flowchart TD
    request["Request<br/>start"] --> spec["Spec<br/>spec"]
    spec -- "you approve" --> plan["Build plan<br/>plan"]
    spec -. "small change:<br/>one approval" .-> build
    plan -- "you approve" --> build["Build<br/>build"]
    build -- "every test passes" --> review["Review<br/>review"]
    review -- "findings to fix" --> build
    review -- "nothing major open" --> accept["Acceptance<br/>accept"]
    accept -- "you accept" --> done(["Accepted:<br/>ready for ALM"])
    accept -. "you reject" .-> build
    accept -. "you reject" .-> spec
```

| Stage | Command | What Claude does | Your part | Written to the change folder |
|---|---|---|---|---|
| Request | `start <request>` | Looks at what exists and asks the questions the spec depends on | Answer them | `request.md` |
| Spec | `spec` | Writes the requirements, who may run what, and the acceptance criteria | `spec approve` | `spec.md` |
| Build plan | `plan` | Orders the work into tasks and writes the tests that prove each one | `plan approve` | `plan.md`, `tests/` |
| Build | `build` | Validates, saves and tests each artifact, then tests everything together | | `artifacts/`, `build-log.md`, `test-report.md` |
| Review | `review` | Has the change reviewed independently against the spec and the rules | | `review.md` |
| Acceptance | `accept` | Runs the acceptance scenarios again and shows you the evidence | `accept accept`, or reject | `acceptance.md` |

Each command is `/logic-fabric-dataverse:<command>`. Run `/logic-fabric-dataverse:status` at any time to see the
stage, which approvals still hold, the tasks done and open, the last test run, the open review findings and the next
command to run.

### Request

```
/logic-fabric-dataverse:start When a claim over $50,000 is reported, route it to the senior adjusters team and notify the claims manager
```

The first time, Claude creates `logic-fabric/workspace.yaml` in your repository: the Logic Fabric project, its
solution and publisher prefix, your environments, and the test users (personas) that check who may run what. It
asks you only which project.

Claude then reads what already exists: the artifacts the request touches, the tables and choices involved, the teams
and roles. It writes `request.md` with the request, what exists and could be reused, and its questions, and asks
the ones the spec can't do without (who may run it, thresholds, which records, what happens on failure) in one
message. Nothing is built or saved in this stage.

### Spec

`spec` writes `spec.md` in your business's words and Logic Fabric terms:

- the data model, with every table, column and choice value checked against Dataverse or declared new;
- one requirement per behaviour (`REQ-1`, `REQ-2`, ...), each naming the artifact that will do it, for example the
  flow `Claims_RouteHighValueClaim`;
- an access statement for every entry point: who may run it, under which condition, and what someone refused is
  told;
- acceptance criteria with concrete values: *Given a claim with an estimated loss of 50,001, when it is reported,
  then it is assigned to the Senior Adjusters team and the claims manager is notified.*

Claude checks the spec (criteria for every requirement, no missing column, role or team, no "to be decided") and
shows you a summary. Approve it with `/logic-fabric-dataverse:spec approve`, then commit the change folder.

### Build plan

`plan` turns the approved spec into `plan.md`, one task per artifact, in the order they can be built: tables first,
then configurations and service connections, blocks before the flows that call them, business processes, and the
go-live steps last (enabling recipes and schedules, publishing processes, exposing agent tools). Each task lists its
inputs and outputs, its access rule, its tests and when it is done. A change to an existing artifact lists what uses
it, and their tests join the regression run.

It also writes the test cases in `tests/`: every acceptance criterion, the boundaries (50,000 and 50,001), the
failures, and for every access rule a user who may run it and one who may not.

The plan's summary tells you what will exist, what changes, what goes live and when, what is deleted, and the
risks. Approve it with `/logic-fabric-dataverse:plan approve`, then commit.

### Build

`build` works through the tasks in order. For each one, Claude writes the metadata, has Logic Foundry validate it
and fixes what it reports, saves it to the development environment, and runs the task's tests. The source of every
saved artifact is written to `artifacts/`, so it is versioned and reviewed with the change. Go-live tasks run only
after the tests of what they make live have passed.

When every task is done, Claude runs all the change's tests and the regression set on fresh test data and writes
`test-report.md`, which traces each acceptance criterion to the tests that prove it.

If a task still fails after three attempts, Claude stops, marks it blocked with the error and tells you. If the
build needs something the plan doesn't have (a new artifact, a changed input, a table change), Claude adds it to
the plan and asks you to approve the plan again.

### Review

`review` gives the change to a reviewer agent that sees the artifacts, the spec and the plan, but not Claude's
opinion of its own work. It checks them against the spec, the plan and the rule catalog. A change to a business
process also gets a process analysis, and a change to who can run what gets a security review. Findings go into
`review.md` with their severity, where they are, the rule, the evidence and the fix. Every blocker or major finding
becomes a fix task: run `build`, then `review` again.

### Acceptance

`accept` runs the acceptance scenarios again on fresh test data, checks that what is in the development environment
matches `artifacts/`, and writes `acceptance.md`: each acceptance criterion with its evidence (records, outputs),
the test totals and the review's verdict. Then you decide:

- `/logic-fabric-dataverse:accept accept` closes the change. Its tests join the regression set in
  `logic-fabric/baseline/tests/`, the requirements document is brought up to date, and the change is ready for ALM:
  export the solution and run your pipeline to take it to test and production.
- `/logic-fabric-dataverse:accept reject spec` or `accept reject build`, with your reason, sends it back to that
  stage.

### Small changes

A change of at most two artifacts with no data model change (tables, columns, choices) is a small change: the
plan's tasks go at the end of the spec, and one approval covers both.

### Changing or removing what a change built

An accepted change is closed. To change or remove what it built, start a new change. When a plan deletes an
artifact, its summary names it (`Delete logicBlock Claims_CalculateHandlingFee: <reason>`), a task checks that
nothing uses it, a test checks that it is gone, and the regression tests that covered it are marked retired, so
they are skipped from then on instead of being deleted.

### What the plugin enforces

The plugin's hooks keep the workflow in place, whatever Claude is asked:

- Claude can change the development environment (save, delete, go live, run tests) only while a change is being
  built or fixed after review, and only against an approved plan (the approved spec, for a small change).
- Each approval is stamped with a fingerprint of the file you approved. If the spec or plan is edited afterwards,
  building stops until you approve it again. Ticking off a task doesn't count as an edit.
- A delete goes through only when the approved plan names it.
- Stages only move forward, except when you reject at acceptance, and a change can't retire its own tests to make
  them pass.
- At every prompt, Claude is told the active change, its stage and whether its approvals still hold.

Test and production never change from Claude Code: they change through your solutions and pipelines.

### The change folder

```
logic-fabric/
  workspace.yaml            offering (dataverse), project, solution, prefix, environments, test users
  glossary.md               the business's terms
  baseline/tests/           regression tests from accepted changes
  reports/                  reports from document, govern, insights and secure
  changes/2026-11-20-route-high-value-claims/
    status.yaml             stage, approvals and their fingerprints, test and review counts
    request.md  spec.md  plan.md
    tests/                  test cases
    artifacts/              the source of every saved artifact
    build-log.md  test-report.md  review.md  acceptance.md
```

Commit it after each approval and review it like code: the approvals, tests and sources travel with your solution
in git.

## Work with existing projects

These commands only read, run at any time, and write their report to `logic-fabric/reports/`:

| Command | What it does |
|---|---|
| `/logic-fabric-dataverse:document` | Writes the business requirements document from the deployed artifacts |
| `/logic-fabric-dataverse:govern` | Checks the project against the governance rules and your own |
| `/logic-fabric-dataverse:insights` | Analyzes the business processes: defects, bottlenecks, SLA risk, redesign ideas |
| `/logic-fabric-dataverse:secure` | Who can run what, attack paths, missing access rules, exposed credentials |

`/logic-fabric-dataverse:agent-tools` prepares flows, blocks and processes to be tools for AI agents through Logic
Conductor: descriptions written for an agent, documented inputs and an access rule. It changes artifacts, so it runs
as a small change of its own.

You can also just ask, for example "Why does the Close Claim flow fail for CLM-001014?".

## What's in the plugin

| Part | Names | Purpose |
|---|---|---|
| Skills | `authoring`, `artifacts`, `grammar`, `testing` | The workflow and its rules; every artifact kind with examples; expressions; tests |
| Commands | `start`, `spec`, `plan`, `build`, `review`, `accept`, `status`, `test`, `document`, `govern`, `insights`, `secure`, `agent-tools` | The stages and the project-wide reviews |
| Agents | `reviewer`, `explorer`, `documenter`, `process-analyst`, `security-reviewer` | Read-only specialists |
| Hooks | gate, stage, approval, context, export | Foundry changes only during a change's build, against the approved plan; stages only move forward and a change can't retire its own tests; approvals stamped with the approved file's hash; the active change's state at each prompt; each saved artifact's source written to the change folder |
| MCP server | `foundry` | The connection to your Logic Foundry server |

The plugin does not include or host a server. It only connects to yours. The command-line tools are in the Logic
Fabric CLI plugin, `flowon-dynamics`.

The `logic-fabric/` folder is shared with the plugins of the other Logic Fabric offerings: `workspace.yaml` names the
offering it belongs to, and this plugin works only in a workspace for `dataverse`.

## Set up sign-in (administrators)

Do this once per Microsoft Entra ID tenant.

1. **Consent to the Flowon Logic Fabric for Dataverse client app** for Claude Code, application ID `2ca7b075-1954-40ec-adeb-91cb4d3f3df4` (the
   one in the plugin's `.mcp.json`). It is a multitenant public client with the redirect URI
   `http://localhost:47823/callback`.
2. **Pre-authorize it on the Foundry server app.** In the Foundry server's app registration, open
   **Expose an API → Authorized client applications** and add the client app for the `Mcp.Tools.ReadWrite` scope.
3. **Add the server address as an identifier URI.** On the same app registration, under **Expose an API →
   Application ID URI**, add the Foundry server's MCP address, for example
   `https://<app>.<region>.azurecontainerapps.io/mcp`. It must match the `resource` value the server shows at
   `https://<server>/.well-known/oauth-protected-resource` exactly.

For production, run Foundry with `FOUNDRY_READ_ONLY=true`: it then refuses every change.

## Troubleshooting

| What you see | What to do |
|---|---|
| `AADSTS700016`: application not found in the directory | The client app isn't available in your tenant. Ask your administrator to complete step 1 of [Set up sign-in](#set-up-sign-in-administrators). |
| `AADSTS50011`: redirect URI does not match | The client app needs the redirect URI `http://localhost:47823/callback` (step 1). |
| `AADSTS65001` or a consent prompt you can't accept | Pre-authorize the client app on the Foundry server app (step 2). |
| `AADSTS9010010`: resource does not match the requested scopes | Add the server's MCP address to the Foundry server app's identifier URIs (step 3). |
| The same error after your administrator fixed it | Claude Code remembers sign-in details from the first attempt. Close all Claude Code sessions, remove the server's entry under `mcpOAuth` in `~/.claude/.credentials.json` (on macOS, in the Keychain), then sign in again. |
| "There is no active Logic Fabric change" or "... is in the spec stage" | The gate allows changes to Foundry only while a change is being built. Run `/logic-fabric-dataverse:status`. |
| "plan.md changed since it was approved" | Someone edited the plan. Ask the owner to approve it again. |
| "Access denied" or missing records | Claude acts as you. Ask your Dataverse administrator for the privileges you need. |

## Privacy and license

The plugin sends your requests only to your own Logic Foundry server, signed in as you. Service connection
credentials never reach Claude: Foundry redacts them. See the Flowon
[privacy policy](https://www.flowon.com/privacy-policy). Use of the plugin is subject to the Flowon software
license in [LICENSE](LICENSE) and requires a Logic Fabric subscription.
