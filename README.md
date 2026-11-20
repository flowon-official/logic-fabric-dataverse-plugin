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

Your administrator also needs to set up sign-in once for your organization: see
[Set up sign-in](#set-up-sign-in-administrators).

## Install

1. Add the marketplace and install the plugin:

   ```bash
   claude plugin marketplace add flowon-official/logic-fabric-dataverse-claude-plugins
   claude plugin install logic-fabric-dataverse@flowon
   ```

2. When Claude Code asks for the **Logic Foundry MCP endpoint**, enter your server's address. You can change it
   later in `/config`.
3. Restart Claude Code, run `/mcp`, select **plugin:logic-fabric-dataverse:foundry** and choose to sign in. Sign in
   with your work account in the browser window that opens.

## Use it

Start a change with a request:

```
/logic-fabric-dataverse:start When a claim over $50,000 is reported, route it to the senior adjusters team and notify the claims manager
```

Then move it through the stages. Claude stops at each gate for you:

| Step | Command | What happens | Your part |
|---|---|---|---|
| 1 | `start` | Claude looks at what exists and asks the questions that matter | Answer them |
| 2 | `spec` | A spec in business terms: requirements, who may run what, acceptance criteria | Approve it: `spec approve` |
| 3 | `plan` | The build plan, task by task, and the tests that will prove it | Approve it: `plan approve` |
| 4 | `build` | Each artifact validated, saved and tested; the whole set tested | |
| 5 | `review` | An independent review against the spec and the rules; fixes loop back to build | |
| 6 | `accept` | The acceptance scenarios run again with evidence | Accept or reject: `accept accept` |

`/logic-fabric-dataverse:status` shows where things stand. A small change (two artifacts or fewer, no table
changes) takes one approval instead of two. Everything is written to `logic-fabric/changes/<change>/` in your
repository: commit it, and review it like code.

For the projects you already have:

| Command | What it does |
|---|---|
| `/logic-fabric-dataverse:document` | Writes the business requirements document from the deployed artifacts |
| `/logic-fabric-dataverse:govern` | Checks the project against the governance rules and your own |
| `/logic-fabric-dataverse:insight` | Analyzes the business processes: defects, bottlenecks, SLA risk, redesign ideas |
| `/logic-fabric-dataverse:secure` | Who can run what, attack paths, missing access rules, exposed credentials |
| `/logic-fabric-dataverse:agent-tools` | Prepares flows, blocks and processes to be tools for AI agents |

You can also just ask, for example "Why does the Close Claim flow fail for CLM-001014?".

## What's in the plugin

| Part | Names | Purpose |
|---|---|---|
| Skills | `authoring`, `artifacts`, `grammar`, `testing`, `tools` | The workflow and its rules; every artifact kind with examples; expressions; tests; the command-line tools |
| Commands | `start`, `spec`, `plan`, `build`, `review`, `accept`, `status`, `test`, `document`, `govern`, `insight`, `secure`, `agent-tools` | The stages and the project-wide reviews |
| Agents | `reviewer`, `explorer`, `documenter`, `process-analyst`, `security-reviewer` | Read-only specialists |
| Hooks | gate, stage, approval, context, export | Foundry changes only during a change's build, against the approved plan; stages only move forward and a change can't retire its own tests; approvals stamped with the approved file's hash; the active change's state at each prompt; each saved artifact's source written to the change folder |
| MCP server | `foundry` | The connection to your Logic Foundry server |

The plugin does not include or host a server. It only connects to yours.

## Set up sign-in (administrators)

Do this once per Microsoft Entra ID tenant.

1. **Consent to the FlowOn client app** for Claude Code, application ID `2ca7b075-1954-40ec-adeb-91cb4d3f3df4` (the
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
