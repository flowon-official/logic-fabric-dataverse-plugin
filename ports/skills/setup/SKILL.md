---
name: setup
description: "Connect Codex or GitHub Copilot to your Logic Foundry MCP server for this repository, and install the workflow's agents. Run it once per repository (Claude Code asks for Foundry's address when the plugin is installed, and doesn't need it)."
argument-hint: "<Logic Foundry MCP endpoint, ending in /mcp>"
user-invocable: true
disable-model-invocation: true
---

Set up the Logic Fabric for Dataverse plugin in this repository for the client you are running in (Codex, or GitHub
Copilot in the CLI or Visual Studio Code). The workflow's skills and hooks expect Logic Foundry's MCP server under the
name `foundry`: never give it another name.

1. Get Logic Foundry's MCP endpoint from the text the user gave after the skill's name, or ask for it: the HTTPS
   address of their Logic Foundry ending in `/mcp`, such as `https://<app>.<region>.azurecontainerapps.io/mcp`. It is
   not a secret. The plugin's sign-in client is `2ca7b075-1954-40ec-adeb-91cb4d3f3df4` (the Logic Fabric for Dataverse
   app registration), with the redirect URI `http://localhost:47823/callback`.

2. **GitHub Copilot** (CLI or Visual Studio Code): write `.github/mcp.json` at the repository's root. Keep any other
   server it has; add or replace `foundry`:

   ```json
   {
     "mcpServers": {
       "foundry": {
         "type": "http",
         "url": "<endpoint>",
         "oauthClientId": "2ca7b075-1954-40ec-adeb-91cb4d3f3df4",
         "auth": { "redirectPort": 47823 }
       }
     }
   }
   ```

   Then tell the user: Copilot loads a repository's MCP servers only from a trusted folder (it asks, or add the
   folder to `trustedFolders` in `~/.copilot/config.json`); restart Copilot, and sign in to `foundry` when asked
   (`/mcp` shows its state). Copilot reads the plugin's agents and hooks itself.

3. **Codex**: run `codex mcp add foundry --url <endpoint> --oauth-client-id 2ca7b075-1954-40ec-adeb-91cb4d3f3df4`.
   It writes `[mcp_servers.foundry]` and `[mcp_servers.foundry.oauth]` into `~/.codex/config.toml` with a
   `callback_url` of its own: change that line, under `[mcp_servers.foundry.oauth]` only, to
   `callback_url = "http://localhost:47823/callback"` (the redirect the app registration allows). Don't add a second
   `[mcp_servers.foundry.oauth]` section: Codex refuses a file with one twice. Then:
   - Copy the workflow's agents into the repository: every file in this plugin's `ports/codex/agents/` (the plugin's
     folder is three folders above this `SKILL.md`) into `.codex/agents/` at the repository's root, replacing the
     `logic_fabric_*.toml` files already there. A plugin can't install Codex agents itself, so the copies don't follow
     plugin updates: running this skill again after an update refreshes them. Codex loads a repository's agents only
     once the user trusts the folder (it asks the first time Codex opens it).
   - Tell the user to sign in once in their own terminal with `codex mcp login foundry` (a browser opens), then to
     restart Codex and trust the plugin's hooks in `/hooks`. Codex runs no plugin hook until the user trusts it, and
     asks again whenever the hooks change. Without them, Logic Foundry still keeps the approvals and stages of a
     project whose writes need approved changes, but the plugin's own checks don't run.

4. Check the connection: call Foundry's `reference` tool. If it fails because the user hasn't signed in yet, say how
   to sign in (above) and stop; don't retry in a loop.

5. If the repository has no `logic-fabric/workspace.yaml`, tell the user that the `start` skill begins the first
   change and sets the workspace up.

Never put a secret in these files: the endpoint and the client ID aren't secrets, and the sign-in keeps its tokens in
the client's own store.
