'use strict';

/* ============================================================
   Parking Panic — niveaux et voitures
   Unités : 1 unité = 10 cm (une citadine fait ~42 unités de long).
   Angles en radians, 0 = vers la droite (+x), sens horaire (y vers
   le bas, comme sur un canvas 2D).

   Deux archétypes de niveaux :
   - parkingWorld : un grand parking asphalté, bordé de bordures
     bloquantes ; on y circule librement à l'intérieur.
   - streetWorld  : une rue entre un trottoir/bâtiments (nord) et un
     mur (sud) ; la voiture ne peut pas sortir de la route. Les
     places sont en créneau dans la bande de stationnement au bord
     de la chaussée.

   Chaque niveau :
   - world   : dimensions du monde (murs aux bords)
   - ground  : couleur du sol
   - blocks  : rectangles bloquants { x, y, w, h, kind } (coin haut-gauche)
   - roads   : bandes d'asphalte (repère des voies)
   - decor   : arbres, lampadaires, passages piétons
   - car     : clé dans CAR_SPECS (la voiture à garer)
   - start   : position et cap de départ du joueur
   - spots   : places de parking ; target = index de la place à
               réussir (contour vert). w = longueur de la place
               (axe du cap garé), h = largeur.
   - parked  : voitures à l'arrêt (obstacles), éventuellement mal
               garées (angle décalé, débordent sur la place)
   - traffic : voitures qui circulent sur la chaussée (traffic.js)
   ============================================================ */

// ---------- Voitures jouables ----------
// L/W : longueur/largeur ; accel/brake : forces des pédales (u/s²) ;
// maxF/maxR : vitesses max avant/arrière (u/s) ; maxSteer : angle de
// volant max (rad) ; steerSpeed : vitesse de rotation du volant (rad/s) ;
// drag : traînée. Plus la voiture est grosse, moins elle est maniable.
const CAR_SPECS = {
  citadine:   { nom: 'Citadine',   L: 42, W: 20, accel: 80, brake: 125, maxF: 175, maxR: 70, maxSteer: 0.62, steerSpeed: 5.4, drag: 0.35, color: '#e8a13a' },
  berline:    { nom: 'Berline',    L: 48, W: 21, accel: 70, brake: 115, maxF: 190, maxR: 75, maxSteer: 0.53, steerSpeed: 4.5, drag: 0.32, color: '#3a7bd5' },
  break:      { nom: 'Break',      L: 53, W: 22, accel: 62, brake: 108, maxF: 180, maxR: 70, maxSteer: 0.47, steerSpeed: 4.0, drag: 0.30, color: '#8a5fd0' },
  utilitaire: { nom: 'Utilitaire', L: 64, W: 27, accel: 47, brake: 96,  maxF: 140, maxR: 52, maxSteer: 0.40, steerSpeed: 3.0, drag: 0.28, color: '#d0563a' }
};

// ---------- Archétype : grand parking ----------
function parkingWorld(W, H) {
  return {
    world: { w: W, h: H },
    ground: '#4b4e58',
    blocks: [
      { x: 0, y: 0, w: W, h: 60, kind: 'curb' },
      { x: 0, y: H - 60, w: W, h: 60, kind: 'curb' },
      { x: 0, y: 0, w: 60, h: H, kind: 'curb' },
      { x: W - 60, y: 0, w: 60, h: H, kind: 'curb' }
    ],
    roads: [],
    decor: [
      { type: 'tree', x: 30, y: 30 }, { type: 'tree', x: W - 30, y: 30 },
      { type: 'tree', x: 30, y: H - 30 }, { type: 'tree', x: W - 30, y: H - 30 }
    ]
  };
}

// Décor du pourtour d'un parking : lampadaires, arbres et buissons
// le long des bordures
function withParkingDecor(lv) {
  const W = lv.world.w, H = lv.world.h;
  for (let x = 200; x < W - 100; x += 240) {
    lv.decor.push({ type: 'lamp', x, y: 34 });
    lv.decor.push({ type: 'lamp', x: x + 120, y: H - 34 });
  }
  for (const x of [110, W / 2, W - 110]) {
    lv.decor.push({ type: 'tree', x, y: 30 });
    lv.decor.push({ type: 'tree', x, y: H - 30 });
  }
  for (const y of [170, H / 2, H - 170]) {
    lv.decor.push({ type: 'tree', x: 30, y });
    lv.decor.push({ type: 'tree', x: W - 30, y });
  }
  for (let x = 140; x < W - 80; x += 190) lv.decor.push({ type: 'bush', x, y: 80 });
  for (let y = 150; y < H - 80; y += 230) {
    lv.decor.push({ type: 'bush', x: 80, y });
    lv.decor.push({ type: 'bush', x: W - 80, y });
  }
  return lv;
}

// Îlot central bloquant (herbe + arbre) dans un parking
function withIsland(lv, x, y, w, h) {
  lv.blocks.push({ x, y, w, h, kind: 'island' });
  return lv;
}

// ---------- Archétype : rue ----------
// Nord : bâtiments puis trottoir (bloquants). Ensuite bande de
// stationnement étroite (places en créneau), puis chaussée à deux
// voies étroites (les voitures s'y croisent de justesse), puis mur
// (bloquant). La voiture reste entre le trottoir et le mur.
function streetWorld(W, H) {
  return {
    world: { w: W, h: H },
    ground: '#5d7a4c',
    blocks: [
      { x: 0, y: 0, w: W, h: 360, kind: 'building' },
      { x: 0, y: 360, w: W, h: 110, kind: 'sidewalk' },
      { x: 0, y: H - 80, w: W, h: 80, kind: 'wall' }
    ],
    roads: [
      { x: 0, y: 470, w: W, h: 60 },   // bande de stationnement
      { x: 0, y: 530, w: W, h: 110 }   // chaussée à deux voies étroites
    ],
    decor: [
      { type: 'zebra', x: 260, y: 530, w: 70, h: 110 },
      { type: 'zebra', x: W - 330, y: 530, w: 70, h: 110 },
      // flèches de sens peintes sur les voies (roule à droite : → en bas, ← en haut)
      { type: 'arrow', x: 420, y: 610, angle: 0 }, { type: 'arrow', x: 920, y: 610, angle: 0 },
      { type: 'arrow', x: 680, y: 560, angle: Math.PI }, { type: 'arrow', x: 1180, y: 560, angle: Math.PI },
      { type: 'tree', x: 120, y: 410 }, { type: 'tree', x: 480, y: 415 },
      { type: 'tree', x: 900, y: 405 }, { type: 'tree', x: W - 160, y: 412 },
      { type: 'bush', x: 220, y: 392 }, { type: 'bush', x: 600, y: 396 },
      { type: 'bush', x: 1000, y: 390 }, { type: 'bush', x: W - 260, y: 394 },
      { type: 'lamp', x: 420, y: 462 }, { type: 'lamp', x: 760, y: 462 },
      { type: 'lamp', x: 1100, y: 462 }
    ]
  };
}

// Voies de circulation (aller simple, la voiture sort et revient).
// Sens français (on roule à droite) : la voie → est en bas (y=610),
// la voie ← en haut (y=560).
function laneFwd(W, speed, opts) { return Object.assign({ path: [[80, 610], [W - 80, 610]], loop: false, speed }, opts); }
function laneBwd(W, speed, opts) { return Object.assign({ path: [[W - 80, 560], [80, 560]], loop: false, speed }, opts); }

// ---------- Niveaux (du plus facile au plus dur) ----------
const PARKING_LEVELS = [
  // 1 — tutoriel : grande place libre au milieu d'un parking
  Object.assign(withIsland(withParkingDecor(parkingWorld(1300, 850)), 1010, 590, 130, 70), {
    name: 'Première place',
    desc: 'Un grand parking : garez la citadine dans la place verte.',
    car: 'citadine',
    start: { x: 650, y: 720, angle: -Math.PI / 2 },
    spots: [
      { x: 550, y: 200, w: 84, h: 42, angle: Math.PI / 2 },
      { x: 700, y: 200, w: 84, h: 42, angle: Math.PI / 2 },
      { x: 850, y: 200, w: 84, h: 42, angle: Math.PI / 2 },
      { x: 550, y: 430, w: 84, h: 42, angle: Math.PI / 2 },
      { x: 700, y: 430, w: 84, h: 42, angle: Math.PI / 2 },
      { x: 850, y: 430, w: 84, h: 42, angle: Math.PI / 2 },
      { x: 550, y: 640, w: 84, h: 42, angle: Math.PI / 2 },
      { x: 700, y: 640, w: 84, h: 42, angle: Math.PI / 2 },
      { x: 850, y: 640, w: 84, h: 42, angle: Math.PI / 2 }
    ],
    target: 1,
    parked: [
      { x: 550, y: 430, angle: Math.PI / 2, w: 46, h: 22, color: '#5f8f5a' },
      { x: 850, y: 430, angle: Math.PI / 2, w: 46, h: 22, color: '#8f6fb8' },
      { x: 700, y: 640, angle: Math.PI / 2, w: 46, h: 22, color: '#a85f5f' },
      { x: 850, y: 640, angle: Math.PI / 2, w: 46, h: 22, color: '#7d6a55' }
    ],
    traffic: []
  }),

  // 2 — bataille entre deux voitures bien garées, marge confortable
  Object.assign(withIsland(withParkingDecor(parkingWorld(1300, 850)), 300, 380, 140, 80), {
    name: 'Entre deux voitures',
    desc: 'Une place en bataille entre deux voitures garées droit. Évitez les chocs (+2 s).',
    car: 'citadine',
    start: { x: 650, y: 720, angle: -Math.PI / 2 },
    spots: [
      { x: 550, y: 240, w: 70, h: 38, angle: Math.PI / 2 },
      { x: 700, y: 240, w: 64, h: 36, angle: Math.PI / 2 },
      { x: 850, y: 240, w: 70, h: 38, angle: Math.PI / 2 },
      { x: 550, y: 520, w: 70, h: 38, angle: Math.PI / 2 },
      { x: 700, y: 520, w: 70, h: 38, angle: Math.PI / 2 },
      { x: 850, y: 520, w: 70, h: 38, angle: Math.PI / 2 }
    ],
    target: 1,
    parked: [
      { x: 664, y: 240, angle: Math.PI / 2, w: 46, h: 22, color: '#9aa0a8' },
      { x: 736, y: 240, angle: Math.PI / 2, w: 46, h: 22, color: '#7d6a55' },
      { x: 550, y: 520, angle: Math.PI / 2, w: 46, h: 22, color: '#5f8f5a' },
      { x: 850, y: 520, angle: Math.PI / 2, w: 46, h: 22, color: '#8f6fb8' }
    ],
    traffic: []
  }),

  // 3 — premier créneau, large, sans circulation
  Object.assign(streetWorld(1400, 780), {
    name: 'Créneau tranquille',
    desc: 'Un créneau large au bord de la route, entre deux voitures un peu de travers.',
    car: 'citadine',
    start: { x: 180, y: 585, angle: 0 },
    spots: [ { x: 700, y: 500, w: 100, h: 34, angle: 0 } ],
    target: 0,
    parked: [
      { x: 632, y: 502, angle: 0.10, w: 46, h: 22, color: '#9aa0a8' },
      { x: 768, y: 498, angle: -0.09, w: 46, h: 22, color: '#7d6a55' },
      { x: 300, y: 500, angle: 0, w: 46, h: 22, color: '#5f8f5a' },
      { x: 1100, y: 500, angle: 0.05, w: 46, h: 22, color: '#8f6fb8' }
    ],
    traffic: []
  }),

  // 4 — bataille serrée entre deux mal garées, berline moins maniable
  Object.assign(withIsland(withParkingDecor(parkingWorld(1300, 850)), 880, 380, 150, 80), {
    name: 'Bataille serrée',
    desc: 'Deux voitures mal garées débordent sur la place en bataille. La berline tourne moins bien.',
    car: 'berline',
    start: { x: 650, y: 720, angle: -Math.PI / 2 },
    spots: [
      { x: 480, y: 240, w: 60, h: 34, angle: Math.PI / 2 },
      { x: 650, y: 240, w: 56, h: 34, angle: Math.PI / 2 },
      { x: 820, y: 240, w: 60, h: 34, angle: Math.PI / 2 },
      { x: 480, y: 560, w: 60, h: 34, angle: Math.PI / 2 },
      { x: 650, y: 560, w: 60, h: 34, angle: Math.PI / 2 },
      { x: 820, y: 560, w: 60, h: 34, angle: Math.PI / 2 }
    ],
    target: 1,
    parked: [
      { x: 612, y: 246, angle: Math.PI / 2 + 0.22, w: 48, h: 22, color: '#8f6fb8' },
      { x: 690, y: 236, angle: Math.PI / 2 - 0.25, w: 48, h: 22, color: '#b8a44a' },
      { x: 480, y: 240, angle: Math.PI / 2, w: 48, h: 22, color: '#5f8f5a' },
      { x: 480, y: 560, angle: Math.PI / 2, w: 48, h: 22, color: '#7d6a55' },
      { x: 820, y: 560, angle: Math.PI / 2, w: 48, h: 22, color: '#5f8f5a' }
    ],
    traffic: []
  }),

  // 5 — places en épi + une rue qui traverse le parking avec une voiture
  Object.assign(withIsland(withParkingDecor(parkingWorld(1300, 850)), 950, 430, 140, 70), {
    name: 'Parking en épi',
    desc: 'Des places en épi, une voiture mal garée qui déborde sur sa voisine, et une rue qui traverse le parking.',
    car: 'berline',
    start: { x: 150, y: 680, angle: 0 },
    roads: [ { x: 60, y: 650, w: 1180, h: 60 } ],
    spots: [
      { x: 520, y: 280, w: 66, h: 36, angle: -Math.PI / 3 },
      { x: 660, y: 280, w: 66, h: 36, angle: -Math.PI / 3 },
      { x: 800, y: 280, w: 66, h: 36, angle: -Math.PI / 3 },
      { x: 520, y: 520, w: 66, h: 36, angle: Math.PI / 2 },
      { x: 660, y: 520, w: 66, h: 36, angle: Math.PI / 2 },
      { x: 800, y: 520, w: 66, h: 36, angle: Math.PI / 2 }
    ],
    target: 1,
    parked: [
      { x: 520, y: 280, angle: -Math.PI / 3, w: 48, h: 22, color: '#5f8f5a' },
      { x: 808, y: 298, angle: -Math.PI / 3 + 0.35, w: 48, h: 22, color: '#a85f5f' },
      { x: 660, y: 520, angle: Math.PI / 2, w: 48, h: 22, color: '#7d6a55' },
      { x: 800, y: 520, angle: Math.PI / 2, w: 48, h: 22, color: '#8f6fb8' }
    ],
    traffic: [
      { path: [[100, 680], [1200, 680]], speed: 90, loop: false, gap: 3, color: '#c94f4f', spec: 'citadine', phase: 0.3 }
    ]
  }),

  // 6 — créneau au bord d'une rue passante (une voiture de temps en temps)
  Object.assign(streetWorld(1400, 780), {
    name: 'Rue passante',
    desc: 'Un créneau au bord d\'une rue où une voiture passe de temps en temps. Regardez avant de manœuvrer.',
    car: 'break',
    start: { x: 180, y: 585, angle: 0 },
    spots: [ { x: 700, y: 500, w: 104, h: 36, angle: 0 } ],
    target: 0,
    parked: [
      { x: 630, y: 502, angle: 0.14, w: 50, h: 23, color: '#9aa0a8' },
      { x: 772, y: 498, angle: -0.12, w: 50, h: 23, color: '#7d6a55' },
      { x: 320, y: 500, angle: 0, w: 50, h: 23, color: '#5f8f5a' },
      { x: 1080, y: 500, angle: 0.06, w: 50, h: 23, color: '#8f6fb8' }
    ],
    traffic: [
      laneFwd(1400, 110, { color: '#c94f4f', spec: 'berline', phase: 0.4, gap: 3 })
    ]
  }),

  // 7 — créneau plus étroit, trafic dans les deux sens
  Object.assign(streetWorld(1400, 780), {
    name: 'Créneau sous pression',
    desc: 'Créneau plus étroit entre deux voitures de travers, et des voitures qui passent dans les deux sens.',
    car: 'break',
    start: { x: 180, y: 585, angle: 0 },
    spots: [ { x: 700, y: 500, w: 92, h: 34, angle: 0 } ],
    target: 0,
    parked: [
      { x: 636, y: 502, angle: 0.18, w: 50, h: 23, color: '#9aa0a8' },
      { x: 766, y: 498, angle: -0.16, w: 50, h: 23, color: '#7d6a55' },
      { x: 300, y: 500, angle: -0.05, w: 50, h: 23, color: '#5f8f5a' },
      { x: 1100, y: 500, angle: 0.08, w: 50, h: 23, color: '#8f6fb8' }
    ],
    traffic: [
      laneFwd(1400, 120, { color: '#c94f4f', spec: 'berline', phase: 0.2, gap: 2 }),
      laneBwd(1400, 100, { color: '#4a90d9', spec: 'citadine', phase: 0.65, gap: 3 })
    ]
  }),

  // 8 — boss : utilitaire, créneau serré, trafic dense
  Object.assign(streetWorld(1500, 780), {
    name: 'Le boss du parking',
    desc: 'Créneau serré avec un utilitaire encombrant, voitures mal garées des deux côtés, trafic dense. Bonne chance.',
    car: 'utilitaire',
    start: { x: 180, y: 585, angle: 0 },
    spots: [ { x: 750, y: 500, w: 104, h: 38, angle: 0 } ],
    target: 0,
    parked: [
      { x: 676, y: 502, angle: 0.22, w: 54, h: 24, color: '#9aa0a8' },
      { x: 824, y: 498, angle: -0.20, w: 54, h: 24, color: '#7d6a55' },
      { x: 320, y: 500, angle: 0, w: 54, h: 24, color: '#5f8f5a' },
      { x: 1180, y: 500, angle: -0.06, w: 54, h: 24, color: '#8f6fb8' }
    ],
    traffic: [
      laneFwd(1500, 130, { color: '#c94f4f', spec: 'berline', phase: 0.1, gap: 2 }),
      laneBwd(1500, 115, { color: '#4a90d9', spec: 'citadine', phase: 0.45, gap: 2.8 }),
      laneFwd(1500, 95, { color: '#5f8f5a', spec: 'break', phase: 0.8, gap: 3.2 })
    ]
  })
];
