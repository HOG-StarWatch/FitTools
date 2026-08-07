window.Charts = {
  _chart: null,
  _metricKeys: [],

  METRICS: [
    { key: "heartRate", label: "心率 (bpm)", unit: "bpm", color: "#dc2626" },
    { key: "power", label: "功率 (瓦)", unit: "W", color: "#f59e0b" },
    { key: "cadence", label: "踏频 (rpm)", unit: "rpm", color: "#8b5cf6" },
    { key: "speed", label: "速度 (m/s)", unit: "m/s", color: "#0d9488" },
    { key: "enhancedSpeed", label: "增强速度 (m/s)", unit: "m/s", color: "#0d9488" },
    { key: "altitude", label: "海拔 (米)", unit: "m", color: "#2563eb" },
    { key: "temperature", label: "温度 (\u00B0C)", unit: "\u00B0C", color: "#f97316" },
    { key: "verticalOscillation", label: "垂直振幅", unit: "mm", color: "#64748b" },
    { key: "groundContactTime", label: "触地时间", unit: "ms", color: "#334155" },
    { key: "leftRightBalance", label: "左右平衡", unit: "", color: "#14b8a6" },
    { key: "distance", label: "距离 (米)", unit: "m", color: "#3b82f6" },
    { key: "grade", label: "坡度 (%)", unit: "%", color: "#a3e635" },
  ],

  init() {
    U.$("#btn-chart-reset").onclick = () => this.reset();
    const sel = U.$("#chart-metric");
    sel.onchange = () => this.render(sel.value, true);
    const onResize = () => window.dispatchEvent(new Event("resize"));
    window.addEventListener("charttab", onResize);
    window.addEventListener("ffv-theme", () => {
      if (this._chart && U.$("#chart-metric").value) this.render(U.$("#chart-metric").value, true);
    });
  },

  _themeCss() {
    const cs = getComputedStyle(document.documentElement);
    const get = (n, fb) => (cs.getPropertyValue(n).trim() || fb);
    return {
      text: get("--text", "#c9d1d9"),
      dim: get("--text-dim", "#8b949e"),
      grid: get("--border", "#30363d"),
      panel: get("--card-solid", "#161b22"),
    };
  },

  buildSelector() {
    const available = new Set();
    for (const r of FFV.state.records) for (const k of Object.keys(r)) available.add(k);
    const opts = [];
    for (const m of this.METRICS) {
      if (available.has(m.key)) opts.push(`<option value="${m.key}">${m.label}</option>`);
    }
    const sel = U.$("#chart-metric");
    sel.innerHTML = opts.join("");
    let chosen = "heartRate";
    if (!available.has(chosen)) chosen = "power";
    if (!available.has(chosen)) { chosen = opts.length ? opts[0].match(/value="([^"]+)"/)[1] : null; }
    sel.value = chosen;
    return chosen;
  },

  render(key, force) {
    const st = FFV.state;
    const metric = this.METRICS.find((m) => m.key === key);
    if (!metric) return;
    const label = typeof metric.label === "function" ? metric.label() : metric.label;

    const pts = [];
    for (let i = 0; i < st.elapsedMs.length; i++) {
      const v = Number(st.records[i][key]);
      if (Number.isFinite(v)) pts.push({ x: st.elapsedMs[i], y: v });
    }
    if (pts.length < 2) {
      U.toast("该指标的数据不足");
      return;
    }

    const ctx = U.$("#chart-canvas");
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }

    Chart.register(ChartZoom);
    const theme = this._themeCss();
    const fmtAxis = (v) => {
      const s = Math.round(v / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
    };

    this._chart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [{
          label,
          data: pts,
          borderColor: metric.color,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHitRadius: 6,
          fill: false,
          tension: 0.1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        normalized: true,
        color: theme.dim,
        plugins: {
          legend: { display: true, labels: { color: theme.text } },
          tooltip: {
            mode: "index",
            intersect: false,
            backgroundColor: theme.panel,
            titleColor: theme.text,
            bodyColor: theme.text,
            borderColor: theme.grid,
            borderWidth: 1,
            callbacks: {
              title: (items) => {
                const x = items[0].parsed.x;
                return "用时 " + fmtAxis(x);
              },
              label: (item) =>
                ` ${label}: ${Number(item.parsed.y.toFixed ? item.parsed.y.toFixed(2) : item.parsed.y)} ${metric.unit}`.trim(),
            },
          },
          decimation: { enabled: pts.length > 20000, algorithm: "lttb", samples: 20000 },
          zoom: {
            pan: { enabled: true, mode: "x", modifierKey: "shift" },
            zoom: {
              wheel: { enabled: true, modifierKey: "ctrl" },
              drag: { enabled: true, mode: "x" },
              pinch: { enabled: true },
              mode: "x",
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            title: { display: true, text: "时间 (时:分:秒)", color: theme.text },
            grid: { color: theme.grid },
            ticks: { maxTicksLimit: 12, callback: (v) => fmtAxis(v), color: theme.dim },
          },
          y: {
            title: { display: true, text: label + (metric.unit ? " (" + metric.unit + ")" : ""), color: theme.text },
            grid: { color: theme.grid },
            ticks: { color: theme.dim },
            beginAtZero: metric.key === "power" || metric.key === "speed" || metric.key === "cadence",
          },
        },
      },
    });
  },

  reset() {
    if (this._chart) this._chart.resetZoom();
  },
};