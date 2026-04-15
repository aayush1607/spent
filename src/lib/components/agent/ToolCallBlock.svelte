<script lang="ts">
  export let name: string;
  export let input: unknown;
  export let result: unknown = undefined;
  export let status: 'running' | 'done' | 'error' = 'running';

  let open = false;

  // ── Human-readable summary ────────────────────────────────────────────────
  function summariseInput(n: string, inp: unknown): string {
    if (!inp || typeof inp !== 'object') return '';
    const i = inp as Record<string, unknown>;

    if (n === 'query_transactions') {
      const parts: string[] = [];
      if (i.groupBy)   parts.push(`group by ${i.groupBy}`);
      if (i.category?.length) parts.push((i.category as string[]).join(', '));
      if (i.merchant)  parts.push(`"${i.merchant}"`);
      if (i.from || i.to) parts.push(`${i.from ?? '…'} → ${i.to ?? 'now'}`);
      if (i.minAmount) parts.push(`≥ ₹${i.minAmount}`);
      if (i.maxAmount) parts.push(`≤ ₹${i.maxAmount}`);
      return parts.join(' · ') || 'all transactions';
    }
    if (n === 'search_gmail') {
      return (i.query as string) ?? '';
    }
    return '';
  }

  function summariseResult(n: string, res: unknown): string {
    if (!res || typeof res !== 'object') return '';
    const r = res as Record<string, unknown>;
    if (Array.isArray(r.rows))  return `${r.rows.length} rows`;
    if (Array.isArray(r.items)) return `${r.total ?? r.items.length} transactions`;
    if (r.total !== undefined)  return `₹${Number(r.total).toLocaleString('en-IN')}`;
    if (Array.isArray(r.messages)) return `${r.messages.length} emails`;
    return '';
  }

  // ── Syntax-coloured JSON-like rendering ───────────────────────────────────
  function renderKV(obj: unknown, depth = 0): string {
    if (obj === null)    return '<span class="jn">null</span>';
    if (typeof obj === 'boolean') return `<span class="jb">${obj}</span>`;
    if (typeof obj === 'number')  return `<span class="jnum">${obj}</span>`;
    if (typeof obj === 'string')  return `<span class="js">"${escHtml(obj)}"</span>`;
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      const items = obj.map(v => renderKV(v, depth + 1)).join(', ');
      return `[${items}]`;
    }
    if (typeof obj === 'object') {
      const entries = Object.entries(obj as Record<string, unknown>);
      if (entries.length === 0) return '{}';
      const pad = '  '.repeat(depth + 1);
      const lines = entries.map(([k, v]) =>
        `${pad}<span class="jk">${escHtml(k)}</span>: ${renderKV(v, depth + 1)}`
      ).join('\n');
      return `{\n${lines}\n${'  '.repeat(depth)}}`;
    }
    return String(obj);
  }

  function escHtml(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  $: inputSummary  = summariseInput(name, input);
  $: resultSummary = result !== undefined ? summariseResult(name, result) : '';
  $: inputHtml  = renderKV(input);
  $: resultHtml = result !== undefined ? renderKV(result) : '';

  const ICONS: Record<string, string> = {
    query_transactions: '⬡',
    search_gmail: '✉',
  };
  $: icon = ICONS[name] ?? '◆';
  $: displayName = name.replace(/_/g, ' ');
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="tool-block" class:running={status === 'running'} class:errored={status === 'error'}>
  <button class="header" on:click={() => open = !open}>
    <span class="status-icon" class:spin={status === 'running'}>
      {#if status === 'running'}
        <svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="14 6" class="spinner-ring"/></svg>
      {:else if status === 'error'}
        <svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="4" x2="8" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="4" x2="4" y2="8" stroke="currentColor" stroke-width="1.5"/></svg>
      {:else}
        <svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="3.5,6 5.5,8 8.5,4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      {/if}
    </span>

    <span class="tool-icon">{icon}</span>
    <span class="tool-name">{displayName}</span>

    {#if inputSummary}
      <span class="summary">{inputSummary}</span>
    {/if}

    {#if resultSummary && status === 'done'}
      <span class="result-pill">{resultSummary}</span>
    {/if}

    <span class="chevron" class:flipped={open}>
      <svg width="10" height="10" viewBox="0 0 10 10"><polyline points="2,3.5 5,6.5 8,3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
  </button>

  {#if open}
    <div class="body">
      <div class="pane-row">
        <!-- Input pane -->
        <div class="pane">
          <div class="pane-label">
            <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1 1l4 3.5L1 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            input
          </div>
          <pre class="code">{@html inputHtml}</pre>
        </div>

        <!-- Result pane -->
        {#if result !== undefined}
          <div class="pane">
            <div class="pane-label">
              <svg width="9" height="9" viewBox="0 0 9 9"><path d="M8 1l-4 3.5L8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              output
            </div>
            <pre class="code">{@html resultHtml.slice(0, 1200)}{resultHtml.length > 1200 ? '\n…' : ''}</pre>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .tool-block {
    margin: 4px 0;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg3);
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .tool-block.running { border-color: var(--teal); }
  .tool-block.errored  { border-color: var(--red); }

  .header {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 7px 10px;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s;
  }
  .header:hover { background: var(--bg4); }

  .status-icon {
    flex-shrink: 0;
    color: var(--teal);
    display: flex;
    align-items: center;
  }
  .tool-block.running .status-icon { color: var(--teal); }
  .tool-block.errored .status-icon  { color: var(--red); }
  .tool-block.done    .status-icon  { color: var(--green); }

  /* Spinner rotation */
  @keyframes spin { to { transform: rotate(360deg); } }
  .tool-block.running .status-icon svg { animation: spin 1s linear infinite; }

  .tool-icon {
    font-size: 11px;
    color: var(--text3);
    flex-shrink: 0;
  }

  .tool-name {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text2);
    flex-shrink: 0;
  }

  .summary {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .summary::before { content: '·'; margin-right: 6px; color: var(--border2); }

  .result-pill {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--green);
    background: color-mix(in srgb, var(--green) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--green) 25%, transparent);
    border-radius: 10px;
    padding: 1px 7px;
    flex-shrink: 0;
  }

  .chevron {
    color: var(--text3);
    flex-shrink: 0;
    transition: transform 0.15s;
    display: flex;
    align-items: center;
  }
  .chevron.flipped { transform: rotate(180deg); }

  /* Expanded body */
  .body {
    border-top: 1px solid var(--border);
  }
  .pane-row {
    display: flex;
    gap: 0;
  }
  .pane {
    flex: 1;
    min-width: 0;
    border-right: 1px solid var(--border);
  }
  .pane:last-child { border-right: none; }

  .pane-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: var(--mono);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.7px;
    color: var(--text3);
    padding: 5px 10px 4px;
    border-bottom: 1px solid var(--border);
    background: var(--bg2);
  }

  .code {
    font-family: var(--mono);
    font-size: 10.5px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-all;
    padding: 9px 12px;
    margin: 0;
    max-height: 220px;
    overflow-y: auto;
    color: var(--text2);
    background: var(--bg3);
  }

  /* JSON syntax colours */
  :global(.jk)   { color: #9b8ec4; }   /* key   → purple */
  :global(.js)   { color: #6bb87a; }   /* string → green */
  :global(.jnum) { color: #d4a853; }   /* number → gold */
  :global(.jb)   { color: #4db8a8; }   /* bool  → teal */
  :global(.jn)   { color: #8a8680; }   /* null  → grey */
</style>
