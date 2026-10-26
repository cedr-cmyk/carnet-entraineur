// Espace archer : l'archer (ou son parent) voit uniquement ses propres informations,
// telles que les renvoie la base (fonction espace_archer), et remplit son carnet.
// window.CarnetArcherUI(API, { preview }) : preview = aperçu ouvert par l'entraîneur, en lecture seule.
window.CarnetArcherUI = (API, opts = {}) => {
  const PREVIEW = !!opts.preview && !opts.testWrite, TESTW = !!opts.testWrite, BLOB = window.CARNET_BLOB_BASE || "/_blob/";
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

  const St = { list: API.list, cur: 0, data: null, tab: "accueil", saison: saisonOf(today()), err: "" };
  const who = () => St.list[St.cur];
  const name = (a) => `${a.prenom || ""} ${a.nom || ""}`.trim() || "Archer";

  // Espace archer : remplace l'interface de l'entraîneur ; aperçu : s'ouvre par-dessus, en plein écran
  const root = document.createElement("div"); root.className = "ar-root" + (PREVIEW || TESTW ? " ar-preview" : "");
  root.innerHTML = `${PREVIEW ? `<div class="test-band ar-band" role="note">Aperçu : voici exactement ce que voit l'archer dans son espace (lecture seule) <button class="btn" data-act="close-preview">Fermer l'aperçu</button></div>`
    : TESTW ? `<div class="test-band ar-band" role="note">Archer de test : tu agis comme l'archer, ce que tu enregistres va dans la version de test <button class="btn" data-act="close-preview">Revenir à l'entraîneur</button></div>` : ""}<header class="top"></header><main><div class="wrap"></div></main>`;
  if (!PREVIEW && !TESTW) { document.querySelector("header.top")?.setAttribute("hidden", ""); document.querySelector("#fab")?.setAttribute("hidden", ""); document.querySelector("main")?.setAttribute("hidden", ""); }
  document.body.appendChild(root);
  const top = root.querySelector("header.top"), view = root.querySelector(".wrap");

  async function load() {
    St.err = ""; St.data = null; render();
    try { API.fichiers(who()); St.data = await API.charger(who()); }
    catch (e) { console.error(e); St.err = "Impossible de charger ton espace. Vérifie ta connexion."; }
    render();
  }
  function header() {
    const tabs = [["accueil", "Accueil"], ["carnet", "Mon carnet"], ["concours", "Mes concours"], ["documents", "Documents"], ["evaluations", "Évaluations"], ["parametres", "Paramètres"]];
    top.innerHTML = `<div class="top-in"><div class="brand">${window.CarnetAvatar && St.data?.archer ? "" : `<span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/></svg></span>`}
      ${window.CarnetAvatar && St.data?.archer ? window.CarnetAvatar.svg(St.data.archer, 40) : ""}
      <h1>Espace <em>${esc(St.data?.archer ? name(St.data.archer) : name(who()))}</em></h1><span class="sub">${PREVIEW || TESTW ? "" : `<button class="btn ghost" id="ar-out">Se déconnecter</button>`}</span></div>
      <nav class="tabs" role="tablist">${tabs.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${St.tab === k}" data-atab="${k}">${l}</button>`).join("")}</nav></div>`;
  }
  function render() {
    header();
    let h = "";
    if (PREVIEW || TESTW) h += "";
    else if (St.list.length > 1) h += `<div class="chips" role="group" aria-label="Archer">${St.list.map((a, i) => `<button class="chip" data-who="${i}" aria-pressed="${i === St.cur}">${esc(name(a))}</button>`).join("")}<button class="chip" data-act="add-code">+ Code</button></div>`;
    else h += `<div class="bar"><span class="grow"></span><button class="btn ghost" data-act="add-code">J'ai un autre code (frère, sœur…)</button></div>`;
    if (St.err) h += `<p class="notice">${esc(St.err)}</p><button class="btn" data-act="reload">Réessayer</button>`;
    else if (!St.data) h += `<p class="notice">Chargement…</p>`;
    else h += ({ accueil: vAccueil, carnet: vCarnet, concours: vConcours, documents: vDocs, evaluations: vEvals, parametres: vParams }[St.tab] || vAccueil)();
    view.innerHTML = h;
  }
  // Réglages du chrono de l'archer : gardés sur son appareil
  const LSK = "carnet-chronos";
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } };
  // Préférences de l'archer, gardées sur cet appareil (une par archer suivi : frère, sœur…)
  const prefKey = () => "carnet-ar-prefs-" + (who()?.archer_id || "");
  const prefs = () => lsGet(prefKey(), {});
  const setPref = (k, v) => { const p = prefs(); if (v === "" || v == null) delete p[k]; else p[k] = v; lsSet(prefKey(), p); };
  const chronoStore = { list: () => lsGet(LSK, []), save: (l) => lsSet(LSK, l), last: () => lsGet(LSK + "-dernier", ""), setLast: (n) => lsSet(LSK + "-dernier", n) };
  // ---------- Accueil : infos du club et entraînements proposés ----------
  const ENC = () => ["encadrant", "les-deux"].includes(St.data.archer?.role);
  const clubNom = (id) => (St.data.clubs || []).find((c) => c.id === id)?.nom || "";
  function vAccueil() {
    const ann = (St.data.annonces || []).slice().sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0) || (b.date || "").localeCompare(a.date || ""));
    const ent = St.data.entrainements, prenom = St.data.archer?.prenom || "";
    const mots = St.data.entrees.filter((e) => e.commentaireCoach).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 2);
    let h = `<div class="ar-quick"><button class="btn primary ar-big" data-act="tc-new">🎯 Nouveau tir compté</button>${window.CarnetChrono ? `<button class="btn ar-big" data-act="chrono">⏱ Chrono</button>` : ""}</div>`;
    h += mots.map((e) => `<button class="card coach-mot ar-mot" data-entry="${esc(e.id)}"><b>💬 Le mot de ton entraîneur · ${esc(dObj(e.date).toLocaleDateString("fr-FR"))}</b><span>${esc(e.commentaireCoach)}</span></button>`).join("");
    h += `<div class="card ar-infos"><h3 class="hub-h">Infos du club</h3>${ann.length ? ann.map((n) => `<div class="ar-info${n.important ? " imp" : ""}">
      <b>${n.important ? '<span class="tag imp">Important</span> ' : ""}${esc(n.titre || "Info")}</b>${n.texte ? `<p>${esc(n.texte).replace(/\n/g, "<br>")}</p>` : ""}
      <span class="tirline">${[n.date ? "Publiée le " + dObj(n.date).toLocaleDateString("fr-FR") : "", (n.clubIds || []).length ? n.clubIds.map(clubNom).filter(Boolean).join(", ") : ""].filter(Boolean).map(esc).join(" · ")}</span></div>`).join("")
      : `<p class="tirline">Pas d'info particulière en ce moment.</p>`}</div>`;
    if (!ent) return h;
    h += `<h2 class="sec">Prochains entraînements</h2>`;
    if (!ent.length) return h + `<p class="notice">Aucun entraînement proposé pour l'instant. Ton entraîneur les ajoute au fil de la saison.</p>`;
    h += `<span class="tirline">${ENC() ? "Dis si tu seras là. Comme encadrant, tu vois aussi qui a prévu de venir." : `Dis à ton entraîneur si ${St.list.length > 1 || PREVIEW || TESTW ? esc(prenom) + " sera là" : "tu seras là"} : ça l'aide à préparer la séance.`}</span>`;
    const nb = Number(prefs().nbEnt ?? 3), shown = St.allEnt || !nb ? ent : ent.slice(0, nb);
    h += `<div class="list">${shown.map((e) => `<div class="card ar-ent"><div class="bar"><span class="date"><span class="d">${dObj(e.date).getDate()}</span><span class="mo">${dObj(e.date).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</span></span>
      <span class="main" style="flex:1;min-width:0"><b>${esc(dObj(e.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }))}${e.heure ? " · " + esc(e.heure) : ""}</b>
        <span class="tirline" style="display:block">${[clubNom(e.clubId), e.groupe, e.theme, e.lieu].filter(Boolean).map(esc).join(" · ")}</span></span></div>
      <div class="ar-rep" role="group" aria-label="Ma réponse"><button class="btn${e.reponse === "present" ? " primary" : ""}" data-rep="${esc(e.id)}|present" aria-pressed="${e.reponse === "present"}">✓ Présent</button>
        <button class="btn${e.reponse === "absent" ? " on-abs" : ""}" data-rep="${esc(e.id)}|absent" aria-pressed="${e.reponse === "absent"}">✗ Absent</button>
        <span class="tirline">${e.reponse === "present" ? "Réponse envoyée : présent" : e.reponse === "absent" ? "Réponse envoyée : absent" : "Pas encore répondu"}</span></div>
      ${ENC() && e.presents ? (() => { const enc = new Set(e.presentsEnc || []), pres = e.presents.filter((n) => !enc.has(n)), encs = e.presents.filter((n) => enc.has(n));
        return `<div class="ar-who"><b>Liste des présents · ${e.presents.length} personne${e.presents.length > 1 ? "s" : ""}</b>
        ${e.presents.length ? `<ol class="ar-plist">${pres.map((n) => `<li>${esc(n)}</li>`).join("")}${encs.map((n) => `<li>${esc(n)} <span class="tag">encadrant</span></li>`).join("")}</ol>` : `<span class="tirline">Personne n'a encore dit qu'il venait.</span>`}
        <span class="tirline">${[(e.absents || []).length ? `Absents : ${e.absents.map(esc).join(", ")}` : "", e.sansReponse ? `${e.sansReponse} sans réponse` : ""].filter(Boolean).join(" · ")}</span></div>`; })() : ""}
    </div>`).join("")}</div>`;
    if (shown.length < ent.length) h += `<button class="btn ghost" data-act="all-ent">${ent.length - shown.length > 1 ? `Voir les ${ent.length - shown.length} autres entraînements proposés` : "Voir l'autre entraînement proposé"}</button>`;
    else if (St.allEnt && nb && ent.length > nb) h += `<button class="btn ghost" data-act="all-ent">${nb > 1 ? `N'afficher que les ${nb} prochains` : "N'afficher que le prochain"}</button>`;
    return h;
  }
  // ---------- Carnet ----------
  function vCarnet() {
    const end = St.saison, key = `${end - 1}-${end}`;
    const list = St.data.entrees.filter((e) => e.date && saisonOf(e.date) === end).sort((a, b) => b.date.localeCompare(a.date));
    const tot = VOL.map(([k, l]) => [l, list.reduce((n, e) => n + volOf(e, k), 0)]), all = tot.reduce((n, [, v]) => n + v, 0);
    const notes = list.map((e) => num(e.note)).filter((v) => v != null), moy = notes.length ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1).replace(".", ",") : "—";
    const c = St.data.carnets.find((x) => x.saison === key), o = c?.objectifs || {};
    let h = `<div class="bar"><button class="btn" data-saison="-1" aria-label="Saison précédente">‹</button><b>Saison ${end - 1}-${end}</b><button class="btn" data-saison="1" aria-label="Saison suivante">›</button><span class="grow"></span><button class="btn" data-act="tc-new">🎯 Tir compté</button><button class="btn primary" data-act="new">+ Noter une séance</button></div>
      <div class="hub-stats"><div class="hub-stat"><div class="hub-stat-top"><span>Flèches de la saison</span></div><b class="c-gold">${all.toLocaleString("fr-FR")}</b><small>${tot.filter(([, v]) => v).map(([l, v]) => `${l} ${v}`).join(" · ") || "aucune pour l'instant"}</small></div>
      <div class="hub-stat"><div class="hub-stat-top"><span>Séances notées</span></div><b class="c-cyan">${list.length}</b><small>ressenti moyen ${moy} / 10</small></div></div>`;
    if (o.processus || o.classement || o.score) h += `<div class="card"><h3 class="hub-h">Mes objectifs de la saison</h3>${[["processus", "Processus"], ["classement", "Classement"], ["score", "Score"]].filter(([k]) => o[k]).map(([k, l]) => `<div class="eq-l"><span>${l}</span><b>${esc(o[k])}</b></div>`).join("")}</div>`;
    if (window.CarnetTcProgress) h += window.CarnetTcProgress(list, St.tcCombo, "data-artc", St.tcPer || "30", "data-artcp");
    h += list.length ? `<div class="list">${list.map((e) => `<button class="row" data-entry="${esc(e.id)}"><span class="date"><span class="d">${dObj(e.date).getDate()}</span><span class="mo">${dObj(e.date).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</span></span>
      <span class="main"><span class="t">${esc(e.objectif || (e.concoursId ? "Concours" : "Séance"))}</span><span class="m">${[e.concoursId && num(e.scoreCompet) != null ? e.scoreCompet + " pts" : "", !e.concoursId && num(e.scoreCompte) != null ? `tir compté ${e.scoreCompte} pts${e.tcDistance ? " à " + e.tcDistance + " m" : ""}` : "", vol(e) ? vol(e) + " flèches" : "", e.emotion || "", e.seanceId ? "séance du club" : e.concoursId ? "concours" : "noté par moi", e.commentaireCoach ? "💬 mot de l'entraîneur" : ""].filter(Boolean).map(esc).join(" · ")}</span>${e.commentaire ? `<span class="m">${esc(e.commentaire.slice(0, 100))}</span>` : ""}</span>
      <span class="count">${num(e.note) != null ? `${e.note}<small>/10</small>` : ""}</span></button>`).join("")}</div>` : `<p class="notice">Rien de noté cette saison. « Noter une séance » ajoute une ligne à ton carnet : ton entraîneur la verra.</p>`;
    return h;
  }
  // Ligne de carnet créée par un concours : on montre le concours (résultat, lieu) plutôt qu'un formulaire vide
  function concoursSheet(e) {
    const c = St.data.concours.find((x) => x.id === e.concoursId), r = c?.resultat || {}, el = $("#sheet");
    const line = (l, v) => (v ? `<div class="eq-l"><span>${l}</span><b>${esc(v)}</b></div>` : "");
    el.innerHTML = `<div class="sheet-bg" data-close><div class="sheet ar-root-sheet" role="dialog" aria-label="Concours"><h3>${esc(c ? c.nom || c.lieu || "Concours" : (e.objectif || "Concours").replace(/^Concours · /, ""))}</h3>
      ${c ? `<div class="card" style="gap:4px">${line("Date", fmtLong(c.date) + (c.dateFin && c.dateFin !== c.date ? " au " + fmtLong(c.dateFin) : ""))}${line("Lieu", c.lieu)}${line("Type", (c.types || []).map((x) => TYPES[x] || x).join(", "))}${line("Fédération", c.federation)}
        ${line("Distance", r.distance ? r.distance + " m" : "")}${line("Blason", r.blason)}${line("Arc", r.arc)}${line("Score", num(r.score) != null ? r.score + " pts" : "pas encore saisi")}${line("Place", r.place)}${line("Remarque", r.remarque)}</div>`
        : `<p class="notice">Ce concours n'est plus dans ta liste : ton entraîneur t'en a peut-être retiré. La ligne disparaîtra de ton carnet à sa prochaine connexion.</p>`}
      ${(c?.classements || []).map((k) => `<a class="btn" href="${BLOB}${esc(k.assetId)}" target="_blank" rel="noopener">Classement PDF${c.classements.length > 1 ? " · " + esc(k.nom || "") : ""}</a>`).join("")}
      ${e.commentaireCoach ? `<div class="coach-mot"><b>💬 Le mot de ton entraîneur</b><p style="margin:4px 0 0;color:var(--ink)">${esc(e.commentaireCoach)}</p></div>` : ""}
      <span class="tirline">Cette ligne vient du concours enregistré par ton entraîneur : le score et les flèches s'y ajoutent tout seuls. Tu peux y noter ton ressenti.</span>
      <div class="acts"><button type="button" class="btn" data-close>Fermer</button>${c ? `<button type="button" class="btn" id="co-voir">Mes concours</button>` : ""}<button type="button" class="btn primary" id="co-res">Mon ressenti</button></div></div></div>`;
    el.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", (ev) => { if (ev.target === b) el.innerHTML = ""; }));
    $("#co-res").onclick = () => formEntry(e);
    const v = $("#co-voir"); if (v) v.onclick = () => { el.innerHTML = ""; St.tab = "concours"; render(); window.scrollTo(0, 0); };
  }
  // ---------- Tir compté sur la cible : toucher l'impact ou taper la valeur ----------
  const kv = (k) => (k === "X" ? 10 : k === "M" ? 0 : Number(k) || 0), krank = (k) => (k === "X" ? 11 : kv(k));
  // Cible : clic à la souris ; au doigt, une loupe grossit la zone pendant qu'on glisse, la flèche se place quand on lève le doigt
  function bindTarget(svg, onPlace, valueAt) {
    const pos = (ev) => { const r = svg.getBoundingClientRect(); return { r, px: ev.clientX - r.left, py: ev.clientY - r.top, x: ((ev.clientX - r.left) / r.width * 500 - 250) / 240, y: ((ev.clientY - r.top) / r.height * 500 - 250) / 240 }; };
    let loupe = null, last = null;
    const Z = 3, L = 140;
    const show = (ev) => {
      const p = pos(ev); last = p;
      if (!loupe) { loupe = document.createElement("div"); loupe.className = "loupe"; loupe.innerHTML = `<svg viewBox="0 0 500 500">${svg.innerHTML}</svg><i class="lp-x"></i><b class="lp-v"></b>`; document.body.appendChild(loupe); }
      const inner = loupe.querySelector("svg"), W = p.r.width * Z;
      inner.style.width = inner.style.height = W + "px"; inner.style.left = L / 2 - p.px * Z + "px"; inner.style.top = L / 2 - p.py * Z + "px";
      const above = ev.clientY - L - 40 > 8;
      loupe.style.left = Math.min(Math.max(8, ev.clientX - L / 2), innerWidth - L - 8) + "px"; loupe.style.top = (above ? ev.clientY - L - 40 : ev.clientY + 40) + "px";
      loupe.querySelector(".lp-v").textContent = Math.hypot(p.x, p.y) > 1.05 ? "hors cible" : valueAt(p.x, p.y);
    };
    const hide = () => { loupe?.remove(); loupe = null; };
    svg.addEventListener("pointerdown", (ev) => {
      if (ev.pointerType === "mouse") return;
      ev.preventDefault(); try { svg.setPointerCapture(ev.pointerId); } catch (err) { /* pointeur déjà relâché */ } show(ev);
    });
    svg.addEventListener("pointermove", (ev) => { if (loupe) { ev.preventDefault(); show(ev); } });
    svg.addEventListener("pointerup", (ev) => {
      if (ev.pointerType === "mouse") { const p = pos(ev); onPlace(p.x, p.y); return; }
      if (!loupe) return; const p = last; hide(); if (p && Math.hypot(p.x, p.y) <= 1.05) onPlace(p.x, p.y);
    });
    svg.addEventListener("pointercancel", hide);
  }
  function cibleSheet(init, onDone) {
    const C = window.CarnetCible;
    const T = init.prev ? JSON.parse(JSON.stringify(init.prev)) : { distance: init.distance, blason: init.blason || "Trispot 40 cm CL", fpv: 3, nbVolees: 10, volees: [], impacts: [] };
    T.distance = init.distance || T.distance; if (init.blason) T.blason = init.blason;
    const layer = document.createElement("div"); layer.className = "sheet-bg ar-tgt-layer"; document.body.appendChild(layer);
    const total = () => T.volees.flat().reduce((a, k) => a + kv(k), 0), shot = () => T.volees.flat().length, plan = () => T.fpv * T.nbVolees;
    const full = () => shot() >= plan();
    let view = null; // null : volée en cours ; sinon n° de volée regardée, ou "all"
    const curIdx = () => (T.volees.length && T.volees[T.volees.length - 1].length < T.fpv ? T.volees.length - 1 : T.volees.length);
    function add(k, imp) {
      view = null;
      if (full()) { toast("Toutes les flèches sont notées"); return; }
      let last = T.volees[T.volees.length - 1]; if (!last || last.length >= T.fpv) { last = []; T.volees.push(last); }
      last.push(k); if (imp) T.impacts.push({ v: T.volees.length - 1, x: +imp.x.toFixed(4), y: +imp.y.toFixed(4), k });
      if (last.length === T.fpv) last.sort((a, b) => krank(b) - krank(a));
      if (full()) toast(`Tir terminé : ${total()} points`);
      draw();
    }
    function undo() {
      const vi = T.volees.length - 1, last = T.volees[vi]; if (!last || !last.length) return;
      const j = T.impacts.map((p, i) => [p, i]).filter(([p]) => p.v === vi).pop();
      if (j) { T.impacts.splice(j[1], 1); last.splice(last.lastIndexOf(j[0].k), 1); } else last.pop();
      if (!last.length) T.volees.pop(); draw();
    }
    let drawing = false, again = false, setOpen = false; // réglages repliés une fois le tir commencé (plus de place pour la cible)
    // un champ qui perd le focus pendant le remplacement relance draw : on le rejoue après, pas en plein milieu
    function draw() { if (drawing) { again = true; return; } drawing = true; try { drawNow(); } finally { drawing = false; } if (again) { again = false; draw(); } }
    function drawNow() {
      const n = shot(), vcur = T.volees.length && T.volees[T.volees.length - 1].length < T.fpv ? T.volees.length : Math.min(T.volees.length + 1, T.nbVolees);
      const keys = ["X", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "M"], face = C.face(T), minV = 11 - face.zones;
      const cls = (k) => (["X", "10", "9"].includes(k) ? "y" : ["8", "7"].includes(k) ? "r" : ["6", "5"].includes(k) ? "b" : ["4", "3"].includes(k) ? "k" : k === "M" ? "m" : "w");
      layer.innerHTML = `<div class="sheet ar-tgt-sheet" role="dialog" aria-label="Tir compté sur la cible">
        <div class="bar"><h3 style="margin:0">Tir compté sur la cible</h3><span class="grow"></span><b style="font-size:1.2rem">${total()} pts</b></div>
        ${setOpen || !shot() ? `<div class="grid4"><label class="f">Distance (m)<input type="number" inputmode="numeric" id="tg-d" value="${esc(T.distance)}"></label>
          <label class="f">Blason<select id="tg-b">${C ? window.CarnetBlasonOpts(T.blason) : ""}</select></label>
          <label class="f">Flèches par volée<select id="tg-f">${[3, 6].map((x) => `<option ${T.fpv === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
          <label class="f">Volées<input type="number" inputmode="numeric" min="1" max="40" id="tg-v" value="${T.nbVolees}"></label></div>` : `<button type="button" class="btn ghost tg-sum" id="tg-set">${esc(T.distance || "?")} m · ${esc(T.blason)} · ${T.nbVolees} volées de ${T.fpv} ✎</button>`}
        <div class="ar-tgt-grid"><div>
          ${T.volees.some((v) => v.length) ? `<div class="chips tv-chips" style="margin-bottom:8px">${T.volees.map((v, i) => v.length ? `<button type="button" class="chip" data-vv="${i}" aria-pressed="${(view ?? curIdx()) === i}">V${i + 1}</button>` : "").join("")}${curIdx() >= T.volees.length && !full() ? `<button type="button" class="chip" data-vv="cur" aria-pressed="${view == null}">V${curIdx() + 1} · en cours</button>` : ""}<button type="button" class="chip" data-vv="all" aria-pressed="${view === "all"}">Tout</button></div>` : ""}
          ${C.svg({ id: "ar-tir", ...T, showAll: true, only: view ?? curIdx(), volees: T.volees.length ? T.volees : [[]] })}
          ${view != null ? `<span class="tirline">Tu regardes ${view === "all" ? "tout le tir" : "la volée " + (view + 1)}. Touche la cible pour continuer la volée en cours.</span>` : ""}</div>
          <div class="kp" role="group" aria-label="Valeur de la flèche">${keys.filter((k) => k === "X" || k === "M" || Number(k) >= minV).map((k) => `<button type="button" class="${cls(k)}" data-k="${k}">${k}</button>`).join("")}<button type="button" class="undo" id="tg-undo">↶ Annuler la flèche</button></div></div>
        <span class="tirline">${matchMedia("(pointer: coarse)").matches ? "Pose le doigt sur la cible, ajuste avec la loupe, puis lève le doigt pour placer la flèche" : "Touche la cible là où la flèche s'est plantée"} : la valeur se calcule toute seule. Tu peux aussi taper la valeur sans placer la flèche.</span>
        <div class="bar"><b>Volée en cours : ${Math.min(vcur, T.nbVolees)} / ${T.nbVolees}</b><span class="grow"></span><span>${n} / ${plan()} flèches${n ? ` · ${(total() / n).toFixed(2).replace(".", ",")} par flèche` : ""}</span></div>
        <div class="tgt-bar"><span style="width:${Math.min(100, (n / plan()) * 100)}%"></span></div>
        ${full() && C.bilan ? C.bilan(T, (St.data?.entrees || []).filter((x) => x.id !== init.id)) : ""}
        ${C.carte(T, "data-vv", view ?? curIdx())}${C.groupe({ ...T, impacts: view === "all" ? T.impacts : T.impacts.filter((p) => p.v === (view ?? curIdx())) })}
        <div class="acts"><button type="button" class="btn" id="tg-no">Annuler</button><button type="button" class="btn primary" id="tg-ok">Valider le tir</button></div></div>`;
      bindTarget(layer.querySelector("svg.tgt"), (x, y) => add(C.scoreAt(C.face(T), Math.hypot(x, y)), { x, y }), (x, y) => C.scoreAt(C.face(T), Math.hypot(x, y)));
      layer.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => add(b.dataset.k)));
      layer.querySelectorAll("[data-vv]").forEach((b) => b.addEventListener("click", () => { const x = b.dataset.vv; view = x === "cur" ? null : x === "all" ? "all" : Number(x) === curIdx() ? null : Number(x); draw(); }));
      $("#tg-undo").onclick = undo;
      const ts = $("#tg-set"); if (ts) ts.onclick = () => { setOpen = true; draw(); };
      if ($("#tg-d")) $("#tg-d").onchange = (ev) => { T.distance = ev.target.value; };
      if ($("#tg-b")) $("#tg-b").onchange = (ev) => { T.blason = ev.target.value; T.volees.forEach((v, vi) => { T.impacts.filter((p) => p.v === vi).forEach((p) => { const i = v.indexOf(p.k); const nk = C.scoreAt(C.face(T), Math.hypot(p.x, p.y)); if (i >= 0) v[i] = nk; p.k = nk; }); }); draw(); };
      if ($("#tg-f")) $("#tg-f").onchange = (ev) => { if (shot()) { toast("Change le nombre de flèches par volée avant de commencer"); ev.target.value = T.fpv; return; } T.fpv = +ev.target.value; T.nbVolees = T.fpv === 6 ? 6 : 10; draw(); };
      if ($("#tg-v")) $("#tg-v").onchange = (ev) => { T.nbVolees = Math.max(Math.ceil(shot() / T.fpv) || 1, Math.min(40, +ev.target.value || 1)); draw(); };
      $("#tg-no").onclick = () => layer.remove();
      $("#tg-ok").onclick = () => { layer.remove(); onDone(T); };
    }
    draw();
  }
  // Accès direct : tir sur la cible → ligne « Tir compté » du jour dans le carnet → bilan
  function tirDirect() {
    const last = St.data.entrees.filter((x) => x.tcDistance || x.tcBlason).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0] || {};
    const P = prefs();
    cibleSheet({ distance: P.tcDistance || last.tcDistance || "18", blason: P.tcBlason || last.tcBlason || "" }, async (t) => {
      const fl = t.volees.flat(); if (!fl.length) return;
      const sc = fl.reduce((a, k) => a + kv(k), 0), date = today();
      const data = { date, saison: `${saisonOf(date) - 1}-${saisonOf(date)}`, objectif: "Tir compté", tcDistance: String(t.distance || ""), tcBlason: t.blason || "", compte: String(fl.length), scoreCompte: String(sc), tcTir: t };
      const others = St.data.entrees.slice(), bil = window.CarnetCible?.bilan ? window.CarnetCible.bilan(t, others) : "";
      if (PREVIEW) { toast("Aperçu : l'archer enregistrera ce tir, pas toi"); return; }
      const id = "a_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      try { await API.ecrire(who(), id, data); } catch (err) { toast("Enregistrement impossible : " + err.message); return; }
      const el = $("#sheet");
      el.innerHTML = `<div class="sheet-bg" data-close><div class="sheet" role="dialog" aria-label="Bilan du tir"><h3>Tir enregistré dans ton carnet</h3>${bil}
        <span class="tirline">Ajoute ton ressenti si tu veux : touche la ligne « Tir compté » du jour dans « Mon carnet ».</span>
        <div class="acts"><button type="button" class="btn primary" data-close>Fermer</button></div></div></div>`;
      el.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", (ev) => { if (ev.target === b) el.innerHTML = ""; }));
      St.saison = saisonOf(date); load();
    });
  }
  function formEntry(e = null) {
    const d = e || { date: today() }, el = $("#sheet");
    const lock = e?.concoursId ? "readonly" : "";
    const tcLast = e ? {} : St.data.entrees.filter((x) => x.tcDistance || x.tcBlason).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0] || {}; // reprend la dernière distance // flèches et score d'un concours : saisis par l'entraîneur
    el.innerHTML = `<div class="sheet-bg" data-close><form class="sheet" id="ar-form"><h3>${e ? "Ma séance" : "Noter une séance"}</h3>
      <div class="grid2"><label class="f">Date<input type="date" name="date" required value="${esc(d.date)}" ${e?.seanceId || e?.concoursId ? "readonly" : ""}></label><label class="f">Objectif<input type="text" name="objectif" value="${esc(d.objectif)}"></label></div>
      <div class="f">Flèches tirées<div class="grid5">${VOL.filter(([k]) => k !== "compte" || e?.concoursId).map(([k, l]) => `<label class="f" style="font-weight:500">${l}<input type="number" inputmode="numeric" min="0" name="${k}" value="${esc(d[k])}" placeholder="${d.auto?.[k] ? "+" + d.auto[k] : "0"}" ${lock}></label>`).join("")}</div>${e?.auto ? `<span class="tirline">Les chiffres grisés viennent des feuilles de marque de ton entraîneur.</span>` : ""}</div>
      ${e?.concoursId ? `<input type="hidden" name="scoreCompte" value="${esc(d.scoreCompte)}"><label class="f">Score du concours<input type="number" name="scoreCompet" value="${esc(d.scoreCompet)}" readonly></label>`
      : `<div class="f ar-tc"><b>Mon tir compté</b><span class="tirline">Note ton score pour suivre ta progression (courbe dans « Mon carnet »).</span>
        <div class="grid4"><label class="f" style="font-weight:500">Distance (m)<input type="number" inputmode="numeric" min="0" name="tcDistance" list="ar-dl" value="${esc(d.tcDistance ?? tcLast.tcDistance ?? "")}" placeholder="${esc(d.auto?.tcDistance ?? "")}"><datalist id="ar-dl">${(window.CarnetDistances ? window.CarnetDistances() : [10, 18, 20, 30, 50, 70]).map((x) => `<option value="${x}">`).join("")}</datalist></label>
          <label class="f" style="font-weight:500">Blason<select name="tcBlason"><option value="">—</option>${window.CarnetBlasonOpts ? window.CarnetBlasonOpts(d.tcBlason ?? tcLast.tcBlason ?? "") : ""}</select></label>
          <label class="f" style="font-weight:500">Flèches<input type="number" inputmode="numeric" min="0" name="compte" id="ar-tcn" value="${esc(d.compte)}" placeholder="${d.auto?.compte ? "+" + d.auto.compte : "ex. 30"}"></label>
          <label class="f" style="font-weight:500">Score<input type="number" inputmode="numeric" min="0" name="scoreCompte" id="ar-tcs" value="${esc(d.scoreCompte)}" placeholder="${esc(d.auto?.scoreCompte ?? "")}"></label></div>
        <span class="tirline" id="ar-tcm"></span>
        ${window.CarnetCible ? `<button type="button" class="btn primary" id="ar-cible">🎯 ${d.tcTir ? "Voir / modifier mon tir sur la cible" : "Saisir mon tir sur la cible"}</button>` : ""}
        <input type="hidden" name="tcTir" id="ar-tctir" value="${esc(d.tcTir ? JSON.stringify(d.tcTir) : "")}"></div>
      <input type="hidden" name="scoreCompet" value="${esc(d.scoreCompet)}">`}
      <div class="f">Objectif atteint<div class="radio">${[["", "Je ne sais pas"], ["O", "Oui"], ["N", "Non"]].map(([v, l]) => `<label><input type="radio" name="atteint" value="${v}" ${(d.atteint || "") === v ? "checked" : ""}> ${l}</label>`).join("")}</div></div>
      <div class="grid2"><label class="f">Ressenti (0 à 10)<select name="note"><option value="">—</option>${Array.from({ length: 11 }, (_, i) => `<option ${String(d.note ?? "") === String(i) ? "selected" : ""}>${i}</option>`).join("")}</select></label>
        <label class="f">Émotion<select name="emotion"><option value="">—</option>${EMOTIONS.map((x) => `<option ${d.emotion === x ? "selected" : ""}>${x}</option>`).join("")}</select></label></div>
      ${d.commentaireCoach ? `<div class="coach-mot"><b>💬 Le mot de ton entraîneur</b><p style="margin:4px 0 0;color:var(--ink)">${esc(d.commentaireCoach)}</p></div>` : ""}
      <label class="f">Mes commentaires<textarea name="commentaire">${esc(d.commentaire)}</textarea></label>
      <div class="acts">${e && String(e.id).startsWith("a_") ? `<button type="button" class="btn danger left" id="ar-del">Supprimer</button>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form></div>`;
    el.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", (ev) => { if (ev.target === b) el.innerHTML = ""; }));
    const tcm = () => { const n = Number($("#ar-tcn")?.value), sc = Number($("#ar-tcs")?.value), o = $("#ar-tcm"); if (!o) return; o.textContent = n > 0 && sc > 0 ? `Moyenne : ${(sc / n).toFixed(2).replace(".", ",")} point${sc / n >= 2 ? "s" : ""} par flèche` : ""; };
    $("#ar-tcn")?.addEventListener("input", tcm); $("#ar-tcs")?.addEventListener("input", tcm); tcm();
    $("#ar-cible")?.addEventListener("click", () => {
      const f = $("#ar-form"); let prev = null; try { prev = f.tcTir.value ? JSON.parse(f.tcTir.value) : null; } catch (err) { prev = null; }
      cibleSheet({ id: e?.id, distance: f.tcDistance.value || prev?.distance || "18", blason: f.tcBlason.value || prev?.blason || "", prev }, (t) => {
        const sc = t.volees.flat().reduce((a, k) => a + kv(k), 0), n = t.volees.flat().length;
        f.tcDistance.value = t.distance; f.tcBlason.value = t.blason; f.compte.value = n || ""; f.scoreCompte.value = n ? sc : ""; f.tcTir.value = n ? JSON.stringify(t) : "";
        $("#ar-cible").textContent = n ? "🎯 Voir / modifier mon tir sur la cible" : "🎯 Saisir mon tir sur la cible"; tcm();
      });
    });
    const del = $("#ar-del");
    if (del) del.onclick = async () => { if (!del.dataset.ok) { del.dataset.ok = 1; del.textContent = "Confirmer"; return; } try { await API.supprimer(who(), e.id); el.innerHTML = ""; toast("Séance supprimée"); load(); } catch (err) { toast(err.message); } };
    $("#ar-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (PREVIEW) { toast("Aperçu : l'archer pourra enregistrer ici, pas toi"); return; } const fd = new FormData(ev.target), date = fd.get("date"); if (!date) return;
      const data = { date, saison: `${saisonOf(date) - 1}-${saisonOf(date)}` };
      ["objectif", "atteint", "note", "emotion", "commentaire", "scoreCompte", "scoreCompet", "tcDistance", "tcBlason", ...VOL.map(([k]) => k)].forEach((k) => (data[k] = String(fd.get(k) ?? "").trim()));
      try { const tj = fd.get("tcTir"); if (tj) data.tcTir = JSON.parse(tj); } catch (err) { /* tir illisible : ignoré */ }
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
      ${(c.classements || []).length ? `<div class="bar" style="margin:-4px 0 4px 66px;gap:6px">${c.classements.map((k) => `<a class="btn" href="${BLOB}${esc(k.assetId)}" target="_blank" rel="noopener">Classement PDF${c.classements.length > 1 ? " · " + esc(k.nom || "") : ""}</a>`).join("")}</div>` : ""}`; };
    let h = "";
    // courbe des scores, comme sur la fiche archer de l'entraîneur (une courbe par distance · blason, couleur par saison)
    const faits = past.filter((c) => num(c.resultat?.score) != null).reverse();
    const label = (r) => [r.distance ? `${r.distance} m` : "", r.blason].filter(Boolean).join(" · ") || "Sans distance";
    if (faits.length >= 2 && window.CarnetLineChart) {
      const combos = [...new Set(faits.map((c) => label(c.resultat)))].sort((p, q) => faits.filter((c) => label(c.resultat) === q).length - faits.filter((c) => label(c.resultat) === p).length);
      const cur = combos.includes(St.combo) ? St.combo : combos[0], sel = faits.filter((c) => label(c.resultat) === cur);
      const best = sel.reduce((m, c) => (Number(c.resultat.score) > Number(m.resultat.score) ? c : m), sel[0]);
      const nm = (c) => c.nom || c.lieu || "Concours";
      h += `<h2 class="sec">Ma progression en concours</h2><div class="card">${combos.length > 1 ? `<div class="chips">${combos.map((k) => `<button class="chip" data-arcombo="${esc(k)}" aria-pressed="${k === cur}">${esc(k)}</button>`).join("")}</div>` : `<b>${esc(cur)}</b>`}
        <div class="stat"><div><b>${esc(sel[sel.length - 1].resultat.score)}</b><span>dernier score</span></div><div><b>${esc(best.resultat.score)}</b><span>record (${esc(nm(best))})</span></div><div><b>${sel.length}</b><span>concours</span></div></div>
        ${sel.length >= 2 ? window.CarnetLineChart(sel.map((c) => ({ date: c.date, label: dObj(c.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), y: Number(c.resultat.score), tip: `${nm(c)}, ${fmtLong(c.date)} : ${c.resultat.score} pts${c.resultat.place ? " · " + c.resultat.place : ""}` }))) : `<p class="notice">La courbe apparaîtra dès le 2e concours dans cette catégorie.</p>`}</div>`;
    }
    if (up.length) h += `<h2 class="sec">À venir</h2><div class="list">${up.map(row).join("")}</div>`;
    const seasons = [...new Set(past.map((c) => saisonOf(c.date)))];
    seasons.forEach((z) => { h += `<div class="sz-head"><b>Saison ${z - 1}-${z}</b><span>${past.filter((c) => saisonOf(c.date) === z && num(c.resultat?.score) != null).length} concours</span></div><div class="list">${past.filter((c) => saisonOf(c.date) === z).map(row).join("")}</div>`; });
    return h;
  }
  // ---------- Paramètres de l'archer ----------
  function vParams() {
    const P = prefs(), a = St.data.archer, chronos = [...(window.CarnetChronoNoms ? window.CarnetChronoNoms() : []), ...chronoStore.list().map((c) => c.nom)], cur = chronoStore.last();
    const nbs = [[1, "1"], [2, "2"], [3, "3 (par défaut)"], [4, "4"], [5, "5"], [6, "6"], [8, "8"], [0, "Tous (6 semaines)"]];
    return `<div class="ar-params">
      <section class="card"><h3 class="hub-h">Mon avatar</h3>
        <div class="av-prev">${window.CarnetAvatar ? window.CarnetAvatar.svg(a, 72) : ""}<div style="display:grid;gap:6px"><b>${esc(name(a))}</b><button class="btn" data-act="avatar">Changer d'avatar</button></div></div>
        <span class="tirline">Un dessin à choisir, ou tes initiales. Ton entraîneur le voit sur ses listes.</span></section>
      <section class="card"><h3 class="hub-h">Accueil</h3>
        <label class="f">Entraînements proposés affichés<select data-pref="nbEnt">${nbs.map(([v, l]) => `<option value="${v}" ${Number(P.nbEnt ?? 3) === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <span class="tirline">Les suivants restent accessibles avec « Voir les autres ».</span></section>
      <section class="card"><h3 class="hub-h">Chrono</h3>
        <label class="f">Réglage utilisé à l'ouverture<select data-pref-chrono>${chronos.map((n) => `<option ${n === cur ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
        <div class="bar"><button class="btn" data-act="chrono">⏱ Ouvrir le chrono</button><span class="tirline">Dans le chrono, « Réglages » crée tes propres réglages (temps de tir, volées, pause…).</span></div></section>
      <section class="card"><h3 class="hub-h">Tir compté</h3>
        <div class="grid2"><label class="f">Distance par défaut (m)<input type="number" inputmode="numeric" min="0" data-pref="tcDistance" value="${esc(P.tcDistance || "")}" placeholder="la dernière utilisée"></label>
          <label class="f">Blason par défaut<select data-pref="tcBlason"><option value="">Le dernier utilisé</option>${window.CarnetBlasonOpts ? window.CarnetBlasonOpts(P.tcBlason || "") : ""}</select></label></div>
        <span class="tirline">Utilisés quand tu lances « 🎯 Nouveau tir compté ».</span></section>
      ${PREVIEW ? "" : `<section class="card"><h3 class="hub-h">Mon compte</h3>
        <div class="bar"><button class="btn" data-act="add-code">Ajouter un autre archer (frère, sœur…)</button>${TESTW ? "" : `<button class="btn danger" id="ar-out">Se déconnecter</button>`}</div></section>`}
      <span class="tirline">Ces préférences sont gardées sur cet appareil.</span></div>`;
  }
  // ---------- Documents : partagés avec le club + fiches d'exercices de l'archer ----------
  function vDocs() {
    const docs = (St.data.documents || []).slice().sort((a, b) => (b.partageLe || 0) - (a.partageLe || 0));
    let h = `<h2 class="sec">Documents du club</h2>`;
    h += docs.length ? `<div class="list">${docs.map((d) => `<div class="row"><span class="thumb">${(d.contentType || "").startsWith("image/") ? "IMG" : "PDF"}</span><span class="main"><span class="t">${esc(d.titre || d.nomFichier)}</span>${d.description ? `<span class="m">${esc(d.description.slice(0, 140))}</span>` : ""}</span>
      <a class="btn" href="${BLOB}${esc(d.assetId)}" target="_blank" rel="noopener">Ouvrir</a></div>`).join("")}</div>` : `<p class="notice">Aucun document partagé pour l'instant (calendrier des concours, règlement…).</p>`;
    return h + `<h2 class="sec">Mes exercices</h2>` + vExos();
  }
  function vExos() {
    const list = St.data.exercices.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
    if (!list.length) return `<p class="notice">Ton entraîneur ne t'a pas encore partagé de fiche d'exercice.</p>`;
    return `<div class="list">${list.map((x) => { const d = x.document;
      return `<div class="row"><span class="thumb">${d && (d.contentType || "").startsWith("image/") ? "IMG" : "PDF"}</span><span class="main"><span class="t">${esc(d ? d.titre || d.nomFichier : "Fiche retirée")}${x.fait ? ' <span class="tag">fait</span>' : ""}</span>
        <span class="m">${[x.date ? "pour le " + fmtLong(x.date) : "", x.remarque].filter(Boolean).map(esc).join(" · ")}</span>${d?.description ? `<span class="m">${esc(d.description.slice(0, 140))}</span>` : ""}</span>
        ${d ? `<a class="btn" href="${BLOB}${esc(d.assetId)}" target="_blank" rel="noopener">Ouvrir</a>` : ""}</div>`; }).join("")}</div>`;
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
  root.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.dataset.pref) { setPref(t.dataset.pref, t.value.trim()); toast("Préférence enregistrée"); return; }
    if (t.hasAttribute("data-pref-chrono")) { chronoStore.setLast(t.value); toast("Réglage du chrono enregistré"); }
  });
  root.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-atab],[data-who],[data-act],[data-saison],[data-entry],[data-eval],[data-arcombo],[data-rep],[data-artc],[data-artcp],#ar-out"); if (!t) return;
    ev.stopPropagation();
    if (t.dataset.act === "close-preview") { root.remove(); return; }
    if (t.id === "ar-out") return API.deconnexion();
    if (t.dataset.atab) { St.tab = t.dataset.atab; render(); return; }
    if (t.dataset.eval) { St.evalId = t.dataset.eval; render(); return; }
    if (t.dataset.rep) {
      const [sid, val] = t.dataset.rep.split("|"), e = (St.data.entrainements || []).find((x) => x.id === sid); if (!e) return;
      if (PREVIEW) { toast("Aperçu : l'archer répondra ici, pas toi"); return; }
      const next = e.reponse === val ? "" : val, before = e.reponse;
      e.reponse = next; render();
      try { await API.repondre(who(), sid, next); toast(next === "present" ? "C'est noté : présent" : next === "absent" ? "C'est noté : absent" : "Réponse retirée"); if (ENC()) { St.data = await API.charger(who()); render(); } }
      catch (err) { e.reponse = before; render(); toast("Réponse non envoyée : " + err.message); }
      return;
    }
    if (t.dataset.artc) { St.tcCombo = t.dataset.artc; render(); return; }
    if (t.dataset.artcp) { St.tcPer = t.dataset.artcp; render(); return; }
    if (t.dataset.act === "tc-new") { tirDirect(); return; }
    if (t.dataset.act === "all-ent") { St.allEnt = !St.allEnt; render(); return; }
    if (t.dataset.act === "avatar" && window.CarnetAvatar) {
      window.CarnetAvatar.choisir(St.data.archer, async (v) => {
        if (PREVIEW) { toast("Aperçu : l'archer choisira son avatar ici"); return; }
        const before = St.data.archer.avatar; St.data.archer.avatar = v; render();
        try { await API.avatar(who(), v); toast("Avatar enregistré"); } catch (err) { St.data.archer.avatar = before; render(); toast("Avatar non enregistré : " + err.message); }
      });
      return;
    }
    if (t.dataset.act === "chrono") { window.CarnetChrono(chronoStore); return; }
    if (t.dataset.arcombo) { St.combo = t.dataset.arcombo; render(); return; }
    if (t.dataset.who) { St.cur = +t.dataset.who; load(); return; }
    if (t.dataset.saison) { St.saison += +t.dataset.saison; render(); return; }
    if (t.dataset.entry) { const e = St.data.entrees.find((x) => x.id === t.dataset.entry); if (e?.concoursId) concoursSheet(e); else formEntry(e); return; }
    if (t.dataset.act === "new") { formEntry(); return; }
    if (t.dataset.act === "reload") { load(); return; }
    if (t.dataset.act === "add-code") {
      const code = prompt("Code d'invitation (pour suivre un autre archer)"); if (!code) return;
      try { St.list = await API.ajouterCode(code); St.cur = St.list.length - 1; load(); } catch (e) { toast("Code invalide ou déjà utilisé"); }
    }
  });
  load();
};
if (window.carnetArcherAPI) window.CarnetArcherUI(window.carnetArcherAPI);
