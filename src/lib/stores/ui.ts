import { writable } from 'svelte/store';

export const collapsed = writable<Set<string>>(new Set());

export function togglePanel(id: string) {
  collapsed.update((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

export const agentOpen = writable(false);
