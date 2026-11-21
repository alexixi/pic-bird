'use strict';

/* ============================================================
   Parking Panic — niveaux et voitures
   Unités : 1 unité = 10 cm (une citadine fait ~42 unités de long).
   Angles en radians, 0 = vers la droite (+x), sens horaire (y vers
   le bas, comme sur un canvas 2D).

   Chaque niveau :
   - world   : dimensions du monde (murs aux bords)
   - car     : clé dans CAR_SPECS (la voiture à garer)
   - start   : position et cap de départ du joueur
   - roads   : bandes d'asphalte foncé (décor + repère des voies)
   - decor   : rectangles de décor (trottoirs, etc.)
   - spots   : places de parking dessinées ; target = index de la
               place à réussir (contour vert)
   - parked  : voitures à l'arrêt (obstacles), éventuellement mal
               garées (angle décalé, débordent sur la place)
   - traffic : voitures qui circulent (voir traffic.js)
   ============================================================ */

// ---------- Voitures jouables ----------
// L/W : longueur/largeur ; accel/brake : forces des pédales (u/s²) ;
// maxF/maxR : vitesses max avant/arrière (u/s) ; maxSteer : angle de
// volant max (rad) ; steerSpeed : vitesse de rotation du volant (rad/s) ;
// drag : traînée. Plus la voiture est grosse, moins elle est maniable.
const CAR_SPECS = {
  citadine:   { nom: 'Citadine',   L: 42, W: 20, accel: 80, brake: 125, maxF: 175, maxR: 70, maxSteer: 0.62, steerSpeed: 5.4, drag: 0.90, color: '#e8a13a' },
  berline:    { nom: 'Berline',    L: 48, W: 21, accel: 70, brake: 115, maxF: 190, maxR: 75, maxSteer: 0.53, steerSpeed: 4.5, drag: 0.85, color: '#3a7bd5' },
  break:      { nom: 'Break',      L: 53, W: 22, accel: 62, brake: 108, maxF: 180, maxR: 70, maxSteer: 0.47, steerSpeed: 4.0, drag: 0.80, color: '#8a5fd0' },
  utilitaire: { nom: 'Utilitaire', L: 64, W: 27, accel: 47, brake: 96,  maxF: 140, maxR: 52, maxSteer: 0.40, steerSpeed: 3.0, drag: 0.75, color: '#d0563a' }
};

// ---------- Helper : circuit rectangulaire pour la circulation ----------
// Renvoie les 4 coins d'un anneau centré en (cx, cy), décalés de `lane`
// unités vers l'intérieur (lane > 0) ou l'extérieur (lane < 0).
function ringPath(cx, cy, rx, ry, lane) {
  const pts = [
    [cx - rx, cy - ry], [cx + rx, cy - ry],
    [cx + rx, cy + ry], [cx - rx, cy + ry]
  ];
  return pts.map(([x, y]) => {
    const dx = cx - x, dy = cy - y;
    const l = Math.hypot(dx, dy) || 1;
    return [x + (dx / l) * lane, y + (dy / l) * lane];
  });
}

// ---------- Niveaux ----------
const PARKING_LEVELS = [
  {
    name: 'Première place',
    desc: 'Une place large et bien dégagée pour prendre le volant. Garez la citadine dans la place verte.',
    world: { w: 1200, h: 800 },
    car: 'citadine',
    start: { x: 140, y: 710, angle: 0 },
    roads: [ { x: 40, y: 660, w: 1120, h: 80 } ],
    decor: [],
    spots: [
      { x: 760, y: 300, w: 38, h: 74, angle: Math.PI / 2 },
      { x: 900, y: 300, w: 38, h: 74, angle: Math.PI / 2 },
      { x: 1040, y: 300, w: 38, h: 74, angle: Math.PI / 2 }
    ],
    target: 1,
    parked: [],
    traffic: []
  },
  {
    name: 'Créneau entre deux mal garées',
    desc: 'Deux voitures débordent sur la place en créneau. Glissez la citadine entre elles, bien droite.',
    world: { w: 1300, h: 800 },
    car: 'citadine',
    start: { x: 150, y: 610, angle: 0 },
    roads: [ { x: 40, y: 560, w: 1220, h: 100 } ],
    decor: [ { x: 40, y: 470, w: 1220, h: 90, color: '#6d7078' } ],
    spots: [ { x: 650, y: 522, w: 80, h: 32, angle: 0 } ],
    target: 0,
    parked: [
      { x: 592, y: 524, angle: 0.16, w: 46, h: 22, color: '#9aa0a8' },
      { x: 708, y: 518, angle: -0.13, w: 46, h: 22, color: '#7d6a55' }
    ],
    traffic: []
  },
  {
    name: 'Parking en épi',
    desc: 'Des places en épi. La voiture de droite est mal garée et déborde : visez la place verte, en biais.',
    world: { w: 1300, h: 850 },
    car: 'berline',
    start: { x: 180, y: 740, angle: 0 },
    roads: [ { x: 40, y: 690, w: 1220, h: 90 } ],
    decor: [],
    spots: [
      { x: 520, y: 300, w: 36, h: 66, angle: -Math.PI / 3 },
      { x: 660, y: 300, w: 36, h: 66, angle: -Math.PI / 3 },
      { x: 800, y: 300, w: 36, h: 66, angle: -Math.PI / 3 }
    ],
    target: 1,
    parked: [
      { x: 520, y: 300, angle: -Math.PI / 3, w: 48, h: 22, color: '#5f8f5a' },
      { x: 808, y: 318, angle: -Math.PI / 3 + 0.38, w: 48, h: 22, color: '#a85f5f' }
    ],
    traffic: []
  },
  {
    name: 'Entre deux mal garées',
    desc: 'Place en bataille serrée : deux voitures débordent de chaque côté. Petits coups de volant et marche arrière (R).',
    world: { w: 1300, h: 850 },
    car: 'berline',
    start: { x: 650, y: 740, angle: 0 },
    roads: [ { x: 40, y: 690, w: 1220, h: 90 } ],
    decor: [],
    spots: [ { x: 650, y: 330, w: 34, h: 70, angle: Math.PI / 2 } ],
    target: 0,
    parked: [
      { x: 610, y: 336, angle: 0.28, w: 48, h: 22, color: '#8f6fb8' },
      { x: 692, y: 326, angle: -0.31, w: 48, h: 22, color: '#b8a44a' }
    ],
    traffic: []
  },
  {
    name: 'Rue passante',
    desc: 'La circulation tourne en boucle autour du parking. Garez le break dans la place du haut sans gêner le trafic.',
    world: { w: 1400, h: 900 },
    car: 'break',
    start: { x: 160, y: 820, angle: 0 },
    roads: [
      { x: 40, y: 40, w: 1320, h: 80 },
      { x: 40, y: 780, w: 1320, h: 80 },
      { x: 40, y: 40, w: 80, h: 820 },
      { x: 1280, y: 40, w: 80, h: 820 }
    ],
    decor: [],
    spots: [
      { x: 560, y: 280, w: 38, h: 74, angle: Math.PI / 2 },
      { x: 700, y: 280, w: 38, h: 74, angle: Math.PI / 2 },
      { x: 840, y: 280, w: 38, h: 74, angle: Math.PI / 2 }
    ],
    target: 1,
    parked: [
      { x: 560, y: 280, angle: Math.PI / 2, w: 48, h: 22, color: '#5f8f5a' }
    ],
    traffic: [
      { path: ringPath(700, 450, 620, 370, 16), speed: 95, loop: true, color: '#c94f4f', spec: 'berline', phase: 0.0, gap: 0 },
      { path: ringPath(700, 450, 620, 370, -16), speed: 80, loop: true, color: '#4a90d9', spec: 'citadine', phase: 0.5, gap: 0 }
    ]
  },
  {
    name: 'Créneau sous pression',
    desc: 'Un créneau en bord de rue avec des voitures qui passent dans les deux sens. Timing serré.',
    world: { w: 1400, h: 800 },
    car: 'break',
    start: { x: 180, y: 640, angle: 0 },
    roads: [ { x: 40, y: 580, w: 1320, h: 110 } ],
    decor: [ { x: 40, y: 480, w: 1320, h: 100, color: '#6d7078' } ],
    spots: [ { x: 700, y: 534, w: 96, h: 34, angle: 0 } ],
    target: 0,
    parked: [
      { x: 640, y: 536, angle: 0.18, w: 50, h: 23, color: '#9aa0a8' },
      { x: 762, y: 530, angle: -0.16, w: 50, h: 23, color: '#7d6a55' }
    ],
    traffic: [
      { path: [[70, 612], [1330, 612]], speed: 120, loop: false, color: '#c94f4f', spec: 'berline', phase: 0.2, gap: 2.5 },
      { path: [[1330, 658], [70, 658]], speed: 105, loop: false, color: '#4a90d9', spec: 'citadine', phase: 0.7, gap: 3.5 }
    ]
  },
  {
    name: 'Livraison en centre-ville',
    desc: 'Un utilitaire encombrant, une place en bataille entre deux voitures mal garées, et la circulation qui tourne.',
    world: { w: 1400, h: 900 },
    car: 'utilitaire',
    start: { x: 160, y: 820, angle: 0 },
    roads: [
      { x: 40, y: 40, w: 1320, h: 80 },
      { x: 40, y: 780, w: 1320, h: 80 },
      { x: 40, y: 40, w: 80, h: 820 },
      { x: 1280, y: 40, w: 80, h: 820 }
    ],
    decor: [],
    spots: [ { x: 700, y: 290, w: 42, h: 86, angle: Math.PI / 2 } ],
    target: 0,
    parked: [
      { x: 648, y: 296, angle: 0.24, w: 54, h: 24, color: '#8f6fb8' },
      { x: 756, y: 286, angle: -0.27, w: 54, h: 24, color: '#b8a44a' }
    ],
    traffic: [
      { path: ringPath(700, 450, 620, 370, 16), speed: 85, loop: true, color: '#c9a227', spec: 'berline', phase: 0.3, gap: 0 }
    ]
  },
  {
    name: 'Le boss du parking',
    desc: 'Créneau serré avec un utilitaire, voitures mal garées des deux côtés et trafic dense. Bonne chance.',
    world: { w: 1500, h: 850 },
    car: 'utilitaire',
    start: { x: 180, y: 660, angle: 0 },
    roads: [ { x: 40, y: 600, w: 1420, h: 120 } ],
    decor: [ { x: 40, y: 490, w: 1420, h: 110, color: '#6d7078' } ],
    spots: [ { x: 750, y: 548, w: 108, h: 38, angle: 0 } ],
    target: 0,
    parked: [
      { x: 678, y: 550, angle: 0.22, w: 54, h: 24, color: '#9aa0a8' },
      { x: 826, y: 544, angle: -0.19, w: 54, h: 24, color: '#7d6a55' }
    ],
    traffic: [
      { path: [[70, 628], [1430, 628]], speed: 130, loop: false, color: '#c94f4f', spec: 'berline', phase: 0.1, gap: 2.0 },
      { path: [[1430, 684], [70, 684]], speed: 115, loop: false, color: '#4a90d9', spec: 'citadine', phase: 0.45, gap: 2.8 },
      { path: [[70, 628], [1430, 628]], speed: 95, loop: false, color: '#5f8f5a', spec: 'break', phase: 0.8, gap: 3.2 }
    ]
  }
];
