// @ts-nocheck — code JavaScript simple, sans types
// Fonction Supabase « canva » (V.1.9) : relie le carnet de l'entraîneur à son compte Canva.
// L'appli lui demande de chercher des fiches Canva, de les ajouter aux Documents et de les remettre à jour :
// la fonction exporte le PDF chez Canva, le range dans le stockage du carnet et met à jour le document.
// Les jetons Canva ne quittent jamais le serveur.
//
// Réglages (Supabase › Edge Functions › Secrets) : CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, APP_URL (adresse du carnet).
// SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase.
// À déployer SANS la vérification automatique du jeton (« Verify JWT » décoché) : Canva revient ici sans jeton,
// et la fonction vérifie elle-même l'entraîneur pour toutes les autres demandes.

const env = (k) => Deno.env.get(k) || "";
const CANVA_AUTH = "https://www.canva.com/api/oauth/authorize";
const CANVA_API = "https://api.canva.com/rest/v1";
const SCOPES = "design:meta:read design:content:read";
const MAX_DUREE = 100000; // au-delà, on s'arrête et l'appli relance pour la suite (limite de temps des fonctions)

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class Erreur extends Error { constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; } }

// ---------- petits outils ----------
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hasard = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const hex32 = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
const rid = () => [...crypto.getRandomValues(new Uint8Array(10))].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const nomPdf = (t) => (String(t || "Fiche Canva").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Fiche Canva") + ".pdf";

// ---------- Supabase (clé de service, côté serveur uniquement) ----------
const srv = () => ({ apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: "Bearer " + env("SUPABASE_SERVICE_ROLE_KEY") });
async function rest(path, opt = {}) {
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/" + path, { ...opt, headers: { ...srv(), "Content-Type": "application/json", ...(opt.headers || {}) } });
  if (!r.ok) throw new Erreur("serveur", "Base de données : " + r.status + " " + (await r.text()).slice(0, 200), 500);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const q = encodeURIComponent;
async function stocker(owner, id, octets, type) {
  const r = await fetch(`${env("SUPABASE_URL")}/storage/v1/object/fichiers/${owner}/${id}`, { method: "POST", headers: { ...srv(), "Content-Type": type, "x-upsert": "false" }, body: octets });
  if (!r.ok) throw new Erreur("stockage", "Dépôt du fichier impossible : " + r.status + " " + (await r.text()).slice(0, 200), 500);
}
async function effacer(owner, id) {
  if (!id) return;
  await fetch(`${env("SUPABASE_URL")}/storage/v1/object/fichiers`, { method: "DELETE", headers: { ...srv(), "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [`${owner}/${id}`] }) }).catch(() => {});
}

// L'entraîneur qui appelle : son jeton de session doit être valide et il doit être entraîneur
async function entraineur(req) {
  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jeton) throw new Erreur("connexion", "Connecte-toi d'abord au carnet.", 401);
  const u = await fetch(env("SUPABASE_URL") + "/auth/v1/user", { headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: "Bearer " + jeton } });
  if (!u.ok) throw new Erreur("connexion", "Session expirée : reconnecte-toi au carnet.", 401);
  const user = await u.json();
  const c = await fetch(env("SUPABASE_URL") + "/rest/v1/rpc/est_coach", { method: "POST", headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: "Bearer " + jeton, "Content-Type": "application/json" }, body: "{}" });
  if (!c.ok || (await c.json()) !== true) throw new Erreur("interdit", "Réservé à l'entraîneur.", 403);
  return user.id;
}

// ---------- Canva ----------
const redirection = () => env("SUPABASE_URL") + "/functions/v1/canva";
const clientAuth = () => "Basic " + btoa(env("CANVA_CLIENT_ID") + ":" + env("CANVA_CLIENT_SECRET"));
async function jetonCanva(corps) {
  const r = await fetch(CANVA_API + "/oauth/token", { method: "POST", headers: { Authorization: clientAuth(), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(corps).toString() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Erreur(r.status === 400 || r.status === 401 ? "reconnecter" : "canva", "Canva a refusé la connexion" + (d.error_description || d.error ? " : " + (d.error_description || d.error) : "") + ".", 400);
  return d;
}
async function enregistrerJetons(owner, d, extra = {}) {
  await rest("canva_lien?on_conflict=owner", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ owner, access_token: d.access_token, refresh_token: d.refresh_token, expire_le: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString(), ...extra }) });
}
// Jeton d'accès valide : celui gardé s'il n'a pas expiré, sinon un nouveau (Canva change aussi le jeton de rafraîchissement)
async function acces(owner) {
  const [lien] = (await rest(`canva_lien?owner=eq.${q(owner)}&select=*`)) || [];
  if (!lien) throw new Erreur("pas-connecte", "Le carnet n'est pas encore relié à Canva.", 400);
  if (lien.access_token && lien.expire_le && new Date(lien.expire_le).getTime() > Date.now() + 60000) return lien.access_token;
  try {
    const d = await jetonCanva({ grant_type: "refresh_token", refresh_token: lien.refresh_token });
    await enregistrerJetons(owner, { ...d, refresh_token: d.refresh_token || lien.refresh_token });
    return d.access_token;
  } catch (e) {
    if (e.code === "reconnecter") { await rest(`canva_lien?owner=eq.${q(owner)}`, { method: "DELETE" }); throw new Erreur("reconnecter", "La liaison avec Canva a expiré : reconnecte Canva.", 400); }
    throw e;
  }
}
async function canva(token, path, opt = {}) {
  const r = await fetch(CANVA_API + path, { ...opt, headers: { Authorization: "Bearer " + token, ...(opt.body ? { "Content-Type": "application/json" } : {}), ...(opt.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Erreur("reconnecter", "Canva demande de te reconnecter.", 400);
  if (r.status === 404) throw new Erreur("introuvable", "Cette fiche n'existe plus dans Canva (supprimée ou plus partagée).", 404);
  if (r.status === 429) throw new Erreur("limite", "Canva limite le nombre d'exports : réessaie dans quelques minutes.", 429);
  if (!r.ok) throw new Erreur("canva", "Canva : " + (d.message || d.code || r.status), 502);
  return d;
}
async function exporterPdf(token, designId) {
  const { job } = await canva(token, "/exports", { method: "POST", body: JSON.stringify({ design_id: designId, format: { type: "pdf" } }) });
  let j = job;
  for (let i = 0; i < 40 && j.status === "in_progress"; i++) { await pause(i < 5 ? 1000 : 2000); j = (await canva(token, "/exports/" + encodeURIComponent(j.id))).job; }
  if (j.status !== "success") {
    const c = j.error?.code;
    throw new Erreur("export", c === "license_required" ? "La fiche contient un élément payant de Canva : l'export PDF est refusé." : c === "approval_required" ? "La fiche doit d'abord être approuvée dans Canva." : "Canva n'a pas réussi à exporter la fiche" + (j.status === "in_progress" ? " à temps : réessaie." : "."), 502);
  }
  if (!j.urls?.length) throw new Erreur("export", "Canva n'a renvoyé aucun fichier.", 502);
  const r = await fetch(j.urls[0]);
  if (!r.ok) throw new Erreur("export", "Téléchargement du PDF impossible.", 502);
  return new Uint8Array(await r.arrayBuffer());
}
const infoDesign = (d) => ({ id: d.id, titre: d.title || "Sans titre", vignette: d.thumbnail?.url || "", modifieLe: (d.updated_at || 0) * 1000, pages: d.page_count || null });

// Remet un document à jour (ou le crée) à partir de sa fiche Canva
async function majDocument(owner, token, docId, data, design, force) {
  const info = infoDesign(design);
  if (!force && data?.canva?.modifieLe && data.canva.modifieLe >= info.modifieLe && data.assetId) return { id: docId, etat: "a-jour" };
  const pdf = await exporterPdf(token, info.id);
  const assetId = hex32();
  await stocker(owner, assetId, pdf, "application/pdf");
  const now = Date.now();
  const neuf = { ...(data || { dossierId: null, titre: info.titre, description: "", createdAt: now }),
    assetId, nomFichier: nomPdf(info.titre), contentType: "application/pdf", taille: pdf.byteLength,
    canva: { designId: info.id, titre: info.titre, modifieLe: info.modifieLe, majLe: now } };
  await rest("docs?on_conflict=owner,col,id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ owner, col: "documents", id: docId, data: neuf, updated_at: new Date().toISOString() }) });
  if (data?.assetId && data.assetId !== assetId) await effacer(owner, data.assetId);
  return { id: docId, etat: data ? "mis-a-jour" : "ajoute", titre: neuf.titre };
}

// ---------- Les demandes de l'appli ----------
const ACTIONS = {
  async etat(owner) {
    const [lien] = (await rest(`canva_lien?owner=eq.${q(owner)}&select=connecte_le,nom`)) || [];
    return lien ? { connecte: true, depuis: lien.connecte_le, nom: lien.nom || "" } : { connecte: false };
  },
  async debut(owner) {
    if (!env("CANVA_CLIENT_ID") || !env("CANVA_CLIENT_SECRET")) throw new Erreur("reglages", "La fonction n'a pas encore les codes Canva (CANVA_CLIENT_ID, CANVA_CLIENT_SECRET).", 500);
    await rest(`canva_oauth?cree_le=lt.${q(new Date(Date.now() - 15 * 60000).toISOString())}`, { method: "DELETE" });
    const state = hasard(24), verifier = hasard(48);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    await rest("canva_oauth", { method: "POST", body: JSON.stringify({ state, owner, verifier }) });
    const p = new URLSearchParams({ response_type: "code", client_id: env("CANVA_CLIENT_ID"), redirect_uri: redirection(), scope: SCOPES, state, code_challenge: challenge, code_challenge_method: "s256" });
    return { url: CANVA_AUTH + "?" + p.toString() };
  },
  async designs(owner, b) {
    const token = await acces(owner);
    const p = new URLSearchParams({ sort_by: "modified_descending" });
    if (b.recherche) p.set("query", String(b.recherche).slice(0, 255));
    if (b.suite) p.set("continuation", b.suite);
    const d = await canva(token, "/designs?" + p.toString());
    return { designs: (d.items || []).map(infoDesign), suite: d.continuation || null };
  },
  async ajouter(owner, b) {
    if (!b.designId) throw new Erreur("parametre", "Aucune fiche choisie.");
    const token = await acces(owner);
    const { design } = await canva(token, "/designs/" + encodeURIComponent(b.designId));
    const deja = (await rest(`docs?owner=eq.${q(owner)}&col=eq.documents&data->canva->>designId=eq.${q(b.designId)}&select=id,data`)) || [];
    if (deja.length) return { ...(await majDocument(owner, token, deja[0].id, deja[0].data, design, true)), deja: true };
    const r = await majDocument(owner, token, rid(), b.dossierId ? { dossierId: b.dossierId, titre: design.title || "Fiche Canva", description: "", createdAt: Date.now() } : null, design, true);
    return { ...r, etat: "ajoute" };
  },
  // Met à jour les documents reliés à Canva (tous, ou ceux demandés). Ne réexporte que les fiches modifiées, sauf « forcer ».
  async sync(owner, b) {
    const t0 = Date.now(), token = await acces(owner);
    let docs = (await rest(`docs?owner=eq.${q(owner)}&col=eq.documents&data->canva->>designId=not.is.null&select=id,data`)) || [];
    if (Array.isArray(b.ids) && b.ids.length) docs = docs.filter((d) => b.ids.includes(d.id));
    const resultats = []; let reste = 0;
    for (const d of docs) {
      if (Date.now() - t0 > MAX_DUREE) { reste++; continue; }
      try {
        const { design } = await canva(token, "/designs/" + encodeURIComponent(d.data.canva.designId));
        resultats.push(await majDocument(owner, token, d.id, d.data, design, !!b.forcer));
      } catch (e) {
        if (e.code === "reconnecter" || e.code === "limite") throw e;
        resultats.push({ id: d.id, etat: "erreur", titre: d.data.titre, message: e.message });
      }
    }
    return { resultats, reste };
  },
  async deconnecter(owner) {
    const [lien] = (await rest(`canva_lien?owner=eq.${q(owner)}&select=refresh_token`)) || [];
    if (lien) await fetch(CANVA_API + "/oauth/revoke", { method: "POST", headers: { Authorization: clientAuth(), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: lien.refresh_token }).toString() }).catch(() => {});
    await rest(`canva_lien?owner=eq.${q(owner)}`, { method: "DELETE" });
    return { connecte: false };
  },
};

// Retour depuis Canva après l'autorisation : on garde les jetons et on renvoie l'entraîneur dans son carnet
async function retourCanva(url) {
  const app = env("APP_URL") || "/";
  const vers = (etat) => new Response(null, { status: 302, headers: { Location: app.replace(/#.*$/, "") + "#canva=" + etat } });
  const state = url.searchParams.get("state"), code = url.searchParams.get("code");
  if (!state) return vers("erreur");
  const [o] = (await rest(`canva_oauth?state=eq.${q(state)}&select=*`)) || [];
  if (o) await rest(`canva_oauth?state=eq.${q(state)}`, { method: "DELETE" });
  if (!o || !code || Date.now() - new Date(o.cree_le).getTime() > 15 * 60000) return vers(url.searchParams.get("error") === "access_denied" ? "refuse" : "erreur");
  try {
    const d = await jetonCanva({ grant_type: "authorization_code", code, code_verifier: o.verifier, redirect_uri: redirection() });
    await enregistrerJetons(o.owner, d, { connecte_le: new Date().toISOString() });
    return vers("ok");
  } catch (e) { console.error(e); return vers("erreur"); }
}

export async function handler(req) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  try {
    if (req.method === "GET") return await retourCanva(url);
    if (req.method !== "POST") return json({ erreur: "methode", message: "Méthode non prise en charge." }, 405);
    const owner = await entraineur(req);
    const b = await req.json().catch(() => ({}));
    const f = ACTIONS[b.action];
    if (!f) throw new Erreur("action", "Demande inconnue.");
    return json(await f(owner, b));
  } catch (e) {
    if (!(e instanceof Erreur)) console.error(e);
    return json({ erreur: e.code || "interne", message: e instanceof Erreur ? e.message : "Erreur inattendue du serveur." }, e.status || 500);
  }
}

Deno.serve(handler);
