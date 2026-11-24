'use strict';

/* ============================================================
   Pic'Bird — hub : liste les jeux du parcours avec leur état
   (verrouillé / en cours / réussi) lu par Progression.parcours().
   ============================================================ */

const ICONS = {
  bird:
    '<svg viewBox="0 0 64 52" fill="none" aria-hidden="true">' +
    '<path d="M10 40c-5-3-6-10-2-14 3-3 8-4 12-2l3-9 5 8c7 1 11 5 11 11 0 9-9 15-19 15-4 0-8-1-10-3z" fill="rgba(255,255,255,0.95)"/>' +
    '<circle cx="33" cy="24" r="2.2" fill="#0a0e1a"/>' +
    '<path d="M41 22l8 3-8 4z" fill="#0a0e1a" opacity="0.8"/>' +
    '<path d="M24 46v5M31 46v5" stroke="#0a0e1a" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>' +
    '</svg>',
  table:
    '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="2.6" aria-hidden="true">' +
    '<circle cx="32" cy="32" r="13" fill="rgba(255,255,255,0.18)"/>' +
    '<circle cx="32" cy="32" r="4.5" fill="rgba(255,255,255,0.4)" stroke="none"/>' +
    '<circle cx="32" cy="11" r="4" fill="rgba(255,255,255,0.18)"/>' +
    '<circle cx="32" cy="53" r="4" fill="rgba(255,255,255,0.18)"/>' +
    '<circle cx="11" cy="32" r="4" fill="rgba(255,255,255,0.18)"/>' +
    '<circle cx="53" cy="32" r="4" fill="rgba(255,255,255,0.18)"/>' +
    '</svg>',
  car:
    '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M24 27v-4c0-2 1-3 3-3h10c2 0 3 1 4 3l2 4" fill="rgba(255,255,255,0.18)"/>' +
    '<path d="M10 41l3-10c1-3 3-5 6-5h22c3 0 5 2 7 5l3 10" fill="rgba(255,255,255,0.18)"/>' +
    '<rect x="8" y="41" width="48" height="9" rx="4" fill="rgba(255,255,255,0.18)"/>' +
    '<circle cx="20" cy="50" r="4.5" fill="#0a0e1a"/>' +
    '<circle cx="44" cy="50" r="4.5" fill="#0a0e1a"/>' +
    '</svg>'
};

const LOCK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
  '<rect x="5" y="11" width="14" height="9" rx="2"/>' +
  '<path d="M8 11V8a4 4 0 0 1 8 0v3"/>' +
  '</svg>';

function renderHub() {
  const list = document.getElementById('gameList');
  list.innerHTML = '';
  const etats = Progression.parcours();
  etats.forEach((st, i) => {
    const g = st.game;
    const card = document.createElement(st.unlocked ? 'a' : 'div');
    card.className = 'card ' + (st.cleared ? 'cleared' : st.unlocked ? 'open' : 'locked');
    if (st.unlocked) card.href = g.path;
    const badgeTxt = st.cleared ? 'Réussi' : st.unlocked ? 'En cours' : 'Verrouillé';
    const badgeCls = st.cleared ? 'cleared' : st.unlocked ? 'open' : 'locked';
    const pct = Math.round((st.ratio || 0) * 100);
    const side = st.unlocked
      ? '<span class="go">' + (st.cleared ? 'Rejouer' : 'Jouer') + ' <span class="arr">→</span></span>'
      : '<span class="lockReason">' + LOCK_ICON + 'Réussis le jeu précédent pour débloquer</span>';
    card.innerHTML =
      '<div class="top">' +
        '<div class="icon ' + g.icon + '">' + (ICONS[g.icon] || '') + '</div>' +
        '<span class="badge ' + badgeCls + '">' + badgeTxt + '</span>' +
      '</div>' +
      '<span class="num">Jeu ' + (i + 1) + '</span>' +
      '<h2>' + g.title + '</h2>' +
      '<p class="tagline">' + g.tagline + '</p>' +
      '<p class="desc">' + g.desc + '</p>' +
      '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
      '<p class="detail">' + st.detail + '</p>' +
      '<div class="side">' + side + '</div>';
    list.appendChild(card);
  });
  // résumé du parcours dans la barre du haut
  const unlocked = etats.filter((s) => s.unlocked).length;
  const cleared = etats.filter((s) => s.cleared).length;
  document.getElementById('stats').innerHTML =
    '<b>' + unlocked + '/' + etats.length + '</b> débloqués · <b>' + cleared + '</b> réussis';
}

document.getElementById('resetProg').addEventListener('click', () => {
  if (confirm('Effacer toute la progression (records, niveaux réussis, déblocages) ?')) {
    Progression.resetProgression();
    renderHub();
  }
});

renderHub();
