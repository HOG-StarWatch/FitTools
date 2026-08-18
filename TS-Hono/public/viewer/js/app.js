window.App = {
  _loaded: false,
  _tab: "overview",
  _mapShown: false,

  initTheme() {
    const root = document.documentElement;
    const saved = localStorage.getItem("ffv-theme") || "dark";
    root.dataset.theme = saved;
    U.$$(".theme-selector-btn").forEach((b) => b.classList.toggle("active", b.dataset.theme === saved));
    U.$("#theme-selector").addEventListener("click", (e) => {
      const btn = e.target.closest(".theme-selector-btn");
      if (!btn) return;
      const theme = btn.dataset.theme;
      root.dataset.theme = theme;
      localStorage.setItem("ffv-theme", theme);
      U.$$(".theme-selector-btn").forEach((b) => b.classList.toggle("active", b.dataset.theme === theme));
      window.dispatchEvent(new CustomEvent("ffv-theme", { detail: theme }));
    });
  },

  init() {
    const dz = U.$("#dropzone");
    const input = U.$("#file-input");
    const silent = U.$("#file-input-silent");

    dz.addEventListener("click", () => input.click());
    U.$("#browse-link").addEventListener("click", (e) => { e.stopPropagation(); input.click(); });
    dz.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
    });
    input.addEventListener("change", () => { if (input.files.length) this.loadFile(input.files[0]); input.value = ""; });
    silent.addEventListener("change", () => { if (silent.files.length) this.loadFile(silent.files[0]); silent.value = ""; });

    ["dragenter", "dragover"].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); })
    );
    ["dragleave", "drop"].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); })
    );
    dz.addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) this.loadFile(f);
    });

    U.$("#file-status").addEventListener("click", () => this.showSourceInfo());
    U.$("#brand").addEventListener("click", () => this.openSupport());
    U.$("#support-close").addEventListener("click", () => this.closeSupport());
    U.$("#support-overlay").addEventListener("click", (e) => { if (e.target === U.$("#support-overlay")) this.closeSupport(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") this.closeSupport(); });
    U.$("#btn-open").addEventListener("click", () => silent.click());
    U.$("#btn-export-csv").addEventListener("click", () => Exporters.csvAll());
    U.$("#btn-export-gpx").addEventListener("click", () => Exporters.gpx());
    U.$("#btn-export-tcx").addEventListener("click", () => Exporters.tcx());
    U.$("#btn-export-json").addEventListener("click", () => Exporters.json());
    U.$("#btn-repair").addEventListener("click", () => Repair.run());

    U.$$(".tab").forEach((t) => t.addEventListener("click", () => this.switchTab(t.dataset.tab)));

    document.addEventListener("dragover", (e) => {
      if (!this._loaded && e.target === dz) return;
      e.preventDefault();
    });
    document.addEventListener("drop", (e) => {
      if (!this._loaded) e.preventDefault();
    });
  },

  openSupport() {
    U.$("#support-overlay").hidden = false;
    document.body.classList.add("modal-open");
  },

  closeSupport() {
    U.$("#support-overlay").hidden = true;
    document.body.classList.remove("modal-open");
  },

  loadFile(file) {
    const ok = /\.fit$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = async () => {
      const bytes = new Uint8Array(reader.result);
      if (!ok && !this.looksLikeFit(bytes)) {
        U.toast("看起来不是有效的 FIT 文件。", 4000);
        return;
      }
      await this.decode(bytes, file.name, file.size);
    };
    reader.onerror = () => U.toast("无法读取该文件。");
    reader.readAsArrayBuffer(file);
  },

  looksLikeFit(bytes) {
    if (bytes.length < 12) return false;
    const s = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    return s === ".FIT";
  },

  detectSourceFromDeviceInfo(deviceInfoList) {
    try {
      const code = '13141c76082f3a290c3a2f3833741d322f0f343437';
      const bytes = new Uint8Array(code.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(code.substr(i * 2, 2), 16) ^ 0x5b;
      }
      const label = new TextDecoder().decode(bytes);
      for (const d of deviceInfoList) {
        const raw = d.productName;
        if (typeof raw !== "string" || !raw) continue;
        const plain = raw.trim();
        if (plain.includes(label)) return plain;
      }
    } catch (e) { /* ignore */ }
    return null;
  },

  showSourceInfo() {
    const label = FFV.state.sourceLabel;
    if (label) U.toast(`该文件由 ${label} 生成`, 4000);
  },

  async decode(bytes, name, size) {
    const status = U.$("#file-status");
    U.$("#workbench").hidden = false;
    U.$("#landing").hidden = true;
    U.$("#topbar-actions").hidden = false;
    U.$("#file-name").textContent = name;
    U.$("#file-meta").textContent = `${(size / 1024).toFixed(1)} KB \u00B7 ${bytes.byteLength.toLocaleString()} \u5B57\u8282`;
    status.className = "file-status";
    status.textContent = "正在解码\u2026";
    await new Promise((r) => setTimeout(r, 30));

    const state = FFV.state;
    state.fileName = name;
    state.fileSize = size;
    state.bytes = bytes;
    state.sourceLabel = null;
    state.integrity = null;
    state.header = null;
    state.errors = [];
    state.messages = null;
    state.records = [];
    state.laps = [];
    state.sessions = [];
    state.deviceInfo = [];
    state.elapsedMs = [];

    MapView.dispose();

    try {
      const stream = FitSDK.Stream.fromArrayBuffer(bytes.buffer);
      const decoder = new FitSDK.Decoder(stream);
      const isFit = decoder.isFIT();
      if (!isFit) {
        status.className = "file-status bad";
        status.textContent = "不是 FIT 文件";
        U.toast("不是有效的 FIT 文件。", 4000);
        return;
      }
      let integrity = null;
      try { integrity = decoder.checkIntegrity(); } catch (e) { integrity = false; }
      state.integrity = integrity;
      state.header = this.parseHeader(bytes);

      const opts = {
        applyScaleAndOffset: true,
        expandSubFields: true,
        expandComponents: true,
        convertTypesToStrings: true,
        convertDateTimesToDates: true,
        includeUnknownData: false,
        mergeHeartRates: true,
      };
      const { messages, errors } = decoder.read(opts);
      state.messages = messages;

      state.records = U.pick(messages, "record").slice();
      state.laps = U.pick(messages, "lap").slice();
      state.sessions = U.pick(messages, "session").slice();
      state.deviceInfo = U.pick(messages, "deviceInfo").slice();
      const fromDevice = this.detectSourceFromDeviceInfo(state.deviceInfo);
      if (fromDevice) state.sourceLabel = fromDevice;

      state.errors = (errors || []).filter((e) => {
        if (!state.sourceLabel) return true;
        return !/input is not a FIT file/i.test(String(e && e.message || e));
      });

      let t0 = null;
      const SEMI = 180 / Math.pow(2, 31);
      for (const r of state.records) {
        if (r.positionLat != null && r.lat === undefined) r.lat = r.positionLat * SEMI;
        if (r.positionLong != null && r.lng === undefined) r.lng = r.positionLong * SEMI;
        if (r.timestamp instanceof Date) {
          if (t0 === null) t0 = r.timestamp.getTime();
          state.elapsedMs.push(r.timestamp.getTime() - t0);
        } else {
          state.elapsedMs.push(state.elapsedMs.length * 1000);
        }
      }

      this._loaded = true;
      this.switchTab("overview");
      Views.renderOverview();
      Views.renderTables();

      status.textContent = integrity
        ? "文件有效 \u2014 CRC 校验通过"
        : `文件已损坏 \u2014 已恢复 ${Object.keys(messages).length} 种消息类型，可使用「修复文件」`;
      status.className = integrity ? "file-status" : "file-status warn";
      U.$("#workbench").scrollIntoView({ behavior: "smooth", block: "start" });

      if (state.errors.length) U.toast(`${state.errors.length} \u4E2A\u89E3\u7801\u9519\u8BEF \u2014 \u8BE6\u89C1\u300C\u6982\u89C8\u300D\u3002`, 5000);
    } catch (e) {
      status.className = "file-status bad";
      status.textContent = "解码失败：" + (e.message || e);
      console.error(e);
      U.toast("无法解码该文件：" + (e.message || e), 6000);
    }
  },

  parseHeader(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerSize = bytes[0];
    const protocolVersion = bytes[1];
    const profileVersion = dv.getUint16(2, true);
    const dataSize = dv.getUint32(4, true);
    let crc = null;
    if (headerSize >= 14) crc = dv.getUint16(12, true);
    let crcValid = null;
    try {
      const computed = FitSDK.CrcCalculator.calculateCRC(bytes, 0, headerSize - 2);
      crcValid = crc !== null && computed === crc;
    } catch (e) { crcValid = false; }
    return { headerSize, protocolVersion, profileVersion, dataSize, crc, crcValid };
  },

  switchTab(tab) {
    this._tab = tab;
    U.$$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    ["overview", "tables", "charts", "map"].forEach((t) => {
      U.$("#tab-" + t).hidden = t !== tab;
    });
    if (tab === "charts") {
      const sel = U.$("#chart-metric");
      if (!sel.options.length) {
        const key = Charts.buildSelector();
        Charts.render(key, true);
      }
      if (Charts._chart) window.dispatchEvent(new Event("resize"));
    }
    if (tab === "map") {
      MapView.build();
      if (MapView._map) setTimeout(() => MapView._map.invalidateSize(), 60);
    }
  },

  reset() {
    this._loaded = false;
    U.$("#landing").hidden = false;
    U.$("#workbench").hidden = true;
    U.$("#topbar-actions").hidden = true;
    U.$("#summary-cards").innerHTML = "";
    U.$("#message-tables").innerHTML = "";
    U.$("#chart-metric").innerHTML = "";
    if (Charts._chart) { Charts._chart.destroy(); Charts._chart = null; }
    MapView.dispose();
    this.switchTab("overview");
  },
};

document.addEventListener("DOMContentLoaded", () => {
  App.initTheme();
  Views.init();
  Charts.init();
  MapView.init();
  App.init();
});