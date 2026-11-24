'use strict';

/* ============================================================
   Plan de Table — logique du jeu
   - niveaux chargés depuis levels.js (PLAN_LEVELS)
   - schéma des relations dessiné sur canvas
   - tables rondes, placement par glisser-déposer ou clic
   - score d'ambiance en temps réel :
       paire à la même table      -> v
       paire côte à côte (voisins) -> v + bonus de voisinage
     normalisé en % entre le pire et le meilleur cas théorique.
   ============================================================ */

// ---------- Progression (localStorage) ----------
const SAVE_KEY = 'picbird.planDeTable';
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { unlocked: 0, done: {} }; }
  catch (e) { return { unlocked: 0, done: {} }; }
}
function storeSave(s) { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); }

// ---------- Etat ----------
let levelIdx = 0;
let level = null;
let save = loadSave();
// placement[g] = { table, seat } ou null
let placement = [];
let selected = null; // invité sélectionné (mode clic)
let guestOrder = []; // ordre d'affichage mélangé des invités (indices)

// ---------- Eléments ----------
const $ = (id) => document.getElementById(id);
const el = {
  level: $('hLevel'), ambFill: $('hAmbFill'), amb: $('hAmb'), goal: $('hGoal'), ambGoal: $('hAmbGoal'),
  conflicts: $('hConflicts'), graph: $('graph'),
  tables: $('tables'), bench: $('bench'), levelName: $('levelName'),
  levelDesc: $('levelDesc'), toast: $('toast'),
  start: $('start'), levelsOverlay: $('levelsOverlay'), levelList: $('levelList'),
  winOverlay: $('winOverlay'), winTitle: $('winTitle'), winText: $('winText')
};
const gtx = el.graph.getContext('2d');

// ---------- Scoring ----------
const VOISIN_BONUS = 0.5; // fraction de v ajoutée pour les voisins directs

// ---------- Têtes des invités ----------
// Paramètres déterministes dérivés du prénom : la même personne a toujours la même tête.
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
const SKINS = ['#f8dcc0', '#f3c9a2', '#e8b184', '#d99a66', '#b97a4e', '#8a5433'];
const HAIRS = ['#2f2a26', '#4a3220', '#6e4a24', '#a06a32', '#c9973f', '#d9d9d9', '#8a3b3b', '#3f3a55'];
const SHIRTS = ['#d98e96', '#c9a227', '#8aa87a', '#7fa8c9', '#b39ddb', '#e8a06a'];
const BGS = ['#fde8ef', '#e8f0fd', '#eaf7e6', '#fdf3d8', '#efe6fd', '#e0f4f4'];
function shade(hex, f) { // f < 1 assombrit, f > 1 éclaircit
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 1) { r *= f; g *= f; b *= f; } else { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
// Géométrie commune au SVG (viewBox 64) et au canvas
function faceLayout() {
  const headY = 31, headR = 12.5;
  return {
    cx: 32, headY, headR, earR: 2.4,
    capY: headY, capR: 13.8, capInner: 9.6,
    eyeY: headY + 1.5, eyeDX: 5.2, eyeR: 2.5, pupilR: 1.25,
    browY: headY - 2.4, noseY: headY + 4.5, mouthY: headY + 8.6,
    blushY: headY + 6.8, blushDX: 8.2, blushRX: 2.3, blushRY: 1.6,
    neckW: 8.5, neckY: headY + headR - 3, neckH: 12, shoulderY: 40
  };
}
function faceParams(name) {
  const h = hashStr(name);
  return {
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[(h >> 3) % HAIRS.length],
    style: (h >> 6) % 5,           // 0 court, 1 long, 2 chignon, 3 boucles, 4 queue
    glasses: ((h >> 9) % 4) === 0,
    shirt: SHIRTS[(h >> 11) % SHIRTS.length],
    bg: BGS[(h >> 13) % BGS.length],
    bigSmile: ((h >> 15) % 3) === 0
  };
}

// Tête en SVG (jetons DOM) — portrait : épaules, cou, tête, coiffure, traits du visage
function faceSVG(name) {
  const p = faceParams(name);
  const L = faceLayout();
  const h = hashStr(name);
  const cx = L.cx;
  const skinD = shade(p.skin, 0.82);
  // coiffure : calotte en croissant au-dessus du front + variante selon le style
  let hair = '<path d="M ' + (cx - L.capR) + ' ' + L.capY +
    ' A ' + L.capR + ' ' + L.capR + ' 0 0 1 ' + (cx + L.capR) + ' ' + L.capY +
    ' L ' + (cx + L.capInner) + ' ' + L.capY +
    ' A ' + L.capInner + ' ' + L.capInner + ' 0 0 0 ' + (cx - L.capInner) + ' ' + L.capY +
    ' Z" fill="' + p.hair + '"/>';
  if (p.style === 1) hair +=
    '<rect x="' + (cx - L.capR + 0.5) + '" y="' + (L.capY - 1) + '" width="5" height="24" rx="2.5" fill="' + p.hair + '"/>' +
    '<rect x="' + (cx + L.capR - 5.5) + '" y="' + (L.capY - 1) + '" width="5" height="24" rx="2.5" fill="' + p.hair + '"/>';
  if (p.style === 2) hair += '<circle cx="' + cx + '" cy="' + (L.capY - L.capR + 1.5) + '" r="4.6" fill="' + p.hair + '"/>';
  if (p.style === 3) { for (let i = 0; i < 4; i++) hair += '<circle cx="' + (cx - 9 + i * 6) + '" cy="' + (L.capY - L.capR + 4 + (i % 2)) + '" r="3.4" fill="' + p.hair + '"/>'; }
  if (p.style === 4) hair +=
    '<circle cx="' + (cx + L.capR - 1) + '" cy="' + (L.capY - 6) + '" r="4" fill="' + p.hair + '"/>' +
    '<path d="M ' + (cx + L.capR + 2) + ' ' + (L.capY - 4) + ' q 4 6 1 12" stroke="' + p.hair + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
  const brows =
    '<path d="M ' + (cx - L.eyeDX - 2.2) + ' ' + L.browY + ' q 2.2 -1.6 4.4 0" stroke="' + p.hair + '" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
    '<path d="M ' + (cx + L.eyeDX - 2.2) + ' ' + L.browY + ' q 2.2 -1.6 4.4 0" stroke="' + p.hair + '" stroke-width="1.3" fill="none" stroke-linecap="round"/>';
  const eye = (ex) =>
    '<circle cx="' + ex + '" cy="' + L.eyeY + '" r="' + L.eyeR + '" fill="#fff"/>' +
    '<circle cx="' + (ex - 0.3) + '" cy="' + L.eyeY + '" r="' + L.pupilR + '" fill="#33261d"/>' +
    '<circle cx="' + (ex - 0.8) + '" cy="' + (L.eyeY - 0.8) + '" r="0.55" fill="#fff"/>';
  const mouth = p.bigSmile
    ? '<path d="M ' + (cx - 4.5) + ' ' + L.mouthY + ' Q ' + cx + ' ' + (L.mouthY + 6.8) + ' ' + (cx + 4.5) + ' ' + L.mouthY + ' Z" fill="#a03a2e"/>' +
      '<path d="M ' + (cx - 4.5) + ' ' + L.mouthY + ' Q ' + cx + ' ' + (L.mouthY + 2.2) + ' ' + (cx + 4.5) + ' ' + L.mouthY + '" stroke="#fff" stroke-width="1.4" fill="none"/>'
    : '<path d="M ' + (cx - 4) + ' ' + L.mouthY + ' q 4 3.6 8 0" stroke="#a04a3a" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
  const blush =
    '<ellipse cx="' + (cx - L.blushDX) + '" cy="' + L.blushY + '" rx="' + L.blushRX + '" ry="' + L.blushRY + '" fill="#f2a0a0" opacity="0.5"/>' +
    '<ellipse cx="' + (cx + L.blushDX) + '" cy="' + L.blushY + '" rx="' + L.blushRX + '" ry="' + L.blushRY + '" fill="#f2a0a0" opacity="0.5"/>';
  const nose = '<path d="M ' + cx + ' ' + L.noseY + ' q 1.2 1.6 0 2.6" stroke="' + skinD + '" stroke-width="1.2" fill="none" stroke-linecap="round"/>';
  const glasses = p.glasses
    ? '<circle cx="' + (cx - L.eyeDX) + '" cy="' + L.eyeY + '" r="3.9" fill="none" stroke="#4a3f35" stroke-width="1.4"/>' +
      '<circle cx="' + (cx + L.eyeDX) + '" cy="' + L.eyeY + '" r="3.9" fill="none" stroke="#4a3f35" stroke-width="1.4"/>' +
      '<line x1="' + (cx - L.eyeDX + 3.9) + '" y1="' + L.eyeY + '" x2="' + (cx + L.eyeDX - 3.9) + '" y2="' + L.eyeY + '" stroke="#4a3f35" stroke-width="1.4"/>' +
      '<line x1="' + (cx - L.eyeDX - 3.9) + '" y1="' + L.eyeY + '" x2="' + (cx - L.headR) + '" y2="' + (L.headY - 1) + '" stroke="#4a3f35" stroke-width="1.2"/>' +
      '<line x1="' + (cx + L.eyeDX + 3.9) + '" y1="' + L.eyeY + '" x2="' + (cx + L.headR) + '" y2="' + (L.headY - 1) + '" stroke="#4a3f35" stroke-width="1.2"/>'
    : '';
  return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><clipPath id="cp' + h + '"><circle cx="32" cy="32" r="31"/></clipPath></defs>' +
    '<circle cx="32" cy="32" r="31" fill="' + p.bg + '"/>' +
    '<g clip-path="url(#cp' + h + ')">' +
      '<path d="M ' + (cx - 24) + ' 64 Q ' + cx + ' ' + L.shoulderY + ' ' + (cx + 24) + ' 64 Z" fill="' + p.shirt + '"/>' +
      '<rect x="' + (cx - L.neckW / 2) + '" y="' + L.neckY + '" width="' + L.neckW + '" height="' + L.neckH + '" fill="' + p.skin + '"/>' +
      '<ellipse cx="' + cx + '" cy="' + (L.neckY + 1.5) + '" rx="' + (L.neckW / 2) + '" ry="1.8" fill="' + skinD + '"/>' +
    '</g>' +
    '<circle cx="' + (cx - L.headR + 0.5) + '" cy="' + L.headY + '" r="' + L.earR + '" fill="' + p.skin + '"/>' +
    '<circle cx="' + (cx + L.headR - 0.5) + '" cy="' + L.headY + '" r="' + L.earR + '" fill="' + p.skin + '"/>' +
    '<circle cx="' + cx + '" cy="' + L.headY + '" r="' + L.headR + '" fill="' + p.skin + '"/>' +
    hair + brows + eye(cx - L.eyeDX) + eye(cx + L.eyeDX) + nose + blush + mouth + glasses +
    '</svg>';
}

// Tête dessinée sur le canvas du schéma (même géométrie que faceSVG, mise à l'échelle)
function drawFace(name, x, y, r) {
  const p = faceParams(name);
  const L = faceLayout();
  const s = r / 32, TAU = Math.PI * 2;
  const X = (v) => x + (v - 32) * s;
  const Y = (v) => y + (v - 32) * s;
  const S = (v) => v * s;
  const skinD = shade(p.skin, 0.82);
  const cx = L.cx;
  gtx.beginPath(); gtx.arc(x, y, r, 0, TAU); gtx.fillStyle = p.bg; gtx.fill();
  gtx.save();
  gtx.beginPath(); gtx.arc(x, y, r - S(1), 0, TAU); gtx.clip();
  gtx.beginPath();
  gtx.moveTo(X(cx - 24), Y(64));
  gtx.quadraticCurveTo(X(cx), Y(L.shoulderY), X(cx + 24), Y(64));
  gtx.closePath(); gtx.fillStyle = p.shirt; gtx.fill();
  gtx.fillStyle = p.skin;
  gtx.fillRect(X(cx - L.neckW / 2), Y(L.neckY), S(L.neckW), S(L.neckH));
  gtx.fillStyle = skinD;
  gtx.beginPath(); gtx.ellipse(X(cx), Y(L.neckY + 1.5), S(L.neckW / 2), S(1.8), 0, 0, TAU); gtx.fill();
  gtx.restore();
  gtx.fillStyle = p.skin;
  gtx.beginPath(); gtx.arc(X(cx - L.headR + 0.5), Y(L.headY), S(L.earR), 0, TAU); gtx.fill();
  gtx.beginPath(); gtx.arc(X(cx + L.headR - 0.5), Y(L.headY), S(L.earR), 0, TAU); gtx.fill();
  gtx.beginPath(); gtx.arc(X(cx), Y(L.headY), S(L.headR), 0, TAU); gtx.fill();
  // coiffure
  gtx.fillStyle = p.hair;
  gtx.beginPath();
  gtx.moveTo(X(cx - L.capR), Y(L.capY));
  gtx.arc(X(cx), Y(L.capY), S(L.capR), Math.PI, TAU);
  gtx.lineTo(X(cx + L.capInner), Y(L.capY));
  gtx.arc(X(cx), Y(L.capY), S(L.capInner), TAU, Math.PI, true);
  gtx.closePath(); gtx.fill();
  if (p.style === 1) {
    gtx.fillRect(X(cx - L.capR + 0.5), Y(L.capY - 1), S(5), S(24));
    gtx.fillRect(X(cx + L.capR - 5.5), Y(L.capY - 1), S(5), S(24));
  }
  if (p.style === 2) { gtx.beginPath(); gtx.arc(X(cx), Y(L.capY - L.capR + 1.5), S(4.6), 0, TAU); gtx.fill(); }
  if (p.style === 3) { for (let i = 0; i < 4; i++) { gtx.beginPath(); gtx.arc(X(cx - 9 + i * 6), Y(L.capY - L.capR + 4 + (i % 2)), S(3.4), 0, TAU); gtx.fill(); } }
  if (p.style === 4) {
    gtx.beginPath(); gtx.arc(X(cx + L.capR - 1), Y(L.capY - 6), S(4), 0, TAU); gtx.fill();
    gtx.beginPath(); gtx.moveTo(X(cx + L.capR + 2), Y(L.capY - 4));
    gtx.quadraticCurveTo(X(cx + L.capR + 6), Y(L.capY + 2), X(cx + L.capR + 3), Y(L.capY + 8));
    gtx.strokeStyle = p.hair; gtx.lineWidth = S(3); gtx.lineCap = 'round'; gtx.stroke();
  }
  // sourcils
  gtx.strokeStyle = p.hair; gtx.lineWidth = S(1.3); gtx.lineCap = 'round';
  gtx.beginPath(); gtx.moveTo(X(cx - L.eyeDX - 2.2), Y(L.browY)); gtx.quadraticCurveTo(X(cx - L.eyeDX), Y(L.browY - 1.6), X(cx - L.eyeDX + 2.2), Y(L.browY)); gtx.stroke();
  gtx.beginPath(); gtx.moveTo(X(cx + L.eyeDX - 2.2), Y(L.browY)); gtx.quadraticCurveTo(X(cx + L.eyeDX), Y(L.browY - 1.6), X(cx + L.eyeDX + 2.2), Y(L.browY)); gtx.stroke();
  // yeux
  for (const ex of [cx - L.eyeDX, cx + L.eyeDX]) {
    gtx.beginPath(); gtx.arc(X(ex), Y(L.eyeY), S(L.eyeR), 0, TAU); gtx.fillStyle = '#fff'; gtx.fill();
    gtx.beginPath(); gtx.arc(X(ex - 0.3), Y(L.eyeY), S(L.pupilR), 0, TAU); gtx.fillStyle = '#33261d'; gtx.fill();
    gtx.beginPath(); gtx.arc(X(ex - 0.8), Y(L.eyeY - 0.8), S(0.55), 0, TAU); gtx.fillStyle = '#fff'; gtx.fill();
  }
  // nez
  gtx.beginPath(); gtx.moveTo(X(cx), Y(L.noseY)); gtx.quadraticCurveTo(X(cx + 1.2), Y(L.noseY + 1.6), X(cx), Y(L.noseY + 2.6));
  gtx.strokeStyle = skinD; gtx.lineWidth = S(1.2); gtx.lineCap = 'round'; gtx.stroke();
  // blush
  gtx.fillStyle = 'rgba(242,160,160,0.5)';
  gtx.beginPath(); gtx.ellipse(X(cx - L.blushDX), Y(L.blushY), S(L.blushRX), S(L.blushRY), 0, 0, TAU); gtx.fill();
  gtx.beginPath(); gtx.ellipse(X(cx + L.blushDX), Y(L.blushY), S(L.blushRX), S(L.blushRY), 0, 0, TAU); gtx.fill();
  // bouche
  if (p.bigSmile) {
    gtx.beginPath();
    gtx.moveTo(X(cx - 4.5), Y(L.mouthY));
    gtx.quadraticCurveTo(X(cx), Y(L.mouthY + 6.8), X(cx + 4.5), Y(L.mouthY));
    gtx.closePath(); gtx.fillStyle = '#a03a2e'; gtx.fill();
    gtx.beginPath();
    gtx.moveTo(X(cx - 4.5), Y(L.mouthY));
    gtx.quadraticCurveTo(X(cx), Y(L.mouthY + 2.2), X(cx + 4.5), Y(L.mouthY));
    gtx.strokeStyle = '#fff'; gtx.lineWidth = S(1.4); gtx.stroke();
  } else {
    gtx.beginPath();
    gtx.moveTo(X(cx - 4), Y(L.mouthY));
    gtx.quadraticCurveTo(X(cx), Y(L.mouthY + 3.6), X(cx + 4), Y(L.mouthY));
    gtx.strokeStyle = '#a04a3a'; gtx.lineWidth = S(1.8); gtx.lineCap = 'round'; gtx.stroke();
  }
  // lunettes
  if (p.glasses) {
    gtx.strokeStyle = '#4a3f35'; gtx.lineWidth = S(1.4);
    gtx.beginPath(); gtx.arc(X(cx - L.eyeDX), Y(L.eyeY), S(3.9), 0, TAU); gtx.stroke();
    gtx.beginPath(); gtx.arc(X(cx + L.eyeDX), Y(L.eyeY), S(3.9), 0, TAU); gtx.stroke();
    gtx.beginPath(); gtx.moveTo(X(cx - L.eyeDX + 3.9), Y(L.eyeY)); gtx.lineTo(X(cx + L.eyeDX - 3.9), Y(L.eyeY)); gtx.stroke();
    gtx.lineWidth = S(1.2);
    gtx.beginPath(); gtx.moveTo(X(cx - L.eyeDX - 3.9), Y(L.eyeY)); gtx.lineTo(X(cx - L.headR), Y(L.headY - 1)); gtx.stroke();
    gtx.beginPath(); gtx.moveTo(X(cx + L.eyeDX + 3.9), Y(L.eyeY)); gtx.lineTo(X(cx + L.headR), Y(L.headY - 1)); gtx.stroke();
  }
}

function relMap() {
  const m = new Map();
  for (const r of level.relations) {
    const k = r.a < r.b ? r.a + '_' + r.b : r.b + '_' + r.a;
    m.set(k, r.v);
  }
  return m;
}

function seatOf(g) { return placement[g]; }

function sameTable(a, b) {
  const sa = seatOf(a), sb = seatOf(b);
  return sa && sb && sa.table === sb.table;
}

function adjacent(a, b) {
  const sa = seatOf(a), sb = seatOf(b);
  if (!sa || !sb || sa.table !== sb.table) return false;
  const n = level.seats;
  const d = Math.abs(sa.seat - sb.seat);
  return d === 1 || d === n - 1;
}

// Calcule le score brut, l'ambiance 0..100, et les conflits courants.
function computeScore() {
  const rel = relMap();
  let total = 0;
  let sumPos = 0, sumNeg = 0;
  const conflicts = [];
  const happy = [];
  for (const r of level.relations) {
    if (r.v > 0) sumPos += r.v; else sumNeg += r.v;
  }
  for (const r of level.relations) {
    if (!sameTable(r.a, r.b)) continue;
    let c = r.v;
    if (adjacent(r.a, r.b)) c += Math.round(r.v * VOISIN_BONUS);
    total += c;
    if (r.v < 0) conflicts.push({ a: r.a, b: r.b, v: r.v, adjacent: adjacent(r.a, r.b) });
    else if (r.v >= 2) happy.push({ a: r.a, b: r.b });
  }
  const maxTotal = Math.round(sumPos * (1 + VOISIN_BONUS));
  const minTotal = Math.round(sumNeg * (1 + VOISIN_BONUS));
  const span = maxTotal - minTotal || 1;
  const ambiance = Math.max(0, Math.min(100, Math.round(100 * (total - minTotal) / span)));
  return { total, ambiance, conflicts, happy, sumPos, sumNeg };
}

// ---------- Rendu ----------
function tableSize() { return Math.max(260, level.seats * 92); }

function renderTables() {
  el.tables.innerHTML = '';
  const size = tableSize();
  const radius = size / 2 - 44;
  for (let t = 0; t < level.tables; t++) {
    const tbl = document.createElement('div');
    tbl.className = 'table';
    tbl.style.width = size + 'px';
    tbl.style.height = size + 'px';
    tbl.dataset.table = t;
    tbl.innerHTML = '<span class="tlabel">Table ' + (t + 1) + '</span>';
    for (let s = 0; s < level.seats; s++) {
      const seat = document.createElement('div');
      seat.className = 'seat';
      seat.dataset.table = t;
      seat.dataset.seat = s;
      const ang = -Math.PI / 2 + (2 * Math.PI * s) / level.seats;
      seat.style.left = size / 2 + radius * Math.cos(ang) + 'px';
      seat.style.top = size / 2 + radius * Math.sin(ang) + 'px';
      tbl.appendChild(seat);
    }
    el.tables.appendChild(tbl);
  }
  renderBench();
  renderSeats();
}

function tokenEl(g) {
  const d = document.createElement('div');
  d.className = 'token';
  d.dataset.guest = g;
  d.title = level.guests[g];
  d.innerHTML = faceSVG(level.guests[g]) + '<span class="tname">' + level.guests[g] + '</span>';
  return d;
}

function renderBench() {
  el.bench.innerHTML = '';
  for (const g of guestOrder) {
    if (!placement[g]) el.bench.appendChild(tokenEl(g));
  }
}

function renderSeats() {
  document.querySelectorAll('.seat').forEach((seat) => {
    seat.innerHTML = '';
    seat.classList.remove('occupied');
    const t = +seat.dataset.table, s = +seat.dataset.seat;
    const g = placement.findIndex((p) => p && p.table === t && p.seat === s);
    if (g >= 0) {
      seat.classList.add('occupied');
      const tok = tokenEl(g);
      tok.classList.add('placed');
      seat.appendChild(tok);
    }
  });
}

// Positions des nœuds sur le cercle (partagé entre le rendu et le clic).
// L'angle dépend de l'ordre mélangé (guestOrder), pas de l'ordre du niveau.
function graphPos() {
  const W = el.graph.width, H = el.graph.height;
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 82;
  const TAU = Math.PI * 2;
  const n = level.guests.length;
  const slot = new Array(n);
  guestOrder.forEach((g, k) => { slot[g] = k; });
  return level.guests.map((_, i) => {
    const k = slot[i] != null ? slot[i] : i;
    const a = -Math.PI / 2 + (TAU * k) / n;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a, R };
  });
}

// voisins d'un invité -> force du lien (Map voisin -> v)
function relationsOf(g) {
  const m = new Map();
  for (const r of level.relations) {
    if (r.a === g) m.set(r.b, r.v);
    else if (r.b === g) m.set(r.a, r.v);
  }
  return m;
}

function renderGraph() {
  const W = el.graph.width, H = el.graph.height;
  const cx = W / 2, cy = H / 2, TAU = Math.PI * 2;
  gtx.clearRect(0, 0, W, H);
  const pos = graphPos();
  const R = pos.length ? pos[0].R : 0;
  const sel = selected;
  const relSel = sel == null ? null : relationsOf(sel);
  // arêtes : couleur + épaisseur graduées selon la force (aucun nombre affiché)
  for (const r of level.relations) {
    const p = pos[r.a], q = pos[r.b];
    const conflit = sameTable(r.a, r.b) && r.v < 0;
    const amiMemeTable = sameTable(r.a, r.b) && r.v > 0;
    const mag = Math.abs(r.v);
    const isRel = relSel !== null && (r.a === sel || r.b === sel);
    let color, width, dash;
    if (conflit) { color = '#e0a800'; width = 5; dash = []; }
    else if (r.v > 0) {
      color = ['#7cb87c', '#4c9a2a', '#2e7d32'][mag - 1];
      width = [2, 4, 6.5][mag - 1];
      dash = mag === 1 ? [7, 5] : [];
    } else {
      color = ['#e08a8a', '#d64545', '#a71d1d'][mag - 1];
      width = [2, 4, 6.5][mag - 1];
      dash = mag === 1 ? [7, 5] : [];
    }
    if (sel != null && !isRel) {
      // sélection active : on atténue les liens qui ne concernent pas l'invité
      gtx.globalAlpha = 0.13;
      width = Math.max(1.5, width - 1);
    } else {
      gtx.globalAlpha = 1;
      if (isRel) width += 2.5; // lien de l'invité sélectionné : plus épais
    }
    // courbe légère vers l'extérieur pour séparer les traits
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    let ox = mx - cx, oy = my - cy;
    const ol = Math.hypot(ox, oy) || 1;
    const bow = len * 0.1;
    const ccx = mx + (ox / ol) * bow, ccy = my + (oy / ol) * bow;
    gtx.beginPath();
    gtx.moveTo(p.x, p.y);
    gtx.quadraticCurveTo(ccx, ccy, q.x, q.y);
    gtx.strokeStyle = color;
    gtx.lineWidth = width;
    gtx.lineCap = 'round';
    gtx.setLineDash(dash);
    if (conflit || amiMemeTable || isRel) {
      gtx.shadowColor = conflit ? '#e0a800' : color;
      gtx.shadowBlur = isRel ? 14 : 10;
    }
    gtx.stroke();
    gtx.shadowBlur = 0;
    gtx.setLineDash([]);
    gtx.globalAlpha = 1;
  }
  // nœuds : tête de l'invité + nom à l'extérieur ; la sélection met en relief l'invité et ses relations
  pos.forEach((p, i) => {
    const rr = 26;
    const isSel = sel === i;
    const vRel = relSel ? relSel.get(i) : undefined;
    const dim = sel != null && !isSel && vRel === undefined;
    gtx.globalAlpha = dim ? 0.28 : 1;
    drawFace(level.guests[i], p.x, p.y, rr - 1);
    gtx.beginPath(); gtx.arc(p.x, p.y, rr, 0, TAU);
    if (isSel) {
      gtx.lineWidth = 4.5; gtx.strokeStyle = '#c9a227';
      gtx.shadowColor = '#c9a227'; gtx.shadowBlur = 16;
    } else if (vRel !== undefined) {
      gtx.lineWidth = 3.5; gtx.strokeStyle = vRel > 0 ? '#4c9a2a' : '#d64545';
      gtx.shadowColor = gtx.strokeStyle; gtx.shadowBlur = 10;
    } else {
      gtx.lineWidth = placement[i] ? 3 : 2;
      gtx.strokeStyle = placement[i] ? '#8aa87a' : '#d98e96';
    }
    gtx.stroke();
    gtx.shadowBlur = 0;
    // nom ancré à l'extérieur du cercle : alignement selon l'angle pour
    // que le texte s'éloigne toujours de la tête (jamais dessus)
    const lr = R + 30;
    const lx = cx + lr * Math.cos(p.a), ly = cy + lr * Math.sin(p.a);
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    gtx.textAlign = ca > 0.35 ? 'left' : ca < -0.35 ? 'right' : 'center';
    gtx.textBaseline = sa > 0.35 ? 'top' : sa < -0.35 ? 'bottom' : 'middle';
    gtx.font = (isSel || vRel !== undefined ? 'bold ' : '') + '11px Georgia, serif';
    gtx.fillStyle = dim ? '#c0b3a0' : isSel ? '#8a6d1f' : '#6b5d4f';
    gtx.fillText(level.guests[i], lx, ly);
    gtx.globalAlpha = 1;
  });
}

function renderHud() {
  const sc = computeScore();
  el.level.textContent = (levelIdx + 1) + ' / ' + PLAN_LEVELS.length;
  el.goal.textContent = level.seuil + ' %';
  el.ambGoal.style.left = level.seuil + '%';
  el.amb.textContent = sc.ambiance + ' %';
  el.ambFill.style.width = sc.ambiance + '%';
  el.conflicts.textContent = sc.conflicts.length;
  return sc;
}

function renderAll() {
  renderSeats();
  renderBench();
  renderGraph();
  renderHud();
}

// ---------- Placement ----------
function place(g, table, seat) {
  const cur = placement[g];
  const occupant = placement.findIndex((p, i) => i !== g && p && p.table === table && p.seat === seat);
  if (occupant >= 0) {
    // échange
    placement[occupant] = cur || null;
  }
  placement[g] = { table, seat };
  selected = null;
  renderAll();
}

function unplace(g) {
  placement[g] = null;
  renderAll();
}

// ---------- Sélection d'un invité (jeton ou tête du schéma) ----------
function selectGuest(g) {
  selected = (selected === g) ? null : g;
  renderAll();
  document.querySelectorAll('.token').forEach((t) => t.classList.toggle('selected', +t.dataset.guest === selected));
}

// clic sur une tête du schéma des relations -> sélectionne l'invité
el.graph.addEventListener('click', (e) => {
  const rect = el.graph.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (el.graph.width / rect.width);
  const y = (e.clientY - rect.top) * (el.graph.height / rect.height);
  let best = -1, bd = Infinity;
  graphPos().forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = i; }
  });
  if (best >= 0 && bd <= 32) selectGuest(best);
  else if (selected != null) selectGuest(selected); // clic à côté : désélectionne
});

// ---------- Drag & drop (pointer events) + mode clic ----------
let drag = null; // { g, ghost, moved, fromSeat }

document.addEventListener('pointerdown', (e) => {
  const tok = e.target.closest('.token');
  if (!tok) return;
  const g = +tok.dataset.guest;
  drag = { g, moved: false, sx: e.clientX, sy: e.clientY, fromSeat: !!seatOf(g) };
  const ghost = tokenEl(g);
  ghost.classList.add('ghost');
  ghost.style.left = e.clientX - 37 + 'px';
  ghost.style.top = e.clientY - 37 + 'px';
  document.body.appendChild(ghost);
  drag.ghost = ghost;
  e.preventDefault();
});

document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 6) drag.moved = true;
  if (drag.moved) {
    drag.ghost.style.left = e.clientX - 37 + 'px';
    drag.ghost.style.top = e.clientY - 37 + 'px';
  }
});

document.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.ghost.remove();
  if (d.moved) {
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const seat = under && under.closest ? under.closest('.seat') : null;
    if (seat) place(d.g, +seat.dataset.table, +seat.dataset.seat);
    else if (d.fromSeat) unplace(d.g);
    else renderAll();
  } else {
    // clic simple : sélection / placement
    const seat = e.target.closest('.seat');
    if (seat) { place(d.g, +seat.dataset.table, +seat.dataset.seat); return; }
    selectGuest(d.g);
  }
});

// ---------- Niveaux ----------
function loadLevel(i) {
  levelIdx = i;
  level = PLAN_LEVELS[i];
  placement = level.guests.map(() => null);
  selected = null;
  // ordre d'affichage mélangé : les invités n'apparaissent plus dans l'ordre du niveau
  guestOrder = level.guests.map((_, g) => g);
  for (let k = guestOrder.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    const t = guestOrder[k]; guestOrder[k] = guestOrder[j]; guestOrder[j] = t;
  }
  el.levelName.textContent = 'Niveau ' + (i + 1) + ' — ' + level.name;
  el.levelDesc.textContent = level.desc;
  renderTables();
  renderAll();
}

function renderLevelList() {
  el.levelList.innerHTML = '';
  PLAN_LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    const locked = i > save.unlocked;
    const done = save.done[i] != null;
    b.className = (locked ? 'locked' : '') + (done ? ' done' : '');
    b.innerHTML = '<span>Niveau ' + (i + 1) + ' — ' + lv.name + '</span>' +
      '<span>' + (locked ? 'Verrouillé' : done ? 'Réussi (' + save.done[i] + ' %)' : 'Objectif ' + lv.seuil + ' %') + '</span>';
    if (!locked) b.addEventListener('click', () => { el.levelsOverlay.classList.add('hidden'); loadLevel(i); });
    el.levelList.appendChild(b);
  });
}

// ---------- Validation ----------
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('show'), 2600);
}

function validate() {
  const sc = computeScore();
  const unplaced = placement.filter((p) => !p).length;
  if (unplaced > 0) { toast(unplaced + ' invité(s) encore à placer !'); return; }
  if (sc.ambiance >= level.seuil) {
    const first = save.done[levelIdx] == null;
    save.done[levelIdx] = Math.max(save.done[levelIdx] || 0, sc.ambiance);
    save.unlocked = Math.max(save.unlocked, Math.min(levelIdx + 1, PLAN_LEVELS.length - 1));
    storeSave(save);
    el.winTitle.textContent = 'Niveau réussi !';
    el.winText.textContent = 'Ambiance de ' + sc.ambiance + ' % (objectif ' + level.seuil + ' %). ' +
      (first && levelIdx + 1 < PLAN_LEVELS.length ? 'Le niveau suivant est débloqué.' : 'Tous les niveaux sont débloqués, bravo !');
    $('winNext').style.display = levelIdx + 1 < PLAN_LEVELS.length ? '' : 'none';
    el.winOverlay.classList.remove('hidden');
  } else {
    toast('Ambiance insuffisante : ' + sc.ambiance + ' % < ' + level.seuil + ' %. ' +
      (sc.conflicts.length ? sc.conflicts.length + ' conflit(s) à régler.' : 'Rapprochez les amis !'));
  }
}

// ---------- Boutons ----------
$('btnValidate').addEventListener('click', validate);
$('btnReset').addEventListener('click', () => loadLevel(levelIdx));
$('btnLevels').addEventListener('click', () => { renderLevelList(); el.levelsOverlay.classList.remove('hidden'); });
$('levelsClose').addEventListener('click', () => el.levelsOverlay.classList.add('hidden'));
$('startBtn').addEventListener('click', () => { el.start.classList.add('hidden'); loadLevel(Math.min(save.unlocked, PLAN_LEVELS.length - 1)); });
$('winNext').addEventListener('click', () => { el.winOverlay.classList.add('hidden'); loadLevel(Math.min(levelIdx + 1, PLAN_LEVELS.length - 1)); });
$('winRetry').addEventListener('click', () => { el.winOverlay.classList.add('hidden'); loadLevel(levelIdx); });
$('winLevels').addEventListener('click', () => { el.winOverlay.classList.add('hidden'); renderLevelList(); el.levelsOverlay.classList.remove('hidden'); });
