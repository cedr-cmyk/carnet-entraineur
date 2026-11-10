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

  // ---------- Hors connexion (V.1.7.1) ----------
  // Une réponse du serveur qui ne vient pas = pas de réseau : l'appli démarre quand même sur la copie gardée sur l'appareil.
  const withTimeout = (p, ms = 6000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("pas de réseau"), { code: "timeout" })), ms))]);
  const netErr = (e) => !navigator.onLine || e?.code === "timeout" || /fetch|network|réseau|load failed/i.test(e?.message || "");
  let bandeau = null;
  async function horsLigne(on, qui = "coach") {
    await domReady();
    if (!on) { if (bandeau) { bandeau._pt?.remove(); bandeau.remove(); bandeau = null; } return; }
    if (!bandeau) {
      bandeau = document.createElement("div"); bandeau.id = "hors-ligne"; bandeau.setAttribute("role", "status");
      bandeau.style.cssText = "position:relative;z-index:4;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:8px 14px;background:#78350F;color:#fff;font:600 .9rem/1.3 system-ui,sans-serif;text-align:center";
      document.body.prepend(bandeau);
      // le bandeau défile avec la page (il ne cache plus le bouton retour ni la cible) ; ce petit repère reste visible en bas à gauche, sans bloquer le doigt
      const pt = document.createElement("div"); pt.id = "hors-ligne-pt"; pt.textContent = "📴"; pt.title = "Hors connexion";
      pt.style.cssText = "position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom, 0px));z-index:4;pointer-events:none;padding:4px 8px;border-radius:999px;background:#78350F;color:#fff;font:600 .85rem system-ui,sans-serif;opacity:.85";
      document.body.append(pt); bandeau._pt = pt;
    }
    bandeau.style.background = qui === "maintenance" ? "#1E3A8A" : "#78350F"; if (bandeau._pt) bandeau._pt.style.background = bandeau.style.background;
    if (qui === "maintenance") { bandeau.innerHTML = `<span>🛠 Mise à jour du carnet en cours : en attendant, tu es hors ligne. Tu vois tes dernières données, et ce que tu notes est gardé sur ce téléphone : ça partira tout seul à la fin de la mise à jour.</span>`; return; }
    bandeau.innerHTML = `<span>📴 Hors connexion : ${qui === "archer" ? "tu vois tes dernières données gardées sur ce téléphone. Ce que tu notes est gardé ici et partira dès que le réseau revient." : "tu travailles sur la copie gardée sur cet appareil. Tes modifications partiront dès que le réseau revient."}</span>${qui === "archer" ? `<button type="button" style="font:inherit;padding:4px 12px;border-radius:999px;border:1px solid #fff;background:transparent;color:#fff">Réessayer</button>` : ""}`;
    bandeau.querySelector("button")?.addEventListener("click", () => location.reload());
  }
  async function besoinReseau(msg) {
    await domReady();
    document.body.innerHTML = `<div style="max-width:420px;margin:40px auto;padding:20px;font:1rem/1.5 system-ui,sans-serif;color:#E5E7EB;text-align:center"><p style="font-size:2rem;margin:0">📴</p><p>${msg}</p><button type="button" onclick="location.reload()" style="font:inherit;font-weight:700;padding:10px 20px;border-radius:999px;border:0;background:#F59E0B;color:#111">Réessayer</button></div>`;
    document.body.style.background = "#0B0F19";
    return new Promise(() => {});
  }

  // ---------- Écran de connexion ----------
  let session = null;
  const domReady = () => new Promise((r) => (document.body ? r() : document.addEventListener("DOMContentLoaded", r, { once: true })));

  // ---------- V.1.7.3 : Samsung Internet ----------
  // Installer l'appli depuis Samsung Internet déclenche souvent une fausse alerte de Google Play Protect et l'installation échoue :
  // on propose d'ouvrir la même page dans Chrome. Rien ne s'affiche une fois l'appli installée.
  (async () => {
    const samsung = /SamsungBrowser/i.test(navigator.userAgent), installee = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
    let vu = null; try { vu = localStorage.getItem("carnet:samsung-vu"); } catch (e) {}
    if (!samsung || installee || vu) return;
    await domReady();
    const url = location.host + location.pathname + location.search;
    const chrome = `intent://${url}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent("https://play.google.com/store/apps/details?id=com.android.chrome")};end`;
    const el = document.createElement("div"); el.id = "samsung-chrome"; el.setAttribute("role", "note");
    el.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:70;max-width:520px;margin:0 auto;padding:14px 16px;border-radius:18px;background:#0F172A;color:#F3F4F6;border:1px solid #F59E0B;box-shadow:0 12px 40px rgba(0,0,0,.5);font:15px/1.45 system-ui,sans-serif";
    el.innerHTML = `<b style="display:block;margin-bottom:4px">Pour installer l'appli, utilise Chrome</b>
      <span>Depuis Samsung Internet, l'installation est souvent bloquée par une fausse alerte de sécurité. Ouvre cette page dans Chrome, puis menu ⋮ › « Installer l'appli ». Tu peux aussi continuer ici sans installer.</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><a href="${chrome}" style="flex:1;text-align:center;padding:10px 14px;border-radius:999px;background:#F59E0B;color:#0B0F19;font-weight:700;text-decoration:none">Ouvrir dans Chrome</a>
      <button type="button" style="padding:10px 14px;border-radius:999px;border:1px solid #475569;background:transparent;color:#F3F4F6;font:inherit">Plus tard</button></span>`;
    el.querySelector("button").onclick = () => { try { localStorage.setItem("carnet:samsung-vu", String(Date.now())); } catch (e) {} el.remove(); };
    document.body.appendChild(el);
  })();
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
    const cached = ls.get("uid", null);
    let r = null;
    try { r = await withTimeout(sb.auth.getSession(), 4000); } catch (e) { if (cached) return { user: { id: cached }, offline: true }; }
    if (r?.data?.session) return r.data.session;
    // session gardée mais impossible à renouveler faute de réseau : on reste sur l'appareil
    if (cached && (!navigator.onLine || (r?.error && netErr(r.error)))) return { user: { id: cached }, offline: true };
    if (!navigator.onLine) return besoinReseau("Pas de réseau. La première connexion au carnet a besoin d'internet.");
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
    flush().catch(() => {}); // enregistré sur l'appareil tout de suite ; l'envoi au serveur suit quand il peut
    return Promise.resolve();
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
  let rtOn = false;
  const startRealtime = () => { if (!rtOn) { rtOn = true; realtime(); } };
  async function reconnect() {
    if (ls.get("coach", true) === false) return; // espace archer : bouton « Réessayer »
    try {
      if (!session || session.offline) { const r = await withTimeout(sb.auth.getSession(), 5000); if (!r?.data?.session) return; session = r.data.session; sb.auth.onAuthStateChange((_e, s) => { if (s) { session = s; tellSW(); } }); tellSW(); }
      await withTimeout(flush(), 10000); await withTimeout(pull(), 10000); startRealtime(); horsLigne(false);
    } catch (e) { console.warn("toujours hors connexion", e); }
  }
  window.addEventListener("online", () => { reconnect(); });
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
  let filesOwner = null; // dossier des fichiers : celui de l'entraîneur (pour un archer, celui de son entraîneur)
  function tellSW() {
    if (!navigator.serviceWorker?.controller || !session || session.offline) return;
    navigator.serviceWorker.controller.postMessage({ type: "auth", url: CFG.supabaseUrl, key: CFG.supabaseAnonKey, token: session.access_token, uid: filesOwner || session.user.id });
  }
  navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "need-auth") tellSW(); });

  // ---------- Fiches Canva (V.1.9) : la fonction Supabase « canva » exporte les PDF et met à jour les documents ----------
  window.CARNET_CANVA = async (action, body = {}) => {
    if (!navigator.onLine || !session || session.offline) { const e = new Error("Il faut le réseau pour parler à Canva."); e.code = "reseau"; throw e; }
    const s = (await sb.auth.getSession()).data?.session || session;
    let r;
    try {
      r = await fetch(CFG.supabaseUrl + "/functions/v1/canva", { method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey, Authorization: "Bearer " + s.access_token }, body: JSON.stringify({ action, ...body }) });
    } catch (e) { const er = new Error("Canva ne répond pas : vérifie le réseau, ou que la fonction « canva » est bien installée dans Supabase."); er.code = "reseau"; throw er; }
    const d = await r.json().catch(() => ({}));
    if (r.status === 404 && !d.erreur) { const e = new Error("La fonction « canva » n'est pas encore installée dans Supabase."); e.code = "absente"; throw e; }
    if (!r.ok || d.erreur) { const e = new Error(d.message || "Erreur " + r.status); e.code = d.erreur || "erreur"; throw e; }
    if (["ajouter", "sync"].includes(action)) await pull().catch(() => {}); // les documents mis à jour par le serveur
    return d;
  };

  // ---------- Téléchargements ----------
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith(".json") ? "application/json" : "application/octet-stream" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    },
  };
  const user = { can: async () => true, isOwner: () => true, canEdit: () => true };

  // ---------- Accès des archers (côté entraîneur) ----------
  const rpc = async (fn, args) => { const r = await sb.rpc(fn, args); if (r.error) throw new Error(r.error.message); return r.data; };
  // Mode maintenance (V.1.7.7) : l'entraîneur met l'appli en pause pendant une mise à jour (script maintenance.sql)
  window.carnetMaintenance = { etat: () => rpc("etat_maintenance"), basculer: (on) => rpc("basculer_maintenance", { p_actif: !!on }) };
  window.carnetAcces = {
    inviter: (archerId) => rpc("creer_invitation", { p_archer: archerId }),
    liste: (archerId) => rpc("acces_archer", { p_archer: archerId }),
    retirer: (userId, archerId) => rpc("retirer_acces", { p_user: userId, p_archer: archerId }),
    tous: () => rpc("acces_tous"),
    // V.1.9 : l'entraîneur qui est aussi archer relie sa propre fiche à son compte, puis passe d'un mode à l'autre sur le même appareil
    moi: () => rpc("mes_acces"),
    relierMoi: async (archerId) => { const c = await rpc("creer_invitation", { p_archer: archerId }); await rpc("utiliser_invitation", { p_code: c }); return rpc("mes_acces"); },
    basculer: (mode) => { ls.set("mode", mode); location.reload(); },
  };

  // ---------- Espace archer ----------
  async function codeScreen(msg = "") {
    await domReady();
    return new Promise((resolve) => {
      const el = document.createElement("div"); el.id = "login";
      el.innerHTML = `<form class="sheet" style="position:fixed;inset:auto 0 0 0;margin:auto;top:0;height:fit-content;max-width:420px;border-radius:24px;z-index:50">
        <h3>Ton espace archer</h3>
        <p class="notice">Tape le code d'invitation donné par ton entraîneur.${msg ? "<br><b>" + msg + "</b>" : ""}</p>
        <label class="f">Code d'invitation<input type="text" name="code" required autocomplete="off" style="text-transform:uppercase;letter-spacing:.15em;font-size:1.3rem"></label>
        <div class="acts"><button type="button" class="btn" id="cd-out">Se déconnecter</button><button class="btn primary">Valider</button></div>
        <span class="tirline" id="cd-msg"></span></form>`;
      document.body.appendChild(el);
      const f = el.querySelector("form"), m = el.querySelector("#cd-msg");
      el.querySelector("#cd-out").onclick = () => window.carnetLogout();
      f.addEventListener("submit", async (e) => {
        e.preventDefault(); m.textContent = "…";
        try { await rpc("utiliser_invitation", { p_code: f.code.value }); el.remove(); resolve(); }
        catch (err) { m.textContent = /invalide/.test(err.message) ? "Code invalide ou déjà utilisé" : err.message; }
      });
    });
  }
  async function archerMode(net = true, coach = false, maint = false) {
    let list = null;
    if (net) { try { list = await withTimeout(rpc("mes_acces")); ls.set("ar-acces", list); } catch (e) { if (!netErr(e)) throw e; } }
    if (!list) list = ls.get("ar-acces", null);
    if (!list || (!list.length && !net)) return besoinReseau("Pas de réseau. Ton espace archer a besoin d'internet la première fois ; ensuite il reste consultable sans réseau.");
    if (!list.length && coach) { ls.set("mode", "coach"); location.reload(); return new Promise(() => {}); }
    if (!list.length) { await codeScreen(); list = await rpc("mes_acces"); ls.set("ar-acces", list); }
    await domReady();
    window.carnetArcherAPI = {
      list,
      charger: async (a) => {
        const d = await rpc("espace_archer", { p_owner: a.owner, p_archer: a.archer_id });
        // Animations ouvertes aux archers (V.1.9, script 9) : si le script n'est pas encore installé, l'onglet reste simplement caché
        try { if (d) d.animations = await rpc("archer_animations", { p_owner: a.owner, p_archer: a.archer_id }); } catch (e) { if (d) d.animations = []; }
        // Thèmes de fête (V.1.9, script 9) : si l'espace ne les donne pas encore (avant le script 6), on les demande à part
        try { if (d && !(d.reglagesEspace && "fetes" in d.reglagesEspace)) { const f = await rpc("archer_fetes", { p_owner: a.owner, p_archer: a.archer_id }); if (f) d.reglagesEspace = { ...(d.reglagesEspace || {}), ...f }; } } catch (e) {}
        return d;
      },
      ecrire: (a, id, data) => rpc("archer_ecrire_entree", { p_owner: a.owner, p_archer: a.archer_id, p_id: id, p_data: data }),
      supprimer: (a, id) => rpc("archer_supprimer_entree", { p_owner: a.owner, p_archer: a.archer_id, p_id: id }),
      repondre: (a, seance, reponse) => rpc("archer_repondre", { p_owner: a.owner, p_archer: a.archer_id, p_seance: seance, p_reponse: reponse }),
      mot: (a, id, action, texte) => rpc("archer_mot", { p_owner: a.owner, p_archer: a.archer_id, p_id: id, p_action: action, p_texte: texte || "" }),
      animEssai: (a, anim, jeu, essai, cible, compte) => rpc("archer_anim_essai", { p_owner: a.owner, p_archer: a.archer_id, p_anim: anim, p_jeu: jeu, p_essai: essai, p_cible: cible, p_compte: compte }),
      avatar: (a, v) => rpc("archer_avatar", { p_owner: a.owner, p_archer: a.archer_id, p_avatar: v }),
      fichiers: (a) => { filesOwner = a.owner; tellSW(); },
      ajouterCode: async (code) => { await rpc("utiliser_invitation", { p_code: code }); return rpc("mes_acces"); },
      deconnexion: () => window.carnetLogout(),
      ...(coach ? { versCoach: () => { try { sessionStorage.removeItem("apercu-maint"); } catch (e) { /* rien */ } ls.set("mode", "coach"); location.reload(); } } : {}),
    };
    // V.1.7.1 : l'espace archer est gardé sur le téléphone pour être consulté sans réseau ; les envois disent clairement quand le réseau manque
    const API = window.carnetArcherAPI, envoi = (f) => async (...a) => { try { return await withTimeout(f(...a), 12000); } catch (e) { throw netErr(e) ? new Error("pas de réseau, réessaie quand tu auras internet") : e; } };
    const lire = API.charger;
    API.charger = async (a) => {
      const k = `ar-espace:${a.owner}:${a.archer_id}`;
      try { const d = await withTimeout(lire(a), net ? 8000 : 2500); ls.set(k, d); horsLigne(false); return d; }
      catch (e) { const d = ls.get(k, null); if (d) { horsLigne(true, "archer"); return d; } throw netErr(e) ? new Error("Pas de réseau. Ouvre ton espace une fois avec internet : il sera ensuite gardé sur ce téléphone.") : e; }
    };
    ["ecrire", "supprimer", "repondre", "avatar", "mot", "ajouterCode"].forEach((n) => { if (API[n]) API[n] = envoi(API[n]); });
    // Hors connexion : une séance ou un tir noté sans réseau est gardé sur le téléphone, apparaît tout de suite dans le carnet, et part tout seul dès que le réseau revient
    const ecrireNet = API.ecrire, chargerNet = API.charger, kAtt = "ar-attente";
    const fusion = (a, d) => { if (!d || !Array.isArray(d.entrees)) return d; Object.values(ls.get(kAtt, {})).filter((w) => w.a.owner === a.owner && w.a.archer_id === a.archer_id).forEach((w) => { const i = d.entrees.findIndex((x) => x.id === w.id), e = { ...(i >= 0 ? d.entrees[i] : {}), ...w.data, id: w.id }; if (i >= 0) d.entrees[i] = e; else d.entrees.push(e); }); return d; };
    let envoiEnCours = false;
    async function viderAttente() {
      if (maint || envoiEnCours || !Object.keys(ls.get(kAtt, {})).length) return; envoiEnCours = true;
      try { for (const [cle, w] of Object.entries(ls.get(kAtt, {}))) { await ecrireNet(w.a, w.id, w.data); const r = ls.get(kAtt, {}); delete r[cle]; ls.set(kAtt, r); } }
      catch (e) { console.warn("envoi en attente : réessai au retour du réseau", e); } finally { envoiEnCours = false; }
    }
    const garder = (a, id, data) => {
      const att = ls.get(kAtt, {}); att[`${a.owner}:${a.archer_id}:${id}`] = { a: { owner: a.owner, archer_id: a.archer_id }, id, data, at: Date.now() }; ls.set(kAtt, att);
      const k = `ar-espace:${a.owner}:${a.archer_id}`, d = ls.get(k, null); if (d) ls.set(k, fusion(a, d));
      return { enAttente: true };
    };
    API.ecrire = async (a, id, data) => {
      if (maint) return garder(a, id, data);
      try { const r = await ecrireNet(a, id, data); viderAttente(); return r; }
      catch (e) {
        if (!/pas de réseau/.test(e.message)) throw e;
        horsLigne(true, "archer"); return garder(a, id, data);
      }
    };
    API.charger = async (a) => { const d = fusion(a, await chargerNet(a)); viderAttente(); return d; };
    API.enAttente = () => Object.keys(ls.get(kAtt, {})).length;
    addEventListener("online", () => viderAttente());
    if (maint) {
      // Mode maintenance : l'espace s'ouvre hors connexion sur la copie du téléphone ; l'appli regarde chaque minute si la mise à jour est finie
      API.charger = async (a) => { let d = ls.get(`ar-espace:${a.owner}:${a.archer_id}`, null); if (!d && coach) d = await chargerNet(a).catch(() => null); if (!d) return besoinReseau("Le carnet est en cours de mise à jour. Reviens dans un petit moment."); horsLigne(true, "maintenance"); return fusion(a, d); };
      // aperçu de l'entraîneur : on reste en maintenance jusqu'au retour en mode entraîneur
      if (coach) setTimeout(() => { const t = document.querySelector("#toast"); if (t) { t.textContent = "Aperçu : voici ce que voient tes archers pendant la maintenance"; t.hidden = false; setTimeout(() => (t.hidden = true), 4000); } }, 1500);
      else { const veille = setInterval(async () => { try { const e = await withTimeout(rpc("etat_maintenance"), 6000); if (!e?.actif) { clearInterval(veille); location.reload(); } } catch (err) { /* pas de réseau : on réessaie dans une minute */ } }, 60000); }
    }
    window.CarnetArcherUI(window.carnetArcherAPI);
    return new Promise(() => {}); // l'application de l'entraîneur ne démarre pas
  }

  // ---------- Démarrage ----------
  const ready = (async () => {
    session = await ensureSession();
    ls.set("uid", session.user.id);
    let coach = ls.get("coach", null), net = !session.offline;
    if (net) {
      try { coach = await withTimeout(rpc("est_coach"), 4000); ls.set("coach", coach); } catch (e) { console.warn(e); if (netErr(e)) net = false; }
    }
    if (coach === null && !net) return besoinReseau("Pas de réseau. La première ouverture du carnet a besoin d'internet.");
    if (coach === false) { if (!session.offline) sb.auth.onAuthStateChange((_e, s) => { if (s) { session = s; tellSW(); } }); let maint = false; if (net) { try { maint = !!(await withTimeout(rpc("etat_maintenance"), 4000))?.actif; } catch (e) { /* script pas encore installé ou pas de réseau */ } } return archerMode(net, false, maint); }
    // entraîneur qui a choisi son espace archer (Paramètres › Général › Mon espace archer) ; adresse ?mode=coach = retour forcé en entraîneur
    if (/[?&]mode=coach\b/.test(location.search)) { ls.set("mode", "coach"); history.replaceState(null, "", location.pathname + location.hash); }
    if (ls.get("mode", "coach") === "archer") { if (!session.offline) sb.auth.onAuthStateChange((_e, s) => { if (s) { session = s; tellSW(); } }); let apercu = false; try { apercu = sessionStorage.getItem("apercu-maint") === "1"; } catch (e) { /* rien */ } return archerMode(net, true, apercu); }
    if (!session.offline) {
      sb.auth.onAuthStateChange((_e, s) => { if (s) { session = s; tellSW(); } });
      tellSW();
    }
    if (net) {
      // on attend la mise à jour quelques secondes au plus ; si elle traîne, elle continue en arrière-plan
      try { await withTimeout(flush(), 8000); await withTimeout(pull(), 8000); startRealtime(); }
      catch (e) { console.warn("hors connexion : copie locale", e); online = false; horsLigne(true); pull().then(() => { startRealtime(); horsLigne(false); }).catch(() => {}); }
    } else horsLigne(true);
  })();
  window.carnetLogout = async () => { try { await flush(); } catch (e) {} if (Object.keys(pending).length && !confirm("Des modifications ne sont pas encore envoyées (pas de réseau). Se déconnecter quand même ?")) return; await sb.auth.signOut(); ["cache", "uid", "coach", "pending", "mode", "ar-acces"].forEach((k) => localStorage.removeItem(LSK(k))); location.reload(); };
  window.claude = {
    use: async (name) => {
      await ready;
      return { db, assets: session.offline ? null : assets, downloads, user, sample: null }[name] ?? null;
    },
  };
})();
