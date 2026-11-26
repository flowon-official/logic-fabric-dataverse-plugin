// The AI client that runs a hook, and its formats. Claude Code is the default; each other client's hooks file names
// its client with --client (codex, copilot). The hooks read their input in Claude Code's shape (normalize) and answer
// in the client's (decide, addContext), so their rules are written once.
import { appendFileSync } from 'node:fs';

const flag = process.argv.indexOf('--client');

export const CLIENT = flag > 0 ? String(process.argv[flag + 1] || 'claude').toLowerCase() : 'claude';

// How the user runs one of the plugin's commands in this client: a slash command in Claude Code and Copilot, a skill
// named with $ in Codex.
export function command(name) {
  return CLIENT === 'codex' ? `$logic-fabric-dataverse:${name}` : `/logic-fabric-dataverse:${name}`;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// The input in Claude Code's shape: tool_name, tool_input (an object), tool_response, cwd, hook_event_name, prompt.
// Copilot's camelCase payloads carry toolName and toolArgs (a JSON string) and toolResult; its PascalCase payloads
// use Claude's field names with tool_result. Copilot's file tools name the file path, and edits old_str, new_str
// and file_text.
export function normalize(raw) {
  const input = { ...raw };

  input.tool_name ??= raw.toolName;
  input.hook_event_name ??= raw.hookEventName;
  input.tool_input ??= typeof raw.toolArgs === 'string' ? parseJson(raw.toolArgs) : raw.toolArgs;
  input.tool_input ??= {};
  input.tool_response ??= raw.tool_result ?? raw.toolResult;

  const result = input.tool_response;

  if (result && typeof result === 'object' && !Array.isArray(result) && !result.content && !result.structuredContent) {
    input.tool_response = result.text_result_for_llm ?? result.textResultForLlm ?? result;
  }

  if (input.tool_input && typeof input.tool_input === 'object' && !Array.isArray(input.tool_input)) {
    // A copy, so the payload itself (and its log) stays as the client sent it.
    const args = input.tool_input = { ...input.tool_input };
    args.file_path ??= args.path ?? args.filePath;
    args.old_string ??= args.old_str;
    args.new_string ??= args.new_str;
    args.content ??= args.file_text;
  }

  if (process.env.LF_HOOK_LOG) {
    try {
      appendFileSync(process.env.LF_HOOK_LOG, JSON.stringify({ client: CLIENT, at: new Date().toISOString(), raw }) + '\n');
    } catch {
      // A log that can't be written changes nothing.
    }
  }

  return input;
}

// The tool's own name: Claude's mcp__plugin_<plugin>_<server>__<tool>, Codex's mcp__<server>__<tool>, Copilot's
// <server>-<tool>, or a server/tool form, all give <tool>. So does Codex's mcp__codex_apps__<app>__<tool> for Foundry
// added to ChatGPT as an app, which Codex reaches through ChatGPT (<app> is the app's name, such as
// logic_fabric_foundry_1), and the model's mcp__codex_apps__<app>_<tool>: there the name is the last word, since the
// tools the hooks check (save, delete, release, test, run) are one word. Logic Foundry's tool names have no hyphens.
export function toolName(input) {
  const name = String(input.tool_name || '');
  const tool = name.split(/__|\/|-/).pop();

  return name.startsWith('mcp__codex_apps__') ? tool.split('_').pop() : tool;
}

// Whether the tool is one of Logic Foundry's. Claude Code's and Codex's matchers pick Foundry's tools already (in Codex
// also a ChatGPT app with "foundry" in its name); a client whose hooks see every tool relies on this.
export function isFoundryTool(input) {
  return /foundry/i.test(String(input.tool_name || ''));
}

// Allows, asks or denies the tool call, with the reason shown to the agent. Codex doesn't support "ask" (the call
// would go ahead), so there it denies, and the reason says the user decides.
export function decide(event, decision, reason) {
  if (CLIENT === 'codex' && decision === 'ask') {
    decision = 'deny';
    reason = `${reason} This client can't ask the user from a hook: tell them the command and let them run it in their own terminal, or ask them to approve it and run it themselves.`;
  }

  const answer = CLIENT === 'copilot'
    ? { permissionDecision: decision, permissionDecisionReason: reason }
    : { hookSpecificOutput: { hookEventName: event, permissionDecision: decision, permissionDecisionReason: reason } };

  process.stdout.write(JSON.stringify(answer));
  process.exit(0);
}

// Adds context for the agent after a prompt or a tool call.
export function addContext(event, text) {
  const answer = CLIENT === 'copilot'
    ? { additionalContext: text }
    : { hookSpecificOutput: { hookEventName: event, additionalContext: text } };

  process.stdout.write(JSON.stringify(answer));
}

const lf = text => String(text ?? '').replace(/\r\n/g, '\n');

// One edit: old_string replaced by new_string (every occurrence with replace_all). An edit whose text isn't found
// fails on its own, so the result is null and the hooks let the tool report it.
function applyEdit(text, edit) {
  const from = lf(edit.old_string ?? edit.old_str);
  const to = lf(edit.new_string ?? edit.new_str);

  if (text === null || !from || !text.includes(from)) {
    return null;
  }

  return edit.replace_all ? text.split(from).join(to) : text.replace(from, () => to);
}

// The patch text of an apply_patch call (Codex puts it in command; other clients may use patch or input).
function patchText(args) {
  const text = [args.command, args.patch, args.input].find(value => typeof value === 'string' && value.includes('*** Begin Patch'));

  return text ? lf(text) : null;
}

// An apply_patch patch: "*** Begin Patch", then per file "*** Add File: <path>" (lines starting with +),
// "*** Delete File: <path>", or "*** Update File: <path>" (optionally "*** Move to: <path>") with hunks after "@@"
// lines, whose lines start with a space (context), - (removed) or + (added); "*** End Patch".
export function parsePatch(text) {
  const files = [];
  let current = null;
  let hunk = null;

  for (const line of lf(text).split('\n')) {
    const header = line.match(/^\*\*\* (Add|Delete|Update) File: (.+)$/);

    if (header) {
      current = { kind: header[1].toLowerCase(), path: header[2].trim(), added: [], hunks: [] };
      files.push(current);
      hunk = null;
      continue;
    }

    if (!current || line.startsWith('*** Begin Patch') || line.startsWith('*** End Patch') || line.startsWith('*** End of File')) {
      continue;
    }

    const move = line.match(/^\*\*\* Move to: (.+)$/);

    if (move) {
      current.moveTo = move[1].trim();
      continue;
    }

    if (current.kind === 'add') {
      if (line.startsWith('+')) {
        current.added.push(line.slice(1));
      }
      continue;
    }

    if (line.startsWith('@@')) {
      hunk = { old: [], new: [] };
      current.hunks.push(hunk);
      continue;
    }

    if (current.kind === 'update' && /^[ +-]/.test(line)) {
      if (!hunk) {
        hunk = { old: [], new: [] };
        current.hunks.push(hunk);
      }
      const body = line.slice(1);
      if (line[0] !== '+') {
        hunk.old.push(body);
      }
      if (line[0] !== '-') {
        hunk.new.push(body);
      }
    }
  }

  return files;
}

function applyHunks(before, hunks) {
  if (before === null) {
    return null;
  }

  let text = before;
  let from = 0;

  for (const hunk of hunks) {
    const old = hunk.old.join('\n');
    const replacement = hunk.new.join('\n');
    const at = old ? text.indexOf(old, from) : text.length;

    if (at < 0) {
      return null;
    }

    text = text.slice(0, at) + replacement + text.slice(at + old.length);
    from = at + replacement.length;
  }

  return text;
}

// The files a write tool changes, each with a function from its text before (null for a new file) to its text after
// (null when that can't be worked out, or for a deleted file): Write (content), Edit (old_string/new_string),
// MultiEdit (edits) and apply_patch (a patch over several files).
export function fileWrites(input) {
  const args = input.tool_input || {};
  const patch = patchText(args);

  if (patch) {
    return parsePatch(patch).map(file => ({
      path: file.moveTo || file.path,
      deleted: file.kind === 'delete',
      after: file.kind === 'add' ? () => file.added.join('\n') + (file.added.length ? '\n' : '')
        : file.kind === 'delete' ? () => null
        : before => applyHunks(before, file.hunks),
    }));
  }

  if (!args.file_path) {
    return [];
  }

  if (typeof args.content === 'string') {
    return [{ path: args.file_path, after: () => lf(args.content) }];
  }

  if (Array.isArray(args.edits)) {
    return [{ path: args.file_path, after: before => args.edits.reduce((text, edit) => applyEdit(text, edit), before) }];
  }

  return [{ path: args.file_path, after: before => applyEdit(before, args) }];
}
