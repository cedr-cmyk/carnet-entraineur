// Carnet de l'entraîneur — version installée
// Remplace les services fournis par Claude (données, fichiers, téléchargements, compte) par Supabase,
// avec une copie locale pour travailler hors connexion : les modifications partent dès que le réseau revient.
(() => {
  const CFG = window.CARNET_CONFIG || {};
  window.CARNET_STANDALONE = true;
  window.CARNET_BLOB_BASE = "_blob/";
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const LSK = (k) => "carnet:" + k;
  const ls = { get(k, d) { try { const v = localStorage.getItem(LSK(k)); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(LSK(k), JSON.stringify(v)); } catch (e) { console.warn("stockage local plein", e); } } };
  const rid = () => [...crypto.getRandomValues(new Uint8Array(10))].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  const hex32 = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const clone = (o) => JSON.parse(JSON.stringify(o ?? null));
  const merge = (a, b) => { const o = { ...(a || {}) }; Object.entries(b || {}).forEach(([k, v]) => { o[k] = v && typeof v === "object" && !Array.isArray(v) && o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) ? merge(o[k], v) : v; }); return o; };

  // ---------- Écran de connexion ----------
  let session = null;
  const domReady = () => new Promise((r) => (document.body ? r() : document.addEventListener("DOMContentLoaded", r, { once: true })));
  async function loginScreen(msg = "") {
    await domReady();
    return new Promise((resolve) => {
      const el = document.createElement("div"); el.id = "login";
      el.innerHTML = `<form class="sheet" style="position:fixed;inset:auto 0 0 0;margin:auto;top:0;height:fit-content;max-width:420px;border-radius:24px;z-index:50">
        <h3>Carnet de l'entraîneur</h3>
        <p class="notice">Connecte-toi pour retrouver ton carnet sur cet appareil.${msg ? "<br><b>" + msg + "</b>" : ""}</p>
        <label class="f">E-mail<input type="email" name="email" required autocomplete="username"></label>
        <label class="f">Mot de passe<input type="password" name="pw" required minlength="6" autocomplete="current-password"></label>
        <div class="acts"><button type="button" class="btn" id="lg-new">Créer mon compte</button><button class="btn primary">Se connecter</button></div>
        <span class="tirline" id="lg-msg"></span></form>`;
      document.body.appendChild(el);
      const f = el.querySelector("form"), m = el.querySelector("#lg-msg");
      const go = async (create) => {
        const email = f.email.value.trim(), password = f.pw.value; if (!email || password.length < 6) { m.textContent = "E-mail et mot de passe (6 caractères minimum)"; return; }
        m.textContent = "…";
        const r = create ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
        if (r.error) { m.textContent = r.error.message.includes("Invalid login") ? "E-mail ou mot de passe incorrect" : r.error.message; return; }
        if (!r.data.session) { m.textContent = "Compte créé : ouvre le lien reçu par e-mail pour le confirmer, puis reconnecte-toi ici."; return; }
        el.remove(); resolve(r.data.session);
      };
      f.addEventListener("submit", (e) => { e.preventDefault(); go(false); });
      el.querySelector("#lg-new").onclick = () => go(true);
    });
  }
  async function ensureSession() {
    const { data } = await sb.auth.getSession();
    if (data.session) return data.session;
    const cached = ls.get("uid", null);
    if (cached && !navigator.onLine) return { user: { id: cached }, offline: true };
    return loginScreen();
  }

  // ---------- Données : copie locale + synchronisation ----------
  const cache = ls.get("cache", {});            // { col: { id: data } }
  const pending = ls.get("pending", {});        // { "col|id": { op: "set"|"del", data } }
  const listeners = new Set();                  // { col, filter, fn, docId }
  let online = false;
  const persist = () => { ls.set("cache", cache); ls.set("pending", pending); };
  const snapOf = (col, filters) => {
    const rows = Object.entries(cache[col] || {}).filter(([, d]) => filters.every(([f, v]) => d?.[f] === v));
    return { docs: rows.map(([id, d]) => ({ id, data: () => clone(d), exists: true })), metadata: { fromCache: !online } };
  };
  const notify = (col) => listeners.forEach((l) => {
    if (l.col !== col) return;
    try { l.docId ? l.fn(docSnap(col, l.docId)) : l.fn(snapOf(col, l.filters)); } catch (e) { console.error(e); }
  });
  const docSnap = (col, id) => { const d = cache[col]?.[id]; return { id, exists: d !== undefined, data: () => (d === undefined ? undefined : clone(d)) }; };
  let flushing = null;
  async function flush() {
    if (flushing || !session || session.offline) return flushing;
    flushing = (async () => {
      for (const key of Object.keys(pending)) {
        const [col, id] = key.split("|"), p = pending[key];
        const r = p.op === "del" ? await sb.from("docs").delete().eq("col", col).eq("id", id) : await sb.from("docs").upsert({ owner: session.user.id, col, id, data: p.data, updated_at: new Date().toISOString() });
        if (r.error) { online = false; console.warn("synchro en attente", r.error.message); break; }
        if (pending[key] === p) delete pending[key];
      }
      persist(); online = navigator.onLine;
    })().finally(() => { flushing = null; });
    return flushing;
  }
  function write(col, id, op, data) {
    cache[col] = cache[col] || {};
    if (op === "del") delete cache[col][id]; else cache[col][id] = data;
    pending[col + "|" + id] = { op, data }; persist(); notify(col);
    return flush().catch(() => {});
  }
  async function pull() {
    const all = []; let from = 0;
    for (;;) { const r = await sb.from("docs").select("col,id,data").range(from, from + 999); if (r.error) throw r.error; all.push(...r.data); if (r.data.length < 1000) break; from += 1000; }
    const fresh = {};
    all.forEach((row) => { (fresh[row.col] = fresh[row.col] || {})[row.id] = row.data; });
    Object.keys(pending).forEach((k) => { const [col, id] = k.split("|"), p = pending[k]; fresh[col] = fresh[col] || {}; if (p.op === "del") delete fresh[col][id]; else fresh[col][id] = p.data; });
    const cols = new Set([...Object.keys(cache), ...Object.keys(fresh)]);
    cols.forEach((c) => { cache[c] = fresh[c] || {}; });
    online = true; persist(); cols.forEach(notify);
  }
  function realtime() {
    sb.channel("docs").on("postgres_changes", { event: "*", schema: "public", table: "docs" }, (ev) => {
      const row = ev.new && ev.new.col ? ev.new : ev.old; if (!row || !row.col) return;
      if (pending[row.col + "|" + row.id]) return; // une modification locale plus récente attend d'être envoyée
      cache[row.col] = cache[row.col] || {};
      if (ev.eventType === "DELETE") delete cache[row.col][row.id]; else cache[row.col][row.id] = ev.new.data;
      persist(); notify(row.col);
    }).subscribe();
  }
  window.addEventListener("online", () => { flush().then(pull).catch(console.error); });
  window.addEventListener("offline", () => { online = false; });

  function collection(col, filters = []) {
    return {
      where(f, op, v) { return collection(col, [...filters, [f, v]]); },
      orderBy() { return this; },
      async get() { return snapOf(col, filters); },
      onSnapshot(next, err) { const l = { col, filters, fn: next }; listeners.add(l); setTimeout(() => next(snapOf(col, filters)), 0); return () => listeners.delete(l); },
      doc(id) {
        id = id || rid();
        return {
          id,
          async get() { return docSnap(col, id); },
          async set(data) { return write(col, id, "set", clone(data)); },
          async update(data) { return write(col, id, "set", merge(cache[col]?.[id], clone(data))); },
          async delete() { return write(col, id, "del", null); },
          onSnapshot(next) { const l = { col, docId: id, fn: next }; listeners.add(l); setTimeout(() => next(docSnap(col, id)), 0); return () => listeners.delete(l); },
        };
      },
    };
  }
  const db = { collection, doc: (id) => collection("_")?.doc(id) };

  // ---------- Fichiers (Supabase Storage, dossier propre au compte) ----------
  const bucket = () => sb.storage.from("fichiers");
  const MAX_BYTES = 1024 * 1048576;
  const assets = {
    async upload(blob, opt = {}) {
      const id = hex32(), type = opt.type || blob.type || "application/octet-stream";
      const r = await bucket().upload(`${session.user.id}/${id}`, blob, { contentType: type, upsert: false });
      if (r.error) { const e = new Error(r.error.message); e.code = /size|large/i.test(r.error.message) ? "too_large" : "quota_or_state"; throw e; }
      return { id, url: "_blob/" + id, sizeBytes: blob.size, contentType: type };
    },
    async list() {
      const out = []; let offset = 0;
      for (;;) { const r = await bucket().list(session.user.id, { limit: 1000, offset }); if (r.error) throw r.error; out.push(...r.data); if (r.data.length < 1000) break; offset += 1000; }
      const items = out.filter((x) => x.id).map((x) => ({ id: x.name, url: "_blob/" + x.name, contentType: x.metadata?.mimetype || "", sizeBytes: x.metadata?.size || 0, createdAt: x.created_at }));
      return { assets: items, usage: { files: items.length, bytes: items.reduce((n, x) => n + x.sizeBytes, 0), maxFiles: 5000, maxBytes: MAX_BYTES } };
    },
    async delete(id) { const r = await bucket().remove([`${session.user.id}/${id}`]); if (r.error) throw r.error; return { deleted: true }; },
  };
  // Le service worker sert les fichiers à l'adresse _blob/<id> : on lui transmet la clé de session
  function tellSW() {
    if (!navigator.serviceWorker?.controller || !session || session.offline) return;
    navigator.serviceWorker.controller.postMessage({ type: "auth", url: CFG.supabaseUrl, key: CFG.supabaseAnonKey, token: session.access_token, uid: session.user.id });
  }
  navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "need-auth") tellSW(); });

  // ---------- Téléchargements ----------
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith(".json") ? "application/json" : "application/octet-stream" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    },
  };
  const user = { can: async () => true, isOwner: () => true, canEdit: () => true };

  // ---------- Démarrage ----------
  const ready = (async () => {
    session = await ensureSession();
    ls.set("uid", session.user.id);
    if (!session.offline) {
      sb.auth.onAuthStateChange((_e, s) => { if (s) { session = s; tellSW(); } });
      tellSW();
      try { await flush(); await pull(); realtime(); } catch (e) { console.warn("hors connexion : copie locale", e); online = false; }
    }
  })();
  window.carnetLogout = async () => { await sb.auth.signOut(); localStorage.removeItem(LSK("cache")); localStorage.removeItem(LSK("uid")); location.reload(); };
  window.claude = {
    use: async (name) => {
      await ready;
      return { db, assets: session.offline ? null : assets, downloads, user, sample: null }[name] ?? null;
    },
  };
})();
