// Konfigurasi & util penyimpanan lokal.
const CFG = {
  KEY_BASE: "kaylink_base_url",
  KEY_TOKEN: "kaylink_token",
  KEY_ROLE: "kaylink_role",
  KEY_OT_RATES: "kaylink_ot_rates",
  // Default URL backend kamu (bisa diubah di Settings)
  DEFAULT_BASE: "https://kay-link-backend.brilliantmudzakkir.workers.dev",
};

// Kredensial login (gerbang tampilan). Keamanan SEBENARNYA ada di token backend.
const CREDS = {
  admin: { user: "admin", pass: "admin123", role: "admin" },
  staff: { user: "absen", pass: "123456", role: "staff" },
};
function checkLogin(user, pass) {
  const u = String(user || "").trim().toLowerCase();
  const p = String(pass || "");
  for (const c of Object.values(CREDS)) {
    if (u === c.user && p === c.pass) return c.role;
  }
  return null;
}
function getRole() { return localStorage.getItem(CFG.KEY_ROLE); }
function setRole(r) { localStorage.setItem(CFG.KEY_ROLE, r); }
function clearRole() { localStorage.removeItem(CFG.KEY_ROLE); }

// Opsi rate lembur per jam (admin bisa ubah di Settings)
function getOvertimeRates() {
  const raw = localStorage.getItem(CFG.KEY_OT_RATES);
  if (raw) {
    try { const a = JSON.parse(raw); if (Array.isArray(a) && a.length) return a; } catch (_) {}
  }
  return [10000, 15000, 20000, 25000];
}
function setOvertimeRates(arr) { localStorage.setItem(CFG.KEY_OT_RATES, JSON.stringify(arr)); }

function getBaseUrl() {
  return (localStorage.getItem(CFG.KEY_BASE) || CFG.DEFAULT_BASE).replace(/\/+$/, "");
}
function getToken() {
  return localStorage.getItem(CFG.KEY_TOKEN) || "";
}
function saveConfig(baseUrl, token) {
  if (baseUrl != null) localStorage.setItem(CFG.KEY_BASE, baseUrl.trim().replace(/\/+$/, ""));
  if (token != null) localStorage.setItem(CFG.KEY_TOKEN, token.trim());
}
function isConfigured() {
  return !!getToken();
}

// Format Rupiah
const RP = new Intl.NumberFormat("id-ID");
function rp(n) { return "Rp " + RP.format(Math.round(Number(n) || 0)); }
function num(n) { return RP.format(Math.round(Number(n) || 0)); }

// Tanggal
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// Warna project (stabil berdasarkan index/id)
const PROJ_COLORS = ["#2196F3","#4CAF50","#F44336","#FF9800","#9C27B0","#00BCD4","#E91E63","#8BC34A","#3F51B5","#009688"];
function colorFor(i) { return PROJ_COLORS[i % PROJ_COLORS.length]; }
