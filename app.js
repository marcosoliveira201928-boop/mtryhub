import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, updatePassword
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, deleteDoc, collection,
  onSnapshot, serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig, USERNAME_DOMAIN } from "./firebase-config.js";

/* ================================================================
   FIREBASE
   ================================================================ */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ================================================================
   CONSTANTES
   ================================================================ */
const MAPS = ["Ancient", "Anubis", "Dust2", "Inferno", "Mirage", "Nuke", "Overpass", "Train", "Vertigo"];
const TACTIC_TYPES = ["Tática", "Smoke", "Molotov", "Flash", "Granada", "Outro"];
const SIDES = [["", "Ambos os lados"], ["TR", "TR (Terrorista)"], ["CT", "CT"]];

const ICONS = {
  logo: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  pov: '<rect x="3" y="5" width="18" height="14" rx="3.5"/><path d="M10.2 9.2v5.6l4.6-2.8z" fill="currentColor" stroke="none"/>',
  demo: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11.5v5m0 0-2.2-2.2M12 16.5l2.2-2.2"/>',
  tactic: '<path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  players: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.3a3.2 3.2 0 0 1 0 6.4M21 20c0-2.6-1.5-4.8-3.8-5.7"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M16 8l4 4-4 4M20 12H9"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
  training: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.6 1.6M9.5 3h5M12 3v3"/>'
};
function icon(name, size) {
  var s = size || 18;
  return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
}

/* ================================================================
   ESTADO
   ================================================================ */
let authReady = false;
let currentUser = null;
let isAdmin = false;
let meta = { teamName: "MTRY Hub", tagline: "Central de demos da equipe" };

let players = [];   // { uid, name, username, email, team }
let povs = [];      // { id, title, url, videoId, assignedTo, note, addedAt }
let demos = [];     // { id, title, url, assignedTo, note, addedAt }
let tactics = [];   // { id, title, type, map, side, team, videoIds[], youtubeUrls[], images[], note, addedAt }
let reviews = [];   // { id, itemId, playerUid, playerName, positives[5], negatives[5], submittedAt }
let watches = [];   // { id, itemId, playerUid, playerName, openedAt, watchedAt }
let subs = [];

let page = "povs";
let filters = { status: "all", map: "", type: "" };
let modal = null;            // { kind: 'pov'|'demo'|'tactic', id }
let lastModalKey = null;
let lightbox = null;         // { urls: [], i: 0 }
let loginTab = "player";
let loginError = "";
let busy = false;
let openTacticEdit = null;   // id da tática com o painel "adicionar mídia" aberto (técnico)
let openAdminItem = null;    // "pov:ID" | "demo:ID"
let formState = {};          // guarda o que foi digitado (os formulários sobrevivem aos re-renders)
const warnedColls = {};
let toastTimer = null;

/* ================================================================
   HELPERS
   ================================================================ */
function h(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function extractYoutubeId(url) {
  if (!url) return null;
  var m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
function toDate(ts) {
  if (!ts) return null;
  var d = ts.toDate ? ts.toDate() : new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}
function fmtDate(ts) {
  var d = toDate(ts);
  return d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "agora";
}
function fmtDateTime(ts) {
  var d = toDate(ts);
  if (!d) return "agora";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function secs(x) { return x && x.seconds ? x.seconds : Date.now() / 1000; }
function byDateDesc(a, b) { return secs(b.addedAt) - secs(a.addedAt); }
function initials(name) {
  var p = String(name || "?").trim().split(/\s+/);
  return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
function nameForUid(uid) {
  var p = players.find(function (x) { return x.uid === uid; });
  return p ? p.name : "(jogador removido)";
}
function me() { return players.find(function (p) { return p.uid === currentUser.uid; }); }
function myTeam() { var m = me(); return m && m.team ? m.team : ""; }
function reviewDocId(itemId, uid) { return itemId + "_" + uid; }
function reviewFor(itemId, uid) { return reviews.find(function (r) { return r.itemId === itemId && r.playerUid === uid; }); }
function watchFor(itemId, uid) { return watches.find(function (w) { return w.itemId === itemId && w.playerUid === uid; }); }
function povDone(id, uid) { var w = watchFor(id, uid); return !!(w && w.watchedAt); }
function expectedPlayers(item) {
  if (item.assignedTo === "todos") return players.slice();
  var p = players.find(function (x) { return x.uid === item.assignedTo; });
  return p ? [p] : [];
}
function visibleForMe(item) { return item.assignedTo === "todos" || item.assignedTo === currentUser.uid; }
function tacticVisible(t) {
  if (isAdmin) return true;
  var tm = String(t.team || "").trim().toLowerCase();
  return !tm || tm === myTeam().trim().toLowerCase();
}
function ytThumb(id) { return id ? "https://img.youtube.com/vi/" + id + "/hqdefault.jpg" : ""; }
function teamList() {
  var seen = {}, out = [];
  players.forEach(function (p) {
    var t = (p.team || "").trim();
    if (t && !seen[t.toLowerCase()]) { seen[t.toLowerCase()] = 1; out.push(t); }
  });
  return out.sort();
}
function isImgbbPageLink(u) {
  try {
    var host = new URL(u).hostname.replace(/^www\./, "");
    return host === "ibb.co" || host === "imgbb.com" || host === "pt-br.imgbb.com" || host.endsWith(".imgbb.com");
  } catch (e) { return false; }
}
function val(k) {
  var el = document.querySelector('[data-k="' + k + '"]');
  return el ? el.value : "";
}
function clearForm(prefix) {
  Object.keys(formState).forEach(function (k) { if (k.indexOf(prefix) === 0) delete formState[k]; });
}
function toast(text, kind) {
  var t = document.getElementById("toast-root");
  if (!t) return;
  t.innerHTML = '<div class="toast-wrap"><div class="toast ' + (kind || "") + '">' + h(text) + "</div></div>";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.innerHTML = ""; }, kind === "err" ? 6500 : 3200);
}
function friendlyAuthError(e) {
  var c = e && e.code;
  if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found") return "Usuário ou senha incorretos.";
  if (c === "auth/invalid-email") return "E-mail inválido.";
  if (c === "auth/too-many-requests") return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  if (c === "auth/unauthorized-domain") return "Este endereço não está autorizado no Firebase (Authentication > Settings > Authorized domains).";
  if (c === "auth/network-request-failed") return "Sem conexão com a internet.";
  return "Erro ao entrar (" + (c || (e && e.message) || "desconhecido") + ").";
}

/* ================================================================
   AUTH + DADOS
   ================================================================ */
onAuthStateChanged(auth, async function (user) {
  cleanupListeners();
  currentUser = user;
  isAdmin = false;
  players = []; povs = []; demos = []; tactics = []; reviews = []; watches = [];
  modal = null; lightbox = null; loginError = ""; filters = { status: "all", map: "", type: "" };
  trainIdx = 5; trainMap = ""; trainPlan = null; trainDone = {}; trainMode = "normal";
  if (user) {
    clearForm("lf-");
    loadTraining();
    await loadConfig();
    page = "povs";
    subscribeData();
  }
  authReady = true;
  render();
});

async function loadConfig() {
  try {
    var snap = await getDoc(doc(db, "config", "admin"));
    var uids = snap.exists() ? (snap.data().uids || []) : [];
    isAdmin = uids.indexOf(currentUser.uid) !== -1;
  } catch (e) { isAdmin = false; }
  try {
    var m = await getDoc(doc(db, "config", "meta"));
    if (m.exists()) meta = Object.assign({}, meta, m.data());
  } catch (e) {}
  document.title = meta.teamName || "MTRY Hub";
}

function listen(name, ref, apply) {
  subs.push(onSnapshot(ref, function (snap) {
    apply(snap.docs.map(function (d) { return Object.assign({ id: d.id, uid: d.id }, d.data()); }));
    render();
  }, function (err) {
    console.error(name, err);
    if (!warnedColls[name]) {
      warnedColls[name] = true;
      toast("Sem acesso à coleção '" + name + "'. Republique as regras do Firestore (firestore.rules).", "err");
    }
  }));
}

function subscribeData() {
  listen("players", collection(db, "players"), function (l) { players = l; });
  listen("povs", collection(db, "povs"), function (l) { povs = l; });
  listen("demos", collection(db, "demos"), function (l) { demos = l; });
  listen("tactics", collection(db, "tactics"), function (l) { tactics = l; });
  // Técnico lê tudo; jogador só lê os próprios registros (regra do Firestore).
  var rq = isAdmin ? collection(db, "reviews") : query(collection(db, "reviews"), where("playerUid", "==", currentUser.uid));
  var wq = isAdmin ? collection(db, "watches") : query(collection(db, "watches"), where("playerUid", "==", currentUser.uid));
  listen("reviews", rq, function (l) { reviews = l; });
  listen("watches", wq, function (l) { watches = l; });
}

function cleanupListeners() {
  subs.forEach(function (u) { try { u(); } catch (e) {} });
  subs = [];
}

/* ================================================================
   RENDER
   ================================================================ */
function captureFocus() {
  var el = document.activeElement;
  if (el && el.getAttribute && el.getAttribute("data-k")) {
    return { k: el.getAttribute("data-k"), s: el.selectionStart, e: el.selectionEnd };
  }
  return null;
}
function restoreForm(snap) {
  document.querySelectorAll("[data-k]").forEach(function (el) {
    var k = el.getAttribute("data-k");
    if (formState[k] !== undefined) el.value = formState[k];
  });
  if (snap) {
    var el = document.querySelector('[data-k="' + snap.k + '"]');
    if (el) {
      el.focus();
      try { el.setSelectionRange(snap.s, snap.e); } catch (e) {}
    }
  }
}

function render() {
  var snap = captureFocus();
  var ar = document.getElementById("app-root");
  if (!authReady) ar.innerHTML = '<div class="loader"><span></span></div>';
  else if (!currentUser) ar.innerHTML = renderLogin();
  else ar.innerHTML = renderShell();
  renderModalRoot();
  renderLightboxRoot();
  restoreForm(snap);
  document.body.classList.toggle("no-scroll", !!(modal || lightbox));
}

/* ---------------- login ---------------- */
function renderLogin() {
  var fields = loginTab === "admin"
    ? `<label class="field"><span>E-mail do técnico</span><input type="email" data-k="lf-email" autocomplete="username" placeholder="voce@email.com"></label>`
    : `<label class="field"><span>Usuário</span><input type="text" data-k="lf-user" autocomplete="username" autocapitalize="none" placeholder="ex: joaozinho"></label>`;
  return `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="logo-mark">${icon("logo", 28)}</div>
      <h1 class="auth-title">${h(meta.teamName)}</h1>
      <p class="auth-sub">${h(meta.tagline)}. Entre para ver as POVs, demos e táticas.</p>
      <div class="seg">
        <button class="seg-btn ${loginTab === "player" ? "active" : ""}" data-action="login-tab" data-v="player" type="button">Jogador</button>
        <button class="seg-btn ${loginTab === "admin" ? "active" : ""}" data-action="login-tab" data-v="admin" type="button">Técnico</button>
      </div>
      <form data-form="login">
        ${fields}
        <label class="field"><span>Senha</span><input type="password" data-k="lf-pass" autocomplete="current-password" placeholder="••••••••"></label>
        <button class="btn primary block" type="submit" ${busy ? "disabled" : ""}>${busy ? "Entrando…" : "Entrar"}</button>
      </form>
      ${loginError ? `<div class="form-error">${h(loginError)}</div>` : ""}
      ${loginTab === "admin" ? `<div class="auth-hint">A conta do técnico é criada no Firebase Console (veja o README).</div>` : ""}
    </div>
  </div>`;
}

/* ---------------- shell ---------------- */
function pendingCount(id) {
  if (id === "povs") return povs.filter(visibleForMe).filter(function (v) { return !povDone(v.id, currentUser.uid); }).length;
  if (id === "demos") return demos.filter(visibleForMe).filter(function (v) { return !reviewFor(v.id, currentUser.uid); }).length;
  return 0;
}
function navItems() {
  var items = [
    { id: "povs", label: "POVs", short: "POVs", icon: "pov" },
    { id: "demos", label: "Demos", short: "Demos", icon: "demo" },
    { id: "tactics", label: "Táticas & Smokes", short: "Táticas", icon: "tactic" },
    { id: "training", label: "Treino", short: "Treino", icon: "training" }
  ];
  if (isAdmin) {
    items.push({ id: "players", label: "Jogadores", short: "Jogadores", icon: "players" });
    items.push({ id: "settings", label: "Configurações", short: "Ajustes", icon: "settings" });
  }
  items.forEach(function (it) { it.badge = isAdmin ? 0 : pendingCount(it.id); });
  return items;
}
function userInfo() {
  var m = me();
  return {
    name: isAdmin ? "Técnico" : (m ? m.name : currentUser.email),
    role: isAdmin ? "Painel do técnico" : (m && m.team ? "Time " + m.team : "Jogador")
  };
}

function renderShell() {
  var items = navItems();
  var u = userInfo();
  var nav = items.map(function (it) {
    return `<button class="nav-item ${page === it.id ? "active" : ""}" data-action="nav" data-v="${it.id}" type="button">
      ${icon(it.icon, 20)}<span class="nav-label">${h(it.label)}</span>${it.badge ? `<span class="count-pill">${it.badge}</span>` : ""}
    </button>`;
  }).join("");
  var bnav = items.map(function (it) {
    return `<button class="bnav-item ${page === it.id ? "active" : ""}" data-action="nav" data-v="${it.id}" type="button">
      ${icon(it.icon, 22)}<span>${h(it.short)}</span>${it.badge ? `<span class="count-pill">${it.badge}</span>` : ""}
    </button>`;
  }).join("");
  return `
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <span class="logo-mark">${icon("logo", 22)}</span>
        <div><div class="brand-name">${h(meta.teamName)}</div><div class="brand-sub">${h(meta.tagline)}</div></div>
      </div>
      <nav class="nav">${nav}</nav>
      <div class="user-chip">
        <span class="avatar">${h(initials(u.name))}</span>
        <div class="user-meta"><div class="user-name">${h(u.name)}</div><div class="user-role">${h(u.role)}</div></div>
        <button class="icon-btn" data-action="logout" type="button" title="Sair" aria-label="Sair">${icon("logout", 18)}</button>
      </div>
    </aside>
    <div class="content">
      <header class="mtop">
        <div class="brand"><span class="logo-mark">${icon("logo", 18)}</span><div class="brand-name">${h(meta.teamName)}</div></div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="chip accent">${h(u.role)}</span>
          <button class="icon-btn" data-action="logout" type="button" aria-label="Sair">${icon("logout", 18)}</button>
        </div>
      </header>
      <main class="page">${renderPage()}</main>
    </div>
    <nav class="bottom-nav">${bnav}</nav>
  </div>`;
}

function pageHead(title, sub) {
  return `<div class="page-head"><h1 class="page-title">${h(title)}</h1><p class="page-sub">${h(sub)}</p></div>`;
}
function emptyState(ic, text) {
  return `<div class="empty">${icon(ic, 34)}<div>${h(text)}</div></div>`;
}

function renderPage() {
  if (page === "training") return renderTraining();
  if (isAdmin) {
    if (page === "povs") return renderAdminItems("pov");
    if (page === "demos") return renderAdminItems("demo");
    if (page === "tactics") return renderAdminTactics();
    if (page === "players") return renderAdminPlayers();
    if (page === "settings") return renderAdminSettings();
  }
  if (page === "demos") return renderPlayerItems("demo");
  if (page === "tactics") return renderPlayerTactics();
  return renderPlayerItems("pov");
}

/* ================================================================
   JOGADOR — POVs e Demos
   ================================================================ */
function renderPlayerItems(kind) {
  var all = (kind === "pov" ? povs : demos).filter(visibleForMe).sort(byDateDesc);
  var isDone = function (it) { return kind === "pov" ? povDone(it.id, currentUser.uid) : !!reviewFor(it.id, currentUser.uid); };
  var doneN = all.filter(isDone).length;
  var pendN = all.length - doneN;
  var shown = all.filter(function (it) {
    return filters.status === "all" || (filters.status === "pending" ? !isDone(it) : isDone(it));
  });
  var head = kind === "pov"
    ? pageHead("POVs", "Vídeos de gameplay separados pelo técnico. Assista e marque como assistido.")
    : pageHead("Demos", "Baixe o arquivo .dem, assista no CS2 e envie sua avaliação com 5 pontos positivos e 5 negativos.");
  var chips = [["all", "Todas", all.length], ["pending", "Pendentes", pendN], ["done", "Concluídas", doneN]].map(function (c) {
    return `<button class="chip-btn ${filters.status === c[0] ? "active" : ""}" data-action="filter-status" data-v="${c[0]}" type="button">${c[1]} · ${c[2]}</button>`;
  }).join("");
  var body = shown.length
    ? `<div class="grid">${shown.map(kind === "pov" ? povCard : demoCard).join("")}</div>`
    : emptyState(kind === "pov" ? "pov" : "demo", all.length ? "Nada nesse filtro por enquanto." : (kind === "pov" ? "O técnico ainda não separou nenhuma POV pra você." : "O técnico ainda não separou nenhuma demo pra você."));
  return head + `<div class="filters">${chips}</div>` + body;
}

function assignTag(item) {
  return item.assignedTo === "todos" ? `<span class="chip">Geral</span>` : `<span class="chip accent">Pra você</span>`;
}

function povCard(v) {
  var done = povDone(v.id, currentUser.uid);
  var thumb = ytThumb(v.videoId || extractYoutubeId(v.url));
  return `
  <article class="card" tabindex="0" data-action="open-modal" data-v="pov:${v.id}">
    <div class="media">
      ${thumb ? `<img loading="lazy" src="${thumb}" alt="">` : `<div class="media-ph">${icon("pov", 40)}</div>`}
      <span class="play-btn">${icon("play", 18)}</span>
      <div class="media-tags">${done ? `<span class="chip ok">${icon("check", 13)} Assistido</span>` : ""}</div>
    </div>
    <div class="card-body">
      <div class="tags">${assignTag(v)}</div>
      <h3 class="card-title">${h(v.title)}</h3>
      ${v.note ? `<p class="card-note">${h(v.note)}</p>` : ""}
      <div class="card-foot"><span>${fmtDate(v.addedAt)}</span>${done ? "" : `<span class="chip warn">${icon("clock", 13)} Pendente</span>`}</div>
    </div>
  </article>`;
}

function demoCard(v) {
  var r = reviewFor(v.id, currentUser.uid);
  return `
  <article class="card" tabindex="0" data-action="open-modal" data-v="demo:${v.id}">
    <div class="media demo-media">
      <div class="media-ph">${icon("demo", 36)}<span class="dem-ext">.dem</span></div>
      <div class="media-tags">${r ? `<span class="chip ok">${icon("check", 13)} Avaliada</span>` : ""}</div>
    </div>
    <div class="card-body">
      <div class="tags">${assignTag(v)}</div>
      <h3 class="card-title">${h(v.title)}</h3>
      ${v.note ? `<p class="card-note">${h(v.note)}</p>` : ""}
      <div class="card-foot"><span>${fmtDate(v.addedAt)}</span>${r ? "" : `<span class="chip warn">${icon("clock", 13)} Avaliação pendente</span>`}</div>
    </div>
  </article>`;
}

/* ================================================================
   JOGADOR — Táticas & Smokes
   ================================================================ */
// Vídeos de uma tática (aceita táticas antigas, que tinham um vídeo só).
function tacticVideos(t) {
  var out = [], seen = {};
  function add(id, url) { if (id && !seen[id]) { seen[id] = 1; out.push({ id: id, url: url || ("https://youtu.be/" + id) }); } }
  if (Array.isArray(t.videoIds)) t.videoIds.forEach(function (id, i) { add(id, (t.youtubeUrls || [])[i]); });
  else add(t.videoId || extractYoutubeId(t.youtubeUrl), t.youtubeUrl);
  return out;
}
function parseVideoLines(text) {
  var ids = [], urls = [], bad = [];
  String(text || "").split(/\s+/).filter(Boolean).forEach(function (l) {
    var id = extractYoutubeId(l);
    if (!id) bad.push(l);
    else if (ids.indexOf(id) === -1) { ids.push(id); urls.push(l); }
  });
  return { ids: ids, urls: urls, bad: bad };
}
function parseImageLines(text) {
  var urls = [], err = "";
  String(text || "").split(/\s+/).filter(Boolean).forEach(function (u) {
    if (err) return;
    if (!/^https?:\/\//i.test(u)) err = "Link de imagem inválido: " + u;
    else if (isImgbbPageLink(u)) err = "Use o \"Link direto\" do imgbb (começa com https://i.ibb.co/). Esse é o link da página.";
    else if (urls.indexOf(u) === -1) urls.push(u);
  });
  return { urls: urls, err: err };
}
function tacticMediaPayload(vids, imgs) {
  return {
    videoIds: vids.map(function (v) { return v.id; }), youtubeUrls: vids.map(function (v) { return v.url; }),
    youtubeUrl: vids[0] ? vids[0].url : "", videoId: vids[0] ? vids[0].id : "", images: imgs
  };
}

function tacticCover(t) {
  var img = (t.images || [])[0];
  var v0 = tacticVideos(t)[0];
  var src = img || ytThumb(v0 && v0.id);
  return src ? `<img loading="lazy" referrerpolicy="no-referrer" src="${h(src)}" alt="" onerror="this.style.display='none'">` : "";
}

function renderPlayerTactics() {
  var all = tactics.filter(tacticVisible).sort(byDateDesc);
  var maps = [], types = [];
  all.forEach(function (t) {
    if (t.map && maps.indexOf(t.map) === -1) maps.push(t.map);
    if (t.type && types.indexOf(t.type) === -1) types.push(t.type);
  });
  maps.sort(); types.sort();
  var shown = all.filter(function (t) {
    return (!filters.map || t.map === filters.map) && (!filters.type || t.type === filters.type);
  });
  var mapChips = maps.length ? `<div class="filters"><span class="filter-label">Mapa</span>
      <button class="chip-btn ${!filters.map ? "active" : ""}" data-action="filter-map" data-v="" type="button">Todos</button>
      ${maps.map(function (m) { return `<button class="chip-btn ${filters.map === m ? "active" : ""}" data-action="filter-map" data-v="${h(m)}" type="button">${h(m)}</button>`; }).join("")}
    </div>` : "";
  var typeChips = types.length ? `<div class="filters"><span class="filter-label">Tipo</span>
      <button class="chip-btn ${!filters.type ? "active" : ""}" data-action="filter-type" data-v="" type="button">Todos</button>
      ${types.map(function (t) { return `<button class="chip-btn ${filters.type === t ? "active" : ""}" data-action="filter-type" data-v="${h(t)}" type="button">${h(t)}</button>`; }).join("")}
    </div>` : "";
  var body = shown.length
    ? `<div class="grid">${shown.map(tacticCard).join("")}</div>`
    : emptyState("tactic", all.length ? "Nenhuma tática nesse filtro." : "O técnico ainda não publicou táticas ou smokes.");
  return pageHead("Táticas & Smokes", "Biblioteca do time: táticas, smokes e lineups com vídeo e imagens.") + mapChips + typeChips + body;
}

function tacticCard(t) {
  var imgs = (t.images || []).length;
  var nVideos = tacticVideos(t).length, hasVideo = nVideos > 0;
  var cover = tacticCover(t);
  return `
  <article class="card" tabindex="0" data-action="open-modal" data-v="tactic:${t.id}">
    <div class="media">
      ${cover || `<div class="media-ph">${icon("tactic", 40)}</div>`}
      ${hasVideo ? `<span class="play-btn">${icon("play", 18)}</span>` : ""}
      <div class="media-tags">${nVideos > 1 ? `<span class="chip">${icon("pov", 13)} ${nVideos}</span>` : ""}${imgs ? `<span class="chip">${icon("image", 13)} ${imgs}</span>` : ""}</div>
    </div>
    <div class="card-body">
      <div class="tags">
        ${t.type ? `<span class="chip accent">${h(t.type)}</span>` : ""}
        ${t.map ? `<span class="chip">${h(t.map)}</span>` : ""}
        ${t.side ? `<span class="chip">${h(t.side)}</span>` : ""}
      </div>
      <h3 class="card-title">${h(t.title)}</h3>
      ${t.note ? `<p class="card-note">${h(t.note)}</p>` : ""}
      <div class="card-foot"><span>${fmtDate(t.addedAt)}</span></div>
    </div>
  </article>`;
}

/* ================================================================
   MODAL
   ================================================================ */
function modalItem() {
  if (!modal) return null;
  var list = modal.kind === "pov" ? povs : modal.kind === "demo" ? demos : tactics;
  return list.find(function (x) { return x.id === modal.id; }) || null;
}

function renderModalRoot() {
  var mr = document.getElementById("modal-root");
  var item = modalItem();
  if (modal && !item) { modal = null; }
  var key = modal ? modal.kind + ":" + modal.id : null;
  if (!key) { mr.innerHTML = ""; lastModalKey = null; return; }
  if (key !== lastModalKey) { mr.innerHTML = modalShell(item); lastModalKey = key; }
  var dyn = document.getElementById("modal-dyn");
  if (dyn) dyn.innerHTML = modalDynamic(item);
}

function ytIframe(vid, title, autoplay) {
  return `<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${vid}?rel=0${autoplay ? "&autoplay=1" : ""}" title="${h(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
}

function modalShell(item) {
  var inner = "";
  if (modal.kind === "pov") {
    var vid = item.videoId || extractYoutubeId(item.url);
    inner = (vid ? ytIframe(vid, item.title, true) : `<div class="player ph">${icon("pov", 46)}</div>`) + `
      <div class="modal-body">
        <div class="tags">${assignTag(item)}<span class="chip">${fmtDate(item.addedAt)}</span></div>
        <h2 class="modal-title">${h(item.title)}</h2>
        ${item.note ? `<p class="modal-note">${h(item.note)}</p>` : ""}
        <div class="actions"><a class="btn" href="${h(item.url)}" target="_blank" rel="noopener noreferrer">${icon("ext", 16)} Abrir no YouTube</a></div>
        <div id="modal-dyn"></div>
      </div>`;
  } else if (modal.kind === "demo") {
    inner = `<div class="player demo-ph ph">${icon("demo", 48)}</div>
      <div class="modal-body">
        <div class="tags">${assignTag(item)}<span class="chip">${fmtDate(item.addedAt)}</span></div>
        <h2 class="modal-title">${h(item.title)}</h2>
        ${item.note ? `<p class="modal-note">${h(item.note)}</p>` : ""}
        <div class="actions"><a class="btn primary" href="${h(item.url)}" target="_blank" rel="noopener noreferrer">${icon("download", 16)} Baixar demo (.dem)</a></div>
        <div id="modal-dyn"></div>
      </div>`;
  } else {
    var vids = tacticVideos(item);
    var switcher = vids.length > 1 ? `<div class="section-label" style="margin-top:0">Vídeos (${vids.length})</div><div class="vlist">${vids.map(function (v, i) {
      return `<button class="vitem ${i === 0 ? "active" : ""}" type="button" data-action="tv-select" data-v="${v.id}"><span class="vthumb"><img loading="lazy" src="${ytThumb(v.id)}" alt=""></span><span>Vídeo ${i + 1}</span></button>`;
    }).join("")}</div>` : "";
    var imgs = item.images || [];
    var gallery = imgs.length ? `<div class="section-label">Imagens</div><div class="gallery">${imgs.map(function (u, i) {
      return `<button class="gthumb" type="button" data-action="lb-open" data-v="${item.id}:${i}"><img loading="lazy" referrerpolicy="no-referrer" src="${h(u)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'img-broken',textContent:'Imagem não carregou — use o link direto do imgbb'}))"></button>`;
    }).join("")}</div>` : "";
    inner = (vids.length ? ytIframe(vids[0].id, item.title, false) : "") + `
      <div class="modal-body" ${vids.length ? "" : 'style="padding-top:64px"'}>
        ${switcher}
        <div class="tags">
          ${item.type ? `<span class="chip accent">${h(item.type)}</span>` : ""}
          ${item.map ? `<span class="chip">${h(item.map)}</span>` : ""}
          ${item.side ? `<span class="chip">${h(item.side)}</span>` : ""}
          ${item.team ? `<span class="chip">Time ${h(item.team)}</span>` : ""}
        </div>
        <h2 class="modal-title">${h(item.title)}</h2>
        ${item.note ? `<p class="modal-note">${h(item.note)}</p>` : ""}
        ${gallery}
      </div>`;
  }
  return `<div class="modal-backdrop" data-action="close-backdrop"><div class="modal" role="dialog" aria-modal="true">
    <button class="modal-x" type="button" data-action="close-modal" aria-label="Fechar">${icon("close", 18)}</button>${inner}</div></div>`;
}

function modalDynamic(item) {
  if (isAdmin || !item) return "";
  if (modal.kind === "pov") {
    var done = povDone(item.id, currentUser.uid);
    var w = watchFor(item.id, currentUser.uid);
    return done
      ? `<div class="status-box ok">${icon("check", 20)}<div><strong>Marcada como assistida</strong><span>em ${fmtDateTime(w.watchedAt)}</span></div></div>`
      : `<div class="status-box warn">${icon("clock", 20)}<div><strong>Ainda não marcada como assistida</strong><span>Quando terminar de ver, confirme abaixo pro técnico saber.</span></div></div>
         <div class="actions"><button class="btn primary" type="button" data-action="mark-watched" data-id="${item.id}" ${busy ? "disabled" : ""}>${icon("check", 16)} Marcar como assistido</button></div>`;
  }
  if (modal.kind === "demo") return demoReviewHtml(item);
  return "";
}

function demoReviewHtml(item) {
  var r = reviewFor(item.id, currentUser.uid);
  var pos = (r && r.positives) || [], neg = (r && r.negatives) || [];
  var status = r
    ? `<div class="status-box ok">${icon("check", 20)}<div><strong>Avaliação enviada</strong><span>em ${fmtDateTime(r.submittedAt)} · você pode editar abaixo</span></div></div>`
    : `<div class="status-box warn">${icon("clock", 20)}<div><strong>Avaliação pendente</strong><span>Assista a demo e escreva 5 pontos positivos e 5 negativos pra confirmar.</span></div></div>`;
  function inputs(prefix, arr, label) {
    var out = "";
    for (var i = 0; i < 5; i++) {
      out += `<input type="text" required maxlength="220" data-k="rv-${item.id}-${prefix}${i}" value="${h(arr[i] || "")}" placeholder="${label} ${i + 1}">`;
    }
    return out;
  }
  return status + `
    <form class="review-form" data-form="review" data-id="${item.id}">
      <div class="review-cols">
        <div class="col-pos"><h4>${icon("check", 16)} 5 pontos positivos</h4>${inputs("pos", pos, "Positivo")}</div>
        <div class="col-neg"><h4>${icon("close", 16)} 5 pontos negativos</h4>${inputs("neg", neg, "Negativo")}</div>
      </div>
      <button class="btn primary block" type="submit" ${busy ? "disabled" : ""}>${busy ? "Enviando…" : (r ? "Atualizar avaliação" : "Confirmar que assisti e enviar")}</button>
    </form>`;
}

/* ---------------- lightbox ---------------- */
function renderLightboxRoot() {
  var lr = document.getElementById("lightbox-root");
  if (!lightbox) { lr.innerHTML = ""; return; }
  var n = lightbox.urls.length;
  lr.innerHTML = `<div class="lightbox" data-action="lb-backdrop">
    <button class="lb-btn lb-close" type="button" data-action="lb-close" aria-label="Fechar">${icon("close", 20)}</button>
    ${n > 1 ? `<button class="lb-btn lb-prev" type="button" data-action="lb-prev" aria-label="Anterior">${icon("left", 22)}</button>
    <button class="lb-btn lb-next" type="button" data-action="lb-next" aria-label="Próxima">${icon("right", 22)}</button>` : ""}
    <img class="lb-img" referrerpolicy="no-referrer" src="${h(lightbox.urls[lightbox.i])}" alt="">
    ${n > 1 ? `<div class="lb-count">${lightbox.i + 1} / ${n}</div>` : ""}
  </div>`;
}

/* ================================================================
   TÉCNICO — POVs e Demos
   ================================================================ */
function adminProgress(items, kind) {
  var total = 0, done = 0;
  items.forEach(function (it) {
    expectedPlayers(it).forEach(function (p) {
      total++;
      if (kind === "pov" ? povDone(it.id, p.uid) : reviewFor(it.id, p.uid)) done++;
    });
  });
  return { total: total, done: done };
}

function assignSelect(key) {
  return `<label class="field"><span>Atribuir a</span><select data-k="${key}">
    <option value="todos">Todos (geral)</option>
    ${players.map(function (p) { return `<option value="${h(p.uid)}">${h(p.name)}${p.team ? " (" + h(p.team) + ")" : ""}</option>`; }).join("")}
  </select></label>`;
}

function renderAdminItems(kind) {
  var isPov = kind === "pov";
  var items = (isPov ? povs : demos).slice().sort(byDateDesc);
  var pr = adminProgress(items, kind);
  var pre = isPov ? "pv" : "dm";
  var head = isPov
    ? pageHead("POVs", "Cadastre links do YouTube e acompanhe quem já assistiu cada vídeo.")
    : pageHead("Demos", "Cadastre o link do arquivo .dem e acompanhe quem já assistiu e avaliou.");
  var stats = `<div class="stats">
      <div class="stat"><b>${items.length}</b><span>Cadastradas</span></div>
      <div class="stat"><b>${pr.done}</b><span>${isPov ? "Visualizações marcadas" : "Avaliações enviadas"}</span></div>
      <div class="stat"><b>${pr.total - pr.done}</b><span>Pendentes</span></div>
    </div>`;
  var form = `<div class="panel">
      <div class="panel-title">${isPov ? "Adicionar POV" : "Adicionar demo"}</div>
      <form data-form="add-${kind}">
        <div class="fgrid">
          <label class="field span-2"><span>Título</span><input type="text" required data-k="${pre}-title" placeholder="${isPov ? "ex: POV do zeus — Mirage" : "ex: Mirage vs Time X — mapa 1"}"></label>
          <label class="field span-2"><span>${isPov ? "Link do YouTube" : "Link do arquivo .dem (Google Drive, Mega, Dropbox…)"}</span><input type="url" required data-k="${pre}-url" placeholder="${isPov ? "https://youtube.com/watch?v=..." : "https://drive.google.com/..."}"></label>
          ${assignSelect(pre + "-who")}
          <label class="field"><span>Observação (opcional)</span><input type="text" data-k="${pre}-note" placeholder="ex: focar nos retakes do 2º half"></label>
        </div>
        ${isPov ? "" : `<div class="help" style="margin:-4px 0 14px">O site não guarda o arquivo — só o link de onde ele já está hospedado.</div>`}
        <button class="btn primary" type="submit" ${busy ? "disabled" : ""}>${icon("plus", 16)} Adicionar</button>
      </form>
    </div>`;
  var rows = items.map(function (it) { return adminItemRow(kind, it); }).join("");
  var list = `<div class="panel"><div class="panel-title">Cadastradas (${items.length})</div>${rows || emptyState(isPov ? "pov" : "demo", "Nada cadastrado ainda.")}</div>`;
  return head + stats + form + list;
}

function adminItemRow(kind, it) {
  var key = kind + ":" + it.id;
  var open = openAdminItem === key;
  var exp = expectedPlayers(it);
  var done = exp.filter(function (p) { return kind === "pov" ? povDone(it.id, p.uid) : reviewFor(it.id, p.uid); }).length;
  var who = it.assignedTo === "todos" ? "Geral (todos)" : nameForUid(it.assignedTo);
  var thumb = kind === "pov" ? ytThumb(it.videoId || extractYoutubeId(it.url)) : "";
  var detail = "";
  if (open) {
    detail = `<div class="arow-detail">` + (exp.length ? exp.map(function (p) { return kind === "pov" ? povStatusRow(it, p) : demoStatusRow(it, p); }).join("") : `<div class="help">Nenhum jogador atribuído.</div>`) + `</div>`;
  }
  return `<div>
    <div class="arow">
      <button class="arow-main" type="button" data-action="toggle-item" data-v="${key}">
        <span class="arow-thumb">${thumb ? `<img loading="lazy" src="${thumb}" alt="">` : icon(kind === "pov" ? "pov" : "demo", 20)}</span>
        <span class="arow-info"><strong>${h(it.title)}</strong><small>${h(who)} · ${fmtDate(it.addedAt)}</small></span>
        <span class="chip ${exp.length && done === exp.length ? "ok" : ""}">${done}/${exp.length} ${kind === "pov" ? "assistiram" : "avaliaram"}</span>
        ${icon("chev", 16)}
      </button>
      <a class="icon-btn" href="${h(it.url)}" target="_blank" rel="noopener noreferrer" title="Abrir link" aria-label="Abrir link">${icon("ext", 16)}</a>
      <button class="icon-btn danger" type="button" data-action="del" data-kind="${kind}" data-id="${it.id}" title="Remover" aria-label="Remover">${icon("trash", 16)}</button>
    </div>${detail}</div>`;
}

function povStatusRow(it, p) {
  var w = watchFor(it.id, p.uid), txt, cls = "";
  if (w && w.watchedAt) { txt = "Assistiu · marcou em " + fmtDateTime(w.watchedAt) + (w.openedAt ? " (abriu em " + fmtDateTime(w.openedAt) + ")" : ""); cls = "ok"; }
  else if (w && w.openedAt) { txt = "Abriu em " + fmtDateTime(w.openedAt) + ", mas não marcou como assistido"; cls = "warn"; }
  else txt = "Ainda não abriu";
  return `<div class="prow"><span class="avatar">${h(initials(p.name))}</span><div class="prow-info"><strong>${h(p.name)}${p.team ? ` <span class="chip">${h(p.team)}</span>` : ""}</strong><small>${h(txt)}</small></div><span class="chip ${cls}">${cls === "ok" ? icon("check", 13) + " Assistiu" : cls === "warn" ? icon("eye", 13) + " Só abriu" : icon("clock", 13) + " Pendente"}</span></div>`;
}

function demoStatusRow(it, p) {
  var r = reviewFor(it.id, p.uid);
  var body;
  if (r) {
    body = `<small>Avaliou em ${h(fmtDateTime(r.submittedAt))}</small><div class="pts">` +
      (r.positives || []).filter(Boolean).map(function (t) { return `<div class="p">+ ${h(t)}</div>`; }).join("") +
      (r.negatives || []).filter(Boolean).map(function (t) { return `<div class="n">− ${h(t)}</div>`; }).join("") + `</div>`;
  } else body = `<small>Ainda não assistiu / avaliou</small>`;
  return `<div class="prow"><span class="avatar">${h(initials(p.name))}</span><div class="prow-info"><strong>${h(p.name)}${p.team ? ` <span class="chip">${h(p.team)}</span>` : ""}</strong>${body}</div><span class="chip ${r ? "ok" : ""}">${r ? icon("check", 13) + " Avaliou" : icon("clock", 13) + " Pendente"}</span></div>`;
}

/* ================================================================
   TÉCNICO — Táticas & Smokes
   ================================================================ */
function tacticEditPanel(t) {
  var vids = tacticVideos(t), imgs = t.images || [];
  function mrow(label, url, kind, i) {
    return `<div class="mrow"><span class="mrow-t">${label} ${i + 1} · ${h(url)}</span><button class="icon-btn danger" type="button" data-action="tactic-rm" data-id="${t.id}" data-kind="${kind}" data-i="${i}" title="Remover" aria-label="Remover">${icon("trash", 14)}</button></div>`;
  }
  var vrows = vids.map(function (v, i) { return mrow("Vídeo", v.url, "video", i); }).join("");
  var irows = imgs.map(function (u, i) { return mrow("Imagem", u, "image", i); }).join("");
  return `<div class="arow-detail tx-panel">
    <div class="section-label" style="margin-top:0">Vídeos (${vids.length})</div>
    ${vrows || '<div class="help">Nenhum vídeo ainda.</div>'}
    <label class="field" style="margin-top:12px"><span>Adicionar mais vídeos do YouTube — um link por linha</span>
      <textarea data-k="tx-${t.id}-yt" style="min-height:76px" placeholder="https://youtube.com/watch?v=..."></textarea></label>
    <div class="section-label">Imagens (${imgs.length})</div>
    ${irows || '<div class="help">Nenhuma imagem ainda.</div>'}
    <label class="field" style="margin-top:12px"><span>Adicionar mais imagens do imgbb — um link por linha</span>
      <textarea data-k="tx-${t.id}-imgs" style="min-height:76px" placeholder="https://i.ibb.co/xxxxxxx/imagem.png"></textarea></label>
    <button class="btn primary" type="button" data-action="tactic-save-media" data-id="${t.id}" ${busy ? "disabled" : ""}>${icon("check", 16)} Salvar</button>
  </div>`;
}

function renderAdminTactics() {
  var items = tactics.slice().sort(byDateDesc);
  var teamOpts = teamList().map(function (t) { return `<option value="${h(t)}">Só o time ${h(t)}</option>`; }).join("");
  var form = `<div class="panel">
      <div class="panel-title">Adicionar tática / smoke</div>
      <form data-form="add-tactic">
        <div class="fgrid">
          <label class="field span-2"><span>Título</span><input type="text" required data-k="tc-title" placeholder="ex: Smoke da janela — Mirage (TR)"></label>
          <label class="field"><span>Tipo</span><select data-k="tc-type">${TACTIC_TYPES.map(function (t) { return `<option>${t}</option>`; }).join("")}</select></label>
          <label class="field"><span>Mapa</span><input type="text" list="map-list" data-k="tc-map" placeholder="ex: Mirage"><datalist id="map-list">${MAPS.map(function (m) { return `<option value="${m}">`; }).join("")}</datalist></label>
          <label class="field"><span>Lado</span><select data-k="tc-side">${SIDES.map(function (s) { return `<option value="${s[0]}">${s[1]}</option>`; }).join("")}</select></label>
          <label class="field"><span>Visível para</span><select data-k="tc-team"><option value="">Todos os times</option>${teamOpts}</select></label>
          <label class="field span-2"><span>Vídeos do YouTube (opcional) — um link por linha</span><textarea data-k="tc-yt" style="min-height:76px" placeholder="https://youtube.com/watch?v=...&#10;https://youtu.be/..."></textarea>
            <div class="help">Pode colocar quantos vídeos quiser. Depois de publicar, dá pra adicionar mais pelo botão +.</div></label>
          <label class="field span-2"><span>Imagens do imgbb (opcional) — um link por linha</span><textarea data-k="tc-imgs" placeholder="https://i.ibb.co/xxxxxxx/imagem1.png&#10;https://i.ibb.co/yyyyyyy/imagem2.png"></textarea>
            <div class="help">Suba em imgbb.com e copie o <b>"Link direto"</b> (começa com <b>https://i.ibb.co/</b>). O link da página (ibb.co/…) não funciona.</div></label>
          <label class="field span-2"><span>Descrição (opcional)</span><textarea data-k="tc-note" placeholder="Passo a passo, timing, quem faz o quê…"></textarea></label>
        </div>
        <button class="btn primary" type="submit" ${busy ? "disabled" : ""}>${icon("plus", 16)} Publicar</button>
      </form>
    </div>`;
  var rows = items.map(function (t) {
    var cover = tacticCover(t), nv = tacticVideos(t).length, ni = (t.images || []).length, open = openTacticEdit === t.id;
    var sub = [t.type, t.map, t.side, t.team ? "Time " + t.team : "", nv + (nv === 1 ? " vídeo" : " vídeos"), ni + (ni === 1 ? " imagem" : " imagens"), fmtDate(t.addedAt)].filter(Boolean).map(h).join(" · ");
    return `<div><div class="arow">
      <button class="arow-main" type="button" data-action="open-modal" data-v="tactic:${t.id}">
        <span class="arow-thumb">${cover || icon("tactic", 20)}</span>
        <span class="arow-info"><strong>${h(t.title)}</strong><small>${sub}</small></span>
        ${icon("eye", 16)}
      </button>
      <button class="icon-btn ${open ? "on" : ""}" type="button" data-action="tactic-edit" data-id="${t.id}" title="Adicionar vídeos ou imagens" aria-label="Adicionar vídeos ou imagens">${icon("plus", 16)}</button>
      <button class="icon-btn danger" type="button" data-action="del" data-kind="tactic" data-id="${t.id}" title="Remover" aria-label="Remover">${icon("trash", 16)}</button>
    </div>${open ? tacticEditPanel(t) : ""}</div>`;
  }).join("");
  return pageHead("Táticas & Smokes", "Publique táticas, smokes e lineups: vídeos no YouTube e imagens hospedadas no imgbb.") +
    form + `<div class="panel"><div class="panel-title">Publicadas (${items.length})</div>${rows || emptyState("tactic", "Nada publicado ainda.")}</div>`;
}

/* ================================================================
   TÉCNICO — Jogadores e Configurações
   ================================================================ */
function renderAdminPlayers() {
  var sorted = players.slice().sort(function (a, b) {
    var ta = a.team || "Sem time", tb = b.team || "Sem time";
    return ta === tb ? a.name.localeCompare(b.name) : ta.localeCompare(tb);
  });
  var rows = "", last = null;
  sorted.forEach(function (p) {
    var t = p.team || "Sem time";
    if (t !== last) { rows += `<div class="team-label">Time ${h(t)}</div>`; last = t; }
    rows += `<div class="arow">
      <div class="arow-main" style="cursor:default"><span class="avatar" style="width:40px;height:40px">${h(initials(p.name))}</span>
        <span class="arow-info"><strong>${h(p.name)}</strong><small>usuário: ${h(p.username)}</small></span></div>
      <button class="icon-btn danger" type="button" data-action="del" data-kind="player" data-id="${h(p.uid)}" title="Remover" aria-label="Remover">${icon("trash", 16)}</button>
    </div>`;
  });
  var form = `<div class="panel">
      <div class="panel-title">Adicionar jogador</div>
      <form data-form="add-player">
        <div class="fgrid">
          <label class="field"><span>Nome</span><input type="text" required data-k="ap-name" placeholder="ex: João Silva"></label>
          <label class="field"><span>Usuário (login)</span><input type="text" required autocapitalize="none" data-k="ap-user" placeholder="ex: joaosilva"></label>
          <label class="field"><span>Senha (mín. 6 caracteres)</span><input type="text" required minlength="6" data-k="ap-pass" placeholder="ex: cs2mtry25"></label>
          <label class="field"><span>Time</span><input type="text" list="team-list" data-k="ap-team" placeholder="ex: Red"><datalist id="team-list">${teamList().map(function (t) { return `<option value="${h(t)}">`; }).join("")}</datalist></label>
        </div>
        <button class="btn primary" type="submit" ${busy ? "disabled" : ""}>${icon("plus", 16)} Adicionar jogador</button>
        <div class="help" style="margin-top:12px">Cria uma conta de verdade no Firebase Authentication. O jogador entra na aba "Jogador" com esse usuário e senha.</div>
      </form>
    </div>`;
  return pageHead("Jogadores", "Cadastre o elenco e organize por time.") + form +
    `<div class="panel"><div class="panel-title">Cadastrados (${players.length})</div>${rows || emptyState("players", "Nenhum jogador cadastrado ainda.")}
      <div class="help" style="margin-top:14px">Remover aqui tira o jogador da lista, mas a conta de login só é apagada de verdade em Authentication, no Firebase Console.</div></div>`;
}

function renderAdminSettings() {
  return pageHead("Configurações", "Nome do hub e senha do técnico.") + `
    <div class="panel"><div class="panel-title">Nome e frase do hub</div>
      <label class="field"><span>Nome do time</span><input type="text" data-k="st-name" value="${h(meta.teamName)}"></label>
      <label class="field"><span>Frase curta</span><input type="text" data-k="st-tag" value="${h(meta.tagline)}"></label>
      <button class="btn primary" type="button" data-action="save-meta" ${busy ? "disabled" : ""}>Salvar</button>
    </div>
    <div class="panel"><div class="panel-title">Sua senha de técnico</div>
      <label class="field"><span>Nova senha</span><input type="password" data-k="st-pass" placeholder="mínimo 6 caracteres" autocomplete="new-password"></label>
      <button class="btn" type="button" data-action="save-pass" ${busy ? "disabled" : ""}>Trocar senha</button>
      <div class="help" style="margin-top:12px">Se der erro de "login recente exigido", saia e entre de novo antes de trocar a senha.</div>
    </div>`;
}

/* ================================================================
   TREINO — gerador de treino por tempo disponível
   ================================================================ */
const TRAIN_STOPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 120, 180];
const CAT_LABEL = { warmup: "Aquecimento", recoil: "Spray / Recoil", dm: "Deathmatch", prefire: "Prefire", utility: "Utilitários", retake: "Retakes", review: "Revisão", setup: "Setup", team: "Time", rest: "Descanso" };
const CAT_ORDER = ["warmup", "recoil", "dm", "prefire", "utility", "retake", "review"];
const CAT_PRIORITY = ["warmup", "dm", "recoil", "prefire", "utility", "review", "retake"];
const CAT_WEIGHT = { warmup: 2, dm: 4, recoil: 2, prefire: 2, utility: 2, review: 1, retake: 2 };
const SINGLE_K = [0, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7];   // quantas categorias entram conforme os blocos de 5 min
const SESSION_TEMPLATES = [
  [["warmup", 2], ["recoil", 2], ["dm", 4], ["prefire", 2], ["utility", 2]],
  [["warmup", 1], ["dm", 4], ["prefire", 2], ["utility", 2], ["retake", 2], ["review", 1]],
  [["warmup", 1], ["recoil", 1], ["dm", 4], ["retake", 3], ["utility", 1], ["review", 2]]
];
// Modo "Antes do campeonato": rotina leve (chegar aquecido, não cansado).
const PRE_ORDER = ["setup", "warmup", "dm", "prefire", "utility", "team", "review", "rest"];
const PRE_PRIORITY = ["warmup", "dm", "setup", "team", "prefire", "utility", "review", "rest"];
const PRE_WEIGHT = { setup: 1, warmup: 2, dm: 3, prefire: 2, utility: 2, team: 2, review: 1, rest: 1 };
const SINGLE_K_PRE = [0, 1, 2, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8];
const PRE_SESSIONS_2 = [
  [["setup", 1], ["warmup", 2], ["dm", 3], ["prefire", 2], ["utility", 2]],
  [["warmup", 1], ["team", 3], ["utility", 2], ["review", 2], ["rest", 2]]
];
const PRE_SESSIONS_3 = [
  [["setup", 1], ["warmup", 2], ["dm", 3], ["prefire", 2], ["utility", 2]],
  [["warmup", 1], ["team", 3], ["utility", 2], ["review", 2]],
  [["warmup", 1], ["dm", 2], ["prefire", 2], ["rest", 2]]
];
const TRAIN_KEY = "mtry_training_v1";

let trainMode = "normal"; // "normal" | "pre" (antes do campeonato)
let trainIdx = 5;        // posição da bolinha (padrão: 30 min)
let trainMap = "";       // "" = aleatório
let trainPlan = null;
let trainDone = {};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function nice(n) {
  n = Math.max(1, n);
  if (n < 10) return Math.round(n);
  if (n < 50) return Math.round(n / 5) * 5;
  return Math.round(n / 10) * 10;
}
function fmtMin(m) {
  if (m < 60) return m + " min";
  var hh = Math.floor(m / 60), mm = m % 60;
  return hh + "h" + (mm ? String(mm).padStart(2, "0") : "");
}
function fmtTotal(m) {
  if (m < 60) return m + " minutos";
  var hh = m / 60;
  return hh === 1 ? "1 hora" : hh + " horas";
}

const TV = 'Steam Workshop → pesquise ';
const DRILLS = {
  warmup: [
    { id: "w-botz", make: function (m) { return {
      title: "Aquecimento de mira — só headshot", map: "Aim Botz", mapHow: TV + '"Aim Botz" (uLLeticaL)',
      goal: nice(m * 9) + " kills só de headshot",
      steps: ["Arma: AK-47. Na metade do bloco, troque para a M4A1-S.", "Comece com bots parados; depois ative os bots em movimento.", "Kill sem acertar a cabeça não conta: pare e reposicione a mira."],
      tip: "Deixe a mira já na altura da cabeça entre um alvo e outro." }; } },
    { id: "w-fast", make: function (m) { return {
      title: "Reflexo e flick", map: "Fast Aim / Reflex Training", mapHow: TV + '"Fast Aim Reflex Training"',
      goal: nice(m * 14) + " alvos acertados",
      steps: ["Dificuldade média; suba quando passar de 90% de acerto.", "Foque em flicks curtos e secos, sem passar do alvo."],
      tip: "Relaxe o braço: tensão demais deixa o flick lento." }; } },
    { id: "w-trainaim", make: function (m) { return {
      title: "Tap e burst nos bots", map: "training_aim_csgo2", mapHow: TV + '"training_aim_csgo2"',
      goal: nice(m * 9) + " bots abatidos na cabeça",
      steps: ["Alterne entre tap (1 tiro) e burst (2–3 balas).", "Comece nos alvos parados e termine nos que se movem."],
      tip: "Qualidade vale mais que velocidade: 1 tiro na cabeça por alvo." }; } }
  ],
  recoil: [
    { id: "r-master", make: function (m) { return {
      title: "Controle de spray", map: "Recoil Master — Spray Training", mapHow: TV + '"Recoil Master Spray Training" (uLLeticaL)',
      goal: nice(m * 3) + " sprays completos",
      steps: ["Ative o guia (ghost hair) e acompanhe o spray da AK-47 e depois da M4A1-S.", "Na segunda metade, desligue o guia e repita de memória.", "Termine com rajadas curtas de 4–5 balas."],
      tip: "Puxe o mouse para baixo de forma contínua; não \"belisque\" o spray." }; } },
    { id: "r-botz", make: function (m) { return {
      title: "Spray e transferência de alvo", map: "Aim Botz", mapHow: TV + '"Aim Botz" (uLLeticaL)',
      goal: nice(m * 3) + " sprays de 10 balas",
      steps: ["Bot parado a média distância, mirando do peito até a cabeça.", "Faça o spray de 10 balas e transfira para o bot ao lado.", "Mantenha o spray dentro do corpo do bot."],
      tip: "Olhe para onde quer acertar, não para a mira." }; } }
  ],
  dm: [
    { id: "d-rifle", make: function (m, c) { return {
      title: "Deathmatch com rifle em " + c.map, map: "Deathmatch — " + c.map, mapHow: "Jogar → Deathmatch (modo oficial) ou um servidor comunitário de FFA Deathmatch",
      goal: nice(m * 9) + " kills (meta: 40% ou mais de headshot)",
      steps: ["Use só AK-47 (ou M4A1-S).", "Pré-mire os cantos antes de virar; não corra atirando.", "Troque de posição a cada morte para não decorar um único ângulo."],
      tip: "Pare de andar antes de atirar (counter-strafe)." }; } },
    { id: "d-tap", make: function (m, c) { return {
      title: "Deathmatch só tap e burst em " + c.map, map: "Deathmatch — " + c.map, mapHow: "Jogar → Deathmatch (modo oficial) ou um servidor comunitário de FFA Deathmatch",
      goal: nice(m * 8) + " kills com tap/burst",
      steps: ["Só vale rajada de até 3 balas.", "Mire na cabeça já durante o deslocamento.", "Morreu duas vezes no mesmo lugar? Mude o ângulo."],
      tip: "Calma na primeira bala: é ela que decide o duelo." }; } },
    { id: "d-awp", make: function (m, c) { return {
      title: "Deathmatch de AWP em " + c.map, map: "Deathmatch — " + c.map, mapHow: "Jogar → Deathmatch (modo oficial) ou um servidor comunitário de FFA Deathmatch",
      goal: nice(m * 5) + " kills de AWP",
      steps: ["Segure ângulos e evite peeks desesperados.", "Reposicione depois de cada kill.", "Nenhum tiro de AWP sem parar de andar antes."],
      tip: "Se errou o primeiro tiro, saia do ângulo em vez de insistir." }; } }
  ],
  prefire: [
    { id: "p-yprac", make: function (m, c) { return {
      title: "Prefire em " + c.map, map: "Yprac Hub — Prefire (" + c.map + ")", mapHow: TV + '"Yprac Hub" (Yesber) → modo Prefire → mapa ' + c.map,
      goal: nice(m * 1.5) + " rotas completas sem errar o primeiro tiro",
      steps: ["Faça os dois lados (T e CT) em cada rota.", "Foque em crosshair placement e counter-strafe antes de cada tiro.", "Errou a primeira bala? Repita a rota."],
      tip: "Limpe os ângulos na ordem em que aparecem no jogo, não na ordem que dá menos trabalho." }; } },
    { id: "p-yprac2", make: function (m, c) { return {
      title: "Ângulos de entrada em " + c.map, map: "Yprac Hub — Prefire (" + c.map + ")", mapHow: TV + '"Yprac Hub" (Yesber) → modo Prefire → mapa ' + c.map,
      goal: nice(m * 1.2) + " rotas de entrada em site",
      steps: ["Escolha as rotas de execução que seu time mais usa no mapa.", "Repita até acertar sem pausar entre os ângulos.", "Varie: uma rodada pré-mirando, outra reagindo."],
      tip: "Mire onde o inimigo vai estar, não onde ele está." }; } }
  ],
  utility: [
    { id: "u-yprac", make: function (m, c) { return {
      title: "Lineups de utilidade em " + c.map, map: "Yprac Hub — Utility (" + c.map + ")", mapHow: TV + '"Yprac Hub" (Yesber) → modo Utility → mapa ' + c.map,
      goal: Math.max(2, nice(m * 0.8)) + " lineups dominados (3 acertos seguidos)",
      steps: ["Escolha os lineups que você realmente usa em " + c.map + ".", "Repita cada um até acertar 3 vezes seguidas.", "Anote os que ainda erra para repetir no próximo treino.", "Confira também a aba Táticas & Smokes do hub."],
      tip: "Fixe uma referência no cenário e use sempre a mesma." }; } },
    { id: "u-flash", make: function (m, c) { return {
      title: "Flashes e molotovs de execução em " + c.map, map: "Yprac Hub — Utility (" + c.map + ")", mapHow: TV + '"Yprac Hub" (Yesber) → modo Utility → mapa ' + c.map,
      goal: Math.max(2, nice(m * 0.7)) + " lineups de flash/molotov",
      steps: ["Treine as utilidades que abrem o site (flash de entrada, molotov de limpeza).", "Cronometre: a utilidade tem que cair antes do seu time entrar.", "Repita até acertar 3 vezes seguidas."],
      tip: "Flash boa é a que cega o inimigo, não a que cega o seu time." }; } }
  ],
  retake: [
    { id: "t-retake", make: function (m, c) { return {
      title: "Retakes em " + c.map, map: "Retakes — " + c.map, mapHow: "Servidor comunitário de Retakes (se não achar, use Wingman/Competitivo)",
      goal: Math.max(2, nice(m * 0.6)) + " rounds de retake",
      steps: ["Alterne entre retake (CT) e defesa do bomb (T).", "Fale os callouts em voz alta, mesmo treinando sozinho.", "Use utilidade antes de entrar no site."],
      tip: "Antes de entrar, decida quem limpa qual ângulo." }; } },
    { id: "t-clutch", make: function (m, c) { return {
      title: "Clutch 1vX em " + c.map, map: "Retakes — " + c.map, mapHow: "Servidor comunitário de Retakes (se não achar, use Wingman/Competitivo)",
      goal: Math.max(2, nice(m * 0.5)) + " rounds de clutch",
      steps: ["Isole os duelos: nunca lute contra dois ao mesmo tempo.", "Use o som para decidir quando se mexer.", "Tempo é seu aliado: não corra se o bomb ainda não está no chão."],
      tip: "Depois de cada round, diga em uma frase por que ganhou ou perdeu." }; } }
  ],
  review: [
    { id: "v-review", make: function () { return {
      title: "Revisão e anotações", map: "Aqui no hub", mapHow: "Abas POVs e Demos",
      goal: "3 erros anotados + 1 ajuste para o próximo treino",
      steps: ["Assista 1–2 rounds seus (gravação ou demo) ou uma POV da aba POVs.", "Anote 3 erros: posicionamento, mira ou utilidade.", "Defina 1 ajuste concreto para o próximo treino."],
      tip: "Um ajuste bem feito vale mais que dez anotados e esquecidos." }; } }
  ]
};

const PRE_DRILLS = {
  setup: [
    { id: "s-config", make: function () { return {
      title: "Checagem de setup", map: "Seu PC e o CS2", mapHow: "Sem abrir mapa — confira tudo antes de entrar",
      goal: "Tudo conferido, sem mexer em nada depois",
      steps: ["Mouse e teclado: sensibilidade, DPI e crosshair iguais aos que você sempre usa.", "Áudio: teste o som dos passos e o microfone.", "Rede: feche downloads e programas pesados e confira o ping (de preferência no cabo).", "Feche o que não precisa, ative o Não perturbe e deixe água por perto."],
      tip: "Dia de campeonato não é dia de mudar config: só mexa se algo estiver quebrado." }; } },
    { id: "s-ambiente", make: function () { return {
      title: "Ambiente e equipamento", map: "Seu PC e o CS2", mapHow: "Sem abrir mapa — confira tudo antes de entrar",
      goal: "Ambiente pronto e sem pendências",
      steps: ["Atualizações do Windows/drivers: nada pendente para aparecer no meio do jogo.", "Teste o mouse, o headset e a conexão com a call do time.", "Celular no silencioso, cadeira e monitor ajustados.", "Tenha um plano B para internet e energia (hotspot, carregador)."],
      tip: "Resolva agora os problemas pequenos: no jogo eles viram desculpa." }; } }
  ],
  warmup: [
    { id: "pw-botz", make: function (m) { return {
      title: "Aquecimento leve de mira", map: "Aim Botz", mapHow: TV + '"Aim Botz" (uLLeticaL)',
      goal: nice(m * 7) + " kills de headshot, sem pressa",
      steps: ["Comece nos bots parados, devagar, para esquentar a mão.", "Depois, bots lentos em movimento.", "Se a mão cansar, pare: o objetivo é esquentar, não treinar pesado."],
      tip: "Qualidade, não quantidade: termine o bloco confiante." }; } },
    { id: "pw-recoil", make: function (m) { return {
      title: "Spray de aquecimento", map: "Recoil Master — Spray Training", mapHow: TV + '"Recoil Master Spray Training" (uLLeticaL)',
      goal: Math.max(2, nice(m * 2)) + " sprays com a arma que você mais usa",
      steps: ["Sprays curtos e médios da AK-47 e da M4A1-S com o guia ligado.", "Foque no ritmo, sem forçar o punho."],
      tip: "Mão solta: spray tenso sai torto." }; } },
    { id: "pw-reflex", make: function (m) { return {
      title: "Reflexo em dificuldade fácil", map: "Fast Aim / Reflex Training", mapHow: TV + '"Fast Aim Reflex Training"',
      goal: nice(m * 10) + " alvos acertados",
      steps: ["Dificuldade fácil ou média, sem forçar a velocidade.", "Flicks curtos e secos, sem passar do alvo."],
      tip: "Esquente primeiro, acelere só se estiver 100%." }; } }
  ],
  dm: [
    { id: "pd-rifle", make: function (m, c) { return {
      title: "Deathmatch de confiança em " + c.map, map: "Deathmatch — " + c.map, mapHow: "Jogar → Deathmatch (modo oficial) ou um servidor comunitário de FFA Deathmatch",
      goal: nice(m * 7) + " kills, sem se estressar com a sequência",
      steps: ["Use as armas que você usa em jogo (AK-47, M4 ou AWP).", "Foque em acertar a primeira bala e em jogar os ângulos que o time vai usar.", "Morreu? Respire e siga: não analise cada morte agora."],
      tip: "Termine o bloco com uma sequência boa para entrar confiante." }; } },
    { id: "pd-papel", make: function (m, c) { return {
      title: "Deathmatch jogando o seu papel em " + c.map, map: "Deathmatch — " + c.map, mapHow: "Jogar → Deathmatch (modo oficial) ou um servidor comunitário de FFA Deathmatch",
      goal: nice(m * 6) + " kills, passando pelas posições do seu papel",
      steps: ["Passe pelas posições que você ocupa no jogo e pré-mire os ângulos de lá.", "Treine os reposicionamentos depois de cada kill.", "Sem forçar duelo ruim: aqui vale decisão certa, não só kill."],
      tip: "Se o ritmo estiver baixo, melhor parar cedo do que entrar cansado." }; } }
  ],
  prefire: [
    { id: "pp-papel", make: function (m, c) { return {
      title: "Pré-aim das posições do seu papel em " + c.map, map: "Yprac Hub — Prefire (" + c.map + ")", mapHow: TV + '"Yprac Hub" (Yesber) → modo Prefire → mapa ' + c.map,
      goal: nice(m * 1.2) + " rotas sem errar o primeiro tiro",
      steps: ["Faça só as rotas do seu papel nesse mapa (lado T e CT).", "Limpe os ângulos na ordem certa e pare antes de atirar.", "Sem pressa: a ideia é fixar o movimento."],
      tip: "Repetir o que você já sabe dá mais confiança do que aprender rota nova hoje." }; } }
  ],
  utility: [
    { id: "pu-time", make: function (m, c) { return {
      title: "Utilitários das táticas do time em " + c.map, map: "Yprac Hub — Utility (" + c.map + ")", mapHow: TV + '"Yprac Hub" (Yesber) → modo Utility → mapa ' + c.map,
      goal: Math.max(2, nice(m * 0.8)) + " lineups da sua parte nas táticas",
      steps: ["Abra a aba Táticas & Smokes do hub e pegue as táticas desse mapa.", "Treine só os lineups que o seu papel executa.", "Acerte cada um 3 vezes seguidas e pare — sem inventar lineup novo hoje."],
      tip: "Dia de jogo é para repetir o que você já domina." }; } }
  ],
  team: [
    { id: "tm-sync", make: function (m, c) { return {
      title: "Alinhamento com o time em " + c.map, map: "Call do time (Discord)", mapHow: "Todo mundo na call, com os callouts do mapa à mão",
      goal: "3 combinados fechados: defaults, pistol e anti-eco",
      steps: ["Revisem os callouts do mapa e quem cobre cada ângulo.", "Fechem o plano do pistol round e o do anti-eco.", "Definam quem faz a call de meio de round e quem a assume se ele cair.", "Combinem como falar depois de um round perdido: curto e objetivo."],
      tip: "Um combinado simples e repetido vence um plano complicado." }; } },
    { id: "tm-server", make: function (m, c) { return {
      title: "Execuções no servidor privado — " + c.map, map: "Servidor privado — " + c.map, mapHow: "Crie um servidor/lobby privado e rode as táticas sem bots",
      goal: Math.max(2, nice(m * 0.5)) + " execuções limpas",
      steps: ["Rodem cada tática do mapa até sair no tempo certo.", "Parem na primeira que sair errada e ajustem o timing.", "Terminem sempre com uma execução que deu certo."],
      tip: "Termine com algo que deu certo para entrar com a moral alta." }; } }
  ],
  review: [
    { id: "pv-review", make: function () { return {
      title: "Revisão rápida", map: "Aqui no hub", mapHow: "Abas POVs, Demos e Táticas & Smokes",
      goal: "Relembrar 3 pontos-chave para o jogo",
      steps: ["Reveja suas últimas avaliações na aba Demos e os erros que você anotou.", "Assista uma POV ou demo do adversário, se tiver.", "Escolha 3 pontos-chave para lembrar durante o jogo (mira, posicionamento e utilidade)."],
      tip: "Três pontos simples são mais fáceis de lembrar do que dez." }; } }
  ],
  rest: [
    { id: "z-rest", make: function () { return {
      title: "Descanso e foco", map: "Longe do PC", mapHow: "Sem treinar mais",
      goal: "Chegar descansado e hidratado",
      steps: ["Levante, beba água e coma algo leve.", "Alongue punhos, mãos e pescoço.", "Respire fundo por 1 minuto e visualize as primeiras rodadas.", "Evite redes sociais e discussões: guarde a energia para o jogo."],
      tip: "Treinar a mais agora só cansa a mão. Confie no que você já fez." }; } }
  ]
};

function allocateUnits(pairs, units) {
  var out = {};
  pairs.forEach(function (p) { out[p[0]] = 1; });
  var remaining = Math.max(0, units - pairs.length);
  var W = pairs.reduce(function (sum, p) { return sum + p[1]; }, 0);
  var rems = [], given = 0;
  pairs.forEach(function (p) {
    var q = remaining * p[1] / W, f = Math.floor(q);
    out[p[0]] += f; given += f;
    rems.push({ cat: p[0], frac: q - f, w: p[1] });
  });
  rems.sort(function (a, b) { return b.frac - a.frac || b.w - a.w; });
  for (var i = 0; given < remaining; i = (i + 1) % rems.length) { out[rems[i].cat]++; given++; }
  return out;
}

function generatePlan(total, mapChoice, seed, mode) {
  var pre = mode === "pre";
  var pools = pre ? PRE_DRILLS : DRILLS;
  var order = pre ? PRE_ORDER : CAT_ORDER;
  var priority = pre ? PRE_PRIORITY : CAT_PRIORITY;
  var weights = pre ? PRE_WEIGHT : CAT_WEIGHT;
  var singleK = pre ? SINGLE_K_PRE : SINGLE_K;
  var rng = mulberry32(seed);
  var map = mapChoice || MAPS[Math.floor(rng() * MAPS.length)];
  var ctx = { map: map, used: {} };
  var units = total / 5;

  function pickDrill(cat) {
    var pool = pools[cat];
    var avail = pool.filter(function (d) { return !ctx.used[d.id]; });
    var list = avail.length ? avail : pool;
    var d = list[Math.floor(rng() * list.length)];
    ctx.used[d.id] = true;
    return d;
  }
  function session(pairs, sessionUnits) {
    var counts = allocateUnits(pairs, sessionUnits), out = [];
    order.forEach(function (cat) {
      if (!counts[cat]) return;
      var minutes = counts[cat] * 5, d = pickDrill(cat), made = d.make(minutes, ctx);
      out.push(Object.assign({ kind: "drill", cat: cat, minutes: minutes }, made));
    });
    return out;
  }

  var blocks = [], nSessions = total <= 60 ? 1 : (total === 120 ? 2 : 3);
  if (nSessions === 1) {
    var pairs = priority.slice(0, singleK[Math.min(units, 12)]).map(function (c) { return [c, weights[c]]; });
    blocks = session(pairs, units);
  } else {
    var work = units - (nSessions - 1), base = Math.floor(work / nSessions), extra = work - base * nSessions;
    for (var s = 0; s < nSessions; s++) {
      if (s > 0) blocks.push({ kind: "break", minutes: 5, title: "Pausa", steps: ["Levante, beba água e alongue punhos e pescoço.", "Olhe para longe por 20 segundos para descansar a vista."], tip: "Descansar entre as sessões mantém a qualidade do treino." });
      var tpl = pre ? (nSessions === 2 ? PRE_SESSIONS_2 : PRE_SESSIONS_3)[s] : SESSION_TEMPLATES[s];
      blocks = blocks.concat(session(tpl, base + (s < extra ? 1 : 0)));
    }
  }
  var t = 0;
  blocks.forEach(function (b) { b.start = t; t += b.minutes; b.end = t; });
  return { total: total, map: map, seed: seed, mode: pre ? "pre" : "normal", blocks: blocks };
}

function trainKey() { return TRAIN_KEY + "_" + (currentUser ? currentUser.uid : "anon"); }
function saveTraining() {
  try { localStorage.setItem(trainKey(), JSON.stringify({ idx: trainIdx, map: trainMap, mode: trainMode, plan: trainPlan, done: trainDone })); } catch (e) {}
}
function loadTraining() {
  try {
    var raw = localStorage.getItem(trainKey());
    if (!raw) return;
    var o = JSON.parse(raw);
    if (typeof o.idx === "number" && o.idx >= 0 && o.idx < TRAIN_STOPS.length) trainIdx = o.idx;
    if (typeof o.map === "string") trainMap = o.map;
    if (o.mode === "pre" || o.mode === "normal") trainMode = o.mode;
    if (o.plan && Array.isArray(o.plan.blocks) && o.plan.blocks.length) trainPlan = o.plan;
    if (o.done && typeof o.done === "object") trainDone = o.done;
  } catch (e) {}
}
function syncTrainUI() {
  var r = document.getElementById("train-range");
  if (!r) return;
  r.value = trainIdx;
  r.style.setProperty("--p", (trainIdx / (TRAIN_STOPS.length - 1) * 100) + "%");
  var l = document.getElementById("train-label");
  if (l) l.textContent = fmtTotal(TRAIN_STOPS[trainIdx]);
  document.querySelectorAll("#train-ticks .tick").forEach(function (t, i) { t.classList.toggle("active", i === trainIdx); });
}

function renderTraining() {
  var pct = trainIdx / (TRAIN_STOPS.length - 1) * 100;
  var ticks = TRAIN_STOPS.map(function (m, i) {
    return `<button type="button" class="tick ${i === trainIdx ? "active" : ""}" data-action="train-set" data-v="${i}" aria-label="${fmtTotal(m)}">${m < 60 ? m : (m / 60) + "h"}</button>`;
  }).join("");
  var mapOpts = `<option value="">Aleatório</option>` + MAPS.map(function (m) {
    return `<option value="${m}" ${trainMap === m ? "selected" : ""}>${m}</option>`;
  }).join("");
  var isPre = trainMode === "pre";
  var panel = `<div class="panel train-panel">
      <div class="seg train-seg">
        <button class="seg-btn ${!isPre ? "active" : ""}" data-action="train-mode" data-v="normal" type="button">Treino normal</button>
        <button class="seg-btn ${isPre ? "active" : ""}" data-action="train-mode" data-v="pre" type="button">Antes do campeonato</button>
      </div>
      <p class="train-modehelp">${isPre
        ? "Rotina leve pra chegar aquecido, não cansado: setup, aquecimento, pré-aim e utilitários do seu papel, alinhamento com o time e descanso."
        : "Treino pra evoluir: mira, spray, deathmatch, prefire, utilitários e revisão."}</p>
      <div class="train-top">
        <div><div class="train-small">Tempo disponível pra treinar</div><div class="train-big" id="train-label">${fmtTotal(TRAIN_STOPS[trainIdx])}</div></div>
        <label class="field train-map"><span>${isPre ? "Mapa do primeiro jogo" : "Mapa do treino"}</span><select id="train-map">${mapOpts}</select></label>
      </div>
      <div class="range-wrap">
        <input type="range" class="range" id="train-range" min="0" max="${TRAIN_STOPS.length - 1}" step="1" value="${trainIdx}" style="--p:${pct}%" aria-label="Tempo disponível para treinar">
        <div class="ticks" id="train-ticks">${ticks}</div>
      </div>
      <button class="btn primary block" type="button" data-action="train-generate">${icon("training", 18)} ${trainPlan && (trainPlan.mode || "normal") === trainMode ? "Gerar outro treino" : "Gerar meu treino"}</button>
    </div>`;
  return pageHead("Treino", "Arraste a bolinha até o tempo que você tem e receba um treino pronto: mapa, o que fazer e metas.") +
    panel + (trainPlan ? renderTrainPlan() : emptyState("training", "Escolha o tempo e clique em \"Gerar meu treino\"."));
}

function renderTrainPlan() {
  var pl = trainPlan, blocks = pl.blocks;
  var doneN = blocks.filter(function (b, i) { return trainDone[i]; }).length;
  var pct = Math.round(doneN / blocks.length * 100);
  var isPre = pl.mode === "pre";
  var kind = isPre ? "Pré-campeonato" : pl.total <= 15 ? "Treino rápido" : pl.total <= 45 ? "Treino médio" : pl.total <= 60 ? "Treino completo" : "Treino longo";
  var n = 0;
  var cards = blocks.map(function (b, i) {
    var done = !!trainDone[i];
    var check = `<button class="tcheck ${done ? "on" : ""}" type="button" data-action="train-toggle" data-v="${i}" aria-pressed="${done}" aria-label="Marcar bloco como feito">${icon("check", 18)}</button>`;
    var range = fmtMin(b.start) + " → " + fmtMin(b.end);
    if (b.kind === "break") {
      return `<article class="tblock brk ${done ? "done" : ""}">${check}<div class="tb-main">
        <div class="tb-top"><span class="chip">Pausa</span><span class="chip">${h(range)}</span></div>
        <h3>${h(b.title)}</h3>
        <ul class="tb-steps">${b.steps.map(function (x) { return `<li>${h(x)}</li>`; }).join("")}</ul></div></article>`;
    }
    n++;
    return `<article class="tblock ${done ? "done" : ""}">${check}<div class="tb-main">
      <div class="tb-top"><span class="chip accent">Bloco ${n}</span><span class="chip">${b.minutes} min</span><span class="chip">${h(CAT_LABEL[b.cat] || b.cat)}</span><span class="tb-range">${h(range)}</span></div>
      <h3>${h(b.title)}</h3>
      <div class="tb-map">${icon("tactic", 16)}<div><strong>${h(b.map)}</strong><small>${h(b.mapHow)}</small></div></div>
      <div class="tb-goal"><span>Meta</span>${h(b.goal)}</div>
      <ul class="tb-steps">${b.steps.map(function (x) { return `<li>${h(x)}</li>`; }).join("")}</ul>
      <p class="tb-tip"><b>Dica:</b> ${h(b.tip)}</p></div></article>`;
  }).join("");
  var finished = doneN === blocks.length;
  return `<div id="train-plan" class="train-head">
      <div><h2>${kind} · ${fmtTotal(pl.total)}</h2><p>${isPre ? "Mapa do primeiro jogo" : "Mapa do dia"}: <b>${h(pl.map)}</b> · ${blocks.filter(function (b) { return b.kind === "drill"; }).length} blocos${blocks.some(function (b) { return b.kind === "break"; }) ? " + pausas" : ""}</p></div>
      <button class="btn sm" type="button" data-action="train-reset">Limpar</button>
    </div>
    <div class="progress" aria-label="Progresso do treino"><i style="width:${pct}%"></i></div>
    <div class="progress-txt">${doneN} de ${blocks.length} concluídos</div>
    ${isPre && pl.total >= 120 ? `<div class="status-box warn" style="margin-bottom:16px">${icon("clock", 20)}<div><strong>Atenção ao cansaço</strong><span>Antes de jogo, mais de 1 hora costuma cansar a mão. Se o campeonato for logo, prefira 30–60 min.</span></div></div>` : ""}
    ${finished ? `<div class="status-box ok" style="margin-bottom:16px">${icon("check", 20)}<div><strong>Treino concluído!</strong><span>Bom trabalho. Gere outro quando tiver tempo.</span></div></div>` : ""}
    <div class="tblocks">${cards}</div>`;
}

/* ================================================================
   AÇÕES
   ================================================================ */
async function withBusy(fn, okMsg) {
  busy = true; render();
  try { await fn(); if (okMsg) toast(okMsg, "ok"); }
  catch (e) { console.error(e); toast("Erro: " + (e.message || e), "err"); }
  busy = false; render();
}

async function doLogin() {
  loginError = "";
  var email, pass = val("lf-pass");
  if (loginTab === "admin") {
    email = val("lf-email").trim();
    if (!email || !pass) { loginError = "Preencha e-mail e senha."; render(); return; }
  } else {
    var u = val("lf-user").trim().toLowerCase();
    if (!u || !pass) { loginError = "Preencha usuário e senha."; render(); return; }
    email = u + "@" + USERNAME_DOMAIN;
  }
  busy = true; render();
  try { await signInWithEmailAndPassword(auth, email, pass); }
  catch (e) { console.error(e); loginError = friendlyAuthError(e); }
  busy = false; render();
}

async function logPovOpened(itemId) {
  if (isAdmin || watchFor(itemId, currentUser.uid)) return;
  try {
    await setDoc(doc(db, "watches", reviewDocId(itemId, currentUser.uid)), {
      itemId: itemId, playerUid: currentUser.uid, playerName: me() ? me().name : currentUser.email,
      openedAt: serverTimestamp()
    }, { merge: true });
  } catch (e) { console.error(e); }
}

async function markWatched(itemId) {
  var existing = watchFor(itemId, currentUser.uid);
  var data = {
    itemId: itemId, playerUid: currentUser.uid, playerName: me() ? me().name : currentUser.email,
    watchedAt: serverTimestamp()
  };
  if (!existing || !existing.openedAt) data.openedAt = serverTimestamp();
  await withBusy(function () { return setDoc(doc(db, "watches", reviewDocId(itemId, currentUser.uid)), data, { merge: true }); }, "Marcada como assistida!");
}

async function submitReview(itemId) {
  var pos = [], neg = [];
  for (var i = 0; i < 5; i++) { pos.push(val("rv-" + itemId + "-pos" + i).trim()); neg.push(val("rv-" + itemId + "-neg" + i).trim()); }
  if (pos.concat(neg).some(function (x) { return !x; })) { toast("Preencha os 5 pontos positivos e os 5 negativos.", "err"); return; }
  await withBusy(async function () {
    await setDoc(doc(db, "reviews", reviewDocId(itemId, currentUser.uid)), {
      itemId: itemId, playerUid: currentUser.uid, playerName: me() ? me().name : currentUser.email,
      positives: pos, negatives: neg, submittedAt: serverTimestamp()
    }, { merge: true });
    clearForm("rv-" + itemId + "-");
  }, "Avaliação enviada!");
}

async function addLinkItem(kind) {
  var pre = kind === "pov" ? "pv" : "dm";
  var title = val(pre + "-title").trim(), url = val(pre + "-url").trim();
  if (!title || !url) return;
  if (kind === "pov" && !extractYoutubeId(url)) { toast("Esse não parece um link do YouTube válido.", "err"); return; }
  await withBusy(async function () {
    var data = { title: title, url: url, assignedTo: val(pre + "-who") || "todos", note: val(pre + "-note").trim(), addedAt: serverTimestamp(), addedBy: currentUser.uid };
    if (kind === "pov") data.videoId = extractYoutubeId(url);
    await addDoc(collection(db, kind === "pov" ? "povs" : "demos"), data);
    clearForm(pre + "-");
  }, kind === "pov" ? "POV adicionada." : "Demo adicionada.");
}

async function addTactic() {
  var title = val("tc-title").trim();
  var pv = parseVideoLines(val("tc-yt")), pi = parseImageLines(val("tc-imgs"));
  if (pv.bad.length) { toast("Esse link do YouTube não parece válido: " + pv.bad[0], "err"); return; }
  if (pi.err) { toast(pi.err, "err"); return; }
  if (!pv.ids.length && !pi.urls.length) { toast("Adicione pelo menos um vídeo do YouTube ou uma imagem.", "err"); return; }
  var vids = pv.ids.map(function (id, i) { return { id: id, url: pv.urls[i] }; });
  await withBusy(async function () {
    await addDoc(collection(db, "tactics"), Object.assign({
      title: title, type: val("tc-type"), map: val("tc-map").trim(), side: val("tc-side"), team: val("tc-team"),
      note: val("tc-note").trim(), addedAt: serverTimestamp(), addedBy: currentUser.uid
    }, tacticMediaPayload(vids, pi.urls)));
    clearForm("tc-");
  }, "Publicado!");
}

async function saveTacticMedia(id) {
  var t = tactics.find(function (x) { return x.id === id; });
  if (!t) return;
  var pv = parseVideoLines(val("tx-" + id + "-yt")), pi = parseImageLines(val("tx-" + id + "-imgs"));
  if (pv.bad.length) { toast("Esse link do YouTube não parece válido: " + pv.bad[0], "err"); return; }
  if (pi.err) { toast(pi.err, "err"); return; }
  if (!pv.ids.length && !pi.urls.length) { toast("Cole pelo menos um link novo de vídeo ou de imagem.", "err"); return; }
  var vids = tacticVideos(t).slice(), imgs = (t.images || []).slice();
  pv.ids.forEach(function (vid, i) { if (!vids.some(function (x) { return x.id === vid; })) vids.push({ id: vid, url: pv.urls[i] }); });
  pi.urls.forEach(function (u) { if (imgs.indexOf(u) === -1) imgs.push(u); });
  await withBusy(async function () {
    await setDoc(doc(db, "tactics", id), tacticMediaPayload(vids, imgs), { merge: true });
    clearForm("tx-" + id + "-");
  }, "Adicionado!");
}

async function removeTacticMedia(id, kind, i) {
  var t = tactics.find(function (x) { return x.id === id; });
  if (!t) return;
  var vids = tacticVideos(t).slice(), imgs = (t.images || []).slice();
  if (kind === "video") vids.splice(i, 1); else imgs.splice(i, 1);
  if (!vids.length && !imgs.length) { toast("A tática precisa ficar com pelo menos um vídeo ou uma imagem.", "err"); return; }
  if (!confirm("Remover este item?")) return;
  await withBusy(function () { return setDoc(doc(db, "tactics", id), tacticMediaPayload(vids, imgs), { merge: true }); }, "Removido.");
}

async function addPlayer() {
  var name = val("ap-name").trim(), username = val("ap-user").trim().toLowerCase(), pass = val("ap-pass"), team = val("ap-team").trim();
  if (!name || !username || pass.length < 6) return;
  if (!/^[a-z0-9._-]+$/.test(username)) { toast("Usuário: use só letras minúsculas, números, ponto, hífen ou _ (sem espaços/acentos).", "err"); return; }
  await withBusy(async function () {
    // Instância secundária só para criar a conta, assim a sessão do técnico não é trocada.
    var secondary = initializeApp(firebaseConfig, "secondary-" + Date.now());
    var secondaryAuth = getAuth(secondary);
    try {
      var email = username + "@" + USERNAME_DOMAIN;
      var cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
      await setDoc(doc(db, "players", cred.user.uid), { name: name, username: username, email: email, team: team });
      clearForm("ap-");
    } finally {
      try { await signOut(secondaryAuth); } catch (e) {}
      try { await deleteApp(secondary); } catch (e) {}
    }
  }, "Jogador criado.");
}

async function saveMeta() {
  var teamName = val("st-name").trim() || "MTRY Hub", tagline = val("st-tag").trim();
  await withBusy(async function () {
    await setDoc(doc(db, "config", "meta"), { teamName: teamName, tagline: tagline }, { merge: true });
    meta = { teamName: teamName, tagline: tagline };
    document.title = teamName;
    clearForm("st-name"); clearForm("st-tag");
  }, "Salvo.");
}

async function savePass() {
  var p = val("st-pass");
  if (p.length < 6) { toast("A senha precisa ter pelo menos 6 caracteres.", "err"); return; }
  await withBusy(async function () {
    await updatePassword(currentUser, p);
    clearForm("st-pass");
  }, "Senha alterada.");
}

async function deleteItem(kind, id) {
  var labels = { pov: "essa POV", demo: "essa demo", tactic: "essa tática", player: "esse jogador" };
  if (!confirm("Remover " + labels[kind] + "?")) return;
  var coll = { pov: "povs", demo: "demos", tactic: "tactics", player: "players" }[kind];
  await withBusy(function () { return deleteDoc(doc(db, coll, id)); }, "Removido.");
}

/* ================================================================
   EVENTOS (delegados)
   ================================================================ */
document.addEventListener("input", function (e) {
  if (e.target && e.target.id === "train-range") {
    trainIdx = parseInt(e.target.value, 10) || 0;
    syncTrainUI(); saveTraining();
    return;
  }
  var k = e.target && e.target.getAttribute && e.target.getAttribute("data-k");
  if (k) formState[k] = e.target.value;
});
document.addEventListener("change", function (e) {
  if (e.target && e.target.id === "train-map") { trainMap = e.target.value; saveTraining(); return; }
  var k = e.target && e.target.getAttribute && e.target.getAttribute("data-k");
  if (k) formState[k] = e.target.value;
});

document.addEventListener("submit", function (e) {
  var form = e.target.closest ? e.target.closest("[data-form]") : null;
  if (!form) return;
  e.preventDefault();
  var f = form.getAttribute("data-form");
  if (f === "login") doLogin();
  else if (f === "review") submitReview(form.getAttribute("data-id"));
  else if (f === "add-pov") addLinkItem("pov");
  else if (f === "add-demo") addLinkItem("demo");
  else if (f === "add-tactic") addTactic();
  else if (f === "add-player") addPlayer();
});

document.addEventListener("click", function (e) {
  var el = e.target.closest ? e.target.closest("[data-action]") : null;
  if (!el) return;
  var a = el.getAttribute("data-action"), v = el.getAttribute("data-v"), id = el.getAttribute("data-id");
  if ((a === "close-backdrop" || a === "lb-backdrop") && e.target !== el) return;

  switch (a) {
    case "login-tab": loginTab = v; loginError = ""; render(); break;
    case "logout": signOut(auth); break;
    case "nav":
      page = v; modal = null; lightbox = null; openAdminItem = null; openTacticEdit = null;
      filters = { status: "all", map: "", type: "" };
      render(); window.scrollTo(0, 0); break;
    case "open-modal": {
      var i = v.indexOf(":");
      modal = { kind: v.slice(0, i), id: v.slice(i + 1) };
      if (modal.kind === "pov") logPovOpened(modal.id);
      render(); break;
    }
    case "close-modal":
    case "close-backdrop": modal = null; render(); break;
    case "lb-open": {
      var j = v.lastIndexOf(":");
      var t = tactics.find(function (x) { return x.id === v.slice(0, j); });
      if (t && t.images && t.images.length) { lightbox = { urls: t.images, i: parseInt(v.slice(j + 1), 10) || 0 }; render(); }
      break;
    }
    case "lb-close":
    case "lb-backdrop": lightbox = null; render(); break;
    case "lb-prev": stepLightbox(-1); break;
    case "lb-next": stepLightbox(1); break;
    case "filter-status": filters.status = v; render(); break;
    case "filter-map": filters.map = v; render(); break;
    case "filter-type": filters.type = v; render(); break;
    case "mark-watched": markWatched(id); break;
    case "tv-select": {
      var ifr = document.querySelector("#modal-root .player iframe");
      if (ifr) ifr.src = "https://www.youtube-nocookie.com/embed/" + v + "?rel=0&autoplay=1";
      document.querySelectorAll("#modal-root .vitem").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-v") === v); });
      break;
    }
    case "tactic-edit": openTacticEdit = openTacticEdit === id ? null : id; render(); break;
    case "tactic-save-media": saveTacticMedia(id); break;
    case "tactic-rm": removeTacticMedia(id, el.getAttribute("data-kind"), parseInt(el.getAttribute("data-i"), 10)); break;
    case "toggle-item": openAdminItem = openAdminItem === v ? null : v; render(); break;
    case "del": deleteItem(el.getAttribute("data-kind"), id); break;
    case "train-set": trainIdx = parseInt(v, 10) || 0; syncTrainUI(); saveTraining(); break;
    case "train-mode": trainMode = v === "pre" ? "pre" : "normal"; saveTraining(); render(); break;
    case "train-generate":
      trainPlan = generatePlan(TRAIN_STOPS[trainIdx], trainMap, Date.now(), trainMode);
      trainDone = {}; saveTraining(); render();
      var tp = document.getElementById("train-plan");
      if (tp && tp.scrollIntoView) tp.scrollIntoView({ behavior: "smooth", block: "start" });
      break;
    case "train-toggle": trainDone[v] = !trainDone[v]; saveTraining(); render(); break;
    case "train-reset": trainPlan = null; trainDone = {}; saveTraining(); render(); break;
    case "save-meta": saveMeta(); break;
    case "save-pass": savePass(); break;
  }
});

function stepLightbox(d) {
  if (!lightbox) return;
  var n = lightbox.urls.length;
  lightbox.i = (lightbox.i + d + n) % n;
  render();
}

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    if (lightbox) { lightbox = null; render(); }
    else if (modal) { modal = null; render(); }
  } else if (lightbox && e.key === "ArrowLeft") stepLightbox(-1);
  else if (lightbox && e.key === "ArrowRight") stepLightbox(1);
  else if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("article.card[data-action]")) {
    e.preventDefault(); e.target.click();
  }
});

render();
