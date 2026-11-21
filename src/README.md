# Pic'Bird — plateforme de mini-jeux web

Pic'Bird est un site web regroupant plusieurs petits jeux dans un même « parcours » :
le joueur progresse de jeu en jeu. Pour débloquer le jeu suivant, il faut réussir
suffisamment bien le jeu en cours (score à atteindre). Le premier jeu livé est
**Catch Bird**, un safari photo d'oiseaux ; d'autres jeux viendront s'ajouter au fur
et à mesure.

Ce document décrit le projet, son organisation et les étapes prévues. Il vit dans
`src/`, le dossier qui contiendra le code de la plateforme.

---

## 1. Concept général

- **Un hub, plusieurs jeux.** Le site ouvre sur un menu (hub) listant les jeux du
  parcours. Chaque jeu est verrouillé ou débloqué selon la progression du joueur.
- **Progression par paliers.** Chaque jeu définit un seuil de réussite (score cible).
  Tant que le joueur n'atteint pas le seuil, le jeu suivant reste verrouillé.
  Réussir un jeu débloque le suivant et enregistre la progression.
- **Sauvegarde locale.** La progression (jeux débloqués, meilleurs scores, photos
  prises) est persistée dans le navigateur (`localStorage`) pour reprendre la partie
  plus tard.
- **Un seul socle technique.** Tous les jeux tournent sur la même page web (canvas
  2D, HTML/CSS/JS vanilla, aucun framework) afin de garder le projet léger et
  maintenable.

### Parcours prévu

| # | Jeu | Statut | Idée |
|---|-----|--------|------|
| 1 | Catch Bird (safari photo) | fait | Photographier des oiseaux sans les effrayer |
| 2 | Plan de Table | fait | Placer les invités aux tables selon leurs relations pour maximiser l'ambiance |
| 3 | Parking Panic | fait | Se garer au clavier, entre voitures mal garées et circulation |
| … | … | … | D'autres jeux s'ajoutent au fil du projet |

Le mécanisme de déblocage est générique : il suffit d'ajouter une entrée dans la
liste des jeux pour que le hub la gère (verrouillée tant que le précédent n'est pas
réussi).

---

## 2. Le premier jeu : Catch Bird

Catch Bird est un **safari photo** : des oiseaux évoluent dans une vallée (monde
ouvert de 2600×1700 unités, cycle jour/nuit) et le joueur doit les photographier
sans les effrayer.

### Contrôles

- **Souris** : viser
- **Molette** : zoom (focale de 50 mm à téléobjectif)
- **W / S** (ou ↑ / ↓) : mise au point manuelle
- **A** : autofocus sur l'oiseau visé
- **Clic** ou **Espace** : prendre la photo
- **G** puis clic au sol : poser des graines pour attirer les oiseaux (stock limité, régénération lente)
- **Tab** : ouvrir la galerie des photos prises

### Mécaniques

- **Effroi** : de trop grands mouvements de souris effraient les oiseaux à proximité, qui s'envolent.
- **9 espèces** d'oiseaux, de commune (moineau) à très rare (buse, martin-pêcheur), chacune avec sa probabilité d'apparition, sa taille et sa vitesse.
- **9 poses** (perché, chante, en vol, en fuite…) avec des multiplicateurs de score différents.
- **Cycle jour/nuit** influençant l'ambiance visuelle.

### Score d'une photo

Le score (jusqu'à ~100 pts × rareté × pose) se décompose en :

- **Cadrage** (38 %) : l'oiseau doit être bien centré et d'une taille adaptée dans le cadre ;
- **Mise au point** (34 %) : distance de focus vs distance réelle de l'oiseau ;
- **Netteté / flou de mouvement** (28 %) : pénalisé si l'oiseau bouge vite.

Les photos sont sauvegardées dans une galerie avec leur score détaillé, et le
meilleur score est affiché comme record.

### Fichiers actuels (à la racine, à migrer dans `src/`)

- `index.html` — structure de la page, HUD, écrans (démarrage, galerie, modal photo)
- `style.css` — mise en page et habillage
- `game.js` — toute la logique du jeu (monde, oiseaux, caméra, photo, score)

---

## 3. Le deuxième jeu : Plan de Table

Plan de Table est un jeu de **placement d'invités** : des tables rondes, des invités
à positionner, et un schéma de relations entre eux (qui s'aime, qui se déteste).
Le but est de réaliser le meilleur plan de table possible pour obtenir le meilleur
score d'**ambiance**.

### Mécaniques

- **Schéma des relations** (canvas à gauche) : chaque invité est un nœud, chaque
  relation une arête — verte pour l'amitié, rouge pour l'hostilité, épaisseur selon
  la force (1 à 3). Les conflits actuels (ennemis à la même table) ressortent en
  doré.
- **Tables rondes** : les invités se placent par glisser-déposer (ou clic :
  sélectionner un invité puis un siège) ; déposer sur un siège occupé échange les
  deux places.
- **Score d'ambiance** (0-100 %, affiché en temps réel) :
  - paire à la même table : contribution = valeur de la relation (amis +, ennemis −) ;
  - paire côte à côte sur une table ronde : bonus de voisinage (+50 % de la valeur),
    car les voisins se parlent plus ;
  - le tout est normalisé entre le pire et le meilleur cas théorique du niveau.
- **3 niveaux** (`levels.js`) : 8 invités / 2 tables (objectif 70 %), 12 / 3
  (75 %), 16 / 4 (80 %). Les niveaux se débloquent les uns après les autres quand
  l'objectif d'ambiance est atteint ; la progression est sauvegardée en
  `localStorage`.
- **Aide au placement** : la liste sous le schéma signale les conflits en cours et
  les amitiés fortes encore séparées.

Le calibrage des seuils a été vérifié par simulation : un placement aléatoire donne
~36-47 % d'ambiance (échec), regrouper les amis par table donne 87-92 % (réussite).

### Fichiers

- `src/js/plan-de-table/index.html` — HUD, panneau du schéma, tables, écrans
- `src/js/plan-de-table/style.css` — habillage
- `src/js/plan-de-table/levels.js` — données des 3 niveaux (invités, relations, seuils)
- `src/js/plan-de-table/game.js` — graphe, drag & drop, scoring, progression

---

## 4. Le troisième jeu : Parking Panic

Parking Panic est un jeu de **parking au clavier** : le joueur conduit une
voiture et doit se garer dans la place cible de chaque niveau, entre des
voitures mal garées, avec d'autres voitures qui circulent et freinent devant
lui comme dans des conditions réelles.

### Contrôles

- **↑** : pédale d'accélérateur
- **↓** : pédale de frein
- **← / →** : volant
- **Espace** : frein à main
- **R** : bascule marche avant / marche arrière (à l'arrêt)

L'état des pédales (ACC / FREIN / MAIN) et le mode (AV / AR) sont affichés en
haut de l'écran ; les touches de chaque action sont affichées en bas.

### Mécaniques

- **Voiture du niveau** : citadine, berline, break ou utilitaire — de plus en
  plus grosse et moins maniable (accélération, vitesse max, débattement du
  volant, rayon de braquage).
- **8 niveaux** : place large, créneau entre deux voitures mal garées, parking
  en épi, place en bataille serrée, rue passante avec circulation en boucle,
  créneau sous trafic dense, livraison en utilitaire, niveau « boss ».
- **Stationnement réussi** : voiture entièrement dans la place verte, bien
  droite (±16°, nez ou cul indifférent), à l'arrêt, maintenue 1 seconde.
- **Chocs** (murs, voitures garées ou en circulation) : +2 s de pénalité sur
  le chrono, avec compteur de chocs affiché.
- **Progression** : le jeu est verrouillé tant que moins de 2 niveaux du Plan
  de Table ne sont réussis (progression lue dans `localStorage`). Chaque
  niveau réussi débloque le suivant et est sauvegardé avec son meilleur
  chrono ; **5 niveaux réussis sur 8** marquent le jeu « réussi » (`cleared`),
  ce qui débloquera le jeu suivant du parcours.

### Fichiers

- `src/js/parking-panic/index.html` — HUD (pédales, mode AV/AR, chrono, chocs), barre des contrôles, écrans
- `src/js/parking-panic/style.css` — habillage
- `src/js/parking-panic/levels.js` — les 4 voitures jouables et les données des 8 niveaux
- `src/js/parking-panic/engine.js` — physique (modèle bicycle), collisions OBB/SAT, détection de place
- `src/js/parking-panic/traffic.js` — voitures perturbatrices (chemins, freinage, collisions)
- `src/js/parking-panic/render.js` — caméra et dessin du monde (canvas 2D)
- `src/js/parking-panic/game.js` — boucle de jeu, entrées clavier, HUD, progression

---

## 5. Organisation du code dans `src/`

Le code de la plateforme sera organisé ainsi (le jeu Catch Bird y sera déplacé) :

```
src/
├── README.md            ← ce fichier
├── index.html           ← page d'accueil / hub des jeux
├── css/
│   └── style.css        ← styles communs (hub + jeux)
└── js/
    ├── main.js          ← routeur : hub, progression, sauvegarde localStorage
    ├── progression.js   ← seuils de déblocage, jeux verrouillés/débloqués
    ├── catch-bird/      ← un sous-dossier par jeu
    │   ├── index.html
    │   ├── game.js
    │   └── style.css
    ├── plan-de-table/
    │   ├── index.html
    │   ├── style.css
    │   ├── levels.js
    │   └── game.js
    └── parking-panic/
        ├── index.html
        ├── style.css
        ├── levels.js
        ├── engine.js
        ├── traffic.js
        ├── render.js
        └── game.js
```

Chaque jeu expose une petite interface commune (démarrer, score courant, seuil de
réussite, « réussi ? ») pour que le hub puisse :

1. afficher l'état du parcours (verrouillé / en cours / réussi) ;
2. décider du déblocage du jeu suivant quand le seuil est atteint.

---

## 6. Étapes du projet

### Étape 1 — Premier jeu jouable (faite)
- Catch Bird fonctionnel : monde, oiseaux, photo, score, galerie.

### Étape 2 — Structure de la plateforme (faite)
- `src/` créé, code du premier jeu placé dans `src/js/catch-bird/`.
- README du projet rédigé (ce document).

### Étape 3 — Deuxième jeu (fait)
- Plan de Table implémenté dans `src/js/plan-de-table/` avec 3 niveaux et
  progression locale par seuils d'ambiance.

### Étape 4 — Hub et système de progression global (en cours)
- Page d'accueil `src/index.html` listant les jeux avec leur état
  (verrouillé / en cours / réussi).
- Définir les seuils de réussite de chaque jeu ; débloquer le jeu suivant quand
  le seuil est atteint ; persister la progression globale dans `localStorage`.
- Relier Catch Bird et Plan de Table au hub.

### Étape 5 — Troisième jeu (fait)
- Parking Panic implémenté dans `src/js/parking-panic/` : 8 niveaux, 4 voitures
  de tailles/maniabilités différentes, voitures mal garées et circulation
  perturbatrice, déblocage après 2 niveaux réussis du Plan de Table, jeu
  « réussi » à 5 niveaux pour débloquer la suite.

### Étape 6 — Jeux suivants et polish
- Ajouter d'autres jeux au parcours.
- Améliorations : écran de victoire entre les jeux, récapitulatif des scores,
  éventuels sons, page « à propos ».

### Étape 7 — Utilisable par un agent
- Exposer une interface utilisable par un agent (ligne de commande ou API/MCP) en
  parallèle de l'interface web, par exemple pour lancer une partie, lire le score
  ou la progression sans ouvrir de navigateur.

### Étape 8 — Rapport
- Rédiger `report.md` à la racine : réflexion sur le processus de travail
  (facilités, difficultés, organisation du groupe).

---

## 7. Contraintes du cours (mini-projet)

Ce projet suit les consignes du README à la racine du repo :

- **Projet de groupe** (2-3 personnes), petit mais non trivial : au moins une
  vingtaine de fichiers de code et une cinquantaine de commits sur les 2 semaines.
- **Visible sur Git** : le code et les informations de développement sont commités
  régulièrement. Le hook Vibe (`.vibe/`) enregistre les événements de session dans
  `events/` — ce dossier ne doit **pas** être supprimé ni ignoré par git.
- **Utilisable par un agent** : l'application doit être au moins partiellement
  pilotable par un agent (CLI parallèle à l'interface web, ou serveur MCP, ou skill).
- **Utilisation de Vibe** pour le développement (le hook ne fonctionne qu'avec Vibe).

### Timeline

- **Mercredi 18** : fork du template, invitation des membres du groupe et de
  l'enseignant, premier lancement de Vibe « trusté » avec vérification des événements
  dans `events/`.
- **Vendredi 20** : premier commit d'un README avec un plan initial du projet.
- **Jusqu'à lundi 30** : travail sur le mini-projet + rédaction de `report.md`.
