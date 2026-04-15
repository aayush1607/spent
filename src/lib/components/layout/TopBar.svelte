<script lang="ts">
  import MonthSwitcher from './MonthSwitcher.svelte';

  export let email: string | null = null;
  export let lastSyncAt: number | null = null;
  export let syncing = false;

  function syncAge(): string {
    if (!lastSyncAt) return 'never';
    const diff = Date.now() - lastSyncAt;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  async function triggerSync(mode: 'full' | 'incremental' = 'incremental') {
    syncing = true;
    const res = await fetch(`/api/sync?mode=${mode}`, { method: 'POST' });
    const reader = res.body?.getReader();
    if (!reader) return;
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      dec.decode(value); // consume stream
    }
    syncing = false;
    // Reload data
    window.location.reload();
  }
</script>

<header class="topbar">
  <div class="left">
    <span class="logo">SPENT</span>
    <MonthSwitcher />
  </div>
  <div class="right">
    {#if lastSyncAt || syncing}
      <span class="sync-status">
        <span class="dot" class:syncing></span>
        {syncing ? 'SYNCING…' : `SYNCED ${syncAge().toUpperCase()}`}
      </span>
    {/if}
    {#if email}
      <span class="email">{email}</span>
    {/if}
    <button
      class="btn"
      class:spinning={syncing}
      disabled={syncing}
      on:click={() => triggerSync()}
      title="Sync Gmail"
    >
      <span class:spin={syncing}>⟳</span>
    </button>
    {#if !email}
      <a href="/api/auth/google" class="btn btn-primary">Connect Gmail</a>
    {/if}
  </div>
</header>

<style>
  .topbar {
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--sp-6);
    border-bottom: 1px solid var(--line);
    background: var(--bg-0);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .left, .right {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
  }
  .logo {
    font-family: 'JetBrains Mono', monospace;
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 0.15em;
    color: var(--amber);
  }
  .sync-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--fg-2);
    letter-spacing: 0.06em;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--fg-3);
  }
  .dot.syncing { background: var(--amber); animation: pulse 1s ease infinite; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .email { font-size: 11px; color: var(--fg-2); }
</style>
