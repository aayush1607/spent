<script lang="ts">
  export let weeks: { week: string; amount: number }[];
  export let weeksByCategory: { week: string; category: string; amount: number }[] = [];

  // ── Coordinate space ──────────────────────────────────────────────────────
  const W  = 560;
  const H  = 220;
  const PL = 52;
  const PR = 16;
  const PT = 16;
  const PB = 32;

  const CW = W - PL - PR;
  const CH = H - PT - PB;

  // ── View toggle ───────────────────────────────────────────────────────────
  let view: 'total' | 'category' = 'total';
  $: hasCatData = weeksByCategory.length > 0;

  // ── Category colors (hex — CSS vars don't work in SVG filter/gradient ids) ─
  const CAT_COLORS: Record<string, string> = {
    food: '#e8673a', shopping: '#d4a853', travel: '#4db8a8',
    transport: '#6bb87a', bills: '#e05555', entertainment: '#9b8ec4', other: '#6b6760',
  };
  function catColor(c: string) { return CAT_COLORS[c] ?? '#6b6760'; }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function r(n: number) { return Math.round(n * 10) / 10; }

  function fmt(n: number): string {
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000)   return '₹' + Math.round(n / 1000) + 'k';
    return '₹' + Math.round(n);
  }

  // ── TOTAL view ────────────────────────────────────────────────────────────
  $: totalMax = Math.max(...weeks.map(w => w.amount), 1);

  $: pts = weeks.map((w, i) => {
    const x = PL + (i / Math.max(weeks.length - 1, 1)) * CW;
    const y = PT + (1 - w.amount / totalMax) * CH;
    return { x, y, ...w };
  });

  function makePath(points: { x: number; y: number }[]) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M${points[0].x},${points[0].y}`;
    const d: string[] = [`M${r(points[0].x)},${r(points[0].y)}`];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] ?? points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? points[i + 1];
      const t = 0.4;
      const cp1x = p1.x + (p2.x - p0.x) * t / 2;
      const cp1y = p1.y + (p2.y - p0.y) * t / 2;
      const cp2x = p2.x - (p3.x - p1.x) * t / 2;
      const cp2y = p2.y - (p3.y - p1.y) * t / 2;
      d.push(`C${r(cp1x)},${r(cp1y)} ${r(cp2x)},${r(cp2y)} ${r(p2.x)},${r(p2.y)}`);
    }
    return d.join(' ');
  }

  $: linePath = makePath(pts);
  $: areaPath = pts.length >= 2
    ? `${linePath} L${r(pts[pts.length - 1].x)},${H - PB} L${r(pts[0].x)},${H - PB} Z`
    : '';

  $: yTicks = [0, 0.5, 1].map(t => ({
    y: PT + (1 - t) * CH,
    label: fmt(t * totalMax),
  }));

  // ── CATEGORY view ─────────────────────────────────────────────────────────
  $: weekKeys = weeks.map(w => w.week);
  $: categories = [...new Set(weeksByCategory.map(x => x.category))].sort();
  $: catMax = Math.max(...weeksByCategory.map(x => x.amount), 1);

  $: catYTicks = [0, 0.5, 1].map(t => ({
    y: PT + (1 - t) * CH,
    label: fmt(t * catMax),
  }));

  $: catSeries = categories.map(cat => {
    const cpts = weekKeys.map((wk, i) => {
      const found = weeksByCategory.find(x => x.week === wk && x.category === cat);
      const amt = found?.amount ?? 0;
      const x = PL + (i / Math.max(weekKeys.length - 1, 1)) * CW;
      const y = PT + (1 - amt / catMax) * CH;
      return { x, y, amount: amt, week: wk };
    });
    return { category: cat, color: catColor(cat), pts: cpts, path: makePath(cpts) };
  });

  // ── Interaction ───────────────────────────────────────────────────────────
  let hoverIdx: number | null = null;
  let selectedCat: string | null = null;

  function toggleCat(cat: string) {
    selectedCat = selectedCat === cat ? null : cat;
  }

  $: activePts    = view === 'total' ? pts : (catSeries[0]?.pts ?? pts);
  $: hovered      = hoverIdx !== null ? activePts[hoverIdx] : null;
  $: tipRight     = hovered !== null && hovered.x > PL + CW * 0.65;

  // In category mode, tooltip shows all categories for the hovered week
  $: catTipRows = hoverIdx !== null
    ? catSeries
        .map(s => ({ category: s.category, color: s.color, amount: s.pts[hoverIdx!]?.amount ?? 0 }))
        .filter(x => x.amount > 0)
        .sort((a, b) => b.amount - a.amount)
    : [];

  function onMouseMove(e: MouseEvent) {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, minD = Infinity;
    (view === 'total' ? pts : (catSeries[0]?.pts ?? pts)).forEach((p, i) => {
      const d = Math.abs(p.x - svgX);
      if (d < minD) { minD = d; best = i; }
    });
    hoverIdx = best;
  }

  function onMouseLeave() { hoverIdx = null; }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="wrap">

  <!-- Toggle tabs -->
  {#if hasCatData}
    <div class="tabs">
      <button class="tab" class:active={view === 'total'} on:click={() => { view = 'total'; selectedCat = null; }}>total</button>
      <button class="tab" class:active={view === 'category'} on:click={() => { view = 'category'; selectedCat = null; }}>by category</button>
    </div>
  {/if}

  <svg
    viewBox="0 0 {W} {H}"
    role="img"
    aria-label="weekly spend"
    on:mousemove={onMouseMove}
    on:mouseleave={onMouseLeave}
  >
    <defs>
      <linearGradient id="lg-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#e8673a" stop-opacity="0.2"/>
        <stop offset="80%"  stop-color="#e8673a" stop-opacity="0.02"/>
        <stop offset="100%" stop-color="#e8673a" stop-opacity="0"/>
      </linearGradient>
      <filter id="line-glow" x="-20%" y="-60%" width="140%" height="220%">
        <feGaussianBlur stdDeviation="2.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <clipPath id="chart-clip">
        <rect x={PL} y={0} width={CW} height={H - PB + 2}/>
      </clipPath>
    </defs>

    <!-- Y-axis grid + labels -->
    {#each (view === 'total' ? yTicks : catYTicks) as tick}
      <line x1={PL} y1={tick.y} x2={W - PR} y2={tick.y} stroke="#252525" stroke-width="1"/>
      <text x={PL - 8} y={tick.y + 4} text-anchor="end" font-size="9" font-family="var(--mono)" fill="#4a4744">{tick.label}</text>
    {/each}

    <g clip-path="url(#chart-clip)">
      {#if view === 'total'}
        <!-- Area fill -->
        {#if areaPath}<path d={areaPath} fill="url(#lg-fill)"/>{/if}
        <!-- Line -->
        {#if linePath}
          <path d={linePath} fill="none" stroke="#e8673a" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round" filter="url(#line-glow)"/>
        {/if}
      {:else}
        <!-- Category lines -->
        {#each catSeries as s}
          {@const dimmed = selectedCat !== null && selectedCat !== s.category}
          <path d={s.path} fill="none" stroke={s.color} stroke-width={dimmed ? 1.5 : 2.5}
            stroke-linecap="round" stroke-linejoin="round"
            opacity={dimmed ? 0.15 : 0.9}
            style="transition: opacity 0.2s ease, stroke-width 0.2s ease"/>
        {/each}
      {/if}
    </g>

    <!-- Hover crosshair -->
    {#if hovered}
      <line x1={hovered.x} y1={PT - 4} x2={hovered.x} y2={H - PB}
        stroke="#2e2e2e" stroke-width="1" stroke-dasharray="3 3"/>
    {/if}

    <!-- Dots (total view) -->
    {#if view === 'total'}
      {#each pts as pt, i}
        {@const active = hoverIdx === i}
        <circle cx={pt.x} cy={pt.y} r={active ? 5.5 : 3.5}
          fill={active ? '#e8673a' : '#0f0f0f'} stroke="#e8673a"
          stroke-width={active ? 0 : 1.5}
          style="transition: r 0.12s ease, fill 0.12s ease"/>
      {/each}
    {:else}
      <!-- Dots (category view) -->
      {#each catSeries as s}
        {@const dimmed = selectedCat !== null && selectedCat !== s.category}
        {#each s.pts as pt, i}
          {@const active = hoverIdx === i && !dimmed}
          <circle cx={pt.x} cy={pt.y} r={active ? 5 : 3}
            fill={active ? s.color : '#0f0f0f'} stroke={s.color}
            stroke-width={active ? 0 : 1.5}
            opacity={dimmed ? 0.15 : 1}
            style="transition: r 0.12s ease, fill 0.12s ease, opacity 0.2s ease"/>
        {/each}
      {/each}
    {/if}

    <!-- X-axis labels -->
    {#each pts as pt, i}
      <text x={pt.x} y={H - 8} text-anchor="middle" font-size="10"
        font-family="var(--mono)"
        fill={hoverIdx === i ? '#8a8680' : '#4a4744'}
        style="transition: fill 0.12s"
      >{`w${i + 1}`}</text>
    {/each}
  </svg>

  <!-- Tooltip: total view -->
  {#if view === 'total' && hovered}
    <div class="tip" class:right={tipRight}
      style="left:{(hovered.x / W) * 100}%; top:{(hovered.y / H) * 100}%">
      <span class="tip-amt">{fmt((hovered as any).amount)}</span>
      <span class="tip-wk">w{hoverIdx! + 1}</span>
    </div>
  {/if}

  <!-- Tooltip: category view -->
  {#if view === 'category' && hovered && catTipRows.length}
    <div class="tip cat-tip" class:right={tipRight}
      style="left:{(hovered.x / W) * 100}%; top:0%">
      <span class="tip-wk tip-wk-top">w{hoverIdx! + 1}</span>
      {#each catTipRows as row}
        {@const dimmed = selectedCat !== null && selectedCat !== row.category}
        <div class="tip-row" class:dimmed={dimmed}>
          <span class="tip-dot" style="background:{row.color}"></span>
          <span class="tip-cat">{row.category}</span>
          <span class="tip-amt-sm">{fmt(row.amount)}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Category legend pills -->
  {#if view === 'category'}
    <div class="legend">
      {#each catSeries as s}
        <button
          class="legend-pill"
          class:selected={selectedCat === s.category}
          class:dimmed={selectedCat !== null && selectedCat !== s.category}
          style="--c:{s.color}"
          on:click={() => toggleCat(s.category)}
        >
          <span class="legend-dot"></span>
          {s.category}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    width: 100%;
    margin-top: 6px;
  }

  /* Toggle tabs */
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 10px;
  }
  .tab {
    font-family: var(--mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    padding: 3px 10px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text3);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .tab.active {
    color: var(--accent);
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .tab:hover:not(.active) {
    color: var(--text2);
    border-color: var(--border2);
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 560 / 220;
    cursor: crosshair;
    overflow: visible;
  }

  /* Tooltip shared */
  .tip {
    position: absolute;
    transform: translate(-50%, calc(-100% - 12px));
    background: var(--bg4);
    border: 1px solid var(--border2);
    border-radius: 7px;
    padding: 6px 11px 5px;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.55);
    white-space: nowrap;
    z-index: 10;
  }
  .tip.right { transform: translate(-100%, calc(-100% - 12px)); }

  .tip-amt {
    font-family: var(--serif);
    font-size: 14px;
    color: var(--text);
    line-height: 1.2;
  }
  .tip-wk {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--text3);
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  /* Category tooltip */
  .cat-tip {
    align-items: flex-start;
    gap: 4px;
    padding: 8px 12px;
  }
  .tip-wk-top {
    margin-bottom: 2px;
    align-self: center;
  }
  .tip-row {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
  }
  .tip-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .tip-cat {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text2);
    flex: 1;
    text-transform: lowercase;
  }
  .tip-amt-sm {
    font-family: var(--serif);
    font-size: 12px;
    color: var(--text);
  }
  .tip-row.dimmed { opacity: 0.35; }

  /* Category legend */
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }
  .legend-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px 3px 7px;
    border-radius: 20px;
    border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
    background: color-mix(in srgb, var(--c) 8%, transparent);
    color: color-mix(in srgb, var(--c) 80%, #e8e4dc);
    font-family: var(--mono);
    font-size: 10px;
    text-transform: lowercase;
    letter-spacing: 0.4px;
    cursor: pointer;
    transition: opacity 0.18s, border-color 0.18s, background 0.18s;
  }
  .legend-pill.selected {
    border-color: var(--c);
    background: color-mix(in srgb, var(--c) 18%, transparent);
    color: var(--c);
  }
  .legend-pill.dimmed {
    opacity: 0.35;
  }
  .legend-pill:hover:not(.selected) {
    opacity: 0.8;
  }
  .legend-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c);
    flex-shrink: 0;
  }
</style>
