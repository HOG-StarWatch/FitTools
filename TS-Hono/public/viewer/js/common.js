window.FFV = {
  state: {
    fileName: null,
    fileSize: null,
    bytes: null,
    header: null,
    messages: null,
    errors: [],
    integrity: null,
    repairs: null,
    elapsedSec: [],
    records: [],
    laps: [],
    sessions: [],
    deviceInfo: [],
    isValidFit: false,
    sourceLabel: null,
  },
};

const U = {
  $: (sel) => document.querySelector(sel),
  $$: (sel) => Array.from(document.querySelectorAll(sel)),

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  fmtValue(value) {
    if (value === null || value === undefined || value === "") return "";
    if (value instanceof Date) return U.toIsoLocal(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return "";
      return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
    }
    if (Array.isArray(value)) return value.map((v) => U.fmtValue(v)).join(", ");
    return String(value);
  },

  toIsoLocal(date) {
    const p = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
  },

  fmtDuration(sec) {
    if (sec === null || sec === undefined) return "";
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h} 时 ${m} 分 ${s} 秒`;
    if (m > 0) return `${m} 分 ${s} 秒`;
    return `${s} 秒`;
  },

  fmtPace(secPerKm) {
    if (secPerKm === null || secPerKm === undefined || secPerKm <= 0) return "";
    const mins = Math.floor(secPerKm / 60);
    const secs = Math.round(secPerKm % 60);
    return `${mins}:${String(secs).padStart(2, "0")} /公里`;
  },

  parseFloats(values) {
    if (!Array.isArray(values)) return values;
    const out = [];
    for (const v of values) {
      const n = typeof v === "number" ? v : parseFloat(v);
      out.push(Number.isFinite(n) ? n : null);
    }
    return out;
  },

  pick(messages, name) {
    if (!messages) return [];
    if (Array.isArray(messages[name])) return messages[name];
    if (Array.isArray(messages[name + "Mesgs"])) return messages[name + "Mesgs"];
    return [];
  },

  download(content, fileName, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },

  b64ToUint8(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  },

  arrayBufferToBase64(buffer) {
    const u8 = new Uint8Array(buffer);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) {
      bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(bin);
  },

  isoNow() {
    return new Date().toISOString().replace(/\.[0-9]{3}Z$/, "Z");
  },

  toast(msg, ms) {
    let t = U.$(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(U.toast._timer);
    U.toast._timer = setTimeout(() => t.classList.remove("show"), ms || 3000);
  },
};