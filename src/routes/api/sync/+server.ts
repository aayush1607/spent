import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { runMigrations } from '$server/db/migrate.js';
import { runSync, requestAbort } from '$server/sync/runner.js';

let migrated = false;

function ensureMigrated() {
  if (!migrated) {
    runMigrations();
    migrated = true;
  }
}

// GET /api/sync — returns current sync status for polling
export const GET: RequestHandler = async ({ cookies }) => {
  const userId = cookies.get('spent_uid');
  if (!userId) return json({ status: 'idle' });

  ensureMigrated();
  const { getSyncState, upsertSyncState } = await import('$server/db/repo/syncState.js');
  const state = getSyncState(userId);

  // If the status has been 'syncing' for more than 10 minutes, the server
  // likely crashed or restarted mid-sync. Auto-reset to idle so the UI unblocks.
  const STALE_MS = 10 * 60 * 1000;
  if (state?.status === 'syncing' && state.lastSyncAt && Date.now() - state.lastSyncAt > STALE_MS) {
    await upsertSyncState({ userId, status: 'idle' });
    return json({ status: 'idle' });
  }

  return json({ status: state?.status ?? 'idle' });
};

// DELETE /api/sync — request abort of the running sync
export const DELETE: RequestHandler = ({ cookies }) => {
  const userId = cookies.get('spent_uid');
  if (!userId) return json({ ok: false }, { status: 401 });
  requestAbort(userId);
  return json({ ok: true });
};

export const POST: RequestHandler = ({ cookies, url }) => {
  const userId = cookies.get('spent_uid');
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  ensureMigrated();

  const mode = url.searchParams.get('mode') === 'full' ? 'full' : 'incremental';

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let controllerClosed = false;

      const emit = (event: { type: string } & Record<string, unknown>) => {
        if (controllerClosed) return;
        try {
          const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
          if (event.type === 'done' || event.type === 'error') {
            controllerClosed = true;
            controller.close();
          }
        } catch {
          // Client disconnected — swallow and stop emitting
          controllerClosed = true;
        }
      };

      runSync(userId, mode, emit).catch((err) => {
        emit({ type: 'error', message: String(err) });
      });
    },
    cancel() {
      // Client disconnected — runSync will keep running but emit() calls are no-ops
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
