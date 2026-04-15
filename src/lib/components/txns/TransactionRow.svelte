<script lang="ts">
  import CategoryChip from './CategoryChip.svelte';
  import { formatINR, formatDate } from '$lib/utils/format.js';

  export let txn: {
    id: string;
    date: string;
    merchant: string;
    snippet: string | null;
    category: string;
    amount: number;
    emailId: string;
  };

  let expanded = false;
</script>

<div
  class="row"
  class:expanded
  role="button"
  tabindex="0"
  on:click={() => (expanded = !expanded)}
  on:keydown={(e) => e.key === 'Enter' && (expanded = !expanded)}
>
  <div class="indicator"></div>
  <div class="date">{formatDate(txn.date)}</div>
  <div class="merchant">{txn.merchant}</div>
  <div class="detail">{txn.snippet ?? ''}</div>
  <CategoryChip category={txn.category} />
  <div class="amount mono tabular">{formatINR(txn.amount)}</div>
</div>

{#if expanded}
  <div class="expansion">
    <span class="label">EMAIL ID</span>
    <span class="mono" style="color: var(--fg-2); font-size:11px">{txn.emailId}</span>
    <span class="label" style="margin-left:16px">SNIPPET</span>
    <span style="color:var(--fg-1); font-size:11px">{txn.snippet ?? '—'}</span>
  </div>
{/if}

<style>
  .row {
    display: grid;
    grid-template-columns: 4px 64px 1fr 1fr 80px 96px;
    align-items: center;
    gap: 0 12px;
    padding: 0 var(--sp-4);
    height: 36px;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
    position: relative;
    transition: background var(--dur-fast) var(--ease);
  }
  .row:hover, .row.expanded { background: var(--bg-2); }
  .indicator {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 0;
    background: var(--amber);
    transition: width var(--dur-fast) var(--ease);
  }
  .row:hover .indicator, .row.expanded .indicator { width: 2px; }
  .date { font-size: 11px; color: var(--fg-2); white-space: nowrap; }
  .merchant { font-size: 13px; color: var(--fg-0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detail { font-size: 12px; color: var(--fg-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .amount { font-size: 13px; color: var(--fg-0); text-align: right; }
  .expansion {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px var(--sp-4) 8px 20px;
    background: var(--bg-3);
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
  }
</style>
