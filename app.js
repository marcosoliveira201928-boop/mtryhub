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

/* ---------------- firebase ---------------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------------- app state ---------------- */
let currentUser = null;
let isAdmin = false;
let meta = { teamName: "MTRY Hub", tagline: "Central de demos da equipe" };
let players = [];   // [{ uid, name, username, email, team }]
let povs = [];       // [{ id, title, url, videoId, assignedTo, note, addedAt }]  -- link do YouTube, só assistir
let demos = [];      // [{ id, title, url, assignedTo, note, addedAt }]            -- link externo pro .dem, com avaliação
let reviews = [];    // [{ id, itemId (=demo.id), playerUid, playerName, positives:[5], negatives:[5], submittedAt }]

let unsubPlayers = null, unsubPovs = null, unsubDemos = null, unsubReviews = null;

let loginTab = "player";
let loginError = "";
let loginBusy = false;

let adminTab = "povs";
let adminBusy = false;
let adminMsg = { text: "", kind: "" };

let expandedPovId = null;      // pov com o player do YouTube aberto
let openReviewId = null;       // demo cujo formulário de avaliação está aberto (jogador)
let reviewBusy = false;
let openAdminDemoId = null;    // demo expandida no acordeão de avaliações (técnico)

const root = document.getElementById("root");

/* ---------------- helpers ---------------- */
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function extractYoutubeId(url) {
  if (!url) return null;
  var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
function fmtDate(ts) {
  try {
    var d = ts && ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch (e) { return ""; }
}
function byDateDesc(a, b) {
  var ta = a.addedAt && a.addedAt.seconds ? a.addedAt.seconds : 0;
  var tb = b.addedAt && b.addedAt.seconds ? b.addedAt.seconds : 0;
  return tb - ta;
}
function nameForUid(uid) {
  var p = players.find(function (p) { return p.uid === uid; });
  return p ? p.name : "(jogador removido)";
}
function reviewDocId(itemId, uid) { return itemId + "_" + uid; }
function reviewFor(itemId, uid) {
  return reviews.find(function (r) { return r.itemId === itemId && r.playerUid === uid; });
}
function expectedReviewers(item) {
  if (item.assignedTo === "todos") return players.slice();
  var p = players.find(function (p) { return p.uid === item.assignedTo; });
  return p ? [p] : [];
}

const ICON_PLAY = '<svg width="40" height="40" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="11" fill="rgba(20,23,26,0.55)"/><polygon points="9,7 18,12 9,17" fill="white"/></svg>';
const ICON_TRASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>';
const ICON_FILE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';

/* ---------------- auth state ---------------- */
onAuthStateChanged(auth, async function (user) {
  cleanupListeners();
  currentUser = user;
  isAdmin = false;
  players = []; povs = []; demos = []; reviews = [];
  loginError = "";

  if (user) {
    await loadConfig();
    subscribeData();
  }
  render();
});

async function loadConfig() {
  try {
    var adminSnap = await getDoc(doc(db, "config", "admin"));
    var uids = adminSnap.exists() ? (adminSnap.data().uids || []) : [];
    isAdmin = uids.indexOf(currentUser.uid) !== -1;
  } catch (e) { isAdmin = false; }
  try {
    var metaSnap = await getDoc(doc(db, "config", "meta"));
    if (metaSnap.exists()) meta = Object.assign({}, meta, metaSnap.data());
  } catch (e) {}
}

function subscribeData() {
  unsubPlayers = onSnapshot(collection(db, "players"), function (snap) {
    players = snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
    render();
  });
  unsubPovs = onSnapshot(collection(db, "povs"), function (snap) {
    povs = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    render();
  });
  unsubDemos = onSnapshot(collection(db, "demos"), function (snap) {
    demos = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    render();
  });
  // Técnico vê todas as avaliações; jogador só consegue ler as próprias (regra do Firestore).
  var reviewsQuery = isAdmin
    ? collection(db, "reviews")
    : query(collection(db, "reviews"), where("playerUid", "==", currentUser.uid));
  unsubReviews = onSnapshot(reviewsQuery, function (snap) {
    reviews = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    render();
  });
}

function cleanupListeners() {
  if (unsubPlayers) { unsubPlayers(); unsubPlayers = null; }
  if (unsubPovs) { unsubPovs(); unsubPovs = null; }
  if (unsubDemos) { unsubDemos(); unsubDemos = null; }
  if (unsubReviews) { unsubReviews(); unsubReviews = null; }
}

/* ---------------- render root ---------------- */
function render() {
  if (!currentUser) {
    root.innerHTML = renderLogin();
    bindLogin();
    return;
  }
  root.innerHTML = renderTopbar() + (isAdmin ? renderAdmin() : renderPlayer());
  bindTopbar();
  if (isAdmin) bindAdmin(); else bindPlayer();
}

/* ---------------- topbar ---------------- */
function renderTopbar() {
  var me = players.find(function (p) { return p.uid === currentUser.uid; });
  var displayName = isAdmin ? "Técnico" : (me ? me.name : currentUser.email);
  return '' +
    '<div class="topbar">' +
      '<div class="wordmark"><span class="mark">MTRY<span>·</span>HUB</span><span class="sub">' + escapeHtml(meta.tagline || "") + '</span></div>' +
      '<div class="who">' +
        '<span class="tag">' + (isAdmin ? "TÉCNICO" : "JOGADOR") + '</span>' +
        (!isAdmin && me && me.team ? '<span class="tag">' + escapeHtml(me.team.toUpperCase()) + '</span>' : "") +
        '<span class="name">' + escapeHtml(displayName) + '</span>' +
        '<button class="btn-ghost" id="logout-btn" type="button">Sair</button>' +
      '</div>' +
    '</div>';
}
function bindTopbar() {
  var b = document.getElementById("logout-btn");
  if (b) b.addEventListener("click", function () { signOut(auth); });
}

/* ---------------- login ---------------- */
function renderLogin() {
  return '' +
    '<div class="login-wrap"><div class="login-card">' +
      '<h1>MTRY<span>·</span>HUB</h1>' +
      '<div class="lede">' + escapeHtml(meta.tagline || "Central de demos da equipe") + '. Entre para ver os POVs e as demos separadas pelo técnico.</div>' +
      '<div class="tabs">' +
        '<button class="tab-btn ' + (loginTab === "player" ? "active" : "") + '" data-tab="player" type="button">Jogador</button>' +
        '<button class="tab-btn ' + (loginTab === "admin" ? "active" : "") + '" data-tab="admin" type="button">Técnico</button>' +
      '</div>' +
      (loginTab === "player" ? renderPlayerLoginForm() : renderAdminLoginForm()) +
      (loginError ? '<div class="error-msg">' + escapeHtml(loginError) + '</div>' : "") +
    '</div></div>';
}
function renderPlayerLoginForm() {
  return '' +
    '<form id="login-form">' +
      '<label for="lf-user">Usuário</label>' +
      '<input type="text" id="lf-user" autocomplete="username" placeholder="ex: joaozinho">' +
      '<label for="lf-pass">Senha</label>' +
      '<input type="password" id="lf-pass" autocomplete="current-password" placeholder="••••••••">' +
      '<button class="btn-primary" type="submit" ' + (loginBusy ? "disabled" : "") + '>' + (loginBusy ? "Entrando…" : "Entrar") + '</button>' +
    '</form>';
}
function renderAdminLoginForm() {
  return '' +
    '<form id="login-form">' +
      '<label for="lf-email">E-mail do técnico</label>' +
      '<input type="email" id="lf-email" autocomplete="username" placeholder="tecnico@mtryhub.app">' +
      '<label for="lf-pass">Senha</label>' +
      '<input type="password" id="lf-pass" autocomplete="current-password" placeholder="••••••••">' +
      '<button class="btn-primary" type="submit" ' + (loginBusy ? "disabled" : "") + '>' + (loginBusy ? "Entrando…" : "Entrar como técnico") + '</button>' +
      '<div class="hint">A conta de técnico é criada no Firebase Console (veja o README).</div>' +
    '</form>';
}
function bindLogin() {
  var tabs = root.querySelectorAll(".tab-btn");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener("click", function () {
      loginTab = this.getAttribute("data-tab");
      loginError = "";
      render();
    });
  }
  document.getElementById("login-form").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    loginError = "";

    if (loginTab === "admin") {
      var email = document.getElementById("lf-email").value.trim();
      var pass = document.getElementById("lf-pass").value;
      if (!email || !pass) { loginError = "Preencha e-mail e senha."; render(); return; }
    } else {
      var user = document.getElementById("lf-user").value.trim().toLowerCase();
      var pw = document.getElementById("lf-pass").value;
      if (!user || !pw) { loginError = "Preencha usuário e senha."; render(); return; }
    }

    loginBusy = true;
    render();
    try {
      if (loginTab === "admin") {
        await signInWithEmailAndPassword(auth, email, pass);
      } else {
        await signInWithEmailAndPassword(auth, user + "@" + USERNAME_DOMAIN, pw);
      }
    } catch (e) {
      loginError = "Erro: " + e.code + " — " + e.message;
    }
    loginBusy = false;
    render();
  });
}

/* ================================================================
   PLAYER DASHBOARD
   ================================================================ */
function renderPlayer() {
  var myPovs = povs.filter(function (v) { return v.assignedTo === currentUser.uid; }).sort(byDateDesc);
  var genPovs = povs.filter(function (v) { return v.assignedTo === "todos"; }).sort(byDateDesc);
  var myDemos = demos.filter(function (v) { return v.assignedTo === currentUser.uid; }).sort(byDateDesc);
  var genDemos = demos.filter(function (v) { return v.assignedTo === "todos"; }).sort(byDateDesc);

  var html = "<main>";

  html += '<div class="section-head"><h2>Suas POVs</h2><span class="count">' + myPovs.length + "</span></div>";
  html += myPovs.length ? '<div class="grid">' + myPovs.map(renderPovCard).join("") + "</div>" : '<div class="empty">O técnico ainda não separou nenhuma POV pra você.</div>';
  html += '<div class="section-head"><h2>POVs gerais</h2><span class="count">' + genPovs.length + "</span></div>";
  html += genPovs.length ? '<div class="grid">' + genPovs.map(renderPovCard).join("") + "</div>" : '<div class="empty">Nenhuma POV geral publicada ainda.</div>';

  html += '<div class="section-head"><h2>Suas demos</h2><span class="count">' + myDemos.length + "</span></div>";
  html += myDemos.length ? '<div class="grid">' + myDemos.map(renderDemoCard).join("") + "</div>" : '<div class="empty">O técnico ainda não separou nenhuma demo pra você.</div>';
  html += '<div class="section-head"><h2>Demos gerais</h2><span class="count">' + genDemos.length + "</span></div>";
  html += genDemos.length ? '<div class="grid">' + genDemos.map(renderDemoCard).join("") + "</div>" : '<div class="empty">Nenhuma demo geral publicada ainda.</div>';

  html += "</main>";
  return html;
}

/* ---- POV card: só assistir, sem avaliação ---- */
function renderPovCard(v) {
  var vid = v.videoId || extractYoutubeId(v.url);
  var expanded = expandedPovId === v.id;
  var thumbInner = expanded && vid
    ? '<iframe src="https://www.youtube-nocookie.com/embed/' + vid + '?autoplay=1" title="' + escapeHtml(v.title) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>'
    : (vid
        ? '<img loading="lazy" src="https://img.youtube.com/vi/' + vid + '/hqdefault.jpg" alt=""><div class="play-overlay">' + ICON_PLAY + "</div>"
        : '<div class="play-overlay">' + ICON_PLAY + "</div>");
  return '' +
    '<div class="card">' +
      '<div class="thumb" ' + (expanded ? "" : 'data-open-pov="' + v.id + '"') + ">" + thumbInner + "</div>" +
      '<div class="body">' +
        '<div class="badge-row"><span class="badge">' + (v.assignedTo === "todos" ? "GERAL" : "PRA VOCÊ") + "</span></div>" +
        "<h3>" + escapeHtml(v.title) + "</h3>" +
        (v.note ? '<div class="meta">' + escapeHtml(v.note) + "</div>" : "") +
        '<div class="meta">adicionado em ' + fmtDate(v.addedAt) + "</div>" +
        '<a class="watch-link" href="' + escapeHtml(v.url) + '" target="_blank" rel="noopener noreferrer">abrir no YouTube ↗</a>' +
      "</div>" +
    "</div>";
}

/* ---- Demo card: link pro .dem + confirmação + avaliação ---- */
function renderDemoCard(v) {
  var review = reviewFor(v.id, currentUser.uid);
  var formOpen = openReviewId === v.id;
  return '' +
    '<div class="card">' +
      '<div class="body">' +
        '<div class="badge-row"><span class="badge">' + (v.assignedTo === "todos" ? "GERAL" : "PRA VOCÊ") + "</span>" + ICON_FILE + "</div>" +
        "<h3>" + escapeHtml(v.title) + "</h3>" +
        (v.note ? '<div class="meta">' + escapeHtml(v.note) + "</div>" : "") +
        '<div class="meta">adicionado em ' + fmtDate(v.addedAt) + "</div>" +
        '<a class="watch-link" href="' + escapeHtml(v.url) + '" target="_blank" rel="noopener noreferrer">baixar demo (.dem) ↗</a>' +
        (review
          ? '<div class="meta ok">✓ avaliação enviada em ' + fmtDate(review.submittedAt) + "</div>"
          : '<div class="meta warn">⏳ você ainda não confirmou/avaliou essa demo</div>') +
        '<button class="review-toggle" type="button" data-toggle-review="' + v.id + '">' + (formOpen ? "Fechar" : (review ? "Editar avaliação" : "Confirmar que assisti + avaliar")) + "</button>" +
        (formOpen ? renderReviewForm(v, review) : "") +
      "</div>" +
    "</div>";
}

function renderReviewForm(v, review) {
  var pos = (review && review.positives) || ["", "", "", "", ""];
  var neg = (review && review.negatives) || ["", "", "", "", ""];
  function field(prefix, i, val) {
    return '<input type="text" data-review-field="' + prefix + i + '" value="' + escapeHtml(val || "") + '" placeholder="' + (prefix === "pos" ? "Ponto positivo " : "Ponto negativo ") + (i + 1) + '" required>';
  }
  var posInputs = "", negInputs = "";
  for (var i = 0; i < 5; i++) { posInputs += field("pos", i, pos[i]); negInputs += field("neg", i, neg[i]); }
  return '' +
    '<form class="review-form" data-review-form="' + v.id + '">' +
      '<div class="review-cols">' +
        '<div class="pos"><h4>5 pontos positivos</h4>' + posInputs + "</div>" +
        '<div class="neg"><h4>5 pontos negativos</h4>' + negInputs + "</div>" +
      "</div>" +
      '<button class="btn-primary review-submit" type="submit" ' + (reviewBusy ? "disabled" : "") + ">" + (reviewBusy ? "Enviando…" : "Enviar avaliação") + "</button>" +
    "</form>";
}

function bindPlayer() {
  var thumbs = root.querySelectorAll("[data-open-pov]");
  for (var i = 0; i < thumbs.length; i++) {
    thumbs[i].addEventListener("click", function () {
      expandedPovId = this.getAttribute("data-open-pov");
      render();
    });
  }
  var toggles = root.querySelectorAll("[data-toggle-review]");
  for (var j = 0; j < toggles.length; j++) {
    toggles[j].addEventListener("click", function () {
      var id = this.getAttribute("data-toggle-review");
      openReviewId = openReviewId === id ? null : id;
      render();
    });
  }
  var forms = root.querySelectorAll("[data-review-form]");
  for (var k = 0; k < forms.length; k++) {
    forms[k].addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var itemId = this.getAttribute("data-review-form");
      var pos = [], neg = [];
      for (var n = 0; n < 5; n++) {
        pos.push(this.querySelector('[data-review-field="pos' + n + '"]').value.trim());
        neg.push(this.querySelector('[data-review-field="neg' + n + '"]').value.trim());
      }
      var me = players.find(function (p) { return p.uid === currentUser.uid; });
      reviewBusy = true; render();
      try {
        await setDoc(doc(db, "reviews", reviewDocId(itemId, currentUser.uid)), {
          itemId: itemId, playerUid: currentUser.uid, playerName: me ? me.name : currentUser.email,
          positives: pos, negatives: neg, submittedAt: serverTimestamp()
        }, { merge: true });
        openReviewId = null;
      } catch (e) {
        alert("Erro ao enviar avaliação: " + e.message);
      }
      reviewBusy = false; render();
    });
  }
}

/* ================================================================
   ADMIN DASHBOARD
   ================================================================ */
function renderAdmin() {
  var html = "<main>";
  html += '<div class="adm-tabs">' +
    adminTabBtn("povs", "POVs") +
    adminTabBtn("demos", "Demos") +
    adminTabBtn("players", "Jogadores") +
    adminTabBtn("settings", "Configurações") +
    "</div>";
  if (adminMsg.text) html += '<div class="status-line ' + adminMsg.kind + '">' + escapeHtml(adminMsg.text) + "</div>";
  if (adminTab === "povs") html += renderAdminPovs();
  if (adminTab === "demos") html += renderAdminDemos();
  if (adminTab === "players") html += renderAdminPlayers();
  if (adminTab === "settings") html += renderAdminSettings();
  html += "</main>";
  return html;
}
function adminTabBtn(id, label) {
  return '<button class="adm-tab ' + (adminTab === id ? "active" : "") + '" data-adm-tab="' + id + '" type="button">' + label + "</button>";
}

/* ---- Aba POVs (sem avaliação, igual antes) ---- */
function renderAdminPovs() {
  var rows = povs.slice().sort(byDateDesc).map(function (v) {
    var who = v.assignedTo === "todos" ? "Geral (todos)" : nameForUid(v.assignedTo);
    return '' +
      '<div class="list-row">' +
        '<div class="info"><div class="t">' + escapeHtml(v.title) + '</div><div class="s">' + escapeHtml(who) + " · " + fmtDate(v.addedAt) + "</div></div>" +
        '<div class="row-actions"><button class="icon-btn" data-del-pov="' + v.id + '" type="button" title="Remover">' + ICON_TRASH + "</button></div>" +
      "</div>";
  }).join("");
  var playerOptions = '<option value="todos">Todos (geral)</option>' + players.map(function (p) {
    return '<option value="' + escapeHtml(p.uid) + '">' + escapeHtml(p.name) + "</option>";
  }).join("");
  return '' +
    '<div class="panel"><h3>Adicionar POV</h3>' +
      '<form id="add-pov-form">' +
        '<label for="pv-title">Título</label>' +
        '<input type="text" id="pv-title" placeholder="ex: POV do zeus - Mirage" required>' +
        '<label for="pv-url">Link do YouTube</label>' +
        '<input type="url" id="pv-url" placeholder="https://youtube.com/watch?v=..." required>' +
        '<div class="form-row">' +
          '<div><label for="pv-who">Atribuir a</label><select id="pv-who">' + playerOptions + "</select></div>" +
          '<div><label for="pv-note">Observação (opcional)</label><input type="text" id="pv-note" placeholder="ex: olhar posicionamento no retake"></div>' +
        "</div>" +
        '<button class="btn-add" type="submit" ' + (adminBusy ? "disabled" : "") + ">+ Adicionar POV</button>" +
      "</form>" +
    "</div>" +
    '<div class="panel"><h3>POVs cadastradas (' + povs.length + ")</h3>" + (rows || '<div class="empty">Nenhuma POV cadastrada ainda.</div>') + "</div>";
}

/* ---- Aba Demos (link pro .dem + confirmação/avaliação) ---- */
function renderAdminDemos() {
  var rows = demos.slice().sort(byDateDesc).map(function (v) {
    var who = v.assignedTo === "todos" ? "Geral (todos)" : nameForUid(v.assignedTo);
    return '' +
      '<div class="list-row">' +
        '<div class="info"><div class="t">' + escapeHtml(v.title) + '</div><div class="s">' + escapeHtml(who) + " · " + fmtDate(v.addedAt) + "</div></div>" +
        '<div class="row-actions"><button class="icon-btn" data-del-demo="' + v.id + '" type="button" title="Remover">' + ICON_TRASH + "</button></div>" +
      "</div>";
  }).join("");
  var playerOptions = '<option value="todos">Todos (geral)</option>' + players.map(function (p) {
    return '<option value="' + escapeHtml(p.uid) + '">' + escapeHtml(p.name) + "</option>";
  }).join("");
  return '' +
    '<div class="panel"><h3>Adicionar demo</h3>' +
      '<form id="add-demo-form">' +
        '<label for="dm-title">Título</label>' +
        '<input type="text" id="dm-title" placeholder="ex: Mirage vs Time X - mapa 1" required>' +
        '<label for="dm-url">Link do arquivo .dem (Google Drive, Mega, etc.)</label>' +
        '<input type="url" id="dm-url" placeholder="https://drive.google.com/..." required>' +
        '<div class="form-row">' +
          '<div><label for="dm-who">Atribuir a</label><select id="dm-who">' + playerOptions + "</select></div>" +
          '<div><label for="dm-note">Observação (opcional)</label><input type="text" id="dm-note" placeholder="ex: focar nos retakes do 2º half"></div>' +
        "</div>" +
        '<button class="btn-add" type="submit" ' + (adminBusy ? "disabled" : "") + ">+ Adicionar demo</button>" +
      "</form>" +
      '<div class="small-muted">Cole um link de onde o arquivo .dem já está hospedado (Google Drive, Mega, Dropbox etc.) — o site não guarda o arquivo em si.</div>' +
    "</div>" +
    '<div class="panel"><h3>Demos cadastradas (' + demos.length + ")</h3>" + (rows || '<div class="empty">Nenhuma demo cadastrada ainda.</div>') + "</div>" +
    '<div class="section-head"><h2>Confirmação de visualização</h2></div>' +
    (demos.length ? demos.slice().sort(byDateDesc).map(renderAdminDemoReviewPanel).join("") : '<div class="empty">Cadastre uma demo pra começar a acompanhar quem assistiu.</div>');
}

function renderAdminDemoReviewPanel(v) {
  var expected = expectedReviewers(v);
  var doneCount = expected.filter(function (p) { return reviewFor(v.id, p.uid); }).length;
  var isOpen = openAdminDemoId === v.id;
  var rows = expected.map(function (p) {
    var r = reviewFor(v.id, p.uid);
    if (!r) {
      return '<div class="list-row"><div class="info"><div class="t">' + escapeHtml(p.name) + '</div><div class="s">⏳ ainda não assistiu / avaliou</div></div></div>';
    }
    var posLines = r.positives.filter(Boolean).map(function (t) { return '<div class="pos-line">+ ' + escapeHtml(t) + "</div>"; }).join("");
    var negLines = r.negatives.filter(Boolean).map(function (t) { return '<div class="neg-line">- ' + escapeHtml(t) + "</div>"; }).join("");
    return '' +
      '<div class="list-row" style="align-items:flex-start;">' +
        '<div class="info">' +
          '<div class="t">' + escapeHtml(p.name) + ' <span style="color:var(--ok)">· avaliou em ' + fmtDate(r.submittedAt) + "</span></div>" +
          '<div class="review-summary">' + posLines + negLines + "</div>" +
        "</div>" +
      "</div>";
  }).join("");
  return '' +
    '<div class="panel">' +
      '<div class="adm-video-head" data-toggle-adm-demo="' + v.id + '">' +
        "<h3>" + escapeHtml(v.title) + "</h3>" +
        '<span class="badge">' + doneCount + "/" + expected.length + " avaliaram</span>" +
      "</div>" +
      (isOpen ? '<div style="margin-top:12px">' + (rows || '<div class="empty">Ninguém precisa avaliar essa demo (nenhum jogador atribuído).</div>') + "</div>" : "") +
    "</div>";
}

/* ---- Aba Jogadores (com time) ---- */
function renderAdminPlayers() {
  var sorted = players.slice().sort(function (a, b) {
    var ta = (a.team || "Sem time"), tb = (b.team || "Sem time");
    return ta === tb ? a.name.localeCompare(b.name) : ta.localeCompare(tb);
  });
  var rows = "", lastTeam = null;
  sorted.forEach(function (p) {
    var team = p.team || "Sem time";
    if (team !== lastTeam) { rows += '<div class="team-group-label">Time ' + escapeHtml(team) + "</div>"; lastTeam = team; }
    rows += '' +
      '<div class="list-row">' +
        '<div class="info"><div class="t">' + escapeHtml(p.name) + '</div><div class="s">usuário: ' + escapeHtml(p.username) + "</div></div>" +
        '<div class="row-actions"><button class="icon-btn" data-del-player="' + escapeHtml(p.uid) + '" type="button" title="Remover">' + ICON_TRASH + "</button></div>" +
      "</div>";
  });
  return '' +
    '<div class="panel"><h3>Adicionar jogador</h3>' +
      '<form id="add-player-form">' +
        '<div class="form-row">' +
          '<div><label for="ap-name">Nome</label><input type="text" id="ap-name" placeholder="ex: João Silva" required></div>' +
          '<div><label for="ap-user">Usuário</label><input type="text" id="ap-user" placeholder="ex: joaosilva" required></div>' +
        "</div>" +
        '<div class="form-row">' +
          '<div><label for="ap-pass">Senha (mín. 6 caracteres)</label><input type="text" id="ap-pass" placeholder="ex: cs2mtry25" required minlength="6"></div>' +
          '<div><label for="ap-team">Time</label><input type="text" id="ap-team" placeholder="ex: Red"></div>' +
        "</div>" +
        '<button class="btn-add" type="submit" ' + (adminBusy ? "disabled" : "") + ">+ Adicionar jogador</button>" +
      "</form>" +
      '<div class="small-muted">Isso cria uma conta de verdade no Firebase Authentication. O jogador entra com o usuário e essa senha na aba "Jogador". Time é opcional, mas ajuda a organizar quando o elenco crescer.</div>' +
    "</div>" +
    '<div class="panel"><h3>Jogadores cadastrados (' + players.length + ")</h3>" + (rows || '<div class="empty">Nenhum jogador cadastrado ainda.</div>') +
      '<div class="small-muted">Remover aqui tira o jogador da lista e das demos, mas a conta de login continua existindo até você apagá-la também em Authentication no Firebase Console.</div>' +
    "</div>";
}

function renderAdminSettings() {
  return '' +
    '<div class="panel"><h3>Nome e frase do hub</h3>' +
      '<label for="st-name">Nome do time</label>' +
      '<input type="text" id="st-name" value="' + escapeHtml(meta.teamName) + '">' +
      '<label for="st-tag">Frase curta</label>' +
      '<input type="text" id="st-tag" value="' + escapeHtml(meta.tagline) + '">' +
      '<button class="btn-add" id="save-meta-btn" type="button" ' + (adminBusy ? "disabled" : "") + ">Salvar</button>" +
    "</div>" +
    '<div class="panel"><h3>Sua senha de técnico</h3>' +
      '<label for="st-pass">Nova senha</label>' +
      '<input type="password" id="st-pass" placeholder="mínimo 6 caracteres">' +
      '<button class="btn-add" id="save-pass-btn" type="button" ' + (adminBusy ? "disabled" : "") + ">Trocar senha</button>" +
      '<div class="small-muted">Se der erro de "login recente exigido", saia e entre de novo antes de trocar a senha.</div>' +
    "</div>";
}

function bindAdmin() {
  var tabs = root.querySelectorAll("[data-adm-tab]");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener("click", function () {
      adminTab = this.getAttribute("data-adm-tab");
      adminMsg = { text: "", kind: "" };
      render();
    });
  }

  if (adminTab === "povs") {
    document.getElementById("add-pov-form").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var title = document.getElementById("pv-title").value.trim();
      var url = document.getElementById("pv-url").value.trim();
      var who = document.getElementById("pv-who").value;
      var note = document.getElementById("pv-note").value.trim();
      if (!title || !url) return;
      adminBusy = true; adminMsg = { text: "Salvando…", kind: "" }; render();
      try {
        await addDoc(collection(db, "povs"), {
          title: title, url: url, videoId: extractYoutubeId(url),
          assignedTo: who, note: note, addedAt: serverTimestamp(), addedBy: currentUser.uid
        });
        adminMsg = { text: "POV adicionada.", kind: "ok" };
      } catch (e) {
        adminMsg = { text: "Erro ao salvar: " + e.message, kind: "err" };
      }
      adminBusy = false; render();
    });
    bindDeleteButtons("[data-del-pov]", "data-del-pov", async function (id) {
      await deleteDoc(doc(db, "povs", id));
    });
  }

  if (adminTab === "demos") {
    document.getElementById("add-demo-form").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var title = document.getElementById("dm-title").value.trim();
      var url = document.getElementById("dm-url").value.trim();
      var who = document.getElementById("dm-who").value;
      var note = document.getElementById("dm-note").value.trim();
      if (!title || !url) return;
      adminBusy = true; adminMsg = { text: "Salvando…", kind: "" }; render();
      try {
        await addDoc(collection(db, "demos"), {
          title: title, url: url,
          assignedTo: who, note: note, addedAt: serverTimestamp(), addedBy: currentUser.uid
        });
        adminMsg = { text: "Demo adicionada.", kind: "ok" };
      } catch (e) {
        adminMsg = { text: "Erro ao salvar: " + e.message, kind: "err" };
      }
      adminBusy = false; render();
    });
    bindDeleteButtons("[data-del-demo]", "data-del-demo", async function (id) {
      await deleteDoc(doc(db, "demos", id));
    });
    var accordions = root.querySelectorAll("[data-toggle-adm-demo]");
    for (var a = 0; a < accordions.length; a++) {
      accordions[a].addEventListener("click", function () {
        var id = this.getAttribute("data-toggle-adm-demo");
        openAdminDemoId = openAdminDemoId === id ? null : id;
        render();
      });
    }
  }

  if (adminTab === "players") {
    document.getElementById("add-player-form").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var name = document.getElementById("ap-name").value.trim();
      var username = document.getElementById("ap-user").value.trim().toLowerCase();
      var pass = document.getElementById("ap-pass").value;
      var team = document.getElementById("ap-team").value.trim();
      if (!name || !username || pass.length < 6) return;
      adminBusy = true; adminMsg = { text: "Criando conta…", kind: "" }; render();

      // Usa uma segunda instância do Firebase só para criar a conta,
      // assim a sessão do técnico (você) não é trocada pela do jogador novo.
      var secondaryApp = initializeApp(firebaseConfig, "secondary-" + Date.now());
      var secondaryAuth = getAuth(secondaryApp);
      try {
        var email = username + "@" + USERNAME_DOMAIN;
        var cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
        await setDoc(doc(db, "players", cred.user.uid), { name: name, username: username, email: email, team: team });
        adminMsg = { text: "Jogador criado.", kind: "ok" };
      } catch (e) {
        adminMsg = { text: "Erro ao criar jogador: " + e.message, kind: "err" };
      }
      try { await signOut(secondaryAuth); } catch (e) {}
      try { await deleteApp(secondaryApp); } catch (e) {}
      adminBusy = false; render();
    });
    bindDeleteButtons("[data-del-player]", "data-del-player", async function (uid) {
      await deleteDoc(doc(db, "players", uid));
    });
  }

  if (adminTab === "settings") {
    document.getElementById("save-meta-btn").addEventListener("click", async function () {
      var teamName = document.getElementById("st-name").value.trim() || "MTRY Hub";
      var tagline = document.getElementById("st-tag").value.trim();
      adminBusy = true; adminMsg = { text: "Salvando…", kind: "" }; render();
      try {
        await setDoc(doc(db, "config", "meta"), { teamName: teamName, tagline: tagline }, { merge: true });
        meta = { teamName: teamName, tagline: tagline };
        adminMsg = { text: "Salvo.", kind: "ok" };
      } catch (e) {
        adminMsg = { text: "Erro: " + e.message, kind: "err" };
      }
      adminBusy = false; render();
    });
    document.getElementById("save-pass-btn").addEventListener("click", async function () {
      var newPass = document.getElementById("st-pass").value;
      if (newPass.length < 6) { adminMsg = { text: "A senha precisa ter pelo menos 6 caracteres.", kind: "err" }; render(); return; }
      adminBusy = true; adminMsg = { text: "Trocando senha…", kind: "" }; render();
      try {
        await updatePassword(currentUser, newPass);
        adminMsg = { text: "Senha alterada.", kind: "ok" };
      } catch (e) {
        adminMsg = { text: "Erro: " + e.message, kind: "err" };
      }
      adminBusy = false; render();
    });
  }
}

function bindDeleteButtons(selector, attr, onDelete) {
  var btns = root.querySelectorAll(selector);
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener("click", async function () {
      adminBusy = true; render();
      try { await onDelete(this.getAttribute(attr)); }
      catch (e) { adminMsg = { text: "Erro: " + e.message, kind: "err" }; }
      adminBusy = false; render();
    });
  }
}

render();
