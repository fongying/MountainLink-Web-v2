<script lang="ts">
  export let values: number[] = [];
  export let times: number[] = []; // 與 values 等長的 epoch ms
  export let width = 320;
  export let height = 100;

  export let min: number | null = null;
  export let max: number | null = null;

  export let showTimeAxis = true;
  export let tickEverySeconds = 10;
  export let maxTicks = 6;

  type Band = {
    from: number;
    to: number;
    opacity?: number; // 0~1
    color?: string;   // ✅ 區間顏色（例如 '#22c55e'）
    label?: string;   // ✅ 區間名稱（偏低/正常/偏高）
  };

  export let bands: Band[] = [];

  const padX = 8;
  const padTop = 8;
  const axisH = 18;
  $: padBottom = showTimeAxis ? axisH : 8;
  $: plotH = height - padTop - padBottom;

  $: vMin = min ?? (values.length ? Math.min(...values) : 0);
  $: vMax = max ?? (values.length ? Math.max(...values) : 1);
  $: span = Math.max(1e-9, vMax - vMin);

  function xAt(i: number) {
    return padX + (i * (width - padX * 2)) / Math.max(1, values.length - 1);
  }
  function yAt(v: number) {
    return padTop + (1 - (v - vMin) / span) * plotH;
  }

  $: points = values
    .map((v, i) => `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`)
    .join(' ');

  function fmtTime(ms: number) {
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  $: ticks = (() => {
    if (!showTimeAxis) return [];
    if (!times || times.length < 2) return [];

    const t0 = times[0];
    const t1 = times[times.length - 1];
    if (!(t0 && t1) || t1 <= t0) return [];

    const everyMs = Math.max(1000, tickEverySeconds * 1000);
    const start = Math.ceil(t0 / everyMs) * everyMs;

    const raw: { x: number; label: string }[] = [];
    for (let t = start; t <= t1; t += everyMs) {
      const ratio = (t - t0) / (t1 - t0);
      const x = padX + ratio * (width - padX * 2);
      raw.push({ x, label: fmtTime(t) });
    }

    if (raw.length <= maxTicks) return raw;
    const step = Math.ceil(raw.length / maxTicks);
    return raw.filter((_, i) => i % step === 0);
  })();
    function inRange(v: number, a: number, b: number) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return v >= lo && v <= hi;
  }

  function bandLabelForValue(v: number) {
    for (const b of bands) {
      if (inRange(v, b.from, b.to)) return b.label ?? null;
    }
    return null;
  }

  // ✅ Hover 狀態
  let hoverIndex: number | null = null;

  function pickIndexFromClientX(clientX: number, svgEl: SVGSVGElement) {
    if (values.length === 0) return null;
    const rect = svgEl.getBoundingClientRect();
    const x = clientX - rect.left; // 0..width (視覺座標)
    const ratio = (x - padX) / (width - padX * 2);
    const i = Math.round(ratio * (values.length - 1));
    return Math.max(0, Math.min(values.length - 1, i));
  }

  function onMoveRect(e: MouseEvent) {
    const rectEl = e.currentTarget as SVGRectElement;
    const svgEl = rectEl.ownerSVGElement;
    if (!svgEl) return;

    hoverIndex = pickIndexFromClientX(e.clientX, svgEl);
  }

  function onLeave() {
    hoverIndex = null;
  }

  $: hover =
    hoverIndex != null && hoverIndex >= 0 && hoverIndex < values.length
      ? (() => {
          const v = values[hoverIndex!];
          const t = times?.[hoverIndex!] ?? null;
          const x = xAt(hoverIndex!);
          const y = yAt(v);
          return { x, y, v, t };
        })()
      : null;

  $: hoverStatus =
  hover && Number.isFinite(hover.v)
    ? bandLabelForValue(hover.v)
    : null;
    
  // tooltip 位置：靠右上角，不要擋住點
  function tooltipX(x: number) {
    const w = 140;
    const margin = 8;
    return x + w + margin > width ? x - w - margin : x + margin;
  }
  function tooltipY(y: number) {
    const h = 46;
    const margin = 8;
    return y - h - margin < 0 ? y + margin : y - h - margin;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<svg
  {width}
  {height}
  viewBox={`0 0 ${width} ${height}`}
  style="display:block; border:1px solid #ddd; border-radius:10px; background:#fff;"
  role="img"
  aria-label="即時折線圖"
  tabindex="0"
>
    <!-- 背景格線 -->
  <line x1="0" y1={padTop + plotH / 2} x2={width} y2={padTop + plotH / 2} stroke="#eee" stroke-width="1" />
  <line x1="0" y1={padTop + plotH * 0.25} x2={width} y2={padTop + plotH * 0.25} stroke="#f3f3f3" stroke-width="1" />
  <line x1="0" y1={padTop + plotH * 0.75} x2={width} y2={padTop + plotH * 0.75} stroke="#f3f3f3" stroke-width="1" />

  <!-- ✅ 安全區間帶（先畫在折線底下） -->
  {#each bands as b (`${b.from}-${b.to}`)}
    {#if values.length > 0}
      {@const bandTop = Math.min(yAt(b.from), yAt(b.to))}
      {@const bandBottom = Math.max(yAt(b.from), yAt(b.to))}
      <rect
        x={padX}
        y={bandTop}
        width={width - padX * 2}
        height={Math.max(0, bandBottom - bandTop)}
        fill={b.color ?? '#111'}
        opacity={b.opacity ?? 0.10}
        aria-hidden="true"
        role="presentation"
      />
    {/if}
  {/each}

  <!-- ✅ 透明事件層：確保 hover 穩定觸發 -->
  <rect
    x={padX}
    y={padTop}
    width={width - padX * 2}
    height={plotH}
    fill="transparent"
    style="pointer-events: all; cursor: crosshair;"
    on:mousemove={onMoveRect}
    on:mouseleave={onLeave}
    aria-hidden="true"
    role="presentation"
    tabindex="-1"
  />


  {#if values.length >= 2}
    <polyline fill="none" stroke="#111" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points={points} />
  {:else if values.length === 1}
    <circle cx={width - padX} cy={padTop + plotH / 2} r="3" fill="#111" />
  {:else}
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#888" font-size="12">
      尚無資料
    </text>
  {/if}

  <!-- ✅ Hover 指示 -->
  {#if hover}
    <!-- 垂直線 -->
    <line x1={hover.x} y1={padTop} x2={hover.x} y2={padTop + plotH} stroke="#ddd" stroke-width="1" />
    <!-- 點 -->
    <circle cx={hover.x} cy={hover.y} r="4" fill="#111" />

    <!-- Tooltip -->
    <g transform={`translate(${tooltipX(hover.x)}, ${tooltipY(hover.y)})`}>
      <rect x="0" y="0" width="140" height="46" rx="8" ry="8" fill="#111" opacity="0.92" />
      <text x="10" y="14" fill="#fff" font-size="11">
        {hover.t ? fmtTime(hover.t) : '—'}
      </text>
      <text x="10" y="30" fill="#fff" font-size="12" font-weight="700">
        {Number.isFinite(hover.v) ? hover.v : '—'}
      </text>
      <text x="10" y="42" fill="#ddd" font-size="11">
        {hoverStatus ?? ''}
      </text>
    </g>

  {/if}

  {#if showTimeAxis}
    <line x1={padX} y1={height - padBottom + 4} x2={width - padX} y2={height - padBottom + 4} stroke="#eee" stroke-width="1" />
    {#each ticks as t}
      <line x1={t.x} y1={height - padBottom + 4} x2={t.x} y2={height - padBottom + 10} stroke="#ddd" stroke-width="1" />
      <text x={t.x} y={height - 2} text-anchor="middle" fill="#666" font-size="10">{t.label}</text>
    {/each}
  {/if}
</svg>
