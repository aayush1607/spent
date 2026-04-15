<script lang="ts">
  export let label: string;
  export let value: string;
  export let sub: string = '';
  export let delta: { text: string; color: string } | null = null;
  export let loading = false;
  export let variant: 'primary' | 'secondary' | 'projected' = 'secondary';
</script>

<div class="kpi-tile" class:primary={variant === 'primary'} class:projected={variant === 'projected'}>
  <div class="kpi-label label">{label}</div>
  {#if loading}
    <div class="kpi-value skeleton" style="width: 120px; height: 40px; margin: 4px 0;"></div>
  {:else}
    <div class="kpi-value mono tabular tick-in" class:violet={variant === 'projected'}>{value}</div>
  {/if}
  <div class="kpi-meta">
    {#if delta}
      <span class="delta mono" style="color: {delta.color}">{delta.text}</span>
    {/if}
    {#if sub}
      <span class="sub">{sub}</span>
    {/if}
  </div>
</div>

<style>
  .kpi-tile {
    padding: var(--sp-4);
    border: 1px solid var(--line);
    border-radius: var(--r-panel);
    background: var(--bg-1);
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .kpi-tile.primary { border-color: var(--amber-dim); }
  .kpi-label { color: var(--fg-2); }
  .kpi-value {
    font-size: 28px;
    line-height: 32px;
    color: var(--fg-0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kpi-value.violet { color: var(--violet); }
  .kpi-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
  }
  .delta { font-size: 12px; }
  .sub { font-size: 11px; color: var(--fg-2); }
</style>
