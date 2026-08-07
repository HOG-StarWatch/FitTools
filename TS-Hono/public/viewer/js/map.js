window.MapView = {
  _map: null,
  _tileLayer: null,
  _polyline: null,
  _markers: [],
  _downloaded: null,

  _SOURCES: {
    osm: {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      opts: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 贡献者' },
    },
    gaode: {
      url: "https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
      opts: { maxZoom: 18, attribution: '&copy; 高德地图', subdomains: "12" },
    },
    tencent: {
      url: "https://rt{s}.map.gtimg.com/tile?z={z}&x={x}&y={y}&styleid=1",
      opts: { maxZoom: 20, attribution: '&copy; 腾讯地图', subdomains: ["rt0", "rt1", "rt2", "rt3"] },
    },
    "carto-dark": {
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      opts: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>' },
    },
  },

  init() {
    U.$("#btn-gpx-download").onclick = () => Exporters.gpx();
    U.$("#map-source").onchange = (e) => this.applySource(e.target.value);
  },

  applySource(key) {
    const src = this._SOURCES[key] || this._SOURCES.osm;
    if (this._tileLayer) {
      this._map.removeLayer(this._tileLayer);
      this._tileLayer = null;
    }
    if (!this._map) return;
    this._tileLayer = L.tileLayer(src.url, src.opts).addTo(this._map);
  },

  collectedPts() {
    return FFV.state.records
      .filter((r) => r.lat != null && r.lng != null && Number(r.lat) !== 0 && Number(r.lng) !== 0)
      .map((r) => ({ lat: Number(r.lat), lng: Number(r.lng), r }));
  },

  build() {
    const pts = this.collectedPts();
    const hint = U.$("#map-hint");
    const container = U.$("#map");

    if (pts.length < 2) {
      hint.textContent = "该文件中没有 GPS 轨迹数据。";
      container.style.background = "var(--bg)";
      return;
    }
    container.style.background = "";

    this._downloaded = this._downsample(pts, 20000);

    if (!this._map) {
      this._map = L.map(container, { zoomControl: true });
      this.applySource(U.$("#map-source").value);
    }

    if (this._polyline) this._polyline.remove();
    this._clearMarkers();

    const latlngs = this._downloaded.map((p) => [p.lat, p.lng]);
    this._polyline = L.polyline(latlngs, { color: "#d946ef", weight: 4, opacity: 0.85 }).addTo(this._map);

    this._addLapMarkers(pts);
    this._addEndpoints(pts);

    this._map.fitBounds(this._polyline.getBounds(), { padding: [30, 30] });

    const dist = this._trackDistance(pts);
    hint.textContent = `${pts.length.toLocaleString()} 个 GPS 点（绘制 ${this._downloaded.length.toLocaleString()} 个）\u00B7 轨迹约 ${(dist / 1000).toFixed(2)} km`;
  },

  _downsample(pts, max) {
    if (pts.length <= max) return pts;
    const step = pts.length / max;
    const out = [];
    for (let i = 0; i < pts.length; i += step) out.push(pts[Math.min(Math.floor(i), pts.length - 1)]);
    return out;
  },

  _trackDistance(pts) {
    let dist = 0;
    for (let i = 1; i < pts.length; i++) dist += this._haversine(pts[i - 1], pts[i]);
    return dist;
  },

  _haversine(a, b) {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const la1 = a.lat * Math.PI / 180;
    const la2 = b.lat * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  },

  _lapMarkers(pts) {
    const st = FFV.state;
    const out = [];
    if (!st.laps.length) return out;
    for (const l of st.laps) {
      const t = l.startTime instanceof Date ? l.startTime.getTime() : null;
      if (t === null) continue;
      let hit = null, bestDist = Infinity;
      for (const p of pts) {
        const pt = p.r.timestamp instanceof Date ? p.r.timestamp.getTime() : null;
        if (pt !== null && Math.abs(pt - t) < bestDist) { bestDist = Math.abs(pt - t); hit = p; }
      }
      if (hit) out.push({ p: hit, label: `第 ${out.length + 1} 圈`, time: l.startTime instanceof Date ? U.toIsoLocal(l.startTime) : "" });
    }
    return out;
  },

  _addLapMarkers(pts) {
    for (const lap of this._lapMarkers(pts)) {
      const mk = L.circleMarker([lap.p.lat, lap.p.lng], {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: "#f59e0b",
        fillOpacity: 1,
      }).addTo(this._map);
      mk.bindPopup(`<b>${lap.label}</b>${lap.time ? `<br/>${lap.time}` : ""}`);
      this._markers.push(mk);
    }
  },

  _addEndpoints(pts) {
    const add = (p, text, color, label) => {
      const icon = L.divIcon({
        html: `<div style="background:${color};color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">${text}</div>`,
        className: "",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const mk = L.marker([p.lat, p.lng], { icon }).addTo(this._map);
      const t = p.r.timestamp instanceof Date ? U.toIsoLocal(p.r.timestamp) : "";
      mk.bindPopup(`<b>${label}</b>${t ? `<br/>${t}` : ""}`);
      this._markers.push(mk);
    };
    const first = pts[0], last = pts[pts.length - 1];
    add(first, "S", "#16a34a", "起点");
    if (last !== first) add(last, "E", "#dc2626", "终点");
  },

  _clearMarkers() {
    this._markers.forEach((m) => m.remove());
    this._markers = [];
  },

  dispose() {
    if (this._map) { this._map.remove(); this._map = null; }
    this._tileLayer = null;
    this._polyline = null;
    this._markers = [];
    this._downloaded = null;
  },
};