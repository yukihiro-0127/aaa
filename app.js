const STORAGE_KEY = "stock-tracker-v2";

const EPS_MODE = {
  FIXED: "FIXED_EPS",
  QUARTERLY: "QUARTERLY_EPS",
  FORWARD: "FORWARD_EPS",
};

const state = {
  stocks: [],
  records: [],
  epsProfiles: {},
  chart: null,
  latestImage: null,
};

const el = {
  stockForm: document.getElementById("stock-form"),
  ticker: document.getElementById("ticker"),
  stockName: document.getElementById("stock-name"),
  stockList: document.getElementById("stock-list"),

  epsForm: document.getElementById("eps-form"),
  epsTicker: document.getElementById("eps-ticker"),
  epsMode: document.getElementById("eps-mode"),
  fixedWrap: document.getElementById("fixed-wrap"),
  fixedEps: document.getElementById("fixed-eps"),
  forwardWrap: document.getElementById("forward-wrap"),
  forwardEps: document.getElementById("forward-eps"),
  quarterlyWrap: document.getElementById("quarterly-wrap"),
  quarterLabel: document.getElementById("quarter-label"),
  quarterEps: document.getElementById("quarter-eps"),
  addQuarter: document.getElementById("add-quarter"),
  quarterList: document.getElementById("quarter-list"),
  epsSummary: document.getElementById("eps-summary"),

  recordForm: document.getElementById("record-form"),
  recordTicker: document.getElementById("record-ticker"),
  recordDate: document.getElementById("record-date"),
  price: document.getElementById("price"),
  resolvedEps: document.getElementById("resolved-eps"),
  resolvedPer: document.getElementById("resolved-per"),
  memo: document.getElementById("memo"),

  recordsBody: document.getElementById("records-body"),
  filterTicker: document.getElementById("filter-ticker"),
  chartCanvas: document.getElementById("per-chart"),

  exportJson: document.getElementById("export-json"),
  importJson: document.getElementById("import-json"),
  ocrImage: document.getElementById("ocr-image"),
  ocrRun: document.getElementById("ocr-run"),
  ocrStatus: document.getElementById("ocr-status"),
};

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toNumberOrNull(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function modeLabel(mode) {
  if (mode === EPS_MODE.FIXED) return "固定EPS";
  if (mode === EPS_MODE.QUARTERLY) return "四半期TTM";
  if (mode === EPS_MODE.FORWARD) return "予想EPS";
  return "未設定";
}

function quarterKey(label) {
  const raw = String(label || "").trim().toUpperCase();
  const m = raw.match(/^(\d{4})\s*Q([1-4])$/);
  return m ? `${m[1]}Q${m[2]}` : null;
}

function quarterSortValue(label) {
  const m = String(label).match(/^(\d{4})Q([1-4])$/);
  if (!m) return -Infinity;
  return Number(m[1]) * 10 + Number(m[2]);
}

function getOrCreateProfile(ticker) {
  if (!state.epsProfiles[ticker]) {
    state.epsProfiles[ticker] = {
      mode: EPS_MODE.FIXED,
      fixedEps: null,
      forwardEps: null,
      quarterly: [],
    };
  }
  return state.epsProfiles[ticker];
}

function ttmEps(quarterly) {
  const sorted = [...quarterly].sort((a, b) => quarterSortValue(a.quarter) - quarterSortValue(b.quarter));
  const last4 = sorted.slice(-4);
  if (last4.length < 4) return null;
  return Number(last4.reduce((sum, q) => sum + q.eps, 0).toFixed(2));
}

function resolveEps(ticker) {
  const profile = getOrCreateProfile(ticker);
  if (profile.mode === EPS_MODE.FIXED) return profile.fixedEps;
  if (profile.mode === EPS_MODE.FORWARD) return profile.forwardEps;
  return ttmEps(profile.quarterly || []);
}

// 金融定義: PER = 株価 ÷ EPS（EPS <= 0 の場合は算出しない）
function calcPer(price, eps) {
  if (!price || price <= 0 || !eps || eps <= 0) return null;
  return Number((price / eps).toFixed(2));
}

function recomputeAllRecordPer() {
  for (const r of state.records) {
    const eps = resolveEps(r.ticker);
    r.epsUsed = eps;
    r.epsMode = getOrCreateProfile(r.ticker).mode;
    r.per = calcPer(r.price, eps);
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      stocks: state.stocks,
      records: state.records,
      epsProfiles: state.epsProfiles,
    }),
  );
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.stocks = parsed.stocks ?? [];
    state.records = parsed.records ?? [];
    state.epsProfiles = parsed.epsProfiles ?? {};
    recomputeAllRecordPer();
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function sortedRecords(records) {
  return [...records].sort((a, b) => a.date.localeCompare(b.date));
}

function selectedTicker() {
  return el.filterTicker.value || "all";
}

function filteredRecords() {
  const ticker = selectedTicker();
  const source = ticker === "all" ? state.records : state.records.filter((r) => r.ticker === ticker);
  return sortedRecords(source);
}

function upsertStockOptions() {
  const stockOptions = state.stocks
    .map((s) => `<option value="${s.ticker}">${s.ticker} - ${escapeHtml(s.name)}</option>`)
    .join("");
  const fallback = "<option value=''>先に銘柄を登録してください</option>";
  el.recordTicker.innerHTML = stockOptions || fallback;
  el.epsTicker.innerHTML = stockOptions || fallback;
  el.filterTicker.innerHTML = "<option value='all'>すべて</option>" + stockOptions;
  el.stockList.innerHTML = state.stocks
    .map((s) => `<span class='chip'>${s.ticker} / ${escapeHtml(s.name)}</span>`)
    .join("");
}

function renderQuarterList(ticker) {
  const profile = getOrCreateProfile(ticker);
  const quarters = [...(profile.quarterly || [])].sort((a, b) => quarterSortValue(a.quarter) - quarterSortValue(b.quarter));
  const ttm = ttmEps(quarters);
  const items = quarters.map((q) => `<div class='mini-item'>${q.quarter}: EPS ${q.eps}</div>`).join("");
  el.quarterList.innerHTML = (items || "<div class='mini-item'>まだ四半期EPSがありません。</div>") +
    `<div class='mini-item'><strong>TTM EPS: ${ttm ?? "（4四半期未満）"}</strong></div>`;
}

function toggleModeFields(mode) {
  el.fixedWrap.classList.toggle("hidden", mode !== EPS_MODE.FIXED);
  el.forwardWrap.classList.toggle("hidden", mode !== EPS_MODE.FORWARD);
  el.quarterlyWrap.classList.toggle("hidden", mode !== EPS_MODE.QUARTERLY);
}

function hydrateEpsEditor() {
  const ticker = el.epsTicker.value;
  if (!ticker) return;
  const profile = getOrCreateProfile(ticker);
  el.epsMode.value = profile.mode;
  el.fixedEps.value = profile.fixedEps ?? "";
  el.forwardEps.value = profile.forwardEps ?? "";
  toggleModeFields(profile.mode);
  renderQuarterList(ticker);
  renderEpsSummary();
  updateLivePerPreview();
}

function renderEpsSummary() {
  const ticker = el.recordTicker.value || el.epsTicker.value;
  if (!ticker) {
    el.epsSummary.textContent = "銘柄を登録してEPSモードを設定してください。";
    return;
  }
  const profile = getOrCreateProfile(ticker);
  const eps = resolveEps(ticker);
  el.epsSummary.textContent = `${ticker} の現在モード: ${modeLabel(profile.mode)} / 使用EPS: ${eps ?? "未設定"}`;
}

function updateLivePerPreview() {
  const ticker = el.recordTicker.value;
  const price = toNumberOrNull(el.price.value);
  const eps = ticker ? resolveEps(ticker) : null;
  const per = calcPer(price, eps);
  el.resolvedEps.value = eps ?? "未設定";
  el.resolvedPer.value = per ?? "算出不可";
}

function renderRecords() {
  const rows = filteredRecords()
    .map((r) => `<tr>
      <td>${r.date}</td>
      <td>${r.ticker}</td>
      <td>${r.price}</td>
      <td>${modeLabel(r.epsMode)}</td>
      <td>${r.epsUsed ?? ""}</td>
      <td>${r.per ?? ""}</td>
      <td>${escapeHtml(r.memo || "")}</td>
      <td><button data-id="${r.id}">削除</button></td>
    </tr>`)
    .join("");
  el.recordsBody.innerHTML = rows || "<tr><td colspan='8'>まだ記録がありません。</td></tr>";

  for (const button of el.recordsBody.querySelectorAll("button[data-id]")) {
    button.addEventListener("click", () => {
      state.records = state.records.filter((r) => r.id !== button.dataset.id);
      saveState();
      renderAll();
    });
  }
}

function renderChart() {
  const records = filteredRecords().filter((r) => typeof r.per === "number");
  const data = {
    labels: records.map((r) => `${r.date} ${r.ticker}`),
    datasets: [
      {
        label: "PER",
        data: records.map((r) => r.per),
        borderColor: "#0d6efd",
        backgroundColor: "rgba(13, 110, 253, 0.2)",
        tension: 0.2,
      },
    ],
  };

  if (state.chart) state.chart.destroy();
  state.chart = new Chart(el.chartCanvas, {
    type: "line",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

function renderAll() {
  upsertStockOptions();
  hydrateEpsEditor();
  renderRecords();
  renderChart();
  renderEpsSummary();
  updateLivePerPreview();
}

el.stockForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const ticker = el.ticker.value.trim().toUpperCase();
  const name = el.stockName.value.trim();
  if (!ticker || !name) return;
  if (state.stocks.some((s) => s.ticker === ticker)) {
    alert("その銘柄コードはすでに登録されています。");
    return;
  }
  state.stocks.push({ ticker, name });
  state.stocks.sort((a, b) => a.ticker.localeCompare(b.ticker));
  getOrCreateProfile(ticker);
  saveState();
  el.stockForm.reset();
  renderAll();
});

el.epsTicker.addEventListener("change", hydrateEpsEditor);
el.epsMode.addEventListener("change", () => toggleModeFields(el.epsMode.value));

el.addQuarter.addEventListener("click", () => {
  const ticker = el.epsTicker.value;
  if (!ticker) return;
  const q = quarterKey(el.quarterLabel.value);
  const eps = toNumberOrNull(el.quarterEps.value);
  if (!q || eps == null || eps <= 0) {
    alert("四半期は YYYYQn 形式、EPSは正の数で入力してください。");
    return;
  }
  const profile = getOrCreateProfile(ticker);
  const list = profile.quarterly || [];
  const idx = list.findIndex((item) => item.quarter === q);
  if (idx >= 0) list[idx].eps = eps;
  else list.push({ quarter: q, eps });
  profile.quarterly = list;
  el.quarterLabel.value = "";
  el.quarterEps.value = "";
  recomputeAllRecordPer();
  saveState();
  renderAll();
});

el.epsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const ticker = el.epsTicker.value;
  if (!ticker) return;
  const profile = getOrCreateProfile(ticker);
  profile.mode = el.epsMode.value;
  profile.fixedEps = toNumberOrNull(el.fixedEps.value);
  profile.forwardEps = toNumberOrNull(el.forwardEps.value);

  if (profile.mode === EPS_MODE.FIXED && (!profile.fixedEps || profile.fixedEps <= 0)) {
    alert("固定EPSを正の数で入力してください。");
    return;
  }
  if (profile.mode === EPS_MODE.FORWARD && (!profile.forwardEps || profile.forwardEps <= 0)) {
    alert("予想EPSを正の数で入力してください。");
    return;
  }
  if (profile.mode === EPS_MODE.QUARTERLY && ttmEps(profile.quarterly || []) == null) {
    alert("四半期EPSを最低4件入力するとTTM EPSが計算されます。");
  }

  recomputeAllRecordPer();
  saveState();
  renderAll();
});

el.recordTicker.addEventListener("change", () => {
  renderEpsSummary();
  updateLivePerPreview();
});
el.price.addEventListener("input", updateLivePerPreview);

el.recordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const ticker = el.recordTicker.value;
  const date = el.recordDate.value;
  const price = toNumberOrNull(el.price.value);
  const memo = el.memo.value.trim();
  if (!ticker || !date || price == null || price <= 0) {
    alert("銘柄・日付・株価（正の数）は必須です。");
    return;
  }

  const eps = resolveEps(ticker);
  const per = calcPer(price, eps);

  state.records.push({
    id: crypto.randomUUID(),
    ticker,
    date,
    price,
    epsMode: getOrCreateProfile(ticker).mode,
    epsUsed: eps,
    per,
    memo,
  });

  saveState();
  el.recordForm.reset();
  updateLivePerPreview();
  renderAll();
});

el.filterTicker.addEventListener("change", renderAll);

el.exportJson.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ stocks: state.stocks, records: state.records, epsProfiles: state.epsProfiles }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stock-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

el.importJson.addEventListener("change", async () => {
  const file = el.importJson.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    state.stocks = Array.isArray(parsed.stocks) ? parsed.stocks : [];
    state.records = Array.isArray(parsed.records) ? parsed.records : [];
    state.epsProfiles = parsed.epsProfiles && typeof parsed.epsProfiles === "object" ? parsed.epsProfiles : {};
    recomputeAllRecordPer();
    saveState();
    renderAll();
  } catch {
    alert("JSONの読み込みに失敗しました。形式を確認してください。");
  }
});

function normalizeOcrText(text) {
  return String(text)
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 65248))
    .replace(/[，、]/g, ",")
    .replace(/[．。]/g, ".")
    .replace(/[：]/g, ":")
    .replace(/\s+/g, " ")
    .trim();
}

function extractByPatterns(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const n = Number(m[1].replaceAll(",", ""));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

el.ocrImage.addEventListener("change", () => {
  state.latestImage = el.ocrImage.files?.[0] ?? null;
});

el.ocrRun.addEventListener("click", async () => {
  if (!state.latestImage) {
    el.ocrStatus.textContent = "先に画像を選択してください。";
    return;
  }
  if (typeof Tesseract === "undefined") {
    el.ocrStatus.textContent = "OCRライブラリの読み込みに失敗しました。";
    return;
  }

  el.ocrStatus.textContent = "画像解析中です...";
  try {
    const result = await Tesseract.recognize(state.latestImage, "eng+jpn");
    const text = normalizeOcrText(result.data.text);
    const price = extractByPatterns(text, [
      /(?:株価|現在値|Price)\s*[:]?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i,
      /([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:円|JPY)/i,
      /終値\s*[:]?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i,
    ]);

    if (price != null) {
      el.price.value = String(price);
      updateLivePerPreview();
      el.ocrStatus.textContent = `読み取り完了: 株価 ${price} を反映しました。`;
    } else {
      const fallback = extractByPatterns(text, [/([0-9]{3,}(?:\.[0-9]+)?)/]);
      if (fallback != null) {
        el.price.value = String(fallback);
        updateLivePerPreview();
        el.ocrStatus.textContent = `ラベル抽出に失敗したため推定値 ${fallback} を反映しました（要確認）。`;
      } else {
        el.ocrStatus.textContent = "株価を抽出できませんでした。画像の解像度や項目名の見え方を確認してください。";
      }
    }
  } catch {
    el.ocrStatus.textContent = "OCR処理中にエラーが発生しました。";
  }
});

loadState();
upsertStockOptions();
renderAll();
