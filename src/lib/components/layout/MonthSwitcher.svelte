<script lang="ts">
  import { activeMonth, stepMonth, canGoNext } from '$lib/stores/month.js';
  import { formatMonthLabel } from '$lib/utils/format.js';

  function handleKey(e: KeyboardEvent) {
    if (e.key === '[') stepMonth(-1);
    if (e.key === ']' && $canGoNext) stepMonth(1);
  }
</script>

<svelte:window on:keydown={handleKey} />

<div class="switcher">
  <button class="arrow" on:click={() => stepMonth(-1)} title="Previous month ([ key)">‹</button>
  <span class="month-label">{formatMonthLabel($activeMonth)}</span>
  <button class="arrow" on:click={() => stepMonth(1)} disabled={!$canGoNext} title="Next month (] key)">›</button>
</div>

<style>
  .switcher {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid var(--line);
    border-radius: var(--r-panel);
    background: var(--bg-2);
  }
  .month-label {
    font-size: 12px;
    color: var(--fg-1);
    min-width: 80px;
    text-align: center;
    letter-spacing: 0.04em;
  }
  .arrow {
    color: var(--fg-2);
    font-size: 16px;
    padding: 0 4px;
    transition: color var(--dur-fast) var(--ease);
  }
  .arrow:hover:not(:disabled) { color: var(--amber); }
  .arrow:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
