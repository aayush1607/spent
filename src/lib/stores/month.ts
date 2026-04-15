import { writable, derived } from 'svelte/store';
import { currentMonth, prevMonth, nextMonth } from '$lib/utils/format.js';

export const activeMonth = writable<string>(currentMonth());

export const canGoNext = derived(activeMonth, ($m) => $m < currentMonth());

export function stepMonth(dir: -1 | 1) {
  activeMonth.update((m) => dir === -1 ? prevMonth(m) : nextMonth(m));
}
