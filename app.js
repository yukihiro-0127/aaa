const STORAGE_KEY = "stock-tracker-v1";

const state = {
  stocks: [],
  records: [],
  chart: null,
  latestImage: null,
};

const el = {
  stockForm: document.getElementById("stock-form"),
  ticker: document.getElementById("ticker"),
  stockName: document.getElementById("stock-name"),
  stockList: document.getElementById("stock-list"),
  recordForm: document.getElementById("record-form"),
  recordTicker: document.getElementById("record-ticker"),
  recordDate: document.getElementById("record-date"),
  price: document.getElementById("price"),
  eps: document.getElementById("eps"),
  bps: document.getElementById("bps"),
  per: document.getElementById("per"),
  pbr: document.getElementById("pbr"),
  memo: document.getElementById("memo"),
  recordsBody: document.getElementById("records-body"),
  filterTicker: document.getElementById("filter-ticker"),
  metricSelect: document.getElementById("metric-select"),
  chartCanvas: document.getElementById("metric-chart"),
  exportJson: document.getElementById("export-json"),
  importJson: document.getElementById("import-json"),
  ocrImage: document.getElementById("ocr-image"),
  ocrRun: document.getElementById("ocr-run"),
  ocrStatus: document.getElementById("ocr-status"),
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    state.stocks = parsed.stocks ?? [];
    state.records = parsed.records ?? [];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ stocks: state.stocks, records: state.records }),
  );
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sortedRecords(records) {
  return [...records].sort((a, b) => a.date.localeCompare(b.date));
}

function upsertStockOptions() {
  const stockOptions = state.stocks
    .map((stock) => `<option value="${stock.ticker}">${stock.ticker} - ${escapeHtml(stock.name)}</option>`)
    .join("");

  el.recordTicker.innerHTML = stockOptions || "<option value=''>先に銘柄を登録してください</option>";
  el.filterTicker.innerHTML =
    "<option value='all'>すべて</option>" + stockOptions;

  el.stockList.innerHTML = state.stocks
    .map((stock) => `<span class="chip">${stock.ticker} / ${escapeHtml(stock.name)}</span>`)
    .join("");
}

function toNumberOrNull(value) {
  if (value === "" || value == null) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function calcPer(price, eps) {
  if (!eps || eps <= 0 || !price || price <= 0) {
    return null;
  }
  return Number((price / eps).toFixed(2));
}

function calcPbr(price, bps) {
  if (!bps || bps <= 0 || !price || price <= 0) {
    return null;
  }
  return Number((price / bps).toFixed(2));
}

function selectedTicker() {
  return el.filterTicker.value || "all";
}

function filteredRecords() {
  const ticker = selectedTicker();
  if (ticker === "all") {
    return sortedRecords(state.records);
  }
  return sortedRecords(state.records.filter((record) => record.ticker === ticker));
}

function renderRecords() {
  const rows = filteredRecords()
    .map(
      (record) => `<tr>
        <td>${record.date}</td>
        <td>${record.ticker}</td>
        <td>${record.price ?? ""}</td>
        <td>${record.eps ?? ""}</td>
        <td>${record.bps ?? ""}</td>
        <td>${record.per ?? ""}</td>
        <td>${record.pbr ?? ""}</td>
        <td>${escapeHtml(record.memo ?? "")}</td>
        <td><button data-id="${record.id}">削除</button></td>
      </tr>`,
    )
    .join("");

  el.recordsBody.innerHTML = rows || "<tr><td colspan='9'>まだ記録がありません。</td></tr>";

  for (const button of el.recordsBody.querySelectorAll("button[data-id]")) {
    button.addEventListener("click", () => {
      state.records = state.records.filter((record) => record.id !== button.dataset.id);
      saveState();
      renderAll();
    });
  }
}

function metricLabel(metric) {
  const labels = {
    price: "株価",
    eps: "EPS",
    bps: "BPS",
    per: "PER",
    pbr: "PBR",
  };
  return labels[metric] || metric;
}

function renderChart() {
  const metric = el.metricSelect.value;
  const records = filteredRecords().filter((record) => typeof record[metric] === "number");

  const data = {
    labels: records.map((record) => `${record.date} ${record.ticker}`),
    datasets: [
      {
        label: metricLabel(metric),
        data: records.map((record) => record[metric]),
        borderColor: "#0d6efd",
        backgroundColor: "rgba(13, 110, 253, 0.2)",
        tension: 0.2,
      },
    ],
  };

  if (state.chart) {
    state.chart.destroy();
  }

  state.chart = new Chart(el.chartCanvas, {
    type: "line",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
      },
    },
  });
}

function renderAll() {
  upsertStockOptions();
  renderRecords();
  renderChart();
}

el.stockForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const ticker = el.ticker.value.trim().toUpperCase();
  const name = el.stockName.value.trim();
  if (!ticker || !name) {
    return;
  }

  const exists = state.stocks.some((stock) => stock.ticker === ticker);
  if (exists) {
    alert("その銘柄コードはすでに登録されています。");
    return;
  }

  state.stocks.push({ ticker, name });
  state.stocks.sort((a, b) => a.ticker.localeCompare(b.ticker));
  saveState();
  el.stockForm.reset();
  renderAll();
});

el.recordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.stocks.length) {
    alert("先に銘柄を登録してください。");
    return;
  }

  const ticker = el.recordTicker.value;
  const date = el.recordDate.value;
  const price = toNumberOrNull(el.price.value);
  const eps = toNumberOrNull(el.eps.value);
  const bps = toNumberOrNull(el.bps.value);
  const per = toNumberOrNull(el.per.value) ?? calcPer(price, eps);
  const pbr = toNumberOrNull(el.pbr.value) ?? calcPbr(price, bps);
  const memo = el.memo.value.trim();

  if (!ticker || !date || price == null) {
    alert("銘柄・日付・株価は必須です。");
    return;
  }

  state.records.push({
    id: crypto.randomUUID(),
    ticker,
    date,
    price,
    eps,
    bps,
    per,
    pbr,
    memo,
  });

  saveState();
  el.recordForm.reset();
  renderAll();
});

el.filterTicker.addEventListener("change", renderAll);
el.metricSelect.addEventListener("change", renderChart);

el.exportJson.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ stocks: state.stocks, records: state.records }, null, 2)], {
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
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    state.stocks = Array.isArray(parsed.stocks) ? parsed.stocks : [];
    state.records = Array.isArray(parsed.records) ? parsed.records : [];
    saveState();
    renderAll();
  } catch {
    alert("JSONの読み込みに失敗しました。形式を確認してください。");
  }
});

el.ocrImage.addEventListener("change", () => {
  state.latestImage = el.ocrImage.files?.[0] ?? null;
});

function extractNumber(text, pattern) {
  const match = text.match(pattern);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

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
    const text = result.data.text.replace(/\s+/g, " ");

    const price = extractNumber(text, /(?:株価|Price)[:：]?\s*([0-9.,]+)/i);
    const eps = extractNumber(text, /EPS[:：]?\s*([0-9.,]+)/i);
    const bps = extractNumber(text, /BPS[:：]?\s*([0-9.,]+)/i);
    const per = extractNumber(text, /PER[:：]?\s*([0-9.,]+)/i);
    const pbr = extractNumber(text, /PBR[:：]?\s*([0-9.,]+)/i);

    if (price != null) el.price.value = String(price);
    if (eps != null) el.eps.value = String(eps);
    if (bps != null) el.bps.value = String(bps);
    if (per != null) el.per.value = String(per);
    if (pbr != null) el.pbr.value = String(pbr);

    const detected = [
      price != null && "株価",
      eps != null && "EPS",
      bps != null && "BPS",
      per != null && "PER",
      pbr != null && "PBR",
    ].filter(Boolean);

    el.ocrStatus.textContent = detected.length
      ? `読み取り完了: ${detected.join(" / ")} をフォームに反映しました。`
      : "読み取りは完了しましたが、指標を特定できませんでした。画像の解像度や表記を確認してください。";
  } catch {
    el.ocrStatus.textContent = "OCR処理中にエラーが発生しました。";
  }
});

loadState();
upsertStockOptions();
renderAll();
