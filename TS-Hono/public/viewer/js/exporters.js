window.Exporters = {
  csv(rows, fileName) {
    if (!rows || rows.length === 0) {
      U.toast("没有可导出的数据");
      return;
    }
    const cols = [];
    for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
    const esc = (v) => {
      const s = U.fmtValue(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(",")];
    for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
    U.download("\uFEFF" + lines.join("\r\n"), fileName, "text/csv;charset=utf-8");
  },

  csvAll() {
    const groups = [];
    for (const name of Object.keys(FFV.state.messages)) {
      const list = FFV.state.messages[name];
      const all = [];
      for (const m of list) {
        const row = {};
        for (const k of Object.keys(m)) row[k] = m[k];
        all.push(row);
      }
      groups.push({ name, rows: all });
    }
    if (groups.length === 0) {
      U.toast("没有可导出的数据");
      return;
    }
    const parts = [];
    for (const g of groups) {
      if (g.rows.length === 0) continue;
      const cols = [];
      for (const r of g.rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
      const esc = (v) => {
        const s = U.fmtValue(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      parts.push(`# ${g.name} (${g.rows.length} 条消息)`);
      parts.push(cols.join(","));
      for (const r of g.rows) parts.push(cols.map((c) => esc(r[c])).join(","));
      parts.push("");
    }
    const base = FFV.state.fileName.replace(/\.fit$/i, "");
    U.download("\uFEFF" + parts.join("\r\n"), `${base}_all.csv`, "text/csv;charset=utf-8");
  },

  gpx() {
    const pts = FFV.state.records.filter((r) => r.lat != null && r.lng != null && r.lat !== 0 && r.lng !== 0);
    if (pts.length === 0) {
      U.toast("没有可用的 GPS 数据");
      return;
    }
    const base = FFV.state.fileName.replace(/\.fit$/i, "");
    const pad = (n, len) => String(n).padStart(len, "0");
    const fmtTime = (d) => {
      if (!(d instanceof Date)) return null;
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}T${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}Z`;
    };
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<gpx version="1.1" creator="FIT File Viewer" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">');
    lines.push(`  <trk><name>${U.escapeXml(base)}</name><trkseg>`);
    for (const r of pts) {
      const t = fmtTime(r.timestamp);
      const hr = r.heartRate != null && r.heartRate !== "" ? `<extensions><gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><gpxtpx:hr>${r.heartRate}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>` : "";
      const cad = r.cadence != null && r.cadence !== "" ? `<extensions><gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><gpxtpx:cad>${r.cadence}</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>` : "";
      const ext = hr || cad ? `<extensions>` : "";
      lines.push(`    <trkpt lat="${r.lat}" lon="${r.lng}">${t ? `<time>${t}</time>` : ""}${r.altitude != null && r.altitude !== "" ? `<ele>${r.altitude}</ele>` : ""}${hr}${cad}</trkpt>`);
    }
    lines.push("  </trkseg></trk>");
    lines.push("</gpx>");
    U.download(lines.join("\n"), `${base}.gpx`, "application/gpx+xml");
  },

  tcx() {
    const st = FFV.state;
    const base = st.fileName.replace(/\.fit$/i, "");
    const first = st.sessions[0] || {};
    const lapMsgs = st.laps && st.laps.length ? st.laps : null;
    const startTime = first.startTime instanceof Date ? first.startTime : (st.records[0] && st.records[0].timestamp instanceof Date ? st.records[0].timestamp : new Date());
    const pad = (n, len) => String(n).padStart(len, "0");
    const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}T${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}Z`;
    const num = (v, digits) => (v == null || v === "" ? 0 : Number(v).toFixed(digits == null ? 2 : digits));

    const track = st.records
      .filter((r) => r.timestamp instanceof Date && (r.lat != null || r.distance != null))
      .map((r) => {
        const ext = [];
        if (r.heartRate != null && r.heartRate !== "") ext.push(`<HeartRateBpm><Value>${r.heartRate}</Value></HeartRateBpm>`);
        if (r.cadence != null && r.cadence !== "") ext.push(`<Cadence>${r.cadence}</Cadence>`);
        const alt = r.altitude != null && r.altitude !== "" ? `<AltitudeMeters>${num(r.altitude)}</AltitudeMeters>` : "";
        const pos = r.lat != null && r.lng != null ? `<Position><LatitudeDegrees>${num(r.lat, 6)}</LatitudeDegrees><LongitudeDegrees>${num(r.lng, 6)}</LongitudeDegrees></Position>` : "";
        const dist = r.distance != null && r.distance !== "" ? `<DistanceMeters>${num(r.distance)}</DistanceMeters>` : "";
        return `      <Trackpoint><Time>${fmt(r.timestamp)}</Time>${pos}${alt}${dist}${ext.length ? `<Extensions><TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">${ext.join("")}</TPX></Extensions>` : ""}</Trackpoint>`;
      })
      .join("\n");

    const lapsXml = lapMsgs
      ? lapMsgs.map((l) => {
          const lt = l.startTime instanceof Date ? fmt(l.startTime) : fmt(startTime);
          const d = l.totalTimerTime != null ? num(l.totalTimerTime) : num(l.totalElapsedTime);
          const dist = l.totalDistance != null ? num(l.totalDistance) : "0";
          const cal = l.totalCalories != null ? num(l.totalCalories) : "0";
          const hrAvg = l.avgHeartRate != null ? num(l.avgHeartRate) : "0";
          const hrMax = l.maxHeartRate != null ? num(l.maxHeartRate) : "0";
          return `  <Lap StartTime="${lt}"><TotalTimeSeconds>${d}</TotalTimeSeconds><DistanceMeters>${dist}</DistanceMeters><Calories>${cal}</Calories><AverageHeartRateBpm><Value>${hrAvg}</Value></AverageHeartRateBpm><MaxHeartRateBpm><Value>${hrMax}</Value></MaxHeartRateBpm><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod></Lap>`;
        }).join("\n")
      : `  <Lap StartTime="${fmt(startTime)}"><TotalTimeSeconds>${num(first.totalTimerTime || first.totalElapsedTime)}</TotalTimeSeconds><DistanceMeters>${num(first.totalDistance)}</DistanceMeters><Calories>${num(first.totalCalories)}</Calories><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod></Lap>`;

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">',
      "  <Activities>",
      `    <Activity Sport="${U.escapeXml(Exporters.tcxSport(first.sport || ""))}">`,
      `      <Id>${fmt(startTime)}</Id>`,
      lapsXml,
      "      <Track>",
      track,
      "      </Track>",
      "    </Activity>",
      "  </Activities>",
      "</TrainingCenterDatabase>",
    ].join("\n");
    U.download(xml, `${base}.tcx`, "application/vnd.garmin.tcx+xml");
  },

  tcxSport(sport) {
    const s = String(sport).toLowerCase();
    if (s.includes("run")) return "Running";
    if (s.includes("cycl") || s.includes("bike")) return "Biking";
    if (s.includes("swim")) return "Other";
    if (s.includes("walk")) return "Walking";
    return "Other";
  },

  json() {
    const st = FFV.state;
    const payload = {
      file: st.fileName,
      generatedAt: U.isoNow(),
      header: st.header,
      integrity: st.integrity,
      messages: st.messages,
    };
    U.download(JSON.stringify(payload, null, 2), st.fileName.replace(/\.fit$/i, "") + ".json", "application/json");
  },
};

U.escapeXml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");