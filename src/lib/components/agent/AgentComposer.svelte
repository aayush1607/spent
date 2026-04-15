<script lang="ts">
  import { isStreaming, messages, conversationId,
           addUserMessage, addAgentMessage, appendAgentText, appendAgentReasoning,
           addToolCall, resolveToolCall, finalizeMessage } from '$lib/stores/agent.js';
  import { activeMonth } from '$lib/stores/month.js';

  let input = '';
  let textarea: HTMLTextAreaElement;

  const SUGGESTIONS = [
    'How much on food this month?',
    'Top 5 merchants this month',
    'Compare this month vs last',
    'Weekly Swiggy spend',
  ];

  function autoResize() {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  async function send() {
    const msg = input.trim();
    if (!msg || $isStreaming) return;
    input = '';
    if (textarea) { textarea.style.height = 'auto'; }

    addUserMessage(msg);
    const agentId = addAgentMessage();
    isStreaming.set(true);

    let convId = $conversationId;

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, conversationId: convId, viewingMonth: $activeMonth }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      convId = res.headers.get('X-Conversation-Id') ?? convId;
      if (convId) conversationId.set(convId);

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.startsWith('event:')) continue;
          const lines = part.split('\n');
          const eventType = lines[0].replace('event: ', '').trim();
          const dataLine  = lines.find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          const data = JSON.parse(dataLine.replace('data: ', '').trim());

          switch (eventType) {
            case 'reasoning':   appendAgentReasoning(agentId, data.delta); break;
            case 'text':        appendAgentText(agentId, data.delta); break;
            case 'tool_call':   addToolCall(agentId, { id: data.id, name: data.name, input: data.input }); break;
            case 'tool_result': resolveToolCall(agentId, data.id, data.result); break;
            case 'done':        break;
            case 'error':       appendAgentText(agentId, `\n⚠ ${data.message ?? 'Something went wrong.'}`); break;
          }
        }
      }
    } catch (err) {
      appendAgentText(agentId, `\n[error: ${err}]`);
    } finally {
      finalizeMessage(agentId);
      isStreaming.set(false);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
</script>

<div class="composer">
  {#if $messages.length === 0}
    <div class="suggestions">
      {#each SUGGESTIONS as s}
        <button class="suggestion" on:click={() => { input = s; send(); }}>{s}</button>
      {/each}
    </div>
  {/if}

  <div class="input-row">
    <textarea
      bind:this={textarea}
      bind:value={input}
      on:keydown={onKeyDown}
      on:input={autoResize}
      placeholder="ask spent anything…"
      rows="1"
      disabled={$isStreaming}
    ></textarea>
    <button class="send-btn" on:click={send} disabled={$isStreaming || !input.trim()}>
      {$isStreaming ? '…' : '↵'}
    </button>
  </div>
</div>

<style>
  .composer { padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--line); }
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .suggestion {
    font-size: 11px;
    color: var(--fg-2);
    padding: 4px 8px;
    border: 1px solid var(--line);
    border-radius: var(--r-chip);
    background: var(--bg-2);
    transition: border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
    white-space: nowrap;
  }
  .suggestion:hover { border-color: var(--amber); color: var(--amber); }
  .input-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }
  textarea {
    flex: 1;
    resize: none;
    min-height: 36px;
    max-height: 120px;
    padding: 8px 10px;
    line-height: 20px;
  }
  .send-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line-bright);
    border-radius: var(--r-chip);
    background: var(--bg-2);
    color: var(--fg-1);
    font-size: 16px;
    flex-shrink: 0;
    transition: border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .send-btn:hover:not(:disabled) { border-color: var(--amber); color: var(--amber); }
  .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
