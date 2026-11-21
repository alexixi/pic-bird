'use strict';

/* ============================================================
   Parking Panic — circulation : voitures perturbatrices
   Chaque voiture suit un chemin à vitesse constante, freine si le
   joueur est devant elle, klaxonne après un choc, et recommence
   après un délai en bout de route (aller simple).
   def : { path: [[x,y]...], speed, loop, color, spec, phase, gap }
   - loop: true  -> circuit fermé (la voiture tourne en rond)
   - loop: false -> aller simple, la voiture sort et revient (gap s)
   - phase : position de départ (fraction du chemin, 0..1)
   ============================================================ */

function makeTraffic(def) {
  const pts = def.loop ? def.path.concat([def.path[0]]) : def.path.slice();
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = cum[cum.length - 1] || 1;
  const t = {
    def, pts, cum, total,
    spec: CAR_SPECS[def.spec || 'berline'],
    dist: (def.phase || 0) * total,
    x: 0, y: 0, angle: 0,
    speed: 0, braking: false, angry: 0,
    active: true, wait: 0
  };
  placeOnPath(t);
  return t;
}

// Positionne la voiture à la distance `t.dist` le long du chemin
function placeOnPath(t) {
  let d = t.def.loop ? ((t.dist % t.total) + t.total) % t.total : Math.min(t.dist, t.total - 1e-6);
  let i = 1;
  while (i < t.cum.length - 1 && t.cum[i] < d) i++;
  const segLen = t.cum[i] - t.cum[i - 1] || 1;
  const f = (d - t.cum[i - 1]) / segLen;
  const [x1, y1] = t.pts[i - 1], [x2, y2] = t.pts[i];
  t.x = x1 + (x2 - x1) * f;
  t.y = y1 + (y2 - y1) * f;
  t.angle = Math.atan2(y2 - y1, x2 - x1);
}

function updateTraffic(t, dt, player) {
  if (t.angry > 0) t.angry -= dt;
  if (!t.active) {
    t.wait -= dt;
    if (t.wait <= 0) { t.active = true; t.dist = 0; t.speed = 0; placeOnPath(t); }
    return;
  }
  // freinage si le joueur est dans le cône avant
  let target = t.def.speed;
  if (player) {
    const dx = player.x - t.x, dy = player.y - t.y;
    const d = Math.hypot(dx, dy);
    if (d < 110 && Math.abs(angleNorm(Math.atan2(dy, dx) - t.angle)) < 0.5) target = 0;
  }
  t.braking = target === 0 && t.speed > 1;
  // freinage fort, reprise douce
  const dv = target - t.speed;
  t.speed += Math.max(-320 * dt, Math.min(90 * dt, dv));
  if (t.speed < 0) t.speed = 0;
  t.dist += t.speed * dt;
  if (t.dist >= t.total) {
    if (t.def.loop) {
      t.dist -= t.total;
    } else {
      // bout de route : la voiture sort de l'écran et reviendra
      t.active = false;
      t.wait = (t.def.gap || 2) + Math.random() * 2;
      t.dist = 0;
      return;
    }
  }
  placeOnPath(t);
}
