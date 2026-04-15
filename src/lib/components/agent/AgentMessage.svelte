<script lang="ts">
  import ToolCallBlock from './ToolCallBlock.svelte';
  import type { AgentMessage } from '$lib/stores/agent.js';

  export let message: AgentMessage;

  let reasoningOpen = false;
</script>

<div class="message" class:user={message.role === 'user'} class:agent={message.role === 'agent'}>
  <div class="prefix mono">
    {#if message.role === 'user'}
      <span style="color: var(--amber)">[you]</span>
    {:else}
      <span style="color: var(--cyan)">[spent]</span>
    {/if}
  </div>

  <div class="body">
    {#if message.reasoning}
      <button class="reasoning-toggle" on:click={() => (reasoningOpen = !reasoningOpen)}>
        <span class="mono" style="font-size:11px; color:var(--fg-3)">
          {reasoningOpen ? '▾' : '▸'} reasoning
        </span>
      </button>
      {#if reasoningOpen}
        <div class="reasoning mono">{message.reasoning}</div>
      {/if}
    {/if}

    {#each message.toolCalls ?? [] as tc (tc.id)}
      <ToolCallBlock
        name={tc.name}
        input={tc.input}
        result={tc.result}
        status={tc.status}
      />
    {/each}

    <div class="content prose">
      {message.content}{#if message.streaming}<span class="cursor"></span>{/if}
    </div>
  </div>
</div>

<style>
  .message {
    display: flex;
    gap: 10px;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  .prefix { font-size: 12px; padding-top: 1px; white-space: nowrap; min-width: 56px; }
  .body { flex: 1; min-width: 0; }
  .content {
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    line-height: 20px;
    color: var(--fg-0);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .reasoning-toggle { display: block; margin-bottom: 4px; }
  .reasoning {
    font-size: 11px;
    color: var(--fg-3);
    border-left: 2px solid var(--line);
    padding-left: 8px;
    margin-bottom: 8px;
    white-space: pre-wrap;
    max-height: 120px;
    overflow-y: auto;
  }
</style>
