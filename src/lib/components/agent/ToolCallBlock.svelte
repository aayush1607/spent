<script lang="ts">
  export let name: string;
  export let input: unknown;
  export let result: unknown = undefined;
  export let status: 'running' | 'done' | 'error' = 'running';

  let open = false;
  $: if (status === 'done') open = false;
</script>

<div class="tool-block" class:running={status === 'running'} class:done={status === 'done'}>
  <button class="header" on:click={() => (open = !open)}>
    <span class="icon">{status === 'running' ? '⚙' : '✓'}</span>
    <span class="name mono">{name}</span>
    {#if status === 'running'}
      <span class="spinner spin">▰</span>
    {:else}
      <span class="duration mono">{open ? '▴' : '▾'}</span>
    {/if}
  </button>

  {#if open || status === 'running'}
    <div class="body">
      <div class="section">
        <span class="label">INPUT</span>
        <pre class="mono code">{JSON.stringify(input, null, 2)}</pre>
      </div>
      {#if result !== undefined}
        <div class="section">
          <span class="label">RESULT</span>
          <pre class="mono code">{JSON.stringify(result, null, 2).slice(0, 800)}{JSON.stringify(result).length > 800 ? '\n…' : ''}</pre>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool-block {
    border-left: 2px solid var(--line-bright);
    margin: 6px 0;
    border-radius: 0 var(--r-chip) var(--r-chip) 0;
    background: var(--bg-2);
    overflow: hidden;
    transition: border-color var(--dur-fast) var(--ease);
  }
  .tool-block.running { border-color: var(--cyan); }
  .tool-block.done { border-color: var(--line-bright); }
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    text-align: left;
    color: var(--fg-1);
    transition: background var(--dur-fast) var(--ease);
  }
  .header:hover { background: var(--bg-3); }
  .icon { color: var(--cyan); font-size: 12px; }
  .name { font-size: 12px; color: var(--fg-1); flex: 1; }
  .spinner { color: var(--cyan); font-size: 10px; }
  .duration { font-size: 10px; color: var(--fg-3); }
  .body { padding: 6px 10px 8px; border-top: 1px solid var(--line); }
  .section { margin-bottom: 8px; }
  .label { display: block; font-size: 10px; color: var(--fg-3); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; }
  .code {
    font-size: 11px;
    color: var(--fg-2);
    white-space: pre-wrap;
    word-break: break-all;
    background: var(--bg-1);
    border: 1px solid var(--line);
    border-radius: 2px;
    padding: 6px 8px;
    max-height: 200px;
    overflow-y: auto;
  }
</style>
