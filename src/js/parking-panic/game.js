'use strict';

/* ============================================================
   Parking Panic — logique du jeu
   Le joueur conduit une voiture au clavier et doit se garer
   dans la place cible de chaque niveau, entre voitures mal
   garées et circulation.
   - sauvegarde locale (localStorage), clé picbird.parkingPanic
   - verrouillé tant que Plan de Table n'a pas NEED_PDT_DONE
     niveaux de réussis (progression lue dans sa sauvegarde)
   - le jeu est "réussi" (cleared) avec NEED_DONE niveaux réussis,
     ce qui débloquera le jeu suivant du parcours
   ============================================================ */

// ---------- Constantes de progression ----------
const SAVE_KEY = 'picbird.parkingPanic';
const NEED_PDT_DONE = 2;  // niveaux de Plan de Table à réussir pour débloquer Parking Panic
const NEED_DONE = 5;      // niveaux à réussir sur PARKING_LEVELS.length pour réussir le jeu
const SHOCK_PENALTY = 2;  // secondes ajoutées au chrono par choc

// ---------- Sauvegarde ----------
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { unlocked: 0, done: {}, cleared: false }; }
  catch (e) { return { unlocked: 0, done: {}, cleared: false }; }
}
function storeSave() { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
let save = loadSave();

// ---------- Verrou inter-jeux : Plan de Table ----------
function planDeTableDoneCount() {
  try {
    const s = JSON.parse(localStorage.getItem('picbird.planDeTable'));
    return s && s.done ? Object.keys(s.done).length : 0;
  } catch (e) { return 0; }
}

// ---------- Éléments ----------
const $ = (id) => document.getElementById(id);
const el = {
  hLevel: $('hLevel'), hTime: $('hTime'), hShocks: $('hShocks'), hGear: $('hGear'),
  pAcc: $('pAcc'), pBrake: $('pBrake'), pHand: $('pHand'),
  parkWrap: $('parkWrap'), parkFill: $('parkFill'),
  toast: $('toast'),
  lockOverlay: $('lockOverlay'), lockText: $('lockText'), lockRefresh: $('lockRefresh'),
  start: $('start'), startBtn: $('startBtn'),
  levelsOverlay: $('levelsOverlay'), levelList: $('levelList'), levelsClose: $('levelsClose'),
  clearedBanner: $('clearedBanner'),
  winOverlay: $('winOverlay'), winTitle: $('winTitle'), winText: $('winText'),
  winNext: $('winNext'), winRetry: $('winRetry'), winLevels: $('winLevels'),
  btnReset: $('btnReset'), btnLevels: $('btnLevels')
};

// ---------- État ----------
let levelIdx = 0;
let level = null;
let player = null;
let traffic = [];
let inp = { up: false, down: false, left: false, right: false, hand: false };
let playing = false; // une partie est en cours
let time = 0, shocks = 0, parkT = 0, flash = 0;
let lastShock = -10; // cooldown anti-rebond des chocs (s)

// ---------- Canvas ----------
const canvas = $('game');
const ctx = canvas.getContext('2d');
let CW = 0, CH = 0;
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  CW = r.width; CH = r.height;
  canvas.width = Math.round(CW * DPR);
  canvas.height = Math.round(CH * DPR);
}
window.addEventListener('resize', resize);

// ---------- Entrées clavier ----------
// Les touches affichées à l'écran : ↑ ↓ ← → Espace R.
// Alias ZQSD/WASD acceptés pour les claviers/azerty.
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', KeyZ: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'hand'
};
window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { inp[KEYMAP[e.code]] = true; e.preventDefault(); }
  else if (e.code === 'KeyR') { toggleGear(); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) { inp[KEYMAP[e.code]] = false; e.preventDefault(); }
});

function toggleGear() {
  if (!playing || !player) return;
  if (Math.abs(player.speed) < 6) {
    player.gear *= -1;
    toast(player.gear > 0 ? 'Mode marche avant (AV)' : 'Mode marche arrière (AR)');
  } else {
    toast('Ralentissez complètement pour changer de mode (R)');
  }
}

// ---------- Niveaux ----------
function loadLevel(i) {
  levelIdx = i;
  level = PARKING_LEVELS[i];
  player = makeCar(CAR_SPECS[level.car], level.start.x, level.start.y, level.start.angle);
  traffic = level.traffic.map(makeTraffic);
  time = 0; shocks = 0; parkT = 0; flash = 0;
  playing = true;
  for (const k of Object.keys(inp)) inp[k] = false;
  el.winOverlay.classList.add('hidden');
  updateHUD();
}

function levelSuccess() {
  playing = false;
  const score = Math.round((time + shocks * SHOCK_PENALTY) * 10) / 10;
  if (save.done[levelIdx] == null || score < save.done[levelIdx]) save.done[levelIdx] = score;
  save.unlocked = Math.max(save.unlocked, Math.min(levelIdx + 1, PARKING_LEVELS.length - 1));
  const n = doneCount();
  const newlyCleared = !save.cleared && n >= NEED_DONE;
  if (newlyCleared) save.cleared = true;
  storeSave();
  el.winTitle.textContent = newlyCleared ? 'Jeu réussi !' : 'Niveau réussi !';
  el.winText.textContent = 'Niveau ' + (levelIdx + 1) + ' garé en ' + score.toFixed(1) + ' s (' +
    shocks + ' choc' + (shocks > 1 ? 's' : '') + '). ' + n + '/' + PARKING_LEVELS.length +
    ' niveaux réussis' + (newlyCleared
      ? ' : le jeu est réussi, la suite du parcours est débloquée !'
      : ' — il en faut ' + NEED_DONE + ' pour réussir le jeu et débloquer la suite.');
  el.winNext.style.display = levelIdx + 1 < PARKING_LEVELS.length ? '' : 'none';
  el.winOverlay.classList.remove('hidden');
}

// ---------- HUD ----------
function updateHUD() {
  el.hLevel.textContent = level ? (levelIdx + 1) + ' / ' + PARKING_LEVELS.length + ' — ' + level.name : '—';
  el.hTime.textContent = (time + shocks * SHOCK_PENALTY).toFixed(1) + ' s';
  el.hShocks.textContent = shocks;
  el.hGear.textContent = player && player.gear < 0 ? 'AR' : 'AV';
  el.hGear.className = player && player.gear < 0 ? 'ar' : 'av';
  el.pAcc.classList.toggle('pressed', inp.up);
  el.pBrake.classList.toggle('pressed', inp.down);
  el.pHand.classList.toggle('pressed', inp.hand);
  const spot = level ? level.spots[level.target] : null;
  const show = playing && spot && player && canPark(player, spot);
  el.parkWrap.classList.toggle('hidden', !show);
  el.parkFill.style.width = Math.min(100, (parkT / PARK_HOLD_TIME) * 100) + '%';
}

// ---------- Boucle de jeu ----------
let lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  if (playing && level && player) {
    time += dt;
    if (flash > 0) flash -= dt;
    stepCar(player, inp, dt);
    // murs, blocs (trottoirs, bâtiments) et voitures garées
    const impact = collideStatic(player, level);
    if (impact > 0) {
      if (impact > SHOCK_MIN_SPEED && time - lastShock > 0.6) {
        shocks++; flash = 0.4; lastShock = time;
        player.speed *= -0.2; // rebond
      } else {
        player.speed *= 0.4;
      }
    }
    // voitures en circulation
    for (const t of traffic) {
      updateTraffic(t, dt, player);
      if (t.active) {
        const c = satCollide(player, t);
        if (c) {
          player.x += c.nx * c.depth;
          player.y += c.ny * c.depth;
          const ps = Math.abs(player.speed);
          player.speed *= -0.25;
          t.speed = 0; t.angry = 1.2;
          if (ps > 30 && time - lastShock > 0.6) { shocks++; flash = 0.4; lastShock = time; }
        }
      }
    }
    // stationnement dans la place cible
    const spot = level.spots[level.target];
    if (canPark(player, spot)) {
      parkT += dt;
      if (parkT >= PARK_HOLD_TIME) levelSuccess();
    } else {
      parkT = 0;
    }
    updateHUD();
  }
  drawGame(ctx, CW, CH, { level, player, traffic, parkT, flash, inp });
}

// ---------- Toast ----------
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('show'), 2600);
}

// ---------- Verrou ----------
function refreshLock() {
  const done = planDeTableDoneCount();
  const locked = done < NEED_PDT_DONE;
  el.lockOverlay.classList.toggle('hidden', !locked);
  el.start.classList.toggle('hidden', locked);
  if (locked) {
    el.lockText.textContent = 'Réussissez au moins ' + NEED_PDT_DONE + ' niveaux du Plan de Table ' +
      'pour débloquer Parking Panic (' + done + '/' + NEED_PDT_DONE + ' réussi' + (done > 1 ? 's' : '') + ').';
  }
  return !locked;
}

// ---------- Liste des niveaux ----------
function doneCount() { return Object.keys(save.done).length; }

function renderLevelList() {
  el.levelList.innerHTML = '';
  PARKING_LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    const locked = i > save.unlocked;
    const done = save.done[i] != null;
    b.className = (locked ? 'locked' : '') + (done ? ' done' : '');
    b.innerHTML = '<span>Niveau ' + (i + 1) + ' — ' + lv.name + ' (' + CAR_SPECS[lv.car].nom + ')</span>' +
      '<span>' + (locked ? 'Verrouillé' : done ? 'Réussi en ' + save.done[i] + ' s' : 'À faire') + '</span>';
    if (!locked) b.addEventListener('click', () => { el.levelsOverlay.classList.add('hidden'); loadLevel(i); });
    el.levelList.appendChild(b);
  });
  el.clearedBanner.classList.toggle('hidden', !save.cleared);
}

// ---------- Boutons ----------
el.startBtn.addEventListener('click', () => {
  el.start.classList.add('hidden');
  loadLevel(Math.min(save.unlocked, PARKING_LEVELS.length - 1));
});
el.levelsClose.addEventListener('click', () => el.levelsOverlay.classList.add('hidden'));
el.btnLevels.addEventListener('click', () => { renderLevelList(); el.levelsOverlay.classList.remove('hidden'); });
el.lockRefresh.addEventListener('click', () => location.reload());
el.btnReset.addEventListener('click', () => { if (level) loadLevel(levelIdx); });
el.winNext.addEventListener('click', () => loadLevel(Math.min(levelIdx + 1, PARKING_LEVELS.length - 1)));
el.winRetry.addEventListener('click', () => loadLevel(levelIdx));
el.winLevels.addEventListener('click', () => { el.winOverlay.classList.add('hidden'); renderLevelList(); el.levelsOverlay.classList.remove('hidden'); });

// ---------- Démarrage ----------
resize();
refreshLock();
renderLevelList();
requestAnimationFrame(frame);
