// Espace archer : l'archer (ou son parent) voit uniquement ses propres informations,
// telles que les renvoie la base (fonction espace_archer), et remplit son carnet.
(() => {
  const API = window.carnetArcherAPI;
  const VOL = [["paille", "Paille"], ["visuel", "Visuel"], ["blason", "Blason"], ["compte", "Tir compté"], ["compet", "Compét"], ["autre", "Autre"]];
  const EMOTIONS = ["Fierté", "Satisfaction", "Soulagement", "Espoir", "Tristesse", "Déception", "Honte", "Colère"];
  const TYPES = { salle: "Salle", exterieur: "Extérieur", ufolarc_court: "Ufolarc court", ufolarc_long: "Ufolarc long", safari: "Safari", campagne: "Campagne", "3d": "3D", nature: "Nature" };
  // Grille d'évaluation technique (identique à celle de l'entraîneur)
  const GRILLE = [
    ["Posture", [
      ["Pieds", ["Écartement dans l'alignement du bassin", "Parallèles à la ligne"]],
      ["Jambes", ["Tendues et relâchées"]],
      ["Bassin", ["Perpendiculaire à la ligne de tir"]],
      ["Tronc", ["Gainé avec abaissement du sternum"]],
      ["Épaules", ["Position basse, horizontales"]],
      ["Tête", ["Dans le prolongement de la colonne, rotation sans inclinaison"]],
      ["Axe vertical", ["Pieds, hanches, épaules alignés verticalement", "Le regard reste sur la cible du début à la fin", "Chercher à se grandir"]],
      ["Bloc avant", ["Stable"]],
    ]],
    ["Placement avant", [
      ["Prise d'arc", ["45°", "Gras du pouce qui épouse le grip", "Relâchement du poignet sur la main", "Utilisation d'une dragonne"]],
      ["Bras d'arc", ["Tendu et relâché", "Coude tourné vers l'extérieur"]],
    ]],
    ["Placement arrière", [
      ["Prise de corde", ["Franche à 3 doigts", "Dans le pli de la première phalange", "Main relâchée", "Dos de la main de corde plat", "Utilisation d'une palette"]],
      ["Alignement", ["Main de corde / poignée / avant-bras", "Coude de corde dans le plan de l'arc"]],
      ["Contact", ["Sous la mâchoire", "Corde sur le nez", "Contre le cou", "Tir régulier (6″ : 3″/3″)"]],
    ]],
    ["Mouvement", [
      ["Orientation", ["Axe vertical", "Plan d'arc vertical"]],
      ["Mise en tension", ["Du haut vers le bas, proche de la ligne des épaules", "Traction continue vers le visage", "Viseur dans le visuel à l'arrivée du contact visage", "Omoplate de l'épaule de corde en position basse", "Équilibre des forces"]],
      ["Libération", ["Relâchement des fléchisseurs", "Dans le plan de l'arc", "Par une augmentation de l'effort des muscles du dos", "Maintien 2″ après le lâcher"]],
      ["Timing", ["Rythme de tir soutenu et régulier : 2 min 30 / 6 flèches, 1 min 15 / 3 flèches"]],
    ]],
  ];
  const PRIO = {
    s0e0c0: "v", s0e0c1: "v", s0e1c0: "v", s0e2c0: "v", s0e3c0: "v", s0e4c0: "v", s0e5c0: "b", s0e6c0: "v", s0e6c1: "b", s0e6c2: "b", s0e7c0: "r",
    s1e0c2: "r", s1e1c0: "r", s1e1c1: "r",
    s2e0c0: "b", s2e0c1: "b", s2e0c2: "r", s2e1c1: "b", s2e2c3: "v",
    s3e1c0: "b", s3e1c1: "b", s3e1c2: "v", s3e1c3: "r", s3e1c4: "r", s3e2c2: "v", s3e3c0: "b",
  };
  const NIV = ["À travailler", "En cours", "Acquis"];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dObj = (iso) => new Date(iso + "T12:00:00");
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fmtLong = (iso) => dObj(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const saisonOf = (iso) => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 9 ? y + 1 : y; };
  const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
  const volOf = (e, k) => (Number(e[k]) || 0) + (Number(e.auto?.[k]) || 0);
  const vol = (e) => VOL.reduce((n, [k]) => n + volOf(e, k), 0);
  const $ = (q) => document.querySelector(q);
  const toast = (m) => { const t = $("#toast"); if (!t) return; t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2400); };

  const St = { list: API.list, cur: 0, data: null, tab: "carnet", saison: saisonOf(today()), err: "" };
  const who = () => St.list[St.cur];
  const name = (a) => `${a.prenom || ""} ${a.nom || ""}`.trim() || "Archer";

  // On remplace l'interface de l'entraîneur par l'espace archer
  document.querySelector("header.top")?.setAttribute("hidden", "");
  document.querySelector("#fab")?.setAttribute("hidden", "");
  const main = document.querySelector("main");
  const top = document.createElement("header"); top.className = "top"; document.body.insertBefore(top, main);
  const view = $("#view");

  async function load() {
    St.err = ""; St.data = null; render();
    try { API.fichiers(who()); St.data = await API.charger(who()); }
    catch (e) { console.error(e); St.err = "Impossible de charger ton espace. Vérifie ta connexion."; }
    render();
  }
  function header() {
    const tabs = [["carnet", "Mon carnet"], ["concours", "Mes concours"], ["exercices", "Mes exercices"], ["evaluations", "Évaluations"]];
    top.innerHTML = `<div class="top-in"><div class="brand"><span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/></svg></span>
      <h1>Espace <em>${esc(St.data?.archer ? name(St.data.archer) : name(who()))}</em></h1><span class="sub"><button class="btn ghost" id="ar-out">Se déconnecter</button></span></div>
      <nav class="tabs" role="tablist">${tabs.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${St.tab === k}" data-atab="${k}">${l}</button>`).join("")}</nav></div>`;
  }
  function render() {
    header();
    let h = "";
    if (St.list.length > 1) h += `<div class="chips" role="group" aria-label="Archer">${St.list.map((a, i) => `<button class="chip" data-who="${i}" aria-pressed="${i === St.cur}">${esc(name(a))}</button>`).join("")}<button class="chip" data-act="add-code">+ Code</button></div>`;
    else h += `<div class="bar"><span class="grow"></span><button class="btn ghost" data-act="add-code">J'ai un autre code (frère, sœur…)</button></div>`;
    if (St.err) h += `<p class="notice">${esc(St.err)}</p><button class="btn" data-act="reload">Réessayer</button>`;
    else if (!St.data) h += `<p class="notice">Chargement…</p>`;
    else h += { carnet: vCarnet, concours: vConcours, exercices: vExos, evaluations: vEvals }[St.tab]();
    view.innerHTML = h;
  }
  // ---------- Carnet ----------
  function vCarnet() {
    const end = St.saison, key = `${end - 1}-${end}`;
    const list = St.data.entrees.filter((e) => e.date && saisonOf(e.date) === end).sort((a, b) => b.date.localeCompare(a.date));
    const tot = VOL.map(([k, l]) => [l, list.reduce((n, e) => n + volOf(e, k), 0)]), all = tot.reduce((n, [, v]) => n + v, 0);
    const notes = list.map((e) => num(e.note)).filter((v) => v != null), moy = notes.length ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1).replace(".", ",") : "—";
    const c = St.data.carnets.find((x) => x.saison === key), o = c?.objectifs || {};
    let h = `<div class="bar"><button class="btn" data-saison="-1" aria-label="Saison précédente">‹</button><b>Saison ${end - 1}-${end}</b><button class="btn" data-saison="1" aria-label="Saison suivante">›</button><span class="grow"></span><button class="btn primary" data-act="new">+ Noter une séance</button></div>
      <div class="hub-stats"><div class="hub-stat"><div class="hub-stat-top"><span>Flèches de la saison</span></div><b class="c-gold">${all.toLocaleString("fr-FR")}</b><small>${tot.filter(([, v]) => v).map(([l, v]) => `${l} ${v}`).join(" · ") || "aucune pour l'instant"}</small></div>
      <div class="hub-stat"><div class="hub-stat-top"><span>Séances notées</span></div><b class="c-cyan">${list.length}</b><small>ressenti moyen ${moy} / 10</small></div></div>`;
    if (o.processus || o.classement || o.score) h += `<div class="card"><h3 class="hub-h">Mes objectifs de la saison</h3>${[["processus", "Processus"], ["classement", "Classement"], ["score", "Score"]].filter(([k]) => o[k]).map(([k, l]) => `<div class="eq-l"><span>${l}</span><b>${esc(o[k])}</b></div>`).join("")}</div>`;
    h += list.length ? `<div class="list">${list.map((e) => `<button class="row" data-entry="${esc(e.id)}"><span class="date"><span class="d">${dObj(e.date).getDate()}</span><span class="mo">${dObj(e.date).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</span></span>
      <span class="main"><span class="t">${esc(e.objectif || (e.concoursId ? "Concours" : "Séance"))}</span><span class="m">${[vol(e) ? vol(e) + " flèches" : "", e.emotion || "", e.seanceId ? "séance du club" : e.concoursId ? "concours" : "noté par moi"].filter(Boolean).map(esc).join(" · ")}</span>${e.commentaire ? `<span class="m">${esc(e.commentaire.slice(0, 100))}</span>` : ""}</span>
      <span class="count">${num(e.note) != null ? `${e.note}<small>/10</small>` : ""}</span></button>`).join("")}</div>` : `<p class="notice">Rien de noté cette saison. « Noter une séance » ajoute une ligne à ton carnet : ton entraîneur la verra.</p>`;
    return h;
  }
  function formEntry(e = null) {
    const d = e || { date: today() }, el = $("#sheet");
    el.innerHTML = `<div class="sheet-bg" data-close><form class="sheet" id="ar-form"><h3>${e ? "Ma séance" : "Noter une séance"}</h3>
      <div class="grid2"><label class="f">Date<input type="date" name="date" required value="${esc(d.date)}" ${e?.seanceId || e?.concoursId ? "readonly" : ""}></label><label class="f">Objectif<input type="text" name="objectif" value="${esc(d.objectif)}"></label></div>
      <div class="f">Flèches tirées<div class="grid5">${VOL.map(([k, l]) => `<label class="f" style="font-weight:500">${l}<input type="number" inputmode="numeric" min="0" name="${k}" value="${esc(d[k])}" placeholder="${d.auto?.[k] ? "+" + d.auto[k] : "0"}"></label>`).join("")}</div>${e?.auto ? `<span class="tirline">Les chiffres grisés viennent des feuilles de marque de ton entraîneur.</span>` : ""}</div>
      <div class="grid2"><label class="f">Score tir compté<input type="number" inputmode="numeric" min="0" name="scoreCompte" value="${esc(d.scoreCompte)}"></label><label class="f">Score compétition<input type="number" inputmode="numeric" min="0" name="scoreCompet" value="${esc(d.scoreCompet)}"></label></div>
      <div class="f">Objectif atteint<div class="radio">${[["", "Je ne sais pas"], ["O", "Oui"], ["N", "Non"]].map(([v, l]) => `<label><input type="radio" name="atteint" value="${v}" ${(d.atteint || "") === v ? "checked" : ""}> ${l}</label>`).join("")}</div></div>
      <div class="grid2"><label class="f">Ressenti (0 à 10)<select name="note"><option value="">—</option>${Array.from({ length: 11 }, (_, i) => `<option ${String(d.note ?? "") === String(i) ? "selected" : ""}>${i}</option>`).join("")}</select></label>
        <label class="f">Émotion<select name="emotion"><option value="">—</option>${EMOTIONS.map((x) => `<option ${d.emotion === x ? "selected" : ""}>${x}</option>`).join("")}</select></label></div>
      <label class="f">Mes commentaires<textarea name="commentaire">${esc(d.commentaire)}</textarea></label>
      <div class="acts">${e && String(e.id).startsWith("a_") ? `<button type="button" class="btn danger left" id="ar-del">Supprimer</button>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form></div>`;
    el.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", (ev) => { if (ev.target === b) el.innerHTML = ""; }));
    const del = $("#ar-del");
    if (del) del.onclick = async () => { if (!del.dataset.ok) { del.dataset.ok = 1; del.textContent = "Confirmer"; return; } try { await API.supprimer(who(), e.id); el.innerHTML = ""; toast("Séance supprimée"); load(); } catch (err) { toast(err.message); } };
    $("#ar-form").addEventListener("submit", async (ev) => {
      ev.preventDefault(); const fd = new FormData(ev.target), date = fd.get("date"); if (!date) return;
      const data = { date, saison: `${saisonOf(date) - 1}-${saisonOf(date)}` };
      ["objectif", "atteint", "note", "emotion", "commentaire", "scoreCompte", "scoreCompet", ...VOL.map(([k]) => k)].forEach((k) => (data[k] = String(fd.get(k) ?? "").trim()));
      const id = e?.id || "a_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      try { await API.ecrire(who(), id, data); el.innerHTML = ""; toast("Enregistré dans ton carnet"); St.saison = saisonOf(date); load(); } catch (err) { toast("Enregistrement impossible : " + err.message); }
    });
  }
  // ---------- Concours ----------
  function vConcours() {
    const t = today(), list = St.data.concours.slice().sort((a, b) => b.date.localeCompare(a.date));
    if (!list.length) return `<p class="notice">Tu n'es inscrit à aucun concours pour l'instant.</p>`;
    const up = list.filter((c) => (c.dateFin || c.date) >= t).reverse(), past = list.filter((c) => (c.dateFin || c.date) < t);
    const row = (c) => { const r = c.resultat || {}; return `<div class="row"><span class="date"><span class="d">${dObj(c.date).getDate()}</span><span class="mo">${dObj(c.date).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</span></span>
      <span class="main"><span class="t">${esc(c.nom || c.lieu || "Concours")}</span><span class="m">${[(c.types || []).map((x) => TYPES[x] || x).join(", "), c.federation, r.distance ? r.distance + " m" : "", r.blason, r.place ? "place " + r.place : ""].filter(Boolean).map(esc).join(" · ")}</span></span>
      <span class="count">${num(r.score) != null ? `${esc(r.score)}<small> pts</small>` : "<small>à venir</small>"}</span></div>
      ${(c.classements || []).length ? `<div class="bar" style="margin:-4px 0 4px 66px;gap:6px">${c.classements.map((k) => `<a class="btn" href="_blob/${esc(k.assetId)}" target="_blank" rel="noopener">Classement PDF${c.classements.length > 1 ? " · " + esc(k.nom || "") : ""}</a>`).join("")}</div>` : ""}`; };
    let h = "";
    if (up.length) h += `<h2 class="sec">À venir</h2><div class="list">${up.map(row).join("")}</div>`;
    const seasons = [...new Set(past.map((c) => saisonOf(c.date)))];
    seasons.forEach((z) => { h += `<div class="sz-head"><b>Saison ${z - 1}-${z}</b><span>${past.filter((c) => saisonOf(c.date) === z && num(c.resultat?.score) != null).length} concours</span></div><div class="list">${past.filter((c) => saisonOf(c.date) === z).map(row).join("")}</div>`; });
    return h;
  }
  // ---------- Exercices ----------
  function vExos() {
    const list = St.data.exercices.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
    if (!list.length) return `<p class="notice">Ton entraîneur ne t'a pas encore partagé de fiche d'exercice.</p>`;
    return `<div class="list">${list.map((x) => { const d = x.document;
      return `<div class="row"><span class="thumb">${d && (d.contentType || "").startsWith("image/") ? "IMG" : "PDF"}</span><span class="main"><span class="t">${esc(d ? d.titre || d.nomFichier : "Fiche retirée")}${x.fait ? ' <span class="tag">fait</span>' : ""}</span>
        <span class="m">${[x.date ? "pour le " + fmtLong(x.date) : "", x.remarque].filter(Boolean).map(esc).join(" · ")}</span>${d?.description ? `<span class="m">${esc(d.description.slice(0, 140))}</span>` : ""}</span>
        ${d ? `<a class="btn" href="_blob/${esc(d.assetId)}" target="_blank" rel="noopener">Ouvrir</a>` : ""}</div>`; }).join("")}</div>`;
  }
  // ---------- Évaluations ----------
  function vEvals() {
    const list = St.data.evaluations.slice().sort((a, b) => b.date.localeCompare(a.date));
    if (!list.length) return `<p class="notice">Aucune évaluation technique partagée pour l'instant.</p>`;
    const sel = list.find((e) => e.id === St.evalId) || list[0], prev = list.find((e) => e.date < sel.date);
    const n = sel.notes || {}, pn = prev?.notes || {}, vals = Object.values(n);
    const cnt = (x) => vals.filter((v) => v === x).length;
    let h = list.length > 1 ? `<div class="chips" role="group" aria-label="Évaluation">${list.map((e) => `<button class="chip" data-eval="${esc(e.id)}" aria-pressed="${e.id === sel.id}">${esc(dObj(e.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }))}</button>`).join("")}</div>` : "";
    h += `<div class="card"><b style="font-size:1.1rem">Évaluation du ${esc(fmtLong(sel.date))}</b>
      <span class="legend"><span><i class="s-ac"></i>${cnt(2)} acquis</span><span><i class="s-ec"></i>${cnt(1)} en cours</span><span><i class="s-na"></i>${cnt(0)} à travailler</span></span>
      ${prev ? `<span class="tirline">Les flèches comparent avec l'évaluation du ${esc(dObj(prev.date).toLocaleDateString("fr-FR"))}.</span>` : ""}
      ${sel.observation ? `<div class="f">Le mot de ton entraîneur<p class="prev" style="color:var(--ink)">${esc(sel.observation)}</p></div>` : ""}</div>`;
    h += GRILLE.map(([sec, els], i) => `<h2 class="sec">${esc(sec)}</h2><div class="card">${els.map(([el, cs], j) => `<div class="el"><h4>${esc(el)}</h4>${cs.map((c, k) => {
      const key = `s${i}e${j}c${k}`, v = n[key], pv = pn[key], p = PRIO[key] || "n";
      const evo = v == null || pv == null || v === pv ? "" : v > pv ? ' <b style="color:var(--ok)">▲</b>' : ' <b style="color:var(--danger)">▼</b>';
      const badge = v == null ? `<span class="tag">non évalué</span>` : `<span class="tag" style="background:${v === 2 ? "color-mix(in srgb, var(--ok) 20%, transparent);color:var(--ok)" : v === 1 ? "color-mix(in srgb, var(--accent) 20%, transparent);color:var(--accent)" : "color-mix(in srgb, var(--danger) 18%, transparent);color:var(--danger)"}">${NIV[v]}</span>`;
      return `<div class="crit p-${p}"><span class="lbl">${esc(c)}</span>${badge}${evo}</div>`;
    }).join("")}</div>`).join("")}</div>`).join("");
    return h;
  }
  // ---------- Événements ----------
  document.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-atab],[data-who],[data-act],[data-saison],[data-entry],[data-eval],#ar-out"); if (!t || t.closest("#sheet")) return;
    if (t.id === "ar-out") return API.deconnexion();
    if (t.dataset.atab) { St.tab = t.dataset.atab; render(); return; }
    if (t.dataset.eval) { St.evalId = t.dataset.eval; render(); return; }
    if (t.dataset.who) { St.cur = +t.dataset.who; load(); return; }
    if (t.dataset.saison) { St.saison += +t.dataset.saison; render(); return; }
    if (t.dataset.entry) { formEntry(St.data.entrees.find((e) => e.id === t.dataset.entry)); return; }
    if (t.dataset.act === "new") { formEntry(); return; }
    if (t.dataset.act === "reload") { load(); return; }
    if (t.dataset.act === "add-code") {
      const code = prompt("Code d'invitation (pour suivre un autre archer)"); if (!code) return;
      try { St.list = await API.ajouterCode(code); St.cur = St.list.length - 1; load(); } catch (e) { toast("Code invalide ou déjà utilisé"); }
    }
  }, true);
  load();
})();
