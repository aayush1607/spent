import { writable } from 'svelte/store';

export type ToolCallState = {
  id: string;
  name: string;
  input: unknown;
  result?: unknown;
  status: 'running' | 'done' | 'error';
};

export type AgentMessage = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  reasoning?: string;
  toolCalls?: ToolCallState[];
  streaming?: boolean;
};

export const messages = writable<AgentMessage[]>([]);
export const isStreaming = writable(false);
export const conversationId = writable<string | undefined>(undefined);

export function addUserMessage(content: string): string {
  const id = crypto.randomUUID();
  messages.update((m) => [...m, { id, role: 'user', content }]);
  return id;
}

export function addAgentMessage(): string {
  const id = crypto.randomUUID();
  messages.update((m) => [...m, { id, role: 'agent', content: '', streaming: true, toolCalls: [] }]);
  return id;
}

export function appendAgentText(id: string, delta: string) {
  messages.update((msgs) =>
    msgs.map((m) => m.id === id ? { ...m, content: m.content + delta } : m)
  );
}

export function setAgentText(id: string, content: string) {
  messages.update((msgs) =>
    msgs.map((m) => m.id === id ? { ...m, content } : m)
  );
}

export function appendAgentReasoning(id: string, delta: string) {
  messages.update((msgs) =>
    msgs.map((m) => m.id === id ? { ...m, reasoning: (m.reasoning ?? '') + delta } : m)
  );
}

export function addToolCall(msgId: string, tc: Omit<ToolCallState, 'status'>) {
  messages.update((msgs) =>
    msgs.map((m) =>
      m.id === msgId
        ? { ...m, toolCalls: [...(m.toolCalls ?? []), { ...tc, status: 'running' }] }
        : m
    )
  );
}

export function resolveToolCall(msgId: string, tcId: string, result: unknown) {
  messages.update((msgs) =>
    msgs.map((m) =>
      m.id === msgId
        ? {
            ...m,
            toolCalls: m.toolCalls?.map((tc) =>
              tc.id === tcId ? { ...tc, result, status: 'done' } : tc
            ),
          }
        : m
    )
  );
}

export function finalizeMessage(id: string) {
  messages.update((msgs) =>
    msgs.map((m) => m.id === id ? { ...m, streaming: false } : m)
  );
}
