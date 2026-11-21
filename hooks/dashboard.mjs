// Stop: keeps logic-fabric/dashboard.html current once /logic-fabric-dataverse:dashboard has written it. At the end of
// a turn, when anything in logic-fabric/ changed after the dashboard was written, the dashboard is written again.
// Without a dashboard it does nothing, and it never blocks or fails a turn.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findWorkspace, isOwnWorkspace, readInput } from './workspace.mjs';

try {
  const input = await readInput();
  const workspace = findWorkspace(input.cwd);

  if (workspace && isOwnWorkspace(workspace)) {
    const { DASHBOARD, isStale, writeDashboard } = await import('../scripts/dashboard.mjs');
    const file = join(workspace, DASHBOARD);

    if (existsSync(file) && isStale(workspace, file)) {
      writeDashboard(workspace);
    }
  }
} catch {
  // A dashboard that couldn't be refreshed stays as it was; the command writes it again.
}

process.exit(0);
