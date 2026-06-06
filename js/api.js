// Pemanggilan backend (kay-link-backend Cloudflare Worker).
const API = {
  async _fetch(path, { method = "GET", body, timeoutMs = 60000 } = {}) {
    const base = getBaseUrl();
    const token = getToken();
    if (!token) throw new Error("Token belum diatur. Buka menu Setting.");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let resp;
    try {
      resp = await fetch(base + path, {
        method,
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") throw new Error(`Timeout setelah ${Math.round(timeoutMs / 1000)} detik. Coba lagi atau cek koneksi/worker.`);
      throw new Error("Gagal terhubung ke server: " + e.message);
    }
    clearTimeout(timer);
    let data = null;
    const txt = await resp.text();
    try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    if (!resp.ok) {
      const msg = (data && data.error) ? data.error : (typeof data === "string" ? data : `HTTP ${resp.status}`);
      throw new Error(msg);
    }
    return data;
  },

  health() { return this._fetch("/health"); },

  listProjects() { return this._fetch("/projects"); },
  createProject(name) { return this._fetch("/projects", { method: "POST", body: { name } }); },
  archiveProject(id) { return this._fetch("/projects/" + id, { method: "PATCH", body: { status: "archived" } }); },

  listCategories() { return this._fetch("/categories"); },
  createCategory(name) { return this._fetch("/categories", { method: "POST", body: { name } }); },

  uploadImage(image_base64, mime_type) {
    return this._fetch("/receipt/upload", { method: "POST", body: { image_base64, mime_type }, timeoutMs: 90000 });
  },
  extract(image_base64, mime_type) {
    return this._fetch("/receipt/extract", { method: "POST", body: { image_base64, mime_type }, timeoutMs: 90000 });
  },
  submitReceipt(receipt, lines) {
    return this._fetch("/receipt/submit", { method: "POST", body: { receipt, lines } });
  },

  dashboard() { return this._fetch("/dashboard"); },
  receipts(limit = 200) { return this._fetch("/receipts?limit=" + limit); },

  listEmployees() { return this._fetch("/employees"); },
  createEmployee(name, rate_per_day) { return this._fetch("/employees", { method: "POST", body: { name, rate_per_day } }); },
  submitAttendance(rows) { return this._fetch("/attendance/submit", { method: "POST", body: { rows } }); },
  getAttendance({ from, to, projectId } = {}) {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (projectId) p.set("project_id", projectId);
    const qs = p.toString();
    return this._fetch("/attendance" + (qs ? "?" + qs : ""));
  },

  submitOvertime(rows) { return this._fetch("/overtime/submit", { method: "POST", body: { rows } }); },
  updateOvertime(id, patch) { return this._fetch("/overtime/" + id, { method: "PATCH", body: patch }); },
  deleteOvertime(id) { return this._fetch("/overtime/" + id, { method: "DELETE" }); },
  deleteBonus(id) { return this._fetch("/bonus/" + id, { method: "DELETE" }); },
  syncPayroll(rows) { return this._fetch("/payroll/sync", { method: "POST", body: { rows } }); },
  syncMasterAll() { return this._fetch("/sync/master-all", { method: "POST" }); },
  getOvertime({ from, to, projectId, employeeId } = {}) {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (projectId) p.set("project_id", projectId);
    if (employeeId) p.set("employee_id", employeeId);
    const qs = p.toString();
    return this._fetch("/overtime" + (qs ? "?" + qs : ""));
  },
  createBonus(payload) { return this._fetch("/bonus", { method: "POST", body: payload }); },
  getBonus({ from, to, employeeId } = {}) {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (employeeId) p.set("employee_id", employeeId);
    const qs = p.toString();
    return this._fetch("/bonus" + (qs ? "?" + qs : ""));
  },
};

// Resize + konversi gambar ke base64 (JPEG, maks sisi 1600px) untuk hemat payload.
function fileToBase64Resized(file, maxSide = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({ dataUrl, base64: dataUrl.split(",")[1], mime: "image/jpeg" });
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
