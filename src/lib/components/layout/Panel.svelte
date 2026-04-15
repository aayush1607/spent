<script lang="ts">
  export let id: string | undefined = undefined;
  export let title: string;
  export let collapsible = false;
  export let collapsed = false;
  export let delay = 0;
</script>

<section
  class="panel panel-in"
  style="animation-delay: {delay}ms"
  aria-labelledby={id ? `${id}-title` : undefined}
>
  <div class="panel-header">
    <span id={id ? `${id}-title` : undefined} class="label">{title}</span>
    <div class="actions">
      <slot name="actions" />
      {#if collapsible}
        <button
          class="collapse-btn"
          aria-expanded={!collapsed}
          on:click={() => (collapsed = !collapsed)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      {/if}
    </div>
  </div>
  {#if !collapsed}
    <div class="panel-body">
      <slot />
    </div>
  {/if}
</section>

<style>
  section { display: flex; flex-direction: column; height: 100%; }
  .panel-body { flex: 1; overflow: auto; }
  .actions { display: flex; align-items: center; gap: 8px; }
  .collapse-btn {
    color: var(--fg-2);
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 2px;
    transition: color var(--dur-fast) var(--ease);
  }
  .collapse-btn:hover { color: var(--fg-0); }
</style>
