import type { RequestHandler } from './$types.js';
import { runAgentLoop } from '$server/agent/loop.js';

// In-memory conversation sessions (1h TTL)
const sessions = new Map<string, { history: unknown[]; at: number }>();
const SESSION_TTL = 60 * 60 * 1000;

function cleanSessions() {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (now - v.at > SESSION_TTL) sessions.delete(k);
  }
}

export const POST: RequestHandler = async ({ request, cookies }) => {
  const userId = cookies.get('spent_uid');
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await request.json() as { message: string; conversationId?: string; viewingMonth?: string };
  const { message, conversationId, viewingMonth } = body;

  if (!message?.trim()) return new Response('Bad Request', { status: 400 });

  cleanSessions();

  const sessId = conversationId ?? crypto.randomUUID();
  const existing = sessions.get(sessId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history = (existing?.history ?? []) as any[];

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const emit = (event: { type: string } & Record<string, unknown>) => {
        const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
        if (event.type === 'done' || event.type === 'error') {
          controller.close();
        }
      };

      runAgentLoop(userId, message, history, emit, viewingMonth)
        .then((newHistory) => {
          sessions.set(sessId, { history: newHistory, at: Date.now() });
        })
        .catch((err) => {
          emit({ type: 'error', message: String(err) });
        });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Conversation-Id': sessId,
    },
  });
};
