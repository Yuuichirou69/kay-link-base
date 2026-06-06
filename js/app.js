"use strict";

// ---------------- util ----------------
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

function toast(msg, ms = 2600) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function showModal(html) {
  $("#modal").innerHTML = html;
  $("#modal-bg").classList.add("show");
}
function hideModal() {
  $("#modal-bg").classList.remove("show");
  $("#modal").innerHTML = "";
}
$("#modal-bg").addEventListener("click", (e) => { if (e.target.id === "modal-bg") hideModal(); });

// caches
let projectsCache = [];
let categoriesCache = [];
let employeesCache = [];
let currentRole = null; // "admin" | "staff"

// scan state
// { pages: [{dataUrl, base64, mime}], extraction, items: [...] }
let scan = null;

// ---------------- navigation ----------------
const HEADERS = {
  dashboard: ["Dashboard", "Ringkasan semua project"],
  scan: ["TRANSAKSI", "Catat pemasukan maupun pengeluaran secara otomatis dan manual"],
  absensi: ["Absensi", "Kehadiran & payroll"],
  history: ["Riwayat", "Semua kwitansi"],
  master: ["Master Data", "Projects, kategori, karyawan"],
  settings: ["Pengaturan", "Koneksi backend"],
};

function go(view) {
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  const [t, s] = HEADERS[view] || ["Kay-Link", ""];
  $("#header-title").textContent = t;
  $("#header-sub").textContent = s;
  // FAB scan hanya relevan di Dashboard & Riwayat
  $("#fab-scan").style.display = (view === "dashboard" || view === "history") ? "block" : "none";
  if (view === "dashboard") loadDashboard();
  if (view === "absensi") loadAbsensi();
  if (view === "history") loadHistory();
  if (view === "master") loadMaster();
  if (view === "settings") fillSettings();
}

$$(".nav button").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
$("#fab-scan").addEventListener("click", () => go("scan"));

// ---------------- DASHBOARD ----------------
async function loadDashboard() {
  const box = $("#dashboard-content");
  if (!isConfigured()) {
    box.innerHTML = notConfiguredHtml();
    return;
  }
  box.innerHTML = `<div class="loading-box"><div class="spinner"></div>Memuat dashboard…</div>`;
  try {
    const res = await API.dashboard();
    const projects = res.projects || [];
    const totals = res.totals || { kredit: 0, debit: 0, saldo: 0 };
    projectsCache = projects.map((p) => ({ id: p.project_id, name: p.name }));

    const maxAbs = Math.max(1, ...projects.map((p) => Math.abs(p.kredit) + Math.abs(p.debit)));

    box.innerHTML = `
      <div class="card balance-card">
        <div class="label">Saldo Total (Kredit − Debit)</div>
        <div class="big">${rp(totals.saldo)}</div>
        <div class="stat-grid" style="margin-top:14px">
          <div style="color:#fff"><div class="label" style="color:rgba(255,255,255,.85)">⬇ Kredit</div><div class="value">${rp(totals.kredit)}</div></div>
          <div style="color:#fff"><div class="label" style="color:rgba(255,255,255,.85)">⬆ Debit</div><div class="value">${rp(totals.debit)}</div></div>
          <div style="color:#fff"><div class="label" style="color:rgba(255,255,255,.85)">📁 Project</div><div class="value">${projects.length}</div></div>
        </div>
      </div>
      <div class="section-title">Monitoring per Project</div>
      ${projects.length === 0 ? emptyHtml("Belum ada project", "Tambah project di menu Data.") :
        `<div class="proj-grid">${projects.map((p, i) => projCardHtml(p, i, maxAbs)).join("")}</div>`}
    `;
    $$(".proj-card").forEach((c) => c.addEventListener("click", () => openProjectDetail(c.dataset.id)));
  } catch (e) {
    box.innerHTML = errorHtml(e.message);
  }
}

function projCardHtml(p, i, maxAbs) {
  const color = colorFor(i);
  const kw = (Math.abs(p.kredit) / maxAbs) * 100;
  const dw = (Math.abs(p.debit) / maxAbs) * 100;
  return `<div class="proj-card" data-id="${p.project_id}">
    <div class="dot" style="background:${color}">${(p.name || "?")[0].toUpperCase()}</div>
    <div class="pname">${esc(p.name)}</div>
    <div class="psaldo" style="color:${p.saldo >= 0 ? "var(--green)" : "var(--red)"}">${rp(p.saldo)}</div>
    <div class="bar"><div class="k" style="width:${kw}%"></div><div class="d" style="width:${dw}%"></div></div>
    <div class="hint">${p.receipt_count} kwitansi · ${p.line_count} item</div>
  </div>`;
}

async function openProjectDetail(projectId) {
  showModal(`<div class="loading-box"><div class="spinner"></div>Memuat…</div>`);
  try {
    const res = await API.receipts(500);
    const all = res.data || [];
    const items = all.filter((r) => (r.receipt_lines || []).some((l) => l.project_id === projectId));
    const proj = projectsCache.find((p) => p.id === projectId);
    let kredit = 0, debit = 0;
    items.forEach((r) => {
      const sum = (r.receipt_lines || []).filter((l) => l.project_id === projectId).reduce((s, l) => s + (Number(l.line_total) || 0), 0);
      if (r.type === "kredit") kredit += sum; else debit += sum;
    });
    showModal(`
      <h3>${esc(proj ? proj.name : "Project")}</h3>
      <div class="step">${items.length} kwitansi terkait</div>
      <div class="stat-grid">
        <div class="stat"><div class="label">Kredit</div><div class="value" style="color:var(--green)">${rp(kredit)}</div></div>
        <div class="stat"><div class="label">Debit</div><div class="value" style="color:var(--red)">${rp(debit)}</div></div>
        <div class="stat"><div class="label">Saldo</div><div class="value">${rp(kredit - debit)}</div></div>
      </div>
      <div class="section-title">Kwitansi</div>
      ${items.length ? items.map((r) => receiptHtml(r, projectId)).join("") : emptyHtml("Belum ada kwitansi", "")}
      <button class="btn outline" style="margin-top:10px" onclick="hideModal()">Tutup</button>
    `);
    bindReceiptToggles($("#modal"));
    bindReceiptEditButtons($("#modal"));
  } catch (e) {
    showModal(errorHtml(e.message) + `<button class="btn outline" onclick="hideModal()">Tutup</button>`);
  }
}

// ---------------- HISTORY ----------------
async function loadHistory() {
  const box = $("#history-content");
  if (!isConfigured()) { box.innerHTML = notConfiguredHtml(); return; }
  box.innerHTML = `<div class="loading-box"><div class="spinner"></div>Memuat riwayat…</div>`;
  try {
    const res = await API.receipts(300);
    const data = res.data || [];
    box.innerHTML = data.length
      ? `<div class="section-title">${data.length} Kwitansi</div>` + data.map((r) => receiptHtml(r)).join("")
      : emptyHtml("Belum ada kwitansi", "Tekan tombol Transaksi untuk mulai.");
    bindReceiptToggles(box);
    bindReceiptEditButtons(box);
  } catch (e) {
    box.innerHTML = errorHtml(e.message);
  }
}

function receiptHtml(r, filterProject) {
  const lines = (r.receipt_lines || []).filter((l) => !filterProject || l.project_id === filterProject)
    .sort((a, b) => (a.line_no || 0) - (b.line_no || 0));
  const cat = r.categories && r.categories.name ? r.categories.name : "";
  const total = filterProject
    ? lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0)
    : Number(r.total_amount) || 0;
  const img = (r.image_urls && r.image_urls[0]) ? r.image_urls[0] : "";
  const moreImg = (r.image_urls && r.image_urls.length > 1) ? r.image_urls.length - 1 : 0;
  const canEdit = currentRole === "admin";
  return `<div class="receipt" data-toggle data-receipt-id="${r.id || ""}">
    <div class="rh">
      <div>
        <div class="rt">${esc(r.title || "(tanpa nama)")}</div>
        <div class="rd">${fmtDate(r.receipt_date)}${cat ? " · " + esc(cat) : ""}${r.merchant_name ? " · " + esc(r.merchant_name) : ""}</div>
      </div>
      <div style="text-align:right">
        <div class="badge ${r.type}">${r.type === "kredit" ? "Kredit" : "Debit"}</div>
        <div class="rt" style="margin-top:4px">${rp(total)}</div>
        ${canEdit ? `<button class="btn outline tiny" data-edit="${r.id}" style="margin-top:8px">Edit</button>` : ""}
      </div>
    </div>
    <div class="lines">
      ${lines.map((l) => {
        const q = (l.qty == null || l.qty === "") ? null : Number(l.qty);
        const up = (l.unit_price == null || l.unit_price === "") ? null : Number(l.unit_price);
        const lt = Number(l.line_total) || 0;
        const rhs = (q != null && up != null)
          ? `${q}× ${rp(up)} = ${rp(lt)}`
          : (q != null ? `${q}× ${rp(lt)}` : rp(lt));
        return `<div class="lineitem"><span>${l.line_no}. ${esc(l.description || "")}</span><span class="ld">${rhs}</span></div>`;
      }).join("")}
      ${img ? `<a href="${img}" target="_blank"><img class="preview-img" style="max-height:160px;margin-top:8px" src="${img}" alt="struk"/></a>${moreImg ? `<div class="hint">+${moreImg} foto lainnya</div>` : ""}` : ""}
    </div>
  </div>`;
}

function bindReceiptToggles(root) {
  $$("[data-toggle]", root).forEach((el) => el.addEventListener("click", (e) => {
    if (e.target.closest("[data-edit]")) return;
    if (e.target.tagName === "A" || e.target.tagName === "IMG" || e.target.tagName === "BUTTON") return;
    el.classList.toggle("open");
  }));
}

function bindReceiptEditButtons(root) {
  $$("[data-edit]", root).forEach((btn) => btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const id = btn.getAttribute("data-edit");
    if (id) await openEditReceipt(id);
  }));
}

async function openEditReceipt(receiptId) {
  if (currentRole !== "admin") { toast("Hanya admin yang bisa edit"); return; }
  if (!isConfigured()) { toast("Atur koneksi backend dulu di Setting"); go("settings"); return; }

  // muat master data (untuk dropdown)
  try {
    const [pr, ca] = await Promise.all([API.listProjects(), API.listCategories()]);
    projectsCache = (pr.data || []).map((p) => ({ id: p.id, name: p.name }));
    categoriesCache = (ca.data || []).map((c) => ({ id: c.id, name: c.name }));
  } catch (e) {
    toast("Gagal memuat master data: " + e.message);
    return;
  }

  // ambil receipt detail dari API (pakai list, cari id)
  let r = null;
  try {
    const res = await API.receipts(800);
    r = (res.data || []).find((x) => x.id === receiptId) || null;
  } catch (e) {
    toast("Gagal memuat kwitansi: " + e.message);
    return;
  }
  if (!r) { toast("Kwitansi tidak ditemukan"); return; }

  const lines = (r.receipt_lines || []).slice().sort((a, b) => (a.line_no || 0) - (b.line_no || 0));
  const catId = r.category_id || "";

  showModal(`
    <h3>Edit Kwitansi</h3>
    <div class="step">Perubahan akan mengupdate DB + Google Sheets (UPSERT).</div>

    <label class="field"><span>Nama Pencatatan</span>
      <input id="ed-title" value="${escAttr(r.title || "")}" /></label>

    <label class="field"><span>Tipe Transaksi</span></label>
    <div class="type-toggle" id="ed-type">
      <div class="type-opt ${r.type === "debit" ? "sel-debit" : ""}" data-type="debit"><div class="tl">Debit</div><div class="ts">Pengeluaran</div></div>
      <div class="type-opt ${r.type === "kredit" ? "sel-kredit" : ""}" data-type="kredit"><div class="tl">Kredit</div><div class="ts">Pemasukan</div></div>
    </div>

    <label class="field" style="margin-top:14px"><span>Kategori</span>
      <select id="ed-category">
        <option value="">— pilih kategori (opsional) —</option>
        ${categoriesCache.map((c) => `<option value="${c.id}" ${c.id === catId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select></label>

    <label class="field"><span>Merchant (opsional)</span>
      <input id="ed-merchant" value="${escAttr(r.merchant_name || "")}" /></label>

    <label class="field"><span>Tanggal</span>
      <input id="ed-date" type="date" value="${escAttr(r.receipt_date || todayISO())}" /></label>

    <div class="section-title">Item</div>
    <div id="ed-lines" style="margin-top:8px">
      ${lines.map((l, i) => editLineHtml(l, i)).join("")}
    </div>

    <div class="total-row"><span>TOTAL</span><span class="t" id="ed-total">${rp(lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0))}</span></div>

    <div class="btn-row" style="margin-top:14px">
      <button class="btn outline" onclick="hideModal()">Batal</button>
      <button class="btn" id="ed-save">Simpan Perubahan ✓</button>
    </div>
  `);

  let type = r.type || "debit";
  $$("#ed-type .type-opt").forEach((o) => o.addEventListener("click", () => {
    type = o.dataset.type;
    $$("#ed-type .type-opt").forEach((x) => { x.className = "type-opt" + (x.dataset.type === type ? " sel-" + type : ""); });
  }));

  $("#ed-lines").addEventListener("input", (e) => {
    const row = e.target.closest(".edline"); if (!row) return;
    const idx = Number(row.dataset.i);
    const l = lines[idx];
    if (!l) return;
    if (e.target.classList.contains("ed-desc")) l.description = e.target.value;
    if (e.target.classList.contains("ed-proj")) l.project_id = e.target.value;
    if (e.target.classList.contains("ed-qty")) l.qty = numOrNull(e.target.value);
    if (e.target.classList.contains("ed-unit")) l.unit_price = numOrNull(e.target.value);
    if (e.target.classList.contains("ed-total")) l.line_total = numOrNull(e.target.value) || 0;
    if ((l.qty != null) && (l.unit_price != null)) {
      l.line_total = Math.round(l.qty * l.unit_price);
      row.querySelector(".ed-total").value = l.line_total;
    }
    $("#ed-total").textContent = rp(lines.reduce((s, x) => s + (Number(x.line_total) || 0), 0));
  });

  $("#ed-save").addEventListener("click", async () => {
    const btn = $("#ed-save");
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div>`;
    try {
      const title = $("#ed-title").value.trim();
      const category_id = $("#ed-category").value || null;
      const cat = categoriesCache.find((c) => c.id === category_id);
      const receipt_date = $("#ed-date").value;
      if (!title) throw new Error("Nama pencatatan wajib diisi");
      if (!receipt_date) throw new Error("Tanggal wajib diisi");
      if (!lines.length) throw new Error("Minimal 1 item");

      const total_amount = lines.reduce((s, x) => s + (Number(x.line_total) || 0), 0);
      const receipt = {
        receipt_id: r.id,
        type,
        title,
        category_id,
        category_name: cat ? cat.name : "",
        merchant_name: $("#ed-merchant").value.trim() || null,
        receipt_date,
        receipt_date_detected: r.receipt_date_detected || null,
        currency: r.currency || "IDR",
        total_amount,
        image_urls: r.image_urls || [],
        extraction_raw_json: r.extraction_raw_json || {},
        created_by: r.created_by || null,
        created_at: r.created_at || new Date().toISOString(),
      };

      const linesPayload = lines.map((l, i) => {
        const proj = projectsCache.find((p) => p.id === l.project_id);
        return {
          receipt_line_id: l.id,
          receipt_id: r.id,
          project_id: l.project_id,
          project_name: proj ? proj.name : "",
          line_no: i + 1,
          description: l.description,
          qty: numOrNull(l.qty),
          unit_price: numOrNull(l.unit_price),
          line_total: Number(l.line_total) || 0,
          confidence: l.confidence ?? null,
        };
      });

      await API.submitReceipt(receipt, linesPayload);
      hideModal();
      toast("✓ Perubahan tersimpan");
      await loadHistory();
      await loadDashboard();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Simpan Perubahan ✓";
      toast("Gagal edit: " + e.message, 4000);
    }
  });
}

function editLineHtml(l, i) {
  return `<div class="edline" data-i="${i}">
    <div class="iitem-top">
      <span class="no">${i + 1}.</span>
      <input class="ed-desc" placeholder="Nama item" value="${escAttr(l.description || "")}" />
    </div>
    <div class="iitem-calc">
      <select class="ed-proj">
        ${projectsCache.map((p) => `<option value="${p.id}" ${p.id === l.project_id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
      </select>
      <input class="ed-qty" inputmode="decimal" placeholder="qty" value="${l.qty ?? ""}" />
      <span>×</span>
      <input class="ed-unit" inputmode="numeric" placeholder="harga" value="${l.unit_price ?? ""}" />
      <span>=</span>
      <input class="ed-total" inputmode="numeric" placeholder="total" value="${l.line_total ?? ""}" />
    </div>
  </div>`;
}

// ---------------- SCAN ----------------
$("#btn-camera").addEventListener("click", () => $("#file-camera").click());
$("#btn-gallery").addEventListener("click", () => $("#file-gallery").click());
$("#btn-manual").addEventListener("click", manualStart);
$("#file-camera").addEventListener("change", onFilePicked);
$("#file-gallery").addEventListener("change", onFilePicked);

async function onFilePicked(e) {
  const files = Array.from((e.target.files || []));
  e.target.value = "";
  if (!files.length) return;
  if (!isConfigured()) { toast("Atur koneksi backend dulu di Setting"); go("settings"); return; }

  try {
    const isCamera = e.target.id === "file-camera";
    const isAppend = isCamera && scan && scan.pages && scan.pages.length && confirm("Tambah foto lagi untuk struk yang sama?");
    if (!isAppend) scan = { pages: [], extraction: null, items: [] };

    $("#scan-result").innerHTML = `<div class="card"><div class="loading-box"><div class="spinner"></div>Memproses foto…</div></div>`;

    for (let i = 0; i < files.length; i++) {
      const { dataUrl, base64, mime } = await fileToBase64Resized(files[i]);
      scan.pages.push({ dataUrl, base64, mime });
    }

    const first = scan.pages[0];
    const prev = $("#scan-preview");
    prev.src = first.dataUrl; prev.style.display = "block";
    const hint = $("#scan-pages-hint");
    if (scan.pages.length > 1) {
      hint.style.display = "block";
      hint.textContent = `Struk panjang terdeteksi: ${scan.pages.length} foto. Akan digabung otomatis.`;
    } else {
      hint.style.display = "none";
      hint.textContent = "";
    }

    $("#scan-result").innerHTML = `<div class="card"><div class="loading-box"><div class="spinner"></div>Menganalisis struk dengan Gemini AI…<div class="hint">Mohon tunggu ~5-15 detik</div></div></div>`;

    const exPages = [];
    for (let i = 0; i < scan.pages.length; i++) {
      const p = scan.pages[i];
      $("#scan-result").innerHTML = `<div class="card"><div class="loading-box"><div class="spinner"></div>Menganalisis foto ${i + 1}/${scan.pages.length}…</div></div></div>`;
      const res = await API.extract(p.base64, p.mime);
      exPages.push(res.extraction || {});
    }

    const ex = mergeExtractions(exPages);
    scan.extraction = ex;
    scan.items = (ex.items || []).map((it) => {
      const sec = (it.section || "").trim();
      const base = (it.description || "").trim();
      return {
        description: sec ? `[${sec}] ${base}` : base,
        qty: numOrNull(it.qty),
        unit_price: numOrNull(it.unit_price),
        line_total: numOrNull(it.line_total) ?? ((numOrNull(it.qty) || 0) * (numOrNull(it.unit_price) || 0)),
        confidence: it.confidence,
      };
    });
    if (scan.items.length === 0) scan.items.push(blankItem());
    renderScanItems();
  } catch (err) {
    $("#scan-result").innerHTML = errorHtml("Gagal menganalisis: " + err.message) +
      `<button class="btn outline" onclick="manualStart()">Input manual saja</button>`;
  }
}

function mergeExtractions(exPages) {
  const out = { merchant_name: null, receipt_date: null, currency: "IDR", items: [], subtotal: 0, tax: 0, total: 0, overall_confidence: null };
  const items = [];
  let confSum = 0, confN = 0;
  for (const ex of exPages || []) {
    if (!out.merchant_name && ex.merchant_name) out.merchant_name = ex.merchant_name;
    if (!out.receipt_date && ex.receipt_date) out.receipt_date = ex.receipt_date;
    if (ex.currency) out.currency = ex.currency;
    if (ex.overall_confidence != null) { confSum += Number(ex.overall_confidence) || 0; confN += 1; }
    for (const it of (ex.items || [])) items.push(it);
    if (!out.total && Number(ex.total) > 0) out.total = Number(ex.total);
  }
  // renumber line_no
  out.items = items.map((it, idx) => ({ ...it, line_no: idx + 1 }));
  // compute total fallback
  if (!out.total) out.total = out.items.reduce((s, it) => s + (Number(it.line_total) || 0), 0);
  out.subtotal = out.items.reduce((s, it) => s + (Number(it.line_total) || 0), 0);
  out.tax = 0;
  out.overall_confidence = confN ? Math.round((confSum / confN) * 100) / 100 : null;
  return out;
}

function blankItem() { return { description: "", qty: 1, unit_price: 0, line_total: 0, confidence: null }; }
function manualStart() {
  if (!isConfigured()) { toast("Atur koneksi backend dulu di Setting"); go("settings"); return; }
  scan = { pages: [], extraction: {}, items: [blankItem(), blankItem()] };
  const prev = $("#scan-preview");
  if (prev) prev.style.display = "none";
  const hint = $("#scan-pages-hint"); if (hint) hint.style.display = "none";
  renderScanItems();
}

function renderScanItems() {
  const ex = scan.extraction || {};
  const lowConf = ex.overall_confidence != null && ex.overall_confidence < 0.5;
  const html = `
    <div class="card">
      <div class="row-between"><h2 style="margin:0">🧾 Item Kwitansi</h2>
        ${ex.merchant_name ? `<span class="chip">🏪 ${esc(ex.merchant_name)}</span>` : ""}</div>
      ${lowConf ? `<div class="confidence-low">⚠ Keyakinan baca rendah — mohon periksa angkanya.</div>` : ""}
      <div id="items-list" style="margin-top:10px">${scan.items.map((it, i) => itemHtml(it, i)).join("")}</div>
      <button class="btn secondary small" id="btn-add-item" style="margin-top:4px">+ Tambah Item</button>
      <div class="total-row"><span>TOTAL</span><span class="t" id="grand-total">${rp(grandTotal())}</span></div>
      <button class="btn" id="btn-proceed" style="margin-top:12px">Lanjut → Detail & Simpan</button>
    </div>`;
  $("#scan-result").innerHTML = html;
  bindItemEvents();
}

function itemHtml(it, i) {
  return `<div class="iitem" data-i="${i}">
    <div class="iitem-top">
      <span class="no">${i + 1}.</span>
      <input class="idesc" placeholder="Nama item" value="${escAttr(it.description)}" />
      <button class="x" data-del="${i}">✕</button>
    </div>
    <div class="iitem-calc">
      <input class="iqty" inputmode="decimal" placeholder="qty" value="${it.qty ?? ""}" />
      <span>×</span>
      <input class="iprice" inputmode="numeric" placeholder="harga" value="${it.unit_price ?? ""}" />
      <span>=</span>
      <input class="itotal" inputmode="numeric" placeholder="total" value="${it.line_total ?? ""}" />
    </div>
  </div>`;
}

function bindItemEvents() {
  const list = $("#items-list");
  $("#btn-add-item").addEventListener("click", () => { scan.items.push(blankItem()); renderScanItems(); });
  $("#btn-proceed").addEventListener("click", proceedToReview);
  list.addEventListener("click", (e) => {
    const del = e.target.getAttribute("data-del");
    if (del != null) { scan.items.splice(Number(del), 1); if (!scan.items.length) scan.items.push(blankItem()); renderScanItems(); }
  });
  list.addEventListener("input", (e) => {
    const row = e.target.closest(".iitem"); if (!row) return;
    const i = Number(row.dataset.i);
    const it = scan.items[i];
    if (e.target.classList.contains("idesc")) it.description = e.target.value;
    if (e.target.classList.contains("iqty")) { it.qty = numOrNull(e.target.value); recalc(row, it); }
    if (e.target.classList.contains("iprice")) { it.unit_price = numOrNull(e.target.value); recalc(row, it); }
    if (e.target.classList.contains("itotal")) { it.line_total = numOrNull(e.target.value) || 0; }
    $("#grand-total").textContent = rp(grandTotal());
  });
}

function recalc(row, it) {
  if (it.qty != null && it.unit_price != null) {
    it.line_total = Math.round(it.qty * it.unit_price);
    $(".itotal", row).value = it.line_total;
  }
}
function grandTotal() { return scan ? scan.items.reduce((s, it) => s + (Number(it.line_total) || 0), 0) : 0; }

// ---------- REVIEW / SUBMIT ----------
async function proceedToReview() {
  // pastikan master data ada
  try {
    if (!projectsCache.length || !categoriesCache.length) {
      const [pr, ca] = await Promise.all([API.listProjects(), API.listCategories()]);
      projectsCache = (pr.data || []).map((p) => ({ id: p.id, name: p.name }));
      categoriesCache = (ca.data || []).map((c) => ({ id: c.id, name: c.name }));
    }
  } catch (e) { toast("Gagal memuat project/kategori: " + e.message); return; }

  if (!projectsCache.length) {
    showModal(`<h3>Belum ada Project</h3><p class="hint">Buat minimal 1 project dulu untuk mengkategorikan item.</p>
      <button class="btn" onclick="hideModal(); go('master');">Ke menu Data</button>`);
    return;
  }

  const detected = (scan.extraction && scan.extraction.receipt_date) || "";
  showModal(`
    <h3>Detail Kwitansi</h3>
    <div class="step">Lengkapi sebelum simpan</div>

    <label class="field"><span>Nama Pencatatan</span>
      <input id="rv-title" placeholder="cth: Pembelian keperluan listrik" /></label>

    <label class="field"><span>Tipe Transaksi</span></label>
    <div class="type-toggle" id="rv-type">
      <div class="type-opt sel-debit" data-type="debit"><div class="tl">Debit</div><div class="ts">Pengeluaran</div></div>
      <div class="type-opt" data-type="kredit"><div class="tl">Kredit</div><div class="ts">Pemasukan</div></div>
    </div>

    <label class="field" style="margin-top:14px"><span>Kategori Pencatatan</span>
      <select id="rv-category">
        <option value="">— pilih kategori (opsional) —</option>
        ${categoriesCache.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}
        <option value="__new">+ Tambah kategori baru…</option>
      </select></label>

    <label class="field"><span>Project (untuk semua item)</span>
      <select id="rv-project">
        ${projectsCache.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
        <option value="__new">+ Tambah project baru…</option>
      </select></label>

    <label class="field"><span>📅 Verifikasi Tanggal Kwitansi</span>
      <input id="rv-date" type="date" value="${detected || todayISO()}" />
      <div class="hint">${detected ? "Terdeteksi otomatis: " + fmtDate(detected) + ". Ubah bila salah." : "Tanggal tidak terdeteksi — set manual."}</div>
    </label>

    <div class="total-row"><span>TOTAL</span><span class="t">${rp(grandTotal())}</span></div>

    <div class="btn-row" style="margin-top:14px">
      <button class="btn outline" onclick="hideModal()">Batal</button>
      <button class="btn" id="rv-submit">Simpan ✓</button>
    </div>
  `);

  let type = "debit";
  $$("#rv-type .type-opt").forEach((o) => o.addEventListener("click", () => {
    type = o.dataset.type;
    $$("#rv-type .type-opt").forEach((x) => { x.className = "type-opt" + (x.dataset.type === type ? " sel-" + type : ""); });
  }));

  $("#rv-category").addEventListener("change", async (e) => {
    if (e.target.value === "__new") { e.target.value = ""; await quickAddCategory(e.target); }
  });
  $("#rv-project").addEventListener("change", async (e) => {
    if (e.target.value === "__new") { e.target.value = projectsCache[0]?.id || ""; await quickAddProject(e.target); }
  });

  $("#rv-submit").addEventListener("click", () => submitReceipt(type));
}

async function quickAddCategory(sel) {
  const name = prompt("Nama kategori baru:");
  if (!name) return;
  try {
    const res = await API.createCategory(name.trim());
    const c = res.data; categoriesCache.push({ id: c.id, name: c.name });
    sel.insertAdjacentHTML("beforeend", `<option value="${c.id}">${esc(c.name)}</option>`);
    sel.value = c.id;
    toast("Kategori ditambah");
  } catch (e) { toast("Gagal: " + e.message); }
}
async function quickAddProject(sel) {
  const name = prompt("Nama project baru:");
  if (!name) return;
  try {
    const res = await API.createProject(name.trim());
    const p = res.data; projectsCache.push({ id: p.id, name: p.name });
    const opt = document.createElement("option"); opt.value = p.id; opt.textContent = p.name;
    sel.insertBefore(opt, sel.querySelector('option[value="__new"]'));
    sel.value = p.id;
    toast("Project ditambah");
  } catch (e) { toast("Gagal: " + e.message); }
}

async function submitReceipt(type) {
  const title = $("#rv-title").value.trim();
  const categoryId = $("#rv-category").value || null;
  const projectId = $("#rv-project").value;
  const date = $("#rv-date").value;
  if (!title) { toast("Nama pencatatan wajib diisi"); return; }
  if (!projectId) { toast("Pilih project"); return; }
  if (!date) { toast("Set tanggal"); return; }

  const proj = projectsCache.find((p) => p.id === projectId);
  const cat = categoriesCache.find((c) => c.id === categoryId);

  const btn = $("#rv-submit");
  btn.disabled = true; btn.innerHTML = `<div class="spinner"></div>`;

  try {
    // 1) upload foto (jika ada)
    let imageUrls = [];
    if (scan.pages && scan.pages.length) {
      try {
        for (let i = 0; i < scan.pages.length; i++) {
          btn.innerHTML = `<div class="spinner"></div> Upload ${i + 1}/${scan.pages.length}`;
          const p = scan.pages[i];
          const up = await API.uploadImage(p.base64, p.mime);
          if (up.url) imageUrls.push(up.url);
        }
      } catch (e) {
        if (!confirm("Upload foto gagal (" + e.message + ").\nLanjut simpan tanpa foto?")) {
          btn.disabled = false; btn.textContent = "Simpan ✓"; return;
        }
        imageUrls = [];
      }
    }

    // 2) susun payload
    const receipt = {
      type,
      title,
      category_id: categoryId,
      category_name: cat ? cat.name : "",
      merchant_name: (scan.extraction && scan.extraction.merchant_name) || null,
      receipt_date: date,
      receipt_date_detected: (scan.extraction && scan.extraction.receipt_date) || null,
      currency: "IDR",
      total_amount: grandTotal(),
      image_urls: imageUrls,
      extraction_raw_json: scan.extraction || {},
      created_at: new Date().toISOString(),
    };
    const lines = scan.items.map((it, i) => ({
      line_no: i + 1,
      project_id: projectId,
      project_name: proj ? proj.name : "",
      description: it.description,
      qty: it.qty,
      unit_price: it.unit_price,
      line_total: Number(it.line_total) || 0,
      confidence: it.confidence ?? null,
    }));

    // 3) submit
    await API.submitReceipt(receipt, lines);
    hideModal();
    toast("✓ Kwitansi tersimpan & tersinkron ke Sheets");
    scan = null;
    $("#scan-preview").style.display = "none";
    const hint = $("#scan-pages-hint"); if (hint) hint.style.display = "none";
    $("#scan-result").innerHTML = "";
    go("dashboard");
  } catch (e) {
    btn.disabled = false; btn.textContent = "Simpan ✓";
    toast("Gagal simpan: " + e.message, 4000);
  }
}

// ---------------- MASTER DATA ----------------
async function loadMaster() {
  if (!isConfigured()) { $("#master-projects").innerHTML = notConfiguredHtml(); $("#master-categories").innerHTML = ""; $("#master-employees").innerHTML = ""; return; }
  $("#master-projects").innerHTML = `<div class="loading-box"><div class="spinner"></div></div>`;
  $("#master-categories").innerHTML = "";
  $("#master-employees").innerHTML = "";
  try {
    const [pr, ca, em] = await Promise.all([API.listProjects(), API.listCategories(), API.listEmployees()]);
    projectsCache = (pr.data || []).map((p) => ({ id: p.id, name: p.name }));
    categoriesCache = (ca.data || []).map((c) => ({ id: c.id, name: c.name }));
    employeesCache = (em.data || []).map((e) => ({ id: e.id, name: e.name, rate: Number(e.rate_per_day) || 0 }));
    $("#master-projects").innerHTML = projectsCache.length
      ? projectsCache.map((p, i) => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--border)"><span><span class="dot" style="display:inline-flex;width:24px;height:24px;background:${colorFor(i)};font-size:12px;vertical-align:middle;margin-right:8px">${(p.name||"?")[0].toUpperCase()}</span>${esc(p.name)}</span></div>`).join("")
      : `<div class="hint">Belum ada project.</div>`;
    $("#master-categories").innerHTML = categoriesCache.length
      ? categoriesCache.map((c) => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--border)"><span>🏷️ ${esc(c.name)}</span></div>`).join("")
      : `<div class="hint">Belum ada kategori.</div>`;
    $("#master-employees").innerHTML = employeesCache.length
      ? employeesCache.map((e) => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--border)"><span>👷 ${esc(e.name)}</span><span class="erate">${rp(e.rate)}/hari</span></div>`).join("")
      : `<div class="hint">Belum ada karyawan.</div>`;
  } catch (e) {
    $("#master-projects").innerHTML = errorHtml(e.message);
  }
}

$("#btn-add-project").addEventListener("click", async () => {
  const name = prompt("Nama project baru:"); if (!name) return;
  try { await API.createProject(name.trim()); toast("Project ditambah"); loadMaster(); }
  catch (e) { toast("Gagal: " + e.message); }
});
$("#btn-add-category").addEventListener("click", async () => {
  const name = prompt("Nama kategori baru:"); if (!name) return;
  try { await API.createCategory(name.trim()); toast("Kategori ditambah"); loadMaster(); }
  catch (e) { toast("Gagal: " + e.message); }
});
$("#btn-add-employee").addEventListener("click", async () => {
  const name = prompt("Nama karyawan:"); if (!name) return;
  const rateStr = prompt("Rate gaji per hari (angka, cth: 150000):");
  if (rateStr === null) return;
  const rate = Number(String(rateStr).replace(/[^\d.-]/g, ""));
  if (isNaN(rate) || rate <= 0) { toast("Rate harus angka > 0"); return; }
  try { await API.createEmployee(name.trim(), rate); toast("Karyawan ditambah"); loadMaster(); }
  catch (e) { toast("Gagal: " + e.message); }
});

// ---------------- ABSENSI & PAYROLL ----------------
let absensiMode = "input";
let payWeekRef = null; // tanggal acuan minggu payroll
let lastPayroll = null; // hasil payroll terakhir untuk export

function absensiTabs() {
  const tabs = [
    { mode: "input", label: "Absen Harian" },
    { mode: "lembur", label: "Lembur" },
  ];
  if (currentRole === "admin") {
    tabs.push({ mode: "bonus", label: "Bonus" });
    tabs.push({ mode: "payroll", label: "Payroll" });
  }
  return tabs;
}

function renderAbsensiTabs() {
  const tabs = absensiTabs();
  if (!tabs.find((t) => t.mode === absensiMode)) absensiMode = tabs[0].mode;
  $("#absensi-seg").innerHTML = tabs
    .map((t) => `<button data-mode="${t.mode}" class="${t.mode === absensiMode ? "active" : ""}">${t.label}</button>`)
    .join("");
  $$("#absensi-seg button").forEach((b) => b.addEventListener("click", () => {
    absensiMode = b.dataset.mode;
    $$("#absensi-seg button").forEach((x) => x.classList.toggle("active", x.dataset.mode === absensiMode));
    renderAbsensi();
  }));
}

async function loadAbsensi() {
  const box = $("#absensi-content");
  if (!isConfigured()) { $("#absensi-seg").innerHTML = ""; box.innerHTML = notConfiguredHtml(); return; }
  renderAbsensiTabs();
  box.innerHTML = `<div class="loading-box"><div class="spinner"></div>Memuat…</div>`;
  try {
    const [pr, em] = await Promise.all([API.listProjects(), API.listEmployees()]);
    projectsCache = (pr.data || []).map((p) => ({ id: p.id, name: p.name }));
    employeesCache = (em.data || []).map((e) => ({ id: e.id, name: e.name, rate: Number(e.rate_per_day) || 0 }));
  } catch (e) { box.innerHTML = errorHtml(e.message); return; }
  renderAbsensi();
}

function renderAbsensi() {
  if (absensiMode === "input") renderAttInput();
  else if (absensiMode === "lembur") renderLembur();
  else if (absensiMode === "bonus") renderBonus();
  else if (absensiMode === "payroll") renderPayroll();
}

// ----- Input harian -----
function renderAttInput() {
  const box = $("#absensi-content");
  if (!projectsCache.length) { box.innerHTML = emptyHtml("Belum ada project", "Tambah project di menu Data."); return; }
  if (!employeesCache.length) { box.innerHTML = emptyHtml("Belum ada karyawan", "Tambah karyawan di menu Data."); return; }
  box.innerHTML = `
    <div class="card">
      <label class="field"><span>Project</span>
        <select id="att-project">${projectsCache.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Tanggal</span>
        <input id="att-date" type="date" value="${todayISO()}" /></label>
      <button class="btn" id="att-load">Muat Daftar Karyawan</button>
    </div>
    <div id="att-list"></div>`;
  $("#att-load").addEventListener("click", loadAttList);
}

async function loadAttList() {
  const projectId = $("#att-project").value;
  const date = $("#att-date").value;
  if (!date) { toast("Pilih tanggal"); return; }
  const list = $("#att-list");
  list.innerHTML = `<div class="loading-box"><div class="spinner"></div></div>`;
  try {
    const present = {};
    // hanya admin yang boleh membaca absensi (pre-fill); staff mulai dari kosong
    if (currentRole === "admin") {
      try {
        const res = await API.getAttendance({ from: date, to: date, projectId });
        (res.data || []).forEach((a) => { if (a.present) present[a.employee_id] = true; });
      } catch (_) {}
    }
    list.innerHTML = `
      <div class="card">
        <div class="row-between"><h2 style="margin:0">${fmtDate(date)}</h2><span class="hint" id="att-count"></span></div>
        <div id="att-rows" style="margin-top:8px">
          ${employeesCache.map((e) => `
            <div class="att-row">
              <div><div class="ename">${esc(e.name)}</div>${currentRole === "admin" ? `<div class="erate">${rp(e.rate)}/hari</div>` : ""}</div>
              <label class="hadir"><input type="checkbox" data-emp="${e.id}" ${present[e.id] ? "checked" : ""}/> Hadir</label>
            </div>`).join("")}
        </div>
        <button class="btn" id="att-save" style="margin-top:14px">Simpan Absensi</button>
      </div>`;
    const upd = () => { $("#att-count").textContent = $$("#att-rows input:checked").length + " hadir"; };
    upd();
    $("#att-rows").addEventListener("change", upd);
    $("#att-save").addEventListener("click", () => saveAtt(projectId, date));
  } catch (e) { list.innerHTML = errorHtml(e.message); }
}

async function saveAtt(projectId, date) {
  const rows = $$("#att-rows input").map((inp) => ({
    employee_id: inp.dataset.emp,
    project_id: projectId,
    work_date: date,
    present: inp.checked,
  }));
  const btn = $("#att-save"); btn.disabled = true; btn.innerHTML = `<div class="spinner"></div>`;
  try {
    await API.submitAttendance(rows);
    toast("✓ Absensi tersimpan & sync ke Sheets");
  } catch (e) { toast("Gagal: " + e.message, 4000); }
  finally { btn.disabled = false; btn.textContent = "Simpan Absensi"; }
}

// ----- Lembur (overtime) -----
let otHours = 0;
function renderLembur() {
  const box = $("#absensi-content");
  if (!employeesCache.length) { box.innerHTML = emptyHtml("Belum ada karyawan", currentRole === "admin" ? "Tambah di menu Data." : "Hubungi admin."); return; }
  const isAdmin = currentRole === "admin";
  const rates = getOvertimeRates();
  otHours = 0;
  box.innerHTML = `
    <div class="card">
      <label class="field"><span>Karyawan</span>
        <select id="ot-emp">${employeesCache.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Project (opsional)</span>
        <select id="ot-project"><option value="">— Tanpa project —</option>${projectsCache.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Tanggal</span><input id="ot-date" type="date" value="${todayISO()}" /></label>
      <label class="field"><span>Jumlah jam lembur</span></label>
      <div class="stepper">
        <button class="step-btn" id="ot-minus" type="button">−</button>
        <div class="step-val"><span id="ot-hval">0</span><small>jam</small></div>
        <button class="step-btn" id="ot-plus" type="button">+</button>
      </div>
      ${isAdmin ? `
      <label class="field" style="margin-top:14px"><span>Rate / jam</span>
        <select id="ot-rate">${rates.map((r) => `<option value="${r}">${rp(r)}</option>`).join("")}</select></label>
      <div class="total-row"><span>Total Lembur</span><span class="t" id="ot-total">Rp 0</span></div>` : ""}
      <button class="btn" id="ot-save" style="margin-top:14px">Simpan Lembur</button>
    </div>
    ${isAdmin ? '<div id="ot-pending"></div>' : ''}`;
  const upd = () => {
    $("#ot-hval").textContent = otHours;
    if (isAdmin) { const r = Number($("#ot-rate").value) || 0; $("#ot-total").textContent = rp(otHours * r); }
  };
  $("#ot-minus").addEventListener("click", () => { otHours = Math.max(0, otHours - 1); upd(); });
  $("#ot-plus").addEventListener("click", () => { otHours += 1; upd(); });
  if (isAdmin) $("#ot-rate").addEventListener("change", upd);
  $("#ot-save").addEventListener("click", saveOvertime);
  if (isAdmin) loadPendingOvertime();
}

async function saveOvertime() {
  const employee_id = $("#ot-emp").value;
  const project_id = $("#ot-project").value || null;
  const work_date = $("#ot-date").value;
  const hours = otHours;
  // Admin isi rate langsung; staff simpan TANPA rate (null) → admin yang isi nanti.
  const rate_per_hour = currentRole === "admin" ? Number($("#ot-rate").value) : null;
  if (!employee_id) { toast("Pilih karyawan"); return; }
  if (!work_date) { toast("Pilih tanggal"); return; }
  if (!hours || hours <= 0) { toast("Tambah jumlah jam dulu (tekan +)"); return; }
  const btn = $("#ot-save"); btn.disabled = true; btn.innerHTML = `<div class="spinner"></div>`;
  try {
    await API.submitOvertime([{ employee_id, project_id, work_date, hours, rate_per_hour }]);
    toast("✓ Lembur tersimpan");
    otHours = 0; $("#ot-hval").textContent = "0";
    if (currentRole === "admin") { $("#ot-total").textContent = "Rp 0"; loadPendingOvertime(); }
  } catch (e) { toast("Gagal: " + e.message, 4000); }
  finally { btn.disabled = false; btn.textContent = "Simpan Lembur"; }
}

// Admin: daftar lembur yang belum ada rate (14 hari terakhir) untuk diisi.
async function loadPendingOvertime() {
  const box = $("#ot-pending");
  if (!box) return;
  const to = todayISO();
  const from = addDays(to, -14);
  box.innerHTML = `<div class="section-title">Lembur perlu rate</div><div class="loading-box"><div class="spinner"></div></div>`;
  try {
    const res = await API.getOvertime({ from, to });
    const pending = (res.data || []).filter((o) => !o.rate_per_hour || Number(o.rate_per_hour) <= 0);
    if (!pending.length) { box.innerHTML = ""; return; }
    const rates = getOvertimeRates();
    box.innerHTML = `<div class="section-title">Lembur perlu rate (${pending.length})</div>` + pending.map((o) => `
      <div class="card" style="padding:12px" data-ot="${o.id}">
        <div class="ename">${esc(o.employee_name)}</div>
        <div class="erate">${fmtDate(o.work_date)} · ${o.hours} jam${o.project_name ? " · " + esc(o.project_name) : ""}</div>
        <div class="btn-row" style="margin-top:10px">
          <select class="ot-prate" style="flex:1">${rates.map((r) => `<option value="${r}">${rp(r)}</option>`).join("")}</select>
          <button class="btn small ot-pset">Simpan Rate</button>
          <button class="btn small ot-del" style="background:var(--red)">Hapus</button>
        </div>
      </div>`).join("");
    box.querySelectorAll(".ot-pset").forEach((btn) => btn.addEventListener("click", async () => {
      const card = btn.closest("[data-ot]");
      const id = card.dataset.ot;
      const rate = Number(card.querySelector(".ot-prate").value);
      btn.disabled = true; btn.innerHTML = `<div class="spinner"></div>`;
      try { await API.updateOvertime(id, { rate_per_hour: rate }); toast("✓ Rate diisi"); loadPendingOvertime(); }
      catch (e) { toast("Gagal: " + e.message); btn.disabled = false; btn.textContent = "Simpan Rate"; }
    }));
    box.querySelectorAll(".ot-del").forEach((btn) => btn.addEventListener("click", async () => {
      const id = btn.closest("[data-ot]").dataset.ot;
      if (!confirm("Hapus entri lembur ini?")) return;
      btn.disabled = true;
      try { await API.deleteOvertime(id); toast("✓ Lembur dihapus"); loadPendingOvertime(); }
      catch (e) { toast("Gagal: " + e.message); btn.disabled = false; }
    }));
  } catch (e) { box.innerHTML = `<div class="hint" style="margin:8px 4px">Gagal memuat lembur pending: ${esc(e.message)}</div>`; }
}

// ----- Bonus (admin) -----
function renderBonus() {
  const box = $("#absensi-content");
  if (!employeesCache.length) { box.innerHTML = emptyHtml("Belum ada karyawan", "Tambah di menu Data."); return; }
  box.innerHTML = `
    <div class="card">
      <label class="field"><span>Karyawan</span>
        <select id="bn-emp">${employeesCache.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Tanggal</span><input id="bn-date" type="date" value="${todayISO()}" /></label>
      <label class="field"><span>Nominal Bonus</span><input id="bn-amount" inputmode="numeric" placeholder="cth: 200000" /></label>
      <label class="field"><span>Keterangan (opsional)</span><input id="bn-note" placeholder="cth: Bonus proyek selesai" /></label>
      <button class="btn" id="bn-save">Simpan Bonus</button>
    </div>
    <div id="bn-list"></div>`;
  $("#bn-save").addEventListener("click", saveBonus);
  loadBonusList();
}

async function loadBonusList() {
  const box = $("#bn-list");
  if (!box) return;
  const to = todayISO();
  const from = addDays(to, -30);
  box.innerHTML = `<div class="section-title">Bonus terbaru</div><div class="loading-box"><div class="spinner"></div></div>`;
  try {
    const res = await API.getBonus({ from, to });
    const data = res.data || [];
    if (!data.length) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="section-title">Bonus terbaru (30 hari)</div>` + data.slice().reverse().map((b) => `
      <div class="card" style="padding:12px" data-bn="${b.id}">
        <div class="row-between">
          <div><div class="ename">${esc(b.employee_name)}</div><div class="erate">${fmtDate(b.work_date)}${b.note ? " · " + esc(b.note) : ""}</div></div>
          <div style="text-align:right"><div class="rt">${rp(b.amount)}</div><button class="btn small bn-del" style="background:var(--red);margin-top:6px">Hapus</button></div>
        </div>
      </div>`).join("");
    box.querySelectorAll(".bn-del").forEach((btn) => btn.addEventListener("click", async () => {
      const id = btn.closest("[data-bn]").dataset.bn;
      if (!confirm("Hapus bonus ini?")) return;
      btn.disabled = true;
      try { await API.deleteBonus(id); toast("✓ Bonus dihapus"); loadBonusList(); }
      catch (e) { toast("Gagal: " + e.message); btn.disabled = false; }
    }));
  } catch (e) { box.innerHTML = `<div class="hint" style="margin:8px 4px">Gagal memuat bonus: ${esc(e.message)}</div>`; }
}

async function saveBonus() {
  const employee_id = $("#bn-emp").value;
  const work_date = $("#bn-date").value;
  const amount = Number(($("#bn-amount").value || "").replace(/[^\d.]/g, ""));
  const note = $("#bn-note").value.trim() || null;
  if (!employee_id) { toast("Pilih karyawan"); return; }
  if (!work_date) { toast("Pilih tanggal"); return; }
  if (!amount || amount <= 0) { toast("Isi nominal bonus"); return; }
  const btn = $("#bn-save"); btn.disabled = true; btn.innerHTML = `<div class="spinner"></div>`;
  try {
    await API.createBonus({ employee_id, work_date, amount, note });
    toast("✓ Bonus tersimpan & sync ke Sheets");
    $("#bn-amount").value = ""; $("#bn-note").value = "";
    loadBonusList();
  } catch (e) { toast("Gagal: " + e.message, 4000); }
  finally { btn.disabled = false; btn.textContent = "Simpan Bonus"; }
}

// ----- Payroll mingguan -----
function renderPayroll() {
  const box = $("#absensi-content");
  if (!payWeekRef) payWeekRef = todayISO();
  const { start, end } = weekRange(payWeekRef);
  box.innerHTML = `
    <div class="card">
      <label class="field"><span>Karyawan</span>
        <select id="pay-emp"><option value="">— Semua Karyawan —</option>${employeesCache.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Project</span>
        <select id="pay-project"><option value="">— Semua Project —</option>${projectsCache.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
      <div class="week-nav">
        <button class="btn outline" id="pay-prev">‹</button>
        <div class="week-label">${fmtDate(start)} – ${fmtDate(end)}</div>
        <button class="btn outline" id="pay-next">›</button>
      </div>
      <button class="btn" id="pay-calc">Hitung Payroll</button>
    </div>
    <div id="pay-result"></div>`;
  $("#pay-prev").addEventListener("click", () => { payWeekRef = addDays(start, -7); renderPayroll(); });
  $("#pay-next").addEventListener("click", () => { payWeekRef = addDays(start, 7); renderPayroll(); });
  $("#pay-calc").addEventListener("click", calcPayroll);
}

async function calcPayroll() {
  const employeeId = $("#pay-emp").value || null;
  const projectId = $("#pay-project").value || null;
  const { start, end } = weekRange(payWeekRef);
  const box = $("#pay-result");
  box.innerHTML = `<div class="loading-box"><div class="spinner"></div>Menghitung…</div>`;
  try {
    const [attRes, otRes, bnRes] = await Promise.all([
      API.getAttendance({ from: start, to: end, projectId }),
      API.getOvertime({ from: start, to: end, projectId, employeeId }),
      projectId ? Promise.resolve({ data: [] }) : API.getBonus({ from: start, to: end, employeeId }),
    ]);
    let att = (attRes.data || []).filter((a) => a.present);
    let ot = otRes.data || [];
    let bn = bnRes.data || [];
    if (employeeId) {
      att = att.filter((a) => a.employee_id === employeeId);
      ot = ot.filter((o) => o.employee_id === employeeId);
      bn = bn.filter((b) => b.employee_id === employeeId);
    }

    const E = {};
    const ensure = (id, name, rate) => (E[id] = E[id] || { id, name: name || "", rate: rate || 0, days: 0, base: 0, ot: [], otTotal: 0, bonus: [], bonusTotal: 0, dates: new Set() });
    att.forEach((a) => { const e = ensure(a.employee_id, a.employee_name, Number(a.rate_per_day) || 0); e.days += 1; e.dates.add(a.work_date); });
    ot.forEach((o) => {
      const amt = (Number(o.hours) || 0) * (Number(o.rate_per_hour) || 0);
      const e = ensure(o.employee_id, o.employee_name, 0);
      e.ot.push({ date: o.work_date, hours: Number(o.hours) || 0, rate: Number(o.rate_per_hour) || 0, amount: amt, project: o.project_name });
      e.otTotal += amt;
    });
    bn.forEach((b) => {
      const amt = Number(b.amount) || 0;
      const e = ensure(b.employee_id, b.employee_name, 0);
      e.bonus.push({ date: b.work_date, amount: amt, note: b.note });
      e.bonusTotal += amt;
    });
    Object.values(E).forEach((e) => { e.base = e.days * e.rate; });

    const list = Object.values(E).filter((e) => e.days > 0 || e.otTotal > 0 || e.bonusTotal > 0);
    if (!list.length) { box.innerHTML = emptyHtml("Tidak ada data", "di rentang minggu ini."); lastPayroll = null; return; }
    const grand = list.reduce((s, e) => s + e.base + e.otTotal + e.bonusTotal, 0);

    const projName = projectId ? (projectsCache.find((p) => p.id === projectId)?.name || "") : "";
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    lastPayroll = { list, start, end, projName, weekDates, employeeId, projectId };

    let html = "";
    if (employeeId && list.length === 1) {
      // Slip gaji satu karyawan
      html = payslipHtml(list[0], start, end, projectId);
    } else {
      // Ringkasan banyak karyawan
      html = `<div class="card balance-card"><div class="label">Total Payroll Minggu Ini</div><div class="big">${rp(grand)}</div><div class="label">${fmtDate(start)} – ${fmtDate(end)}</div></div>`;
      if (projectId) html += `<div class="hint" style="margin:0 4px 10px">ℹ️ Bonus tidak ditampilkan saat difilter per project (bonus bersifat per karyawan). Pilih "Semua Project" untuk menyertakan bonus.</div>`;
      html += `<div class="card" style="padding:12px">`;
      list.forEach((e) => {
        const tot = e.base + e.otTotal + e.bonusTotal;
        const meta = [`${e.days} hari`];
        if (e.otTotal) meta.push(`lembur ${rp(e.otTotal)}`);
        if (e.bonusTotal) meta.push(`bonus ${rp(e.bonusTotal)}`);
        html += `<div class="pay-row"><div class="pe">${esc(e.name)}</div><div class="pcalc"><span class="pmeta">${meta.join(" · ")}</span><span class="pt">${rp(tot)}</span></div></div>`;
      });
      html += `</div>`;
    }
    html += exportControlsHtml();
    box.innerHTML = html;
    bindExportControls();
  } catch (e) { box.innerHTML = errorHtml(e.message); }
}

// ----- Export slip (PDF/JPEG, client-side) -----
function exportControlsHtml() {
  const mode = lastPayroll && lastPayroll.employeeId ? "Per nama (1 karyawan)"
    : (lastPayroll && lastPayroll.projectId ? "Per project (semua karyawan di project ini)" : "Semua karyawan");
  return `<div class="card"><h2>📄 Export Slip Gaji</h2>
    <div class="hint" style="margin-bottom:10px">Mode: <b>${mode}</b> · ${lastPayroll ? lastPayroll.list.length : 0} slip</div>
    <div class="btn-row">
      <button class="btn" id="exp-pdf">⬇ PDF</button>
      <button class="btn secondary" id="exp-jpeg">⬇ JPEG</button>
    </div>
    <button class="btn outline" id="exp-sync" style="margin-top:10px">☁ Sync Payroll ke Google Sheet</button>
    </div>`;
}
function bindExportControls() {
  const p = $("#exp-pdf"), j = $("#exp-jpeg"), s = $("#exp-sync");
  if (p) p.addEventListener("click", () => exportSlips("pdf"));
  if (j) j.addEventListener("click", () => exportSlips("jpeg"));
  if (s) s.addEventListener("click", syncPayrollToSheet);
}

async function syncPayrollToSheet() {
  if (!lastPayroll || !lastPayroll.list.length) { toast("Hitung payroll dulu"); return; }
  const btn = $("#exp-sync"); btn.disabled = true; btn.innerHTML = `<div class="spinner"></div>`;
  const now = new Date().toISOString();
  const rows = lastPayroll.list.map((e) => ({
    payroll_id: `${lastPayroll.start}_${lastPayroll.projectId || "all"}_${e.id}`,
    minggu_mulai: lastPayroll.start,
    minggu_selesai: lastPayroll.end,
    project_id: lastPayroll.projectId || "",
    nama_project: lastPayroll.projName || "",
    employee_id: e.id,
    nama_karyawan: e.name,
    jumlah_hari_hadir: e.days,
    rate_gaji_per_hari: e.rate,
    total_gaji_pokok: e.base,
    total_lembur: e.otTotal,
    total_bonus: e.bonusTotal,
    total_diterima: e.base + e.otTotal + e.bonusTotal,
    dibuat_pada: now,
  }));
  try { await API.syncPayroll(rows); toast(`✓ ${rows.length} baris payroll tersync ke Sheet`); }
  catch (e) { toast("Gagal sync: " + e.message, 4000); }
  finally { btn.disabled = false; btn.textContent = "☁ Sync Payroll ke Google Sheet"; }
}

function slipBlock(e, lp) {
  const dayLabels = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const heads = dayLabels.map((d) => `<th>${d}</th>`).join("");
  const cells = lp.weekDates.map((dt) => {
    const present = e.dates && e.dates.has(dt);
    return present ? `<td>&#10003;</td>` : `<td class="nm-x">&times;</td>`;
  }).join("");
  const total = e.base + e.otTotal + e.bonusTotal;
  return `<div class="nm-slip">
    <div class="nm-band">
      <div class="nm-ttl">${esc(lp.projName || "SLIP GAJI")}</div>
      <div class="nm-sub">Slip Gaji &middot; Periode ${fmtDate(lp.start)} – ${fmtDate(lp.end)}</div>
    </div>
    <div class="nm-name"><div class="nm-n">${esc(e.name)}</div><div class="nm-r">${rp(e.rate)}/hari &middot; Hadir <b>${e.days} hari</b></div></div>
    <div class="nm-att">
      <table><tr>${heads}</tr><tr>${cells}</tr></table>
    </div>
    <table class="nm-earn">
      <tr><td>Gaji Pokok (${e.days} &times; ${rp(e.rate)})</td><td class="amt">${rp(e.base)}</td></tr>
      ${e.otTotal ? `<tr><td>Lembur</td><td class="amt">${rp(e.otTotal)}</td></tr>` : ""}
      ${e.bonusTotal ? `<tr><td>Bonus</td><td class="amt">${rp(e.bonusTotal)}</td></tr>` : ""}
    </table>
    <div class="nm-totbar"><span class="l">TOTAL DITERIMA</span><span class="v">${rp(total)}</span></div>
  </div>`;
}
function buildSlipDocHtml(lp) { return lp.list.map((e) => slipBlock(e, lp)).join(""); }

async function exportSlips(format) {
  if (!lastPayroll || !lastPayroll.list.length) { toast("Hitung payroll dulu"); return; }
  if (typeof html2canvas === "undefined" || !window.jspdf) { toast("Library export belum termuat (butuh internet sekali)"); return; }
  const stage = $("#export-stage");
  stage.innerHTML = buildSlipDocHtml(lastPayroll);
  toast("Menyiapkan file…");
  const safe = (lastPayroll.projName || (lastPayroll.list[0] && lastPayroll.list[0].name) || "gaji").replace(/[^\w]+/g, "_");
  const base = `slip_${safe}_${lastPayroll.start}`;
  try {
    if (format === "jpeg") {
      const canvas = await html2canvas(stage, { scale: 2, backgroundColor: "#ffffff", windowWidth: 760 });
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/jpeg", 0.95);
      a.download = base + ".jpg";
      a.click();
    } else {
      // PDF: capture tiap slip terpisah → tiap slip utuh, pindah halaman otomatis (≈5/A4)
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF("p", "mm", "a4");
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const M = 8, gap = 4, w = pw - M * 2;
      let y = M;
      for (const el of Array.from(stage.children)) {
        const c = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", windowWidth: 760 });
        const h = (c.height * w) / c.width;
        if (y + h > ph - M && y > M) { pdf.addPage(); y = M; }
        pdf.addImage(c.toDataURL("image/jpeg", 0.95), "JPEG", M, y, w, h);
        y += h + gap;
      }
      pdf.save(base + ".pdf");
    }
    toast("✓ File terunduh");
  } catch (e) { toast("Gagal export: " + e.message, 4000); }
  finally { stage.innerHTML = ""; }
}

function payslipHtml(e, start, end, projectId) {
  const total = e.base + e.otTotal + e.bonusTotal;
  let h = `<div class="card slip">
    <div class="slip-head"><div class="slip-name">${esc(e.name)}</div><div class="slip-week">Slip Gaji · ${fmtDate(start)} – ${fmtDate(end)}</div></div>
    <div class="slip-sec">
      <div class="slip-line"><span>Kehadiran: ${e.days} hari × ${rp(e.rate)}</span><span>${rp(e.base)}</span></div>
    </div>`;
  if (e.ot.length) {
    h += `<div class="slip-sec"><div class="slip-sub">Lembur</div>`;
    e.ot.forEach((o) => {
      const label = o.rate > 0 ? `${o.hours} jam × ${rp(o.rate)}` : `${o.hours} jam · ⚠ rate belum diisi`;
      h += `<div class="slip-line"><span>${fmtDate(o.date)} · ${label}</span><span>${rp(o.amount)}</span></div>`;
    });
    h += `<div class="slip-line strong"><span>Subtotal lembur</span><span>${rp(e.otTotal)}</span></div></div>`;
  }
  if (e.bonus.length) {
    h += `<div class="slip-sec"><div class="slip-sub">Bonus</div>`;
    e.bonus.forEach((b) => { h += `<div class="slip-line"><span>${fmtDate(b.date)}${b.note ? " · " + esc(b.note) : ""}</span><span>${rp(b.amount)}</span></div>`; });
    h += `<div class="slip-line strong"><span>Subtotal bonus</span><span>${rp(e.bonusTotal)}</span></div></div>`;
  }
  if (projectId) h += `<div class="hint">ℹ️ Difilter per project — bonus tidak disertakan. Pilih "Semua Project" untuk slip lengkap.</div>`;
  h += `<div class="slip-total"><span>TOTAL DITERIMA</span><span>${rp(total)}</span></div></div>`;
  return h;
}

// ----- week helpers -----
function isoOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function weekRange(iso) {
  const d = new Date(iso + "T00:00:00");
  const day = (d.getDay() + 6) % 7; // Senin = 0
  const start = new Date(d); start.setDate(d.getDate() - day);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start: isoOf(start), end: isoOf(end) };
}
function addDays(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoOf(d); }

// ---------------- SETTINGS ----------------
function fillSettings() {
  $("#cfg-base").value = getBaseUrl();
  $("#cfg-token").value = getToken();
  $("#cfg-status").textContent = isConfigured() ? "" : "⚠ Token belum diatur.";
  $("#cfg-ot-rates").value = getOvertimeRates().join(", ");
}
$("#btn-save-ot").addEventListener("click", () => {
  const arr = $("#cfg-ot-rates").value.split(",").map((s) => Number(String(s).replace(/[^\d.]/g, ""))).filter((n) => n > 0);
  if (!arr.length) { $("#ot-status").textContent = "Isi minimal 1 angka."; return; }
  setOvertimeRates(arr);
  $("#ot-status").textContent = "✓ Tersimpan: " + arr.map((n) => rp(n)).join(", ");
});
$("#btn-sync-master").addEventListener("click", async () => {
  const btn = $("#btn-sync-master"); btn.disabled = true; btn.innerHTML = `<div class="spinner"></div>`;
  $("#syncm-status").textContent = "Menyinkron…";
  try {
    const r = await API.syncMasterAll();
    $("#syncm-status").textContent = `✓ Tersync: ${r.employees} karyawan, ${r.projects} project, ${r.categories} kategori`;
  } catch (e) { $("#syncm-status").textContent = "✗ Gagal: " + e.message; }
  finally { btn.disabled = false; btn.textContent = "Sync Master Data ke Sheet"; }
});
$("#btn-save-cfg").addEventListener("click", () => {
  saveConfig($("#cfg-base").value, $("#cfg-token").value);
  toast("Konfigurasi disimpan");
  $("#cfg-status").textContent = "Tersimpan.";
});
$("#btn-test-cfg").addEventListener("click", async () => {
  saveConfig($("#cfg-base").value, $("#cfg-token").value);
  $("#cfg-status").textContent = "Menguji…";
  try {
    await API.health();
    const pr = await API.listProjects();
    $("#cfg-status").textContent = `✓ Terhubung. ${ (pr.data||[]).length } project ditemukan.`;
  } catch (e) {
    $("#cfg-status").textContent = "✗ Gagal: " + e.message;
  }
});

// ---------------- helpers HTML ----------------
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function escAttr(s) { return esc(s); }
function numOrNull(v) { if (v === "" || v == null) return null; const n = Number(String(v).replace(/[^\d.-]/g, "")); return isNaN(n) ? null : n; }
function emptyHtml(t, s) { return `<div class="empty"><div class="ico">📭</div><div style="font-weight:600">${t}</div><div class="hint">${s}</div></div>`; }
function errorHtml(m) { return `<div class="card" style="border-left:4px solid var(--red)"><strong style="color:var(--red)">Terjadi kesalahan</strong><div class="hint">${esc(m)}</div></div>`; }
function notConfiguredHtml() { return `<div class="empty"><div class="ico">🔌</div><div style="font-weight:600">Belum terhubung</div><div class="hint">Atur URL & token backend di menu Setting.</div><button class="btn" style="max-width:200px;margin:14px auto 0" onclick="go('settings')">Ke Setting</button></div>`; }

// ---------------- PWA install ----------------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferredPrompt = e;
  const btn = $("#btn-install"); if (btn) btn.style.display = "block";
});
$("#btn-install")?.addEventListener("click", async () => {
  if (!deferredPrompt) { toast("Gunakan menu browser → 'Add to Home Screen'"); return; }
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null;
  $("#btn-install").style.display = "none";
});

// ---------------- LOGIN & ROLE ----------------
function showLogin() {
  $("#login-base").value = getBaseUrl();
  $("#login-token").value = getToken();
  $("#login-cfg-status").textContent = isConfigured() ? "Koneksi tersimpan." : "Belum ada token.";
  $("#login-err").textContent = "";
  $("#login-screen").style.display = "flex";
}
function hideLogin() { $("#login-screen").style.display = "none"; }

$("#login-save-cfg").addEventListener("click", () => {
  saveConfig($("#login-base").value, $("#login-token").value);
  $("#login-cfg-status").textContent = "✓ Koneksi disimpan.";
});
$("#login-btn").addEventListener("click", doLogin);
$("#login-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

function doLogin() {
  const role = checkLogin($("#login-user").value, $("#login-pass").value);
  if (!role) { $("#login-err").textContent = "Username atau password salah."; return; }
  saveConfig($("#login-base").value, $("#login-token").value);
  if (!isConfigured()) { $("#login-err").textContent = "Isi token koneksi dulu (buka 'Pengaturan koneksi')."; $(".login-cfg").open = true; return; }
  $("#login-err").textContent = "";
  setRole(role); currentRole = role;
  $("#login-pass").value = "";
  hideLogin();
  applyRole(role);
}

$("#btn-logout").addEventListener("click", () => {
  if (!confirm("Keluar dari aplikasi?")) return;
  clearRole(); currentRole = null;
  showLogin();
});

function applyRole(role) {
  const staff = role === "staff";
  $(".nav").style.display = staff ? "none" : "flex";
  go(staff ? "absensi" : "dashboard");
}

// ---------------- boot ----------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
(function boot() {
  const role = getRole();
  if (role) { currentRole = role; hideLogin(); applyRole(role); }
  else { showLogin(); }
})();
