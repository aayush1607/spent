<script lang="ts">
  import AgentMessage from './AgentMessage.svelte';
  import AgentComposer from './AgentComposer.svelte';
  import { messages, isStreaming } from '$lib/stores/agent.js';

  let threadEl: HTMLDivElement;

  $: if ($messages && threadEl) {
    requestAnimationFrame(() => {
      threadEl.scrollTop = threadEl.scrollHeight;
    });
  }
</script>

<aside class="rail">
  <div class="rail-header panel-header">
    <span class="label">AGENT</span>
    {#if $isStreaming}
      <span class="label" style="color: var(--cyan)">THINKING <span class="spin">▰</span></span>
    {/if}
  </div>

  <div class="thread" bind:this={threadEl}>
    {#if $messages.length === 0}
      <div class="empty">
        <p class="mono" style="color: var(--fg-3); font-size:12px; text-align:center; padding: 32px 16px;">
          Ask anything about your spending
        </p>
      </div>
    {/if}
    {#each $messages as msg (msg.id)}
      <AgentMessage message={msg} />
    {/each}
  </div>

  <AgentComposer />
</aside>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    height: 100%;
    border-left: 1px solid var(--line);
    background: var(--bg-1);
    min-width: 0;
  }
  .rail-header {
    flex-shrink: 0;
    background: var(--bg-0);
  }
  .thread {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--sp-4);
  }
  .empty { height: 100%; display: flex; align-items: center; justify-content: center; }
</style>
