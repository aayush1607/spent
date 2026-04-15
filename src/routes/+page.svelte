<script lang="ts">
  import { onMount } from 'svelte';
  import SpendLine from '$lib/components/charts/SpendLine.svelte';
  import ToolCallBlock from '$lib/components/agent/ToolCallBlock.svelte';
  import { activeMonth, stepMonth, canGoNext } from '$lib/stores/month.js';
  import {
    messages as agentMessages, isStreaming, conversationId,
    addUserMessage, addAgentMessage, appendAgentText, appendAgentReasoning,
    addToolCall, resolveToolCall, finalizeMessage
  } from '$lib/stores/agent.js';
  import { formatINR, formatDelta, formatMonthLabel, prevMonth } from '$lib/utils/format.js';

  export let data: {
    connected: boolean;
    month?: string;
    syncStatus?: string;
    summary?: {
      total: number;
      byCategory: { category: string; amount: number; count: number }[];
      byWeek:          { week: string; amount: number }[];
      byWeekCategory:  { week: string; category: string; amount: number }[];
      vsLastMonth: number | null;
      dailyAvg: number;
    } | null;
    merchants?: { merchant: string; amount: number; count: number }[];
    recentTxns?: { id: string; date: string; merchant: string; snippet: string | null; category: string; amount: number; emailId: string }[];
    lastSyncAt?: number | null;
  };

  let mounted = false;
  onMount(() => {
    mounted = true;
    // If the server says a sync is in progress (e.g. after a reload mid-sync),
    // start polling until it finishes then reload the page.
    if (data.syncStatus === 'syncing') {
      syncing = true;
      pollUntilIdle();
    }
  });

  $: if (mounted && data.month) activeMonth.set(data.month);
  $: if (mounted && data.month && $activeMonth !== data.month) {
    window.location.href = `/?month=${$activeMonth}`;
  }

  $: s = data.summary;
  $: delta = formatDelta(s?.vsLastMonth ?? null);

  function catColor(cat: string) {
    const m: Record<string, string> = {
      food: 'var(--cat-food)', shopping: 'var(--cat-shopping)',
      travel: 'var(--cat-travel)', transport: 'var(--cat-transport)',
      bills: 'var(--cat-bills)', entertainment: 'var(--cat-entertainment)', other: 'var(--cat-other)'
    };
    return m[cat] ?? 'var(--cat-other)';
  }

  function sourceColor(src: string) {
    const m: Record<string, string> = {
      swiggy: '#e8673a', zomato: '#e05555', amazon: '#d4a853',
      rapido: '#6bb87a', uber: '#9b8ec4', cleartrip: '#4db8a8',
      indigo: '#4db8a8', deepseek_generic: '#6b6760'
    };
    return m[src] ?? '#6b6760';
  }

  function formatDate(iso: string) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase();
  }

  function syncAge(ts: number) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  }

  let syncing = false;
  let stopping = false;
  let _syncReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  // ── Resizable chat pane ────────────────────────────────────────────────────
  const CHAT_MIN = 280;
  const CHAT_MAX = 700;
  let chatWidth = 360;
  let dragging = false;

  function onDragStart(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    const startX = e.clientX;
    const startW = chatWidth;
    function onMove(ev: MouseEvent) {
      const delta = startX - ev.clientX;          // drag left = wider
      chatWidth = Math.max(CHAT_MIN, Math.min(CHAT_MAX, startW + delta));
    }
    function onUp() {
      dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function pollUntilIdle() {
    while (true) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch('/api/sync');
        if (res.ok) {
          const { status } = await res.json() as { status: string };
          if (status !== 'syncing') {
            window.location.reload();
            return;
          }
        }
      } catch {
        // network hiccup — keep polling
      }
    }
  }

  async function stopSync() {
    if (stopping) return;
    stopping = true;
    // Signal the server to abort — it will emit a done event after finishing the
    // current batch, which streamDone in triggerSync picks up and reloads normally.
    // Do NOT cancel the reader here: cancelling causes read() to resolve done:true
    // which reloads the page before the abort fires, making the stop button reappear.
    await fetch('/api/sync', { method: 'DELETE' });
  }

  async function triggerSync(mode: 'incremental' | 'full' = 'incremental') {
    if (syncing) return;
    syncing = true;
    try {
      const res = await fetch(`/api/sync?mode=${mode}`, { method: 'POST' });
      if (!res.ok || !res.body) { syncing = false; return; }

      const reader = res.body.getReader();
      _syncReader = reader;
      const dec = new TextDecoder();
      let buf = '';

      // Read SSE stream; also fall back to polling if the stream is interrupted
      const streamDone = (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) return 'stream-end';
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            const evtLine = part.split('\n').find(l => l.startsWith('event:'));
            if (evtLine?.includes('done') || evtLine?.includes('error')) {
              return 'done';
            }
          }
        }
      })();

      await streamDone;
      _syncReader = null;
      window.location.reload();
    } catch {
      _syncReader = null;
      stopping = false;
      // SSE connection dropped — fall back to polling
      pollUntilIdle();
    }
  }

  // Chat
  let chatInput = '';
  let chatEl: HTMLDivElement;
  const SUGGESTIONS = ['how much on food?', 'swiggy vs zomato', 'biggest week?', 'travel this month', 'vs last month'];

  $: if ($agentMessages && chatEl) {
    requestAnimationFrame(() => { chatEl.scrollTop = chatEl.scrollHeight; });
  }

  async function sendMessage(text?: string) {
    const msg = (text ?? chatInput).trim();
    if (!msg || $isStreaming) return;
    chatInput = '';

    addUserMessage(msg);
    const agentId = addAgentMessage();
    isStreaming.set(true);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, conversationId: $conversationId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const cid = res.headers.get('X-Conversation-Id');
      if (cid) conversationId.set(cid);

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.startsWith('event:')) continue;
          const lines = part.split('\n');
          const evt  = lines[0].replace('event: ', '').trim();
          const dl   = lines.find(l => l.startsWith('data:'));
          if (!dl) continue;
          const d = JSON.parse(dl.replace('data: ', '').trim());
          if (evt === 'text')        appendAgentText(agentId, d.delta);
          if (evt === 'reasoning')   appendAgentReasoning(agentId, d.delta);
          if (evt === 'tool_call')   addToolCall(agentId, { id: d.id, name: d.name, input: d.input });
          if (evt === 'tool_result') resolveToolCall(agentId, d.id, d.result);
        }
      }
    } catch (e) {
      appendAgentText(agentId, `error: ${e}`);
    } finally {
      finalizeMessage(agentId);
      isStreaming.set(false);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function autoResize(e: Event) {
    const t = e.target as HTMLTextAreaElement;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 100) + 'px';
  }

  // ── Sources panel ─────────────────────────────────────────────────────────
  const PARSER_OPTIONS = [
    { value: 'swiggy',    label: 'Swiggy' },
    { value: 'zomato',    label: 'Zomato' },
    { value: 'amazon',    label: 'Amazon' },
    { value: 'rapido',    label: 'Rapido' },
    { value: 'uber',      label: 'Uber' },
    { value: 'cleartrip', label: 'Cleartrip' },
    { value: 'indigo',    label: 'IndiGo' },
    { value: '',          label: 'AI Fallback (DeepSeek)' },
  ];

  type Filter = { id: number; email: string; label: string | null; parserId: string | null; enabled: boolean };

  let sourcesOpen = false;
  let filters: Filter[] = [];
  let filtersLoading = false;
  let newEmail = '';
  let newLabel = '';
  let newParserId = 'swiggy';
  let addError = '';

  async function loadFilters() {
    filtersLoading = true;
    try {
      const res = await fetch('/api/filters');
      if (res.ok) filters = await res.json();
    } finally {
      filtersLoading = false;
    }
  }

  async function toggleFilter(f: Filter) {
    await fetch('/api/filters', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: f.id, enabled: !f.enabled }),
    });
    filters = filters.map((x) => x.id === f.id ? { ...x, enabled: !x.enabled } : x);
  }

  async function deleteFilter(id: number) {
    await fetch(`/api/filters?id=${id}`, { method: 'DELETE' });
    filters = filters.filter((f) => f.id !== id);
  }

  async function addFilter() {
    addError = '';
    if (!newEmail.trim()) { addError = 'email required'; return; }
    const res = await fetch('/api/filters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:    newEmail.trim(),
        label:    newLabel.trim() || null,
        parserId: newParserId || null,
      }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      addError = body.error ?? 'error adding filter';
      return;
    }
    const added: Filter = await res.json();
    filters = [...filters, added].sort((a, b) => (a.label ?? a.email).localeCompare(b.label ?? b.email));
    newEmail = '';
    newLabel = '';
    newParserId = 'swiggy';
  }

  function openSources() {
    sourcesOpen = true;
    if (filters.length === 0) loadFilters();
  }

  // Group filters by label for display
  $: groupedFilters = filters.reduce<Record<string, Filter[]>>((acc, f) => {
    const key = f.label ?? 'Other';
    (acc[key] ??= []).push(f);
    return acc;
  }, {});
</script>

<svelte:head><title>spent</title></svelte:head>

{#if !data.connected}
  <!-- CONNECT SCREEN -->
  <div class="connect-screen">
    <div class="connect-card">
      <div class="logo-big">sp<em>e</em>nt</div>
      <p>sign in with google to parse your gmail and see your spending</p>
      <a href="/api/auth/google" class="connect-btn">connect gmail →</a>
    </div>
  </div>
{:else}
  <div class="shell">

    <!-- NAV -->
    <nav>
      <div class="logo">sp<em>e</em>nt</div>
      <div class="nav-center">
        <button class="mtab" on:click={() => stepMonth(-1)}>‹</button>
        <span class="month-label">{formatMonthLabel($activeMonth)}</span>
        <button class="mtab" on:click={() => stepMonth(1)} disabled={!$canGoNext}>›</button>
      </div>
      <div class="nav-right">
        {#if data.lastSyncAt}
          <div class="badge">
            <div class="badge-dot"></div>
            synced {syncAge(data.lastSyncAt)}
          </div>
        {/if}
        {#if syncing}
          <button class="sync-btn stop-btn" on:click={stopSync} disabled={stopping}>
            {stopping ? 'stopping…' : '■ stop'}
          </button>
        {:else}
          <button class="sync-btn" on:click={() => triggerSync('incremental')}>
            <span>↻</span> sync
          </button>
          <button class="sync-btn full-sync-btn" on:click={() => triggerSync('full')} title="Re-fetch all emails from all configured sources">
            full sync
          </button>
        {/if}
      </div>
    </nav>

    <div class="app">

      <!-- SIDEBAR -->
      <div class="sidebar">
        <button class="sb-btn active" title="Dashboard">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </button>
        <button class="sb-btn" title="Transactions" on:click={() => window.location.href='/txns'}>
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
        </button>
        <button class="sb-btn" class:active={sourcesOpen} title="Email Sources" on:click={openSources}>
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07"/>
          </svg>
        </button>
        <button class="sb-btn logout" style="margin-top:auto" title="Disconnect"
          on:click={async () => { await fetch('/api/auth/status', { method: 'DELETE' }); window.location.reload(); }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      <!-- DASHBOARD -->
      <div class="panel-dash" class:hidden={sourcesOpen}>

        <!-- Header -->
        <div class="dash-header">
          <div class="dash-title serif">
            ₹{(s?.total ?? 0).toLocaleString('en-IN')}
            <small>{data.recentTxns?.length ?? 0} transactions · {formatMonthLabel($activeMonth).toLowerCase()}</small>
          </div>
        </div>

        <!-- Stat cards -->
        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-label">total spent</div>
            <div class="stat-val serif">₹{(s?.total ?? 0).toLocaleString('en-IN')}</div>
            <div class="stat-delta" style="color: {delta.color}">{delta.text}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">avg per day</div>
            <div class="stat-val serif">₹{Math.round(s?.dailyAvg ?? 0).toLocaleString('en-IN')}</div>
            <div class="stat-delta" style="color:var(--text2)">this month</div>
          </div>

        </div>

        <!-- Weekly line chart -->
        {#if s?.byWeek?.length}
          <div class="chart-card">
            <div class="card-label"><span>weekly spend</span></div>
            <SpendLine weeks={s.byWeek} weeksByCategory={s.byWeekCategory ?? []} />
          </div>
        {/if}

        <!-- Category breakdown -->
        <div class="chart-card">
          <div class="card-label"><span>by category</span></div>
          {#each s?.byCategory ?? [] as cat}
            {@const max = Math.max(...(s?.byCategory ?? []).map(c => c.amount), 1)}
            <div class="cat-item">
              <div class="cat-pip" style="background:{catColor(cat.category)}"></div>
              <div class="cat-name">{cat.category}</div>
              <div class="cat-track">
                <div class="cat-fill" style="width:{(cat.amount/max)*100}%;background:{catColor(cat.category)}"></div>
              </div>
              <div class="cat-val serif">₹{cat.amount.toLocaleString('en-IN')}</div>
            </div>
          {/each}
          {#if !s?.byCategory?.length}
            <div class="empty-state">no data</div>
          {/if}
        </div>

        <!-- Top merchants -->
        {#if data.merchants?.length}
          <div class="chart-card">
            <div class="card-label"><span>top merchants</span></div>
            {#each data.merchants as m, i}
              <div class="brand-item">
                <div class="brand-icon rank-icon">{String(i + 1).padStart(2, '0')}</div>
                <div class="brand-meta">
                  <div class="brand-name">{m.merchant}</div>
                  <div class="brand-count">{m.count} orders</div>
                </div>
                <div class="brand-val serif">₹{m.amount.toLocaleString('en-IN')}</div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Recent transactions -->
        <div class="chart-card">
          <div class="card-label"><span>recent transactions</span></div>
          {#each data.recentTxns ?? [] as txn (txn.id)}
            <div class="txn-item">
              <div class="txn-pip" style="background:{catColor(txn.category)}"></div>
              <div class="txn-info">
                <div class="txn-name">{txn.merchant}</div>
                <div class="txn-date">{formatDate(txn.date)} · {txn.category}</div>
              </div>
              <div class="txn-val serif">₹{txn.amount.toLocaleString('en-IN')}</div>
            </div>
          {/each}
          {#if !data.recentTxns?.length}
            <div class="empty-state">
              no transactions yet —
              <button style="color:var(--accent);text-decoration:underline" on:click={triggerSync}>run a sync</button>
            </div>
          {/if}
        </div>

      </div>

      <!-- SOURCES PANEL -->
      {#if sourcesOpen}
      <div class="panel-dash">
        <div class="sources-header">
          <div>
            <div class="sources-title">email sources</div>
            <div class="sources-sub">emails spent monitors for transactions. run a full sync after changes.</div>
          </div>
          <button class="sources-close" on:click={() => sourcesOpen = false}>✕ close</button>
        </div>

        <!-- Add new filter form -->
        <div class="chart-card">
          <div class="card-label"><span>add email source</span></div>
          <div class="add-form">
            <input
              class="add-input"
              type="email"
              placeholder="noreply@merchant.com"
              bind:value={newEmail}
              on:keydown={(e) => e.key === 'Enter' && addFilter()}
            />
            <input
              class="add-input add-label"
              type="text"
              placeholder="Label (e.g. Swiggy)"
              bind:value={newLabel}
              on:keydown={(e) => e.key === 'Enter' && addFilter()}
            />
            <select class="add-select" bind:value={newParserId}>
              {#each PARSER_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
            <button class="add-btn" on:click={addFilter}>add</button>
          </div>
          {#if addError}
            <div class="add-error">{addError}</div>
          {/if}
        </div>

        <!-- Filter list grouped by label -->
        {#if filtersLoading}
          <div class="empty-state">loading…</div>
        {:else if filters.length === 0}
          <div class="empty-state">no sources configured</div>
        {:else}
          {#each Object.entries(groupedFilters) as [group, rows]}
            <div class="chart-card">
              <div class="card-label"><span>{group}</span></div>
              {#each rows as f (f.id)}
                <div class="filter-row" class:filter-disabled={!f.enabled}>
                  <div class="filter-dot" style="background:{f.parserId ? sourceColor(f.parserId) : 'var(--text3)'}"></div>
                  <div class="filter-info">
                    <div class="filter-email">{f.email}</div>
                    <div class="filter-parser">{f.parserId ?? 'deepseek fallback'}</div>
                  </div>
                  <button
                    class="toggle-btn"
                    class:toggle-on={f.enabled}
                    title={f.enabled ? 'disable' : 'enable'}
                    on:click={() => toggleFilter(f)}
                  >
                    {f.enabled ? 'on' : 'off'}
                  </button>
                  <button class="del-btn" title="delete" on:click={() => deleteFilter(f.id)}>✕</button>
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      </div>
      {/if}

      <div class="resize-handle" class:dragging on:mousedown={onDragStart} role="separator" aria-label="resize chat panel"></div>

      <!-- CHAT PANEL -->
      <div class="panel-chat" style="width:{chatWidth}px">
        <div class="chat-header">
          <div class="chat-header-left">
            <div class="agent-dot">S</div>
            <div>
              <div class="chat-title">Ask Spent</div>
              <div class="chat-sub">Invoices to Insights</div>
            </div>
          </div>
        </div>

        <div class="chat-messages" bind:this={chatEl}>
          {#if $agentMessages.length === 0}
            <div class="msg msg-agent">
              <div class="msg-bubble">
                Hey — I have access to your parsed transactions.
                {#if s?.total}
                  You've spent <strong>₹{s.total.toLocaleString('en-IN')}</strong> this month across {data.recentTxns?.length ?? 0}+ transactions.
                {/if}
                What do you want to know?
              </div>
              <div class="msg-meta">Ask Spent · now</div>
            </div>
          {/if}

          {#each $agentMessages as msg (msg.id)}
            <div class="msg" class:msg-user={msg.role === 'user'} class:msg-agent={msg.role === 'agent'}>
              {#if msg.role === 'agent'}
                <!-- Tool call traces -->
                {#each msg.toolCalls ?? [] as tc (tc.id)}
                  <ToolCallBlock
                    name={tc.name}
                    input={tc.input}
                    result={tc.result}
                    status={tc.status}
                  />
                {/each}
              {/if}

              <div class="msg-bubble">
                {#if msg.role === 'agent' && msg.streaming && !msg.content}
                  <div class="thinking-dots">
                    <span></span><span></span><span></span>
                  </div>
                {:else}
                  {msg.content}{#if msg.streaming}<span class="cursor-blink">▍</span>{/if}
                {/if}
              </div>
              <div class="msg-meta">{msg.role === 'user' ? 'you' : 'Ask Spent'} · now</div>
            </div>
          {/each}

          {#if $isStreaming}
            <!-- spacer so content doesn't hide behind input -->
            <div style="height:8px"></div>
          {/if}
        </div>

        {#if $agentMessages.length === 0}
          <div class="chat-suggestions">
            {#each SUGGESTIONS as s}
              <button class="sugg" on:click={() => sendMessage(s)}>{s}</button>
            {/each}
          </div>
        {/if}

        <div class="chat-input-wrap">
          <textarea
            class="chat-input"
            bind:value={chatInput}
            on:keydown={onKey}
            on:input={autoResize}
            placeholder="ask anything about your spending..."
            rows="1"
            disabled={$isStreaming}
          ></textarea>
          <button class="send-btn" on:click={() => sendMessage()} disabled={$isStreaming || !chatInput.trim()}>
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

    </div>
  </div>
{/if}

<style>
  /* CONNECT */
  .connect-screen {
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
  }
  .connect-card {
    text-align: center;
    padding: 48px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--bg2);
    max-width: 380px;
  }
  .logo-big {
    font-family: var(--serif);
    font-size: 48px;
    letter-spacing: -2px;
    margin-bottom: 16px;
  }
  .logo-big em { color: var(--accent); font-style: italic; }
  .connect-card p { font-size: 12px; color: var(--text2); margin-bottom: 24px; line-height: 1.6; }
  .connect-btn {
    display: inline-block;
    padding: 10px 24px;
    background: var(--accent);
    color: white;
    border-radius: var(--r-sm);
    font-size: 12px;
    transition: opacity var(--dur-fast);
  }
  .connect-btn:hover { opacity: 0.85; }

  /* SHELL */
  .shell { display: flex; flex-direction: column; height: 100vh; }

  /* NAV */
  nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 28px;
    height: 52px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg);
    z-index: 10;
  }
  .logo { font-family: var(--serif); font-size: 22px; letter-spacing: -0.5px; }
  .logo em { color: var(--accent); font-style: italic; }
  .nav-center { display: flex; align-items: center; gap: 12px; }
  .month-label { font-size: 12px; color: var(--text2); min-width: 90px; text-align: center; }
  .mtab {
    color: var(--text3);
    font-size: 16px;
    padding: 4px;
    transition: color var(--dur-fast);
  }
  .mtab:hover:not(:disabled) { color: var(--text); }
  .mtab:disabled { opacity: 0.2; cursor: not-allowed; }
  .nav-right { display: flex; align-items: center; gap: 12px; }
  .badge {
    background: var(--bg3);
    border: 1px solid var(--border2);
    padding: 4px 10px;
    border-radius: var(--r-sm);
    font-size: 11px;
    color: var(--text2);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .badge-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--green);
    animation: pulse 2s infinite;
  }
  .sync-btn {
    border: 1px solid var(--border2);
    color: var(--text2);
    font-size: 11px;
    padding: 5px 12px;
    border-radius: var(--r-sm);
    transition: all var(--dur-fast);
  }
  .sync-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .sync-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .full-sync-btn { color: var(--text3); }
  .stop-btn { border-color: var(--red); color: var(--red); }
  .stop-btn:hover { border-color: var(--red); color: var(--red); opacity: 0.8; }
  .spin-icon { display: inline-block; animation: spin 1s linear infinite; }

  /* APP BODY */
  .app { display: flex; flex: 1; overflow: hidden; }

  /* SIDEBAR */
  .sidebar {
    width: 64px;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 0;
    gap: 4px;
    flex-shrink: 0;
    background: var(--bg);
  }
  .sb-btn {
    width: 40px; height: 40px;
    border-radius: var(--r);
    display: flex; align-items: center; justify-content: center;
    color: var(--text3);
    font-size: 16px;
    transition: all var(--dur-fast);
    position: relative;
  }
  .sb-btn:hover, .sb-btn.active { background: var(--bg3); color: var(--text); }
  .sb-btn.active::before {
    content: '';
    position: absolute;
    left: 0; top: 50%; transform: translateY(-50%);
    width: 2px; height: 20px;
    background: var(--accent);
    border-radius: 0 2px 2px 0;
  }

  /* DASHBOARD */
  .panel-dash {
    flex: 1;
    overflow-y: auto;
    padding: 28px;
  }

  .dash-header { margin-bottom: 24px; }
  .dash-title {
    font-size: 32px;
    letter-spacing: -1px;
    line-height: 1;
  }
  .dash-title small {
    display: block;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text2);
    margin-top: 6px;
    letter-spacing: 0.5px;
    font-style: normal;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 14px;
  }
  .stat-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--r);
    padding: 16px 18px;
    animation: fadeIn 0.4s ease both;
    transition: border-color var(--dur-fast);
  }
  .stat-card:hover { border-color: var(--border2); }
  .stat-label { font-size: 10px; color: var(--text2); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .stat-val { font-size: 28px; letter-spacing: -1px; line-height: 1; }
  .stat-delta { font-size: 10px; margin-top: 5px; }

  .chart-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--r);
    padding: 18px 20px;
    margin-bottom: 14px;
    animation: fadeIn 0.4s ease both;
  }
  .card-label {
    font-size: 10px;
    color: var(--text2);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* Weekly bars */
  .bars { display: flex; align-items: flex-end; gap: 8px; height: 96px; }
  .bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; height: 100%; justify-content: flex-end; }

  /* Category */
  .cat-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid var(--border);
    transition: opacity var(--dur-fast);
  }
  .cat-item:last-child { border-bottom: none; padding-bottom: 0; }
  .cat-item:hover { opacity: 0.7; }
  .cat-pip { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .cat-name { flex: 1; font-size: 12px; }
  .cat-track { width: 64px; height: 2px; background: var(--bg4); border-radius: 1px; flex-shrink: 0; }
  .cat-fill { height: 2px; border-radius: 1px; }
  .cat-val { font-size: 13px; min-width: 56px; text-align: right; }

  /* Brand / source */
  .brand-item {
    display: flex; align-items: center; gap: 11px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    transition: opacity var(--dur-fast);
  }
  .brand-item:last-child { border-bottom: none; padding-bottom: 0; }
  .brand-item:hover { opacity: 0.7; }
  .brand-icon {
    width: 30px; height: 30px;
    border-radius: var(--r);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 600;
    flex-shrink: 0;
  }
  .rank-icon { background: var(--bg3); color: var(--text3); font-family: var(--mono); font-size: 10px; }
  .brand-meta { flex: 1; }
  .brand-name { font-size: 12px; }
  .brand-count { font-size: 10px; color: var(--text3); margin-top: 1px; }
  .brand-val { font-size: 14px; }

  /* Transactions */
  .txn-item {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .txn-item:last-child { border-bottom: none; padding-bottom: 0; }
  .txn-pip { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
  .txn-info { flex: 1; }
  .txn-name { font-size: 12px; }
  .txn-date { font-size: 10px; color: var(--text3); margin-top: 1px; }
  .txn-val { font-size: 14px; }

  .empty-state { padding: 24px 0; text-align: center; color: var(--text3); font-size: 12px; }

  /* DIVIDER / RESIZE HANDLE */
  .resize-handle {
    width: 5px;
    flex-shrink: 0;
    cursor: col-resize;
    background: transparent;
    position: relative;
    transition: background 0.15s;
    z-index: 5;
  }
  .resize-handle::after {
    content: '';
    position: absolute;
    inset: 0 2px;
    background: var(--border);
    transition: background 0.15s;
  }
  .resize-handle:hover::after,
  .resize-handle.dragging::after {
    background: var(--accent);
  }

  /* CHAT */
  .panel-chat {
    flex-shrink: 0;
    min-width: 280px;
    max-width: 700px;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .chat-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .chat-header-left { display: flex; align-items: center; gap: 10px; }
  .agent-dot {
    width: 28px; height: 28px;
    border-radius: var(--r);
    background: var(--accent);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 600; color: white;
    font-family: var(--serif);
  }
  .chat-title { font-size: 13px; font-weight: 500; }
  .chat-sub { font-size: 10px; color: var(--text2); margin-top: 1px; }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .msg { display: flex; flex-direction: column; gap: 4px; animation: fadeUp 0.3s ease; }
  .msg-user { align-items: flex-end; }
  .msg-agent { align-items: flex-start; }

  .msg-bubble {
    max-width: 90%;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 12px;
    line-height: 1.65;
  }
  .msg-user .msg-bubble {
    background: var(--bg4);
    border: 1px solid var(--border2);
    border-bottom-right-radius: 3px;
  }
  .msg-agent .msg-bubble {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-bottom-left-radius: 3px;
  }
  .msg-meta { font-size: 10px; color: var(--text3); padding: 0 4px; }

  .thinking-dots { display: flex; gap: 4px; align-items: center; height: 18px; }
  .thinking-dots span {
    width: 4px; height: 4px; border-radius: 50%;
    background: var(--text3);
    animation: dot 0.8s infinite;
  }
  .thinking-dots span:nth-child(2) { animation-delay: 0.15s; }
  .thinking-dots span:nth-child(3) { animation-delay: 0.30s; }

  .cursor-blink {
    display: inline-block;
    color: var(--accent);
    animation: pulse 1s step-end infinite;
    font-size: 10px;
  }

  .chat-suggestions {
    padding: 10px 20px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex-shrink: 0;
  }
  .sugg {
    background: var(--bg3);
    border: 1px solid var(--border);
    color: var(--text2);
    font-size: 10px;
    padding: 5px 10px;
    border-radius: var(--r-sm);
    transition: all var(--dur-fast);
    white-space: nowrap;
  }
  .sugg:hover { border-color: var(--accent); color: var(--text); }

  .chat-input-wrap {
    padding: 14px 20px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }
  .chat-input {
    flex: 1;
    resize: none;
    padding: 10px 14px;
    border-radius: var(--r);
    min-height: 38px;
    max-height: 100px;
    line-height: 1.5;
    font-size: 12px;
  }
  .chat-input::placeholder { color: var(--text3); }
  .send-btn {
    width: 36px; height: 36px;
    border-radius: var(--r);
    background: var(--accent);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    color: white;
    transition: opacity var(--dur-fast);
  }
  .send-btn:hover:not(:disabled) { opacity: 0.85; }
  .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Responsive */
  @media (max-width: 1100px) {
    .panel-chat { min-width: 280px; }
  }
  @media (max-width: 900px) {
    .panel-chat { display: none; }
    .stats-row { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 600px) {
    .sidebar { display: none; }
    .stats-row { grid-template-columns: 1fr; }
    .panel-dash { padding: 16px; }
    nav { padding: 0 16px; }
  }

  /* SOURCES PANEL */
  .panel-dash.hidden { display: none; }

  .sources-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 24px;
  }
  .sources-title {
    font-family: var(--serif);
    font-size: 24px;
    letter-spacing: -0.5px;
  }
  .sources-sub {
    font-size: 11px;
    color: var(--text2);
    margin-top: 4px;
    max-width: 380px;
    line-height: 1.5;
  }
  .sources-close {
    font-size: 11px;
    color: var(--text3);
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    transition: all var(--dur-fast);
    flex-shrink: 0;
  }
  .sources-close:hover { border-color: var(--border2); color: var(--text); }

  /* Add form */
  .add-form {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .add-input {
    padding: 7px 10px;
    border-radius: var(--r-sm);
    font-size: 12px;
    flex: 1;
    min-width: 180px;
  }
  .add-label { max-width: 140px; flex: 0 1 140px; }
  .add-select {
    padding: 7px 10px;
    border-radius: var(--r-sm);
    font-size: 12px;
    background: var(--bg3);
    border: 1px solid var(--border);
    color: var(--text);
    cursor: pointer;
    flex-shrink: 0;
  }
  .add-btn {
    padding: 7px 16px;
    background: var(--accent);
    color: white;
    border-radius: var(--r-sm);
    font-size: 12px;
    transition: opacity var(--dur-fast);
    flex-shrink: 0;
  }
  .add-btn:hover { opacity: 0.85; }
  .add-error {
    font-size: 11px;
    color: var(--red);
    margin-top: 8px;
  }

  /* Filter rows */
  .filter-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid var(--border);
    transition: opacity var(--dur-fast);
  }
  .filter-row:last-child { border-bottom: none; padding-bottom: 0; }
  .filter-disabled { opacity: 0.4; }
  .filter-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .filter-info { flex: 1; min-width: 0; }
  .filter-email { font-size: 12px; font-family: var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .filter-parser { font-size: 10px; color: var(--text3); margin-top: 1px; }
  .toggle-btn {
    font-size: 10px;
    padding: 3px 8px;
    border-radius: var(--r-sm);
    border: 1px solid var(--border);
    color: var(--text3);
    transition: all var(--dur-fast);
    flex-shrink: 0;
  }
  .toggle-btn.toggle-on { border-color: var(--green); color: var(--green); }
  .toggle-btn:hover { border-color: var(--border2); }
  .del-btn {
    font-size: 11px;
    color: var(--text3);
    padding: 3px 6px;
    border-radius: var(--r-sm);
    transition: color var(--dur-fast);
    flex-shrink: 0;
  }
  .del-btn:hover { color: var(--red); }
</style>
