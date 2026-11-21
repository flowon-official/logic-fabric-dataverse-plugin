// PreToolUse check for shell commands that change Dataverse outside Logic Foundry: the Flowon command-line tool's
// writing commands (import, apply-mappings, enable or disable plugins and recipes, versions and patches, publish-api),
// the Flowon PowerShell module's writing cmdlets, and scripts that call Dataverse with a connection string or write
// through its Web API. Such a command
//   - is refused outside a change's build stage, or before its plan is approved (the same rules as Foundry writes),
//   - is refused when it names a test or production environment of workspace.yaml (those change only through
//     solutions and the pipeline),
//   - otherwise stops for the user's approval, showing what it is about to change. The user approves it in Claude
//     Code's prompt, so Claude runs it instead of handing the user a script.
// Previews (import --security-what-if) and read-only commands pass. Outside a workflow repository nothing is checked.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRefusal, findWorkspace, isOwnWorkspace, readEnvironments, readInput } from './workspace.mjs';

const CLI_WRITES = /\bflowon-dynamics(?:\.exe)?\s+(import|i|apply-mappings|am|disable-plugins|dp|enable-plugins|ep|enable-recipe|er|disable-recipe|dr|increment-solution-version|isv|create-patch|cp|merge-patches|mp|publish-api|pa)(?=\s|$)/i;
const CMDLET_WRITES = /\b(Import-FlowonProject|Import-FlowonDataMap|Enable-FlowonPlugin|Disable-FlowonPlugin|Enable-FlowonLogicRecipe|Disable-FlowonLogicRecipe|Step-FlowonSolutionVersion|New-FlowonSolutionPatch|Merge-FlowonSolutionPatch|Publish-FlowonApi)\b/i;
const PREVIEW = /--security-what-if\b|-SecurityWhatIf\b/i;

// A script reaching Dataverse: a connection string, the SDK's client, or the Web API. And a write in it.
const DATAVERSE = /CONNECTION_?STRING|AuthType\s*=|ClientSecret\s*=|\bServiceClient\b|CrmServiceClient|\.dynamics\.com\/api\/data/i;
const WRITE = /-Method\s+['"]?(Post|Patch|Put|Delete)\b|-X\s*['"]?(POST|PATCH|PUT|DELETE)\b|\b(requests|session|httpx)\.(post|patch|put|delete)\s*\(|method\s*[:=]\s*['"](POST|PATCH|PUT|DELETE)['"]|\.(Create|Update|Delete|Execute|Upsert)(Async)?\s*\(|\b(CreateRequest|UpdateRequest|UpsertRequest|DeleteRequest|ExecuteMultipleRequest)\b/i;

// Script files the command runs, read so a script can't hide what it does.
const SCRIPT = /(?:^|[\s"'&])((?:[A-Za-z]:)?[^\s"'&|;<>]+\.(?:py|ps1|psm1|mjs|cjs|js|ts|sh|csx))(?=["'\s;|&)]|$)/g;

function decide(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
  }));
  process.exit(0);
}

const input = await readInput();

if (!['Bash', 'PowerShell'].includes(String(input.tool_name || ''))) {
  process.exit(0);
}

const command = String(input.tool_input?.command || '');
const workspace = findWorkspace(input.cwd);

if (!command || !workspace || !isOwnWorkspace(workspace)) {
  process.exit(0);
}

const cwd = resolve(input.cwd || process.cwd());
const scripts = [...command.matchAll(SCRIPT)]
  .map(m => resolve(cwd, m[1].replace(/^~(?=[\\/])/, process.env.USERPROFILE || process.env.HOME || '~')))
  .filter(file => existsSync(file) && statSync(file).isFile() && statSync(file).size < 2_000_000)
  .map(file => ({ file, text: readFileSync(file, 'utf8') }));
const everything = [command, ...scripts.map(s => s.text)].join('\n');

const cli = CLI_WRITES.exec(command)?.[0] || CMDLET_WRITES.exec(command)?.[0];
// The tool itself refuses --security-what-if together with anything else to import, so with it nothing changes.
const preview = cli && PREVIEW.test(command);
const script = !cli && DATAVERSE.test(everything) && WRITE.test(everything);

if (preview || (!cli && !script)) {
  process.exit(0);
}

const what = cli
  ? `\`${cli.trim()}\``
  : `a script that writes to Dataverse${scripts.length ? ` (${scripts.map(s => s.file).join(', ')})` : ''}`;

// Test and production change only through solutions and the pipeline.
const environments = readEnvironments(workspace);
const target = Object.entries(environments).find(([, env]) => {
  const host = (env.url || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  return (host && !host.includes('<') && everything.toLowerCase().includes(host)) || (env.connection && everything.includes(env.connection));
});

if (target && (target[1].role || target[0]) !== 'development') {
  decide('deny', `${what} would change the ${target[0]} environment (${target[1].role || target[0]}). It changes only through solutions and the pipeline, not from Claude Code.`);
}

const { refusal, change } = buildRefusal(workspace, `Changing Dataverse outside Logic Foundry (${what})`);

if (refusal) {
  decide('deny', refusal);
}

const where = target ? `the ${target[0]} environment` : 'Dataverse (the environment its connection string names)';

decide('ask', `Logic Fabric for Dataverse: ${what} changes ${where} outside Logic Foundry, for the change ${change.name}. Approve it only if the approved plan has this task and the command does what Claude told you.`);
