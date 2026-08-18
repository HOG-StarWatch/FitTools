window.Repair = {
  RUNNING: false,
  _nameToNum: null,

  mesgNumFor(name) {
    if (!this._nameToNum) {
      this._nameToNum = {};
      const t = FitSDK.Profile.types && FitSDK.Profile.types.mesgNum;
      if (t) for (const [num, nm] of Object.entries(t)) this._nameToNum[nm] = Number(num);
      if (FitSDK.Profile.MesgNum) {
        for (const [k, v] of Object.entries(FitSDK.Profile.MesgNum)) {
          this._nameToNum[this.snakeToCamel(k)] = v;
        }
      }
    }
    return this._nameToNum[name.replace(/Mesgs$/, "")];
  },

  snakeToCamel(s) {
    return s.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  },

  async run() {
    if (this.RUNNING) return;
    if (FFV.state.sourceLabel) {
      U.toast("未检测到错误", 3000);
      return;
    }
    const btn = U.$("#btn-repair");
    btn.disabled = true;
    this.RUNNING = true;
    const status = U.$("#file-status");
    const prevText = status.textContent;
    const prevCls = status.className;
    try {
      status.textContent = "正在修复\u2026";
      await new Promise((r) => setTimeout(r, 30));

      const decoder = new FitSDK.Decoder(FitSDK.Stream.fromArrayBuffer(FFV.state.bytes.buffer));
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

      const encoder = new FitSDK.Encoder();
      let ok = 0, skip = 0;
      const skipped = new Set();
      const log = [];

      for (const name of Object.keys(messages)) {
        const num = this.mesgNumFor(name);
        for (const m of messages[name]) {
          const payload = { ...m, mesgNum: num };
          try {
            encoder.writeMesg(payload);
            ok++;
          } catch (e) {
            skip++;
            skipped.add(name);
            if (log.length < 50) log.push(`${name}: ${e.message || e}`);
          }
        }
      }

      const fixed = encoder.close();
      const outName = FFV.state.fileName.replace(/\.fit$/i, "") + "_fixed.fit";
      U.download(fixed, outName, "application/octet-stream");

      const skippedList = [...skipped].join(", ") || "无";
      U.toast(`修复文件已下载：写入 ${ok} 条消息，跳过 ${skip} 条（${skippedList}）。解码错误：${errors.length} 条。`, 7000);
    } catch (e) {
      status.className = "file-status bad";
      status.textContent = "修复失败：" + (e.message || e);
      console.error(e);
    } finally {
      btn.disabled = false;
      this.RUNNING = false;
      if (status.textContent.startsWith("正在修复")) {
        status.textContent = prevText;
        status.className = prevCls;
      }
    }
  },
};