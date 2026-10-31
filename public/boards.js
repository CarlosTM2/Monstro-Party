// Plateaux et données de jeu : partagé entre le serveur (Node) et le navigateur.
(function (root) {
  // Générateur pseudo-aléatoire reproductible (le même plateau chez tout le monde).
  function rng(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ---------------- Thèmes (régions de Monstralia) ---------------- */
  const THEMES = {
    jurassic: {
      id: 'jurassic', name: 'Vallée Jurassique', emoji: '🦖', warp: { icon: '🦅', name: 'Ptéro-taxi', ride: 'ptero', text: 'Un ptérodactyle attrape {p} et l’emporte dans les airs !' }, seed: 7, wobble: 0.08, waves: 3, shape: 2,
      desc: 'Volcans, fougères géantes et dinosaures affamés.',
      bg: ['#2f5d34', '#7a9b3f'], path: '#d9c38a', floor: '#8b6b3e',
      decor: ['🌴', '🌿', '🦴', '🥚', '🌋', '🦕', '🍃', '🪨'],
      coin: { name: 'os', one: 'os', icon: '🦴' }, star: { name: 'Œuf d’or', a: 'un Œuf d’or', icon: '🥚', rule: 'L’Œuf d’or coûte 20 os.' },
      special: { icon: '🌋', name: 'Éruption', desc: 'Magmator crache de la lave : tous les autres perdent 5 os.' },
      countGame: { target: '🦖', others: ['🦕', '🌴', '🥚', '🦴'] },
    },
    pirate: {
      id: 'pirate', name: 'Île aux Pirates', emoji: '🏴‍☠️', warp: { icon: '⛵', name: 'Barque', ride: 'boat', text: '{p} monte dans une barque et rame vers l’autre rive !' }, seed: 21, wobble: 0.12, waves: 4, shape: 2.3,
      desc: 'Trésors, canons et ponts de corde au-dessus des requins.',
      bg: ['#0e5a8a', '#1fa2c7'], path: '#f2d49b', floor: '#7c4a1e',
      decor: ['🌊', '🦈', '⚓', '🏝️', '🐚', '🦜', '⛵', '🐠'],
      coin: { name: 'doublons', one: 'doublon', icon: '🪙' }, star: { name: 'Perle', a: 'une Perle', icon: '🦪', rule: 'Le prix de la Perle change à chaque fois (10 à 30 doublons).' },
      special: { icon: '💣', name: 'Canon', desc: 'Boum ! Le canon de Calamarde t’envoie sur une case au hasard.' },
      countGame: { target: '🦜', others: ['💰', '🏴‍☠️', '⚓', '🐚'] },
    },
    heroes: {
      id: 'heroes', name: 'Méga City', emoji: '🦸', warp: { icon: '🚁', name: 'Hélicoptère', ride: 'heli', text: 'Un hélicoptère emporte {p} au-dessus des toits !' }, seed: 42, wobble: 0, waves: 3, shape: 6,
      desc: 'Une ville de super-héros : gratte-ciel, éclairs et super-vitesse.',
      bg: ['#24135f', '#6d28d9'], path: '#fde68a', floor: '#334155',
      decor: ['🏙️', '🏢', '⚡', '🚁', '🌃', '💥', '🛸', '🚓'],
      coin: { name: 'crédits', one: 'crédit', icon: '💠' }, star: { name: 'Médaille', a: 'une Médaille', icon: '🏅', rule: 'Deux Médailles à 20 crédits sont cachées en ville.' },
      special: { icon: '⚡', name: 'Super-vitesse', desc: 'Tu fonces juste avant une Médaille !' },
      countGame: { target: '🦸', others: ['⚡', '🏙️', '💥', '🦹'] },
    },
    mine: {
      id: 'mine', name: 'Mine Profonde', emoji: '⛏️', warp: { icon: '🛤️', name: 'Wagon', ride: 'cart', text: '{p} saute dans un wagon et file dans les galeries !' }, seed: 99, wobble: 0.1, waves: 5, shape: 2.6,
      desc: 'Galeries sombres, wagons, cristaux… et passages secrets.',
      bg: ['#1c1917', '#57534e'], path: '#a8a29e', floor: '#44403c',
      decor: ['⛏️', '💎', '🪨', '🔦', '🕯️', '🪵', '💰', '🦇'],
      coin: { name: 'pépites', one: 'pépite', icon: '🔶' }, star: { name: 'Cristal', a: 'un Cristal', icon: '💎', rule: 'Le Cristal coûte 20 pépites. Une fois sur quatre, c’est un Cristal géant qui en vaut deux !' },
      special: { icon: '🪨', name: 'Éboulement', desc: 'La Reine Taupe secoue la galerie : tu perds 8 pépites.' },
      countGame: { target: '💎', others: ['🪨', '⛏️', '🔦', '🦇'] },
    },
    atlantide: {
      id: 'atlantide', name: 'Cité d’Atlantide', emoji: '🔱', warp: { icon: '🐢', name: 'Tortue géante', ride: 'turtle', text: 'Une tortue géante emporte {p} dans les courants !' }, seed: 71, wobble: 0.05, waves: 3, shape: 2.4,
      desc: 'Une cité engloutie : temple à étages, dômes de verre, épave, forêt d’algues et jardins de corail.',
      bg: ['#0c4a6e', '#22d3ee'], path: '#a5b4c4', floor: '#64748b',
      decor: ['🪸', '🐚', '🪨'],
      coin: { name: 'perles', one: 'perle', icon: '🦪' }, star: { name: 'Trident d’or', a: 'un Trident d’or', icon: '🔱', rule: 'Le Trident d’or coûte 20 perles.' },
      special: { icon: '🌀', name: 'Courant marin', desc: 'Un courant t’emporte vers une autre zone de la cité.' },
      countGame: { target: '🐠', others: ['🐙', '🦀', '🐚', '🪼'] },
    },
    espace: {
      id: 'espace', name: 'Station Spatiale', emoji: '🚀', warp: { icon: '🚀', name: 'Fusée', ride: 'rocket', text: '{p} décolle en fusée vers un autre astéroïde !' }, seed: 61, wobble: 0.08, waves: 3, shape: 2.4,
      desc: 'Des astéroïdes reliés par des passerelles, une station spatiale et un trou noir qui aspire tout.',
      bg: ['#1e1b4b', '#7c3aed'], path: '#cbd5e1', floor: '#6b7280',
      decor: ['🪨', '💎', '🪨'],
      coin: { name: 'météorites', one: 'météorite', icon: '☄️' }, star: { name: 'Planète d’or', a: 'une Planète d’or', icon: '🪐', rule: 'La Planète d’or coûte 20 météorites.' },
      special: { icon: '🕳️', name: 'Trou noir', desc: 'Le trou noir t’aspire : tu échanges ta place avec un joueur au hasard.' },
      countGame: { target: '🚀', others: ['🛸', '🪐', '⭐', '👽'] },
    },
    chevaliers: {
      id: 'chevaliers', name: 'Royaume des Chevaliers', emoji: '🏰', warp: { icon: '🐴', name: 'Cheval royal', ride: 'horse', text: 'Un cheval royal emporte {p} au galop !' }, seed: 51, wobble: 0.05, waves: 3, shape: 2.4,
      desc: 'Un château entouré de douves, un pont-levis qui se lève un tour sur deux et un dragon qui rôde.',
      bg: ['#166534', '#86efac'], path: '#d6c7a1', floor: '#9ca3af',
      decor: ['🌳', '🌳', '🪨'],
      coin: { name: 'écus', one: 'écu', icon: '🪙' }, star: { name: 'Saint Graal', a: 'un Saint Graal', icon: '🏆', rule: 'Le Saint Graal coûte 20 écus.' },
      special: { icon: '⚔️', name: 'Joute', desc: 'Tu défies un joueur au hasard : le gagnant prend 6 écus au perdant.' },
      countGame: { target: '🐴', others: ['🛡️', '🏰', '⚔️', '🐉'] },
    },
    polaire: {
      id: 'polaire', name: 'Pôle Nord', emoji: '🐧', warp: { icon: '🛷', name: 'Traîneau à chiens', ride: 'sled', text: 'Un traîneau file avec {p} sur la banquise !' }, seed: 41, wobble: 0.05, waves: 3, shape: 2.4,
      desc: 'Un lac gelé, un village d’igloos, des sapins sous la neige et des aurores boréales.',
      bg: ['#0ea5e9', '#e0f2fe'], path: '#cbd5e1', floor: '#f1f5f9',
      decor: ['🌲', '🌲', '🪨'],
      coin: { name: 'flocons', one: 'flocon', icon: '❄️' }, star: { name: 'Cristal d’aurore', a: 'un Cristal d’aurore', icon: '💠', rule: 'Le Cristal d’aurore coûte 20 flocons.' },
      special: { icon: '🛷', name: 'Toboggan', desc: 'Tu glisses 5 cases plus loin d’un coup !' },
      countGame: { target: '🐧', others: ['⛄', '🌲', '❄️', '🦭'] },
    },
    egypte: {
      id: 'egypte', name: 'Désert d’Égypte', emoji: '🐪', warp: { icon: '🐪', name: 'Chameau-taxi', ride: 'camel', text: 'Un chameau emmène {p} à travers le désert !' }, seed: 31, wobble: 0.06, waves: 3, shape: 2.4,
      desc: 'Le Nil, une oasis, des pyramides et un Sphinx qui garde ses secrets.',
      bg: ['#b45309', '#fcd34d'], path: '#d6b98a', floor: '#c2a06b',
      decor: ['🌴', '🏺', '🪨'],
      coin: { name: 'scarabées', one: 'scarabée', icon: '🪲' }, star: { name: 'Couronne du Pharaon', a: 'une Couronne du Pharaon', icon: '👑', rule: 'La Couronne du Pharaon coûte 20 scarabées.' },
      special: { icon: '🌪️', name: 'Tempête de sable', desc: 'Tout le monde perd 3 scarabées et la Couronne s’envole ailleurs.' },
      countGame: { target: '🐪', others: ['🏺', '🌴', '🪲', '🐍'] },
    },
    hante: {
      id: 'hante', name: 'Manoir Hanté', emoji: '🏚️', warp: { icon: '🦇', name: 'Chauve-taxi', ride: 'bat', text: 'Une chauve-souris géante emporte {p} dans la nuit !' }, seed: 13, wobble: 0.07, waves: 4, shape: 2.2,
      desc: 'Un manoir, un cimetière et des chemins qui n’apparaissent que la nuit. Le jour et la nuit changent tous les 4 tours.',
      bg: ['#2e1065', '#6b21a8'], path: '#b8a99a', floor: '#3f3f46',
      decor: ['🎃', '🪦', '🕯️', '🌳', '🦇'],
      coin: { name: 'bougies', one: 'bougie', icon: '🕯️' }, star: { name: 'Citrouille d’or', a: 'une Citrouille d’or', icon: '🎃', rule: 'La Citrouille d’or coûte 20 bougies.' },
      special: { icon: '⚰️', name: 'Cercueil', desc: 'Le Comte Vampirus t’aspire 6 bougies et les donne au dernier.' },
      countGame: { target: '👻', others: ['🎃', '🦇', '🕯️', '💀'] },
    },
    recif: {
      id: 'recif', name: 'Récif aux 8 Îlots', emoji: '🐠', warp: { icon: '⛵', name: 'Bateau-navette', ride: 'boat', text: '{p} monte dans le bateau-navette et file vers un autre îlot !' }, seed: 63, wobble: 0.06, waves: 3, shape: 2,
      desc: 'Huit petits îlots reliés par des ponts de corde au-dessus d’un lagon plein de coraux.',
      bg: ['#0891b2', '#5eead4'], path: '#f5deb3', floor: '#c2a878',
      decor: ['🌴', '🐚', '🦜', '🪸', '🌿', '🪨'],
      coin: { name: 'coquillages', one: 'coquillage', icon: '🐚' }, star: { name: 'Corail d’or', a: 'un Corail d’or', icon: '🪸', rule: 'Le Corail d’or coûte 20 coquillages.' },
      special: { icon: '🌊', name: 'Raz-de-marée', desc: 'Une vague géante t’emporte sur un autre îlot au hasard.' },
      countGame: { target: '🐠', others: ['🐙', '🦀', '🐚', '🪸'] },
    },
  };

  /* ---------------- Formes : petit, moyen, grand, avec ou sans étage ---------------- */
  // areas : boucles (centre, rayons, nombre de cases, étage) ; branches : raccourcis ; links : passages d'une boucle à l'autre.
  const LAYOUTS = {
    small: { W: 1000, H: 700, areas: [{ cx: 500, cy: 350, rx: 410, ry: 260, N: 26 }], branches: [{ a: 0, from: 3, to: 11, n: 4, bend: 0.5 }], links: [],
      force: { shop: 1, nest: 1, chance: 1, chaos: 1, casino: 1, trade: 1, boss: 1, shift: 1, npc: 1 }, tunnels: 2, stars: 1 },
    medium: { W: 1200, H: 840, areas: [{ cx: 600, cy: 420, rx: 530, ry: 345, N: 40 }], branches: [{ a: 0, from: 3, to: 13, n: 5, bend: 0.45 }, { a: 0, from: 23, to: 33, n: 5, bend: 0.45 }], links: [],
      force: { shop: 2, nest: 1, chance: 2, chaos: 1, casino: 2, trade: 2, boss: 2, shift: 2, npc: 2 }, tunnels: 3, stars: 1 },
    mediumF: { W: 1200, H: 840, areas: [{ cx: 600, cy: 420, rx: 540, ry: 355, N: 36 }, { cx: 600, cy: 410, rx: 260, ry: 155, N: 16, level: 1 }], branches: [],
      links: [{ from: [0, 5], to: [1, 2], n: 2 }, { from: [1, 10], to: [0, 22], n: 2 }],
      force: { shop: 2, nest: 1, chance: 2, chaos: 1, casino: 2, trade: 2, boss: 2, shift: 2, npc: 2 }, tunnels: 3, stars: 1 },
    large: { W: 1600, H: 1120, areas: [{ cx: 380, cy: 560, rx: 300, ry: 460, N: 32 }, { cx: 1220, cy: 560, rx: 300, ry: 460, N: 32 }],
      branches: [{ a: 0, from: 15, to: 27, n: 5, bend: 0.5 }, { a: 1, from: 2, to: 13, n: 5, bend: 0.5 }],
      links: [{ from: [0, 6], to: [1, 26], n: 3 }, { from: [1, 22], to: [0, 10], n: 3 }],
      force: { shop: 3, nest: 2, chance: 2, chaos: 2, casino: 3, trade: 2, boss: 2, shift: 2, npc: 2 }, tunnels: 4, stars: 2 },
    largeF: { W: 1600, H: 1120, areas: [{ cx: 380, cy: 690, rx: 300, ry: 380, N: 30 }, { cx: 1220, cy: 690, rx: 300, ry: 380, N: 30 }, { cx: 800, cy: 150, rx: 230, ry: 92, N: 14, level: 1 }],
      branches: [{ a: 0, from: 14, to: 25, n: 5, bend: 0.5 }, { a: 1, from: 5, to: 15, n: 5, bend: 0.5 }],
      links: [{ from: [0, 7], to: [1, 23], n: 3 }, { from: [1, 21], to: [0, 9], n: 3 }, { from: [0, 3], to: [2, 11], n: 1 }, { from: [2, 3], to: [1, 27], n: 1 }],
      force: { shop: 3, nest: 2, chance: 2, chaos: 2, casino: 3, trade: 2, boss: 2, shift: 2, npc: 2 }, tunnels: 4, stars: 2 },
  };

  // Tracés propres à chaque région (taille moyenne). Les index '@deg' désignent la case à cet angle (0 = droite, 90 = bas).
  const F2 = { shop: 2, nest: 1, chance: 2, chaos: 1, casino: 2, trade: 2, boss: 2, shift: 2, npc: 2 };
  const THEME_LAYOUTS = {
    jurassic: {
      medium: { W: 1200, H: 840, areas: [{ cx: 320, cy: 420, rx: 245, ry: 330, N: 22 }, { cx: 880, cy: 420, rx: 245, ry: 330, N: 22 }], branches: [{ a: 0, from: '@-150', to: '@30', n: 4, bend: 0.15 }, { a: 1, from: '@-30', to: '@150', n: 4, bend: 0.15 }],
        links: [{ from: [0, '@-40'], to: [1, '@-140'], n: 2, bridge: 22 }, { from: [1, '@140'], to: [0, '@40'], n: 2, bridge: 22 }, { from: [0, '@-80'], to: [1, '@100'], n: 10, bridge: 80 }], force: F2, tunnels: 2, stars: 1,
        river: [[600, -20], [575, 120], [630, 260], [585, 420], [625, 580], [590, 720], [610, 860]] },
      mediumF: { W: 1200, H: 840, areas: [{ cx: 320, cy: 420, rx: 245, ry: 330, N: 22 }, { cx: 880, cy: 420, rx: 250, ry: 335, N: 22 }, { cx: 880, cy: 420, rx: 105, ry: 150, N: 10, level: 1 }], branches: [],
        links: [{ from: [0, '@-40'], to: [1, '@-140'], n: 2 }, { from: [1, '@140'], to: [0, '@40'], n: 2 }, { from: [1, '@-60'], to: [2, '@-60'], n: 1 }, { from: [2, '@60'], to: [1, '@60'], n: 1 }], force: F2, tunnels: 2, stars: 1 },
    },
    pirate: {
      medium: { W: 1400, H: 980, areas: [{ cx: 700, cy: 490, rx: 300, ry: 215, N: 22 }, { cx: 861, cy: 132, rx: 92, ry: 50, N: 6, ship: true, zOff: 22, shape: 2 }, { cx: 1245, cy: 485, rx: 92, ry: 50, N: 6, ship: true, zOff: 22, shape: 2 }, { cx: 876, cy: 845, rx: 92, ry: 50, N: 6, ship: true, zOff: 22, shape: 2 }, { cx: 264, cy: 715, rx: 92, ry: 50, N: 6, ship: true, zOff: 22, shape: 2 }, { cx: 255, cy: 274, rx: 92, ry: 50, N: 6, ship: true, zOff: 22, shape: 2 }], branches: [{ a: 0, from: '@-90', to: '@90', n: 4, bend: 0 }],
        links: [{ from: [1, '@23'], to: [2, '@-117'], n: 2, bridge: 14 }, { from: [2, '@116'], to: [3, '@-24'], n: 2, bridge: 14 }, { from: [3, '@-188'], to: [4, '@32'], n: 2, bridge: 14 }, { from: [4, '@-111'], to: [5, '@109'], n: 2, bridge: 14 }, { from: [5, '@-33'], to: [1, '@187'], n: 2, bridge: 14 }, { from: [0, '@-66'], to: [1, '@114'], n: 2 }, { from: [0, '@64'], to: [3, '@-116'], n: 2 }, { from: [2, '@194'], to: [0, '@14'], n: 2 }, { from: [5, '@41'], to: [0, '@-139'], n: 2 }], force: F2, tunnels: 2, stars: 1, islandOnly: [0], ships: true },
    },
    heroes: {
      medium: { W: 1200, H: 840, areas: [{ cx: 600, cy: 420, rx: 525, ry: 345, N: 36 }, { cx: 600, cy: 420, rx: 245, ry: 150, N: 16 }], branches: [],
        links: [{ from: [0, '@0'], to: [1, '@0'], n: 3 }, { from: [1, '@180'], to: [0, '@180'], n: 3 }, { from: [0, '@-55'], to: [0, '@125'], n: 11, bridge: 80 }], force: F2, tunnels: 2, stars: 1 },
      mediumF: { W: 1200, H: 840, areas: [{ cx: 600, cy: 420, rx: 535, ry: 355, N: 34 }, { cx: 330, cy: 300, rx: 112, ry: 82, N: 8, level: 1, shape: 6 }, { cx: 870, cy: 300, rx: 112, ry: 82, N: 8, level: 1, shape: 6 }, { cx: 600, cy: 555, rx: 112, ry: 72, N: 8, level: 1, shape: 6 }], branches: [],
        links: [{ from: [0, '@-140'], to: [1, '@-140'], n: 1 }, { from: [1, '@0'], to: [2, '@180'], n: 2, bridge: 18 }, { from: [2, '@100'], to: [3, '@-20'], n: 2, bridge: 18 }, { from: [3, '@200'], to: [1, '@80'], n: 2, bridge: 18 }, { from: [2, '@-40'], to: [0, '@-40'], n: 1 }, { from: [3, '@90'], to: [0, '@90'], n: 1 }], force: F2, tunnels: 3, stars: 1 },
    },
    chevaliers: {
      medium: { W: 1300, H: 900, areas: [{ cx: 650, cy: 450, rx: 565, ry: 370, N: 34 }, { cx: 650, cy: 450, rx: 190, ry: 125, N: 12, moat: true }], branches: [{ a: 0, from: '@150', to: '@210', n: 4, bend: -0.3 }],
        links: [{ from: [0, '@-90'], to: [1, '@-90'], n: 3, when: 'levis' }, { from: [1, '@0'], to: [0, '@0'], n: 3 }, { from: [0, '@90'], to: [1, '@90'], n: 3, when: 'levis' }, { from: [1, '@180'], to: [0, '@180'], n: 3 }], force: F2, tunnels: 2, stars: 1 },
      mediumF: { W: 1300, H: 900, areas: [{ cx: 650, cy: 450, rx: 565, ry: 370, N: 34 }, { cx: 650, cy: 450, rx: 190, ry: 125, N: 12, moat: true, level: 1 }], branches: [{ a: 0, from: '@150', to: '@210', n: 4, bend: -0.3 }],
        links: [{ from: [0, '@-90'], to: [1, '@-90'], n: 3, when: 'levis' }, { from: [1, '@0'], to: [0, '@0'], n: 3 }, { from: [0, '@90'], to: [1, '@90'], n: 3, when: 'levis' }, { from: [1, '@180'], to: [0, '@180'], n: 3 }], force: F2, tunnels: 2, stars: 1 },
    },
    polaire: {
      medium: { W: 1300, H: 900, areas: [{ cx: 650, cy: 450, rx: 565, ry: 370, N: 34 }, { cx: 650, cy: 460, rx: 240, ry: 150, N: 14, lake: true }], branches: [{ a: 0, from: '@-130', to: '@-50', n: 4, bend: 0.3 }],
        links: [{ from: [0, '@180'], to: [1, '@180'], n: 2 }, { from: [1, '@0'], to: [0, '@0'], n: 2 }, { from: [1, '@90'], to: [0, '@90'], n: 1 }], force: F2, tunnels: 2, stars: 1 },
      mediumF: { W: 1300, H: 900, areas: [{ cx: 650, cy: 450, rx: 565, ry: 370, N: 34 }, { cx: 470, cy: 460, rx: 200, ry: 140, N: 12, lake: true }, { cx: 960, cy: 450, rx: 120, ry: 100, N: 9, level: 1 }], branches: [],
        links: [{ from: [0, '@180'], to: [1, '@180'], n: 1 }, { from: [1, '@0'], to: [0, '@-90'], n: 3 }, { from: [0, '@-30'], to: [2, '@-90'], n: 1 }, { from: [2, '@90'], to: [0, '@30'], n: 1 }], force: F2, tunnels: 2, stars: 1 },
    },
    egypte: {
      medium: { W: 1300, H: 900, areas: [{ cx: 650, cy: 450, rx: 565, ry: 370, N: 34 }, { cx: 360, cy: 450, rx: 150, ry: 120, N: 10 }], branches: [{ a: 0, from: '@-60', to: '@60', n: 5, bend: 0.25 }],
        links: [{ from: [0, '@180'], to: [1, '@180'], n: 1 }, { from: [1, '@0'], to: [0, '@-110'], n: 3 }], force: F2, tunnels: 2, stars: 1,
        river: [[790, -20], [760, 160], [820, 330], [770, 520], [820, 720], [790, 920]] },
      mediumF: { W: 1300, H: 900, areas: [{ cx: 650, cy: 450, rx: 565, ry: 370, N: 34 }, { cx: 360, cy: 450, rx: 150, ry: 120, N: 10 }, { cx: 930, cy: 440, rx: 120, ry: 95, N: 9, level: 1, shape: 4 }], branches: [],
        links: [{ from: [0, '@180'], to: [1, '@180'], n: 1 }, { from: [1, '@0'], to: [0, '@-110'], n: 3 }, { from: [0, '@-60'], to: [2, '@-90'], n: 1 }, { from: [2, '@90'], to: [0, '@60'], n: 1 }], force: F2, tunnels: 2, stars: 1,
        river: [[730, -20], [700, 160], [735, 330], [700, 520], [740, 720], [710, 920]], pyramid: true },
    },
    mine: {
      medium: { W: 1200, H: 840, areas: [{ cx: 240, cy: 260, rx: 175, ry: 185, N: 14 }, { cx: 640, cy: 580, rx: 200, ry: 200, N: 16 }, { cx: 1000, cy: 260, rx: 150, ry: 160, N: 11 }], branches: [],
        links: [{ from: [0, '@30'], to: [1, '@-150'], n: 2 }, { from: [1, '@180'], to: [0, '@90'], n: 2 }, { from: [1, '@-20'], to: [2, '@120'], n: 2 }, { from: [2, '@180'], to: [1, '@-100'], n: 3 }, { from: [0, '@-10'], to: [2, '@200'], n: 6, bridge: 70 }], force: F2, tunnels: 3, stars: 1 },
      mediumF: { W: 1200, H: 840, areas: [{ cx: 240, cy: 260, rx: 175, ry: 185, N: 14 }, { cx: 640, cy: 580, rx: 200, ry: 200, N: 16 }, { cx: 1000, cy: 260, rx: 110, ry: 120, N: 9, level: 1 }], branches: [],
        links: [{ from: [0, '@30'], to: [1, '@-150'], n: 2 }, { from: [1, '@180'], to: [0, '@90'], n: 2 }, { from: [1, '@-20'], to: [2, '@120'], n: 1 }, { from: [2, '@180'], to: [1, '@-100'], n: 1 }], force: F2, tunnels: 3, stars: 1 },
    },
  };
  // Récif : 8 îlots en cercle, reliés par des ponts ; deux grands ponts se croisent au-dessus du lagon (l'un passe sous l'autre)
  function recifLayout(size) {
    const S = { small: [1200, 840, 6, 2, 0.85], medium: [1400, 980, 7, 2, 1], large: [1700, 1190, 8, 3, 1.18] }[size] || [1400, 980, 7, 2, 1];
    const W = S[0], H = S[1], N = S[2], nl = S[3], k = S[4];
    const areas = [], links = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 - Math.PI / 2; areas.push({ cx: Math.round(W / 2 + Math.cos(a) * (W / 2 - 150 * k)), cy: Math.round(H / 2 + Math.sin(a) * (H / 2 - 125 * k)), rx: Math.round(88 * k), ry: Math.round(74 * k), N: N }); }
    const deg = (i, j) => Math.round(Math.atan2(areas[j].cy - areas[i].cy, areas[j].cx - areas[i].cx) * 180 / Math.PI);
    for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; links.push({ from: [i, '@' + (deg(i, j) - 25)], to: [j, '@' + (deg(j, i) + 25)], n: nl, sand: true }); } // bancs de sable (sous l'eau à marée haute)
    const long = (i, j, h) => { const L = Math.hypot(areas[j].cx - areas[i].cx, areas[j].cy - areas[i].cy); return { from: [i, '@' + deg(i, j)], to: [j, '@' + deg(j, i)], n: Math.max(5, Math.round(L / 78)), bridge: h }; };
    return { W: W, H: H, areas: areas, branches: [], links: links, force: size === 'small' ? { shop: 1, nest: 1, chance: 1, chaos: 1, casino: 1, trade: 1, boss: 1, shift: 1, npc: 1 } : { shop: 2, nest: 1, chance: 2, chaos: 1, casino: 2, trade: 2, boss: 2, shift: 2, npc: 2 }, tunnels: 4, stars: size === 'large' ? 2 : 1, islands: true };
  }
  // Manoir Hanté : le tour du domaine, la cour du manoir, une allée du jardin (le jour) et des passages spectraux (la nuit)
  function espaceLayout(size) { // astéroïdes autour d'une station centrale, reliés par des passerelles
    const S = { small: [1200, 840, 6, 0.85], medium: [1400, 980, 8, 1], large: [1700, 1190, 10, 1.18] }[size] || [1400, 980, 8, 1];
    const W = S[0], H = S[1], N = S[2], k = S[3], n = 6;
    const areas = [{ cx: W / 2, cy: H / 2, rx: Math.round(150 * k), ry: Math.round(110 * k), N: N + 2 }], links = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 - Math.PI / 2; areas.push({ cx: Math.round(W / 2 + Math.cos(a) * (W / 2 - 160 * k)), cy: Math.round(H / 2 + Math.sin(a) * (H / 2 - 135 * k)), rx: Math.round(100 * k), ry: Math.round(82 * k), N: N }); }
    const deg = (i, j) => Math.round(Math.atan2(areas[j].cy - areas[i].cy, areas[j].cx - areas[i].cx) * 180 / Math.PI);
    const L = (i, j, h) => { const d = Math.hypot(areas[j].cx - areas[i].cx, areas[j].cy - areas[i].cy) - (areas[i].rx + areas[j].rx) * 0.8; return { from: [i, '@' + deg(i, j)], to: [j, '@' + deg(j, i)], n: Math.max(2, Math.round(d / 70)), bridge: h }; };
    for (let i = 1; i <= n; i++) links.push(L(i, i % n + 1, 12));
    [1, 4].forEach((i) => links.push(L(0, i, 18)));
    [3, 6].forEach((i) => links.push(L(i, 0, 18)));
    return { W: W, H: H, areas: areas, branches: [], links: links, force: size === 'small' ? { shop: 1, nest: 1, chance: 1, chaos: 1, casino: 1, trade: 1, boss: 1, shift: 1, npc: 1 } : { shop: 2, nest: 1, chance: 2, chaos: 1, casino: 2, trade: 2, boss: 2, shift: 2, npc: 2 }, tunnels: 4, stars: size === 'large' ? 2 : 1, islands: true };
  }
  function hanteLayout(size) {
    const k = size === 'small' ? 0.85 : size === 'large' ? 1.2 : 1;
    const W = Math.round(1300 * k), H = Math.round(900 * k);
    const F = size === 'small' ? { shop: 1, nest: 1, chance: 1, chaos: 1, casino: 1, trade: 1, boss: 1, shift: 1, npc: 2 } : { shop: 2, nest: 1, chance: 2, chaos: 1, casino: 2, trade: 2, boss: 2, shift: 2, npc: 3 };
    return { W: W, H: H, areas: [{ cx: W / 2, cy: H / 2, rx: W / 2 - 80 * k, ry: H / 2 - 70 * k, N: Math.round(32 * k) }, { cx: W / 2, cy: H / 2 + 40 * k, rx: 200 * k, ry: 130 * k, N: Math.round(12 * k) }], branches: [{ a: 0, from: '@200', to: '@-20', n: Math.round(7 * k), bend: -0.35, when: 'jour', bridge: 45 }],
      links: [{ from: [0, '@-90'], to: [1, '@-90'], n: 2 }, { from: [1, '@90'], to: [0, '@90'], n: 2 }, { from: [1, '@0'], to: [0, '@20'], n: 3, when: 'nuit' }, { from: [0, '@160'], to: [1, '@180'], n: 3, when: 'nuit' }], force: F, tunnels: 2, stars: size === 'large' ? 2 : 1 };
  }

  // ===== Grandes cartes à étages (la seule taille jouée) =====
  const FB = { shop: 3, nest: 2, chance: 3, chaos: 2, casino: 3, trade: 3, boss: 3, shift: 3, npc: 3 };
  const D = function (a, b, o) { return [Object.assign({ from: [a, 'auto-16'], to: [b, 'auto+16'] }, o || {}), Object.assign({ from: [b, 'auto-16'], to: [a, 'auto+16'] }, o || {})]; };
  const L = function (a, aa, b, ba, o) { return Object.assign({ from: [a, '@' + aa], to: [b, '@' + ba] }, o || {}); };
  const U = function (a, b, o) { return Object.assign({ from: [a, 'auto'], to: [b, 'auto'] }, o || {}); };
  const BIGL = function (areas, links, extra) { return Object.assign({ W: 2200, H: 1500, areas: areas, branches: [], links: [].concat.apply([], links.map(function (l) { return Array.isArray(l) ? l : [l]; })), force: FB, tunnels: 2, stars: 3 }, extra || {}); };
  const RING = { cx: 1100, cy: 750, rx: 1000, ry: 640 };
  // Zone en bande le long d'une ligne (tranchée, rivière, rempart) et tache irrégulière
  const band = function (pts, w) { const L2 = [], R2 = []; for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1; L2.push([Math.round(pts[i][0] - dy / d * w / 2), Math.round(pts[i][1] + dx / d * w / 2)]); R2.push([Math.round(pts[i][0] + dy / d * w / 2), Math.round(pts[i][1] - dx / d * w / 2)]); } return L2.concat(R2.reverse()); };
  const blob = function (cx, cy, rx, ry, seed, k) { const out = []; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, w = 1 + (k || 0.12) * Math.sin(a * 3 + seed) + (k || 0.12) * 0.6 * Math.sin(a * 5 + seed * 2); out.push([Math.round(cx + Math.cos(a) * rx * w), Math.round(cy + Math.sin(a) * ry * w)]); } return out; };
  const BIG = {
    jurassic: BIGL([RING, { cx: 1100, cy: 720, rx: 340, ry: 230, level: 1 }, { cx: 1100, cy: 700, rx: 150, ry: 100, level: 2 }, { cx: 560, cy: 1000, rx: 170, ry: 120 }, { cx: 1640, cy: 500, rx: 150, ry: 105, level: 1 }, { cx: 1600, cy: 1050, rx: 190, ry: 120 }],
      [L(0, -100, 1, -100), L(1, -80, 0, -80), L(1, -120, 2, -120), L(2, -60, 1, -60), L(0, 150, 3, 180), L(3, 120, 0, 130), L(3, -20, 1, 160), L(1, 30, 5, 200), L(5, 20, 0, 30), L(0, -30, 4, 0), L(4, -60, 0, -45), L(4, 170, 1, -20, { bridge: 24 })],
      { river: [[330, -20], [300, 300], [380, 600], [340, 900], [300, 1200], [340, 1520]] }),
    pirate: BIGL([{ cx: 1100, cy: 750, rx: 560, ry: 360 }, { cx: 1100, cy: 730, rx: 260, ry: 160, level: 1 }, { cx: 1100, cy: 720, rx: 120, ry: 70, level: 2 },
      { cx: 1100, cy: 150, rx: 130, ry: 75, ship: true, zOff: 22 }, { cx: 1890, cy: 450, rx: 130, ry: 75, ship: true, zOff: 22 }, { cx: 1890, cy: 1050, rx: 130, ry: 75, ship: true, zOff: 22 }, { cx: 1100, cy: 1350, rx: 130, ry: 75, ship: true, zOff: 22 }, { cx: 310, cy: 1050, rx: 130, ry: 75, ship: true, zOff: 22 }, { cx: 310, cy: 450, rx: 130, ry: 75, ship: true, zOff: 22 }],
      [L(0, -120, 1, -120), L(1, -60, 0, -60), L(1, -140, 2, -140), L(2, -40, 1, -40), U(3, 4, { bridge: 14 }), U(4, 5, { bridge: 14 }), U(5, 6, { bridge: 14 }), U(6, 7, { bridge: 14 }), U(7, 8, { bridge: 14 }), U(8, 3, { bridge: 14 }),
        L(0, -100, 3, 100, { bridge: 12 }), L(3, 80, 0, -80, { bridge: 12 }), L(0, 100, 6, -100, { bridge: 12 }), L(6, -80, 0, 80, { bridge: 12 }), U(0, 4, { bridge: 12 }), U(5, 0, { bridge: 12 }), U(7, 0, { bridge: 12 }), U(0, 8, { bridge: 12 })],
      { islandOnly: [0], ships: true }),
    heroes: (function () {
      // Méga City : 5 quartiers (Affaires, Tours, Gare Centrale, Parc & Vieille Ville, Néon District)
      // aires : 0 boulevard, 1 Affaires, 2 Tours, 3 Gare (rue), 4 Parc, 5 Néon, 6 station centrale (-2),
      //         7 rouge ouest, 8 rouge est, 9 bleu est, 10 bleu ouest, 11 vert ouest, 12 vert est,
      //         13 toit Affaires (2), 14 toit Bourse (1), 15 tour Météor (3), 16 tour Zénith (2), 17 casino (1), 18 voie de bus, 19 égouts (-1)
      const M = -60, D2 = -120;
      const lines = {
        rw: [[700, 720], [800, 760], [858, 778], [910, 790]], re: [[1295, 775], [1345, 768], [1450, 745], [1560, 720]],
        be: [[1560, 1050], [1450, 950], [1350, 880], [1300, 850]], bw: [[905, 850], [852, 885], [760, 960], [640, 1040]],
        gw: [[640, 1040], [600, 900], [660, 760], [700, 720]], ge: [[1560, 720], [1660, 820], [1640, 960], [1560, 1050]],
      };
      return BIGL([
        { pts: [[90, 760], [150, 420], [420, 170], [800, 90], [1100, 70], [1500, 80], [1900, 170], [2120, 420], [2150, 760], [2100, 1120], [1880, 1380], [1500, 1460], [1100, 1470], [700, 1460], [320, 1400], [110, 1120]], closed: true , name: 'Boulevard' }, // 0 boulevard
        { pts: [[300, 260], [560, 215], [770, 290], [790, 470], [620, 600], [370, 590], [240, 440]], closed: true , name: 'Quartier des Affaires' }, // 1 Affaires
        { pts: [[1340, 240], [1650, 180], [1950, 290], [1990, 500], [1760, 610], [1430, 590], [1300, 430]], closed: true , name: 'Les Tours' }, // 2 Tours
        { pts: [[900, 600], [1300, 590], [1410, 790], [1310, 990], [900, 1000], [790, 800]], closed: true , name: 'Gare Centrale' }, // 3 Gare Centrale (rue autour de la station)
        { pts: [[260, 960], [520, 900], [720, 1110], [620, 1310], [330, 1330], [190, 1140]], closed: true , name: 'Vieille Ville' }, // 4 Parc & Vieille Ville
        { pts: [[1520, 1170], [1780, 1010], [1990, 1130], [1900, 1330], [1600, 1340]], closed: true , name: 'Néon District' }, // 5 Néon District
        { pts: [[960, 760, D2], [1100, 735, D2], [1240, 760, D2], [1245, 840, D2], [1100, 865, D2], [955, 840, D2]], closed: true , name: 'Station centrale' }, // 6 station centrale
        { pts: lines.rw.map((p, i) => [p[0], p[1], i === 3 ? -100 : M]), to: [6, '#960,790'], gap: 110 , name: 'Métro rouge' }, // 7 ligne rouge ouest (A -> centre)
        { pts: lines.re.map((p, i) => [p[0], p[1], i === 0 ? -100 : M]), from: [6, '#1240,775'], gap: 110 , name: 'Métro rouge' }, // 8 ligne rouge est (centre -> Tours)
        { pts: lines.be.map((p, i) => [p[0], p[1], i === 3 ? -100 : M]), to: [6, '#1245,830'], gap: 110 , name: 'Métro bleu' }, // 9 ligne bleue est (Néon -> centre)
        { pts: lines.bw.map((p, i) => [p[0], p[1], i === 0 ? -100 : M]), from: [6, '#955,835'], gap: 110 , name: 'Métro bleu' }, // 10 ligne bleue ouest (centre -> Parc)
        { pts: lines.gw.slice(1, 3).map((p) => [p[0], p[1], M]), from: [10, '$'], to: [7, '^'], gap: 110 , name: 'Métro vert' }, // 11 ligne verte ouest (Parc -> Affaires)
        { pts: lines.ge.slice(1, 3).map((p) => [p[0], p[1], M]), from: [8, '$'], to: [9, '^'], gap: 110 , name: 'Métro vert' }, // 12 ligne verte est (Tours -> Néon)
        { pts: [[420, 330, 120], [560, 315, 120], [575, 450, 120], [430, 470, 120]], closed: true , name: 'Toit des Affaires' }, // 13 toit des Affaires (2)
        { pts: [[640, 340, 60], [735, 350, 60], [740, 450, 60], [650, 465, 60]], closed: true , name: 'Toit de la Bourse' }, // 14 toit de la Bourse (1)
        { pts: [[1475, 315, 180], [1590, 310, 180], [1595, 415, 180], [1480, 425, 180]], closed: true , name: 'Tour Météor' }, // 15 tour Météor (3)
        { pts: [[1700, 345, 120], [1830, 340, 120], [1845, 460, 120], [1715, 475, 120]], closed: true , name: 'Tour Zénith' }, // 16 tour Zénith (2)
        { pts: [[1720, 1160, 60], [1840, 1155, 60], [1845, 1255, 60], [1725, 1260, 60]], closed: true , name: 'Toit du casino' }, // 17 toit du casino (1)
        { pts: [[700, 1395, 0], [1000, 1400, 0], [1300, 1400, 0], [1560, 1392, 0]], from: [4, '#620,1310'], to: [5, '#1600,1340'], gap: 150 , name: 'Voie de bus' }, // 18 voie de bus (express)
        { pts: [[300, 1010, 0], [380, 1060, M], [470, 1160, M], [560, 1230, M], [600, 1270, 0]], from: [4, '#260,960'], to: [4, '#620,1310'], gap: 80 , name: 'Égouts' }, // 19 égouts de la vieille ville
      ], [
        // le boulevard dessert les quartiers
        { from: [0, '#150,420'], to: [1, '#240,440'] }, { from: [1, '#300,260'], to: [0, '#420,170'] }, { from: [0, '#1500,80'], to: [2, '#1340,240'] }, { from: [2, '#1990,500'], to: [0, '#2120,420'] },
        { from: [0, '#2100,1120'], to: [5, '#1990,1130'] }, { from: [5, '#1520,1170'], to: [3, '#1310,990'] }, { from: [3, '#790,800'], to: [4, '#720,1110'] }, { from: [4, '#190,1140'], to: [0, '#95,1030'] },
        { from: [1, '#790,470'], to: [3, '#900,600'] }, { from: [3, '#1300,590'], to: [2, '#1430,590'] },
        // escalators du métro (descendre / remonter)
        { from: [1, '#620,600'], to: [7, '^'] }, { from: [7, '%0.5'], to: [3, '#790,800'] },
        { from: [2, '#1430,590'], to: [8, '$'] }, { from: [8, '%0.4'], to: [3, '#1410,790'] },
        { from: [5, '#1520,1170'], to: [9, '^'] }, { from: [12, '$'], to: [5, '#1650,1090'] },
        { from: [4, '#720,1110'], to: [10, '$'] }, { from: [11, '^'], to: [4, '#520,900'] },
        { from: [3, '#1100,1000'], to: [6, '#1100,865'], gap: 60 }, { from: [6, '#1100,735'], to: [3, '#1100,595'], gap: 60 },
        // ascenseurs des immeubles et passerelles
        { from: [1, '#370,590'], to: [13, '#430,470'], lift: true }, { from: [13, '#560,315'], to: [14, '#640,340'], bridge: 10 }, { from: [14, '#740,450'], to: [1, '#790,470'], lift: true },
        { from: [2, '#1300,430'], to: [15, '#1480,425'], lift: true }, { from: [15, '#1595,415'], to: [16, '#1715,475'], bridge: 12 }, { from: [16, '#1845,460'], to: [2, '#1990,500'], lift: true },
        { from: [5, '#1600,1340'], to: [17, '#1725,1260'], lift: true }, { from: [17, '#1840,1155'], to: [5, '#1990,1130'], lift: true },
      ], {
        zones: [
          { poly: band(lines.rw, 110), level: -1 }, { poly: band(lines.re, 110), level: -1 }, { poly: band(lines.be, 110), level: -1 }, { poly: band(lines.bw, 110), level: -1 },
          { poly: band(lines.gw, 110), level: -1 }, { poly: band(lines.ge, 110), level: -1 },
          { poly: blob(1100, 800, 262, 132, 2, 0.04), level: -2 },
          { poly: band([[280, 990], [380, 1060], [470, 1160], [560, 1230], [620, 1290]], 90), level: -1, kind: 'sewer' },
          { poly: [[395, 300], [595, 285], [610, 480], [405, 505]], level: 2, kind: 'building' },
          { poly: [[625, 320], [760, 330], [765, 470], [630, 485]], level: 1, kind: 'building' },
          { poly: [[1450, 290], [1615, 285], [1625, 440], [1455, 450]], level: 3, kind: 'tower' },
          { poly: [[1680, 320], [1855, 315], [1870, 485], [1695, 500]], level: 2, kind: 'building' },
          { poly: [[1700, 1140], [1860, 1135], [1865, 1275], [1705, 1285]], level: 1, kind: 'casino' },
          { poly: blob(690, 700, 85, 60, 1, 0.05), level: -1 }, { poly: blob(1500, 680, 112, 82, 2, 0.04), level: -1 }, { poly: blob(1600, 1060, 140, 95, 3, 0.04), level: -1 }, { poly: blob(650, 1040, 80, 60, 4, 0.05), level: -1 }, { poly: band([[1100, 560], [1100, 1040]], 80), level: -1 },
        ],
        tunnelPairs: [[[15, '#1530,315'], [13, '#490,320']], [[17, '#1780,1160'], [0, '#1100,70']]],
        labels: [{ x: 520, y: 140, text: 'Quartier des Affaires', c: '#4f46e5' }, { x: 1650, y: 130, text: 'Les Tours', c: '#b45309' }, { x: 1100, y: 560, text: 'Gare Centrale', c: '#dc2626' }, { x: 440, y: 860, text: 'Parc & Vieille Ville', c: '#15803d' }, { x: 1760, y: 960, text: 'Néon District', c: '#a21caf' }],
        props: [{ kind: 'wheel', x: 1000, y: 1150 }, { kind: 'fountain', x: 440, y: 1110 }, { kind: 'neon', x: 1780, y: 1210 }, { kind: 'helipad', x: 1535, y: 365, z: 180 }, { kind: 'helipad', x: 495, y: 395, z: 120 }],
        stars: 3,
      });
    })(),
    mine: BIGL([RING, { cx: 580, cy: 540, rx: 240, ry: 180, level: 1 }, { cx: 580, cy: 520, rx: 110, ry: 80, level: 2 }, { cx: 1620, cy: 980, rx: 240, ry: 180, level: 1 }, { cx: 1500, cy: 400, rx: 190, ry: 130 }, { cx: 760, cy: 1150, rx: 190, ry: 110 }],
      [L(0, -150, 1, 180), L(1, -90, 0, -110), L(1, -30, 2, -30), L(2, 150, 1, 150), L(0, 30, 3, 0), L(3, 90, 0, 80), L(0, -60, 4, -60), L(4, -120, 0, -80), L(4, 90, 3, -90), L(0, 110, 5, 90), L(5, 180, 0, 140), L(1, 0, 4, 180, { bridge: 30 }), L(5, 0, 3, 180)], { tunnels: 3 }),
    hante: BIGL([{ cx: 1100, cy: 780, rx: 1000, ry: 620 }, { cx: 1100, cy: 1050, rx: 300, ry: 170 }, { cx: 1100, cy: 540, rx: 300, ry: 170, level: 1 }, { cx: 1100, cy: 520, rx: 130, ry: 70, level: 2 }, { cx: 440, cy: 980, rx: 170, ry: 120 }, { cx: 1760, cy: 980, rx: 170, ry: 120 }],
      [L(1, -110, 2, 110), L(2, 70, 1, -70), L(2, -120, 3, -120), L(3, -60, 2, -60), L(0, 100, 1, 100), L(1, 80, 0, 80), L(0, 168, 4, 190), L(4, -60, 0, -130), L(5, 0, 0, 30), L(0, -50, 5, -120),
        L(4, 0, 1, 180, { when: 'nuit' }), L(1, 0, 5, 180, { when: 'nuit' }), L(0, -100, 2, -100, { when: 'jour' }), L(2, -80, 0, -80, { when: 'jour' })]),
    egypte: (function () {
      const sq = function (h) { return [[1300 - h, 620 - h], [1300 + h, 620 - h], [1300 + h, 620 + h], [1300 - h, 620 + h]]; };
      const valley = [[250, 300], [380, 520], [330, 760], [470, 980], [420, 1200], [400, 1330]];
      return BIGL([
        { pts: [[1100, 110], [1700, 130], [2060, 300], [2090, 750], [2050, 1200], [1700, 1390], [1100, 1380], [600, 1400], [150, 1300], [100, 800], [130, 300], [500, 110]], closed: true , name: 'Désert' }, // 0 boucle du désert
        { pts: [[1220, 1300, 0], [1120, 1150, 0], [960, 940, 0], [925, 700, 20], [930, 480, 45], [985, 370, 60], [1150, 345, 60], [1400, 345, 60], [1565, 380, 60], [1580, 560, 80], [1570, 740, 105], [1470, 800, 120], [1300, 805, 120], [1145, 780, 120], [1135, 640, 120], [1145, 520, 125], [1190, 468, 142], [1300, 458, 160], [1395, 498, 175], [1300, 620, 180]], from: [0, '#1220,1380'] , name: 'Pyramide' }, // 1 ascension de la pyramide en lacets
        { pts: [[1270, 705, 180], [1262, 785, 178], [1262, 860, 130], [1262, 935, 72], [1275, 1030, 15], [1340, 1200, 0]], from: [1, '$'], to: [0, '#1420,1385'] , name: 'Grand escalier' }, // 2 grand escalier qui redescend (passe au-dessus de la terrasse)
        { pts: [[200, 280, 0], [270, 335, -50], [370, 520, -60], [335, 760, -60], [395, 880, -62], [450, 950, -100], [500, 1000, -120], [580, 1030, -120], [525, 1100, -112], [430, 1200, -60], [410, 1290, -25], [380, 1360, 0]], from: [0, '#130,300'], to: [0, '#350,1395'] , name: 'Vallée des Rois' }, // 3 vallée des Rois (-1) et tombeau (-2)
        { pts: [[220, 830, 0], [340, 810, 0], [520, 760, 0], [650, 690, 0], [840, 610, 0]], from: [0, '#100,820'], to: [1, '#930,560'] , name: 'Pont du Nil' }, // 4 pont sur la vallée puis sur le Nil
        { pts: [[2000, 820, 0], [1890, 905, 30], [1780, 1030, 60], [1850, 1170, 60], [1925, 1140, 60], [1995, 1060, 60], [2050, 1000, 22]], from: [0, '#2090,750'], to: [0, '#2085,1000'] , name: 'Temple' }, // 5 terrasse du temple
      ], [], {
        zones: [
          { poly: sq(320), level: 1, kind: 'pyramid' }, { poly: sq(210), level: 2, kind: 'pyramid' }, { poly: sq(100), level: 3, kind: 'pyramid' },
          { poly: band(valley, 150), level: -1 }, { poly: blob(480, 1010, 185, 178, 4, 0.08), level: -2 },
          { poly: blob(1840, 1110, 140, 115, 1, 0.06), level: 1, kind: 'terrace' },
        ],
        river: [[790, -20], [760, 400], [820, 800], [770, 1200], [800, 1520]], pyramid: true,
      });
    })(),
    polaire: BIGL([RING, { cx: 700, cy: 820, rx: 320, ry: 210, lake: true }, { cx: 1580, cy: 600, rx: 300, ry: 210, level: 1 }, { cx: 1600, cy: 580, rx: 140, ry: 90, level: 2 }, { cx: 1500, cy: 1180, rx: 190, ry: 90 }, { cx: 500, cy: 410, rx: 170, ry: 110 }],
      [L(0, 160, 1, 180), L(1, 120, 0, 110), L(0, -30, 2, 0), L(2, -90, 0, -80), L(2, 150, 3, 150), L(3, 30, 2, 30), L(4, 180, 0, 100), L(0, 45, 4, -30), L(1, 0, 2, 180), L(4, -160, 1, 20), L(0, -155, 5, 180), L(5, 0, 0, -100), L(5, 90, 1, -100)]),
    chevaliers: BIGL([RING, { cx: 1100, cy: 700, rx: 300, ry: 190, level: 1, moat: true }, { cx: 1100, cy: 690, rx: 130, ry: 75, level: 2 }, { cx: 480, cy: 1040, rx: 170, ry: 110 }, { cx: 1720, cy: 1040, rx: 170, ry: 110 }, { cx: 480, cy: 410, rx: 170, ry: 110 }, { cx: 1720, cy: 450, rx: 150, ry: 90, level: 1 }],
      [L(0, -95, 1, -95, { when: 'levis' }), L(1, -75, 0, -75), L(1, 150, 3, -20), L(4, 180, 1, 30, { when: 'levis' }), L(1, -130, 2, -130), L(2, -50, 1, -50), L(0, 150, 3, 180), L(3, 90, 0, 105), L(4, 0, 0, 30), L(0, 75, 4, 90), L(0, -155, 5, 180), L(5, -60, 0, -110), L(0, -40, 6, 0), L(6, 180, 0, -70), L(3, -90, 5, 90)]),
    atlantide: BIGL([RING, { cx: 1100, cy: 700, rx: 320, ry: 210, level: 1 }, { cx: 1100, cy: 690, rx: 140, ry: 90, level: 2 }, { cx: 480, cy: 1040, rx: 170, ry: 110 }, { cx: 1720, cy: 1040, rx: 170, ry: 110 }, { cx: 520, cy: 450, rx: 140, ry: 95, level: 1 }, { cx: 1720, cy: 430, rx: 170, ry: 110 }],
      [L(0, -95, 1, -95), L(1, -75, 0, -75), L(1, -130, 2, -130), L(2, -50, 1, -50), L(1, 150, 3, -20), L(4, 180, 1, 30), L(0, 150, 3, 180), L(3, 90, 0, 105), L(4, 0, 0, 30), L(0, 75, 4, 90), L(0, -155, 5, 180), L(5, -90, 0, -115), L(5, 0, 1, 180, { bridge: 20 }), L(0, -32, 6, 10), L(6, 180, 0, -70), L(6, 90, 4, -90)]),
    espace: BIGL([{ cx: 1100, cy: 750, rx: 220, ry: 150, level: 2 }, { cx: 1100, cy: 190, rx: 180, ry: 120 }, { cx: 1840, cy: 470, rx: 180, ry: 130, level: 1 }, { cx: 1840, cy: 1030, rx: 180, ry: 130 }, { cx: 1100, cy: 1310, rx: 180, ry: 120, level: 1 }, { cx: 360, cy: 1030, rx: 180, ry: 130 }, { cx: 360, cy: 470, rx: 180, ry: 130, level: 1 }],
      [U(1, 2, { bridge: 12 }), U(2, 3, { bridge: 12 }), U(3, 4, { bridge: 12 }), U(4, 5, { bridge: 12 }), U(5, 6, { bridge: 12 }), U(6, 1, { bridge: 12 }), D(0, 1, { bridge: 10 }), D(0, 4, { bridge: 10 }), U(0, 2, { bridge: 10 }), U(3, 0, { bridge: 10 }), U(0, 5, { bridge: 10 }), U(6, 0, { bridge: 10 })],
      { islands: true, tunnels: 3 }),
    recif: BIGL([{ cx: 1100, cy: 750, rx: 300, ry: 200 }, { cx: 1100, cy: 730, rx: 140, ry: 80, level: 1 }].concat([0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { const a = i / 8 * Math.PI * 2 - Math.PI / 2; return { cx: Math.round(1100 + Math.cos(a) * 880), cy: Math.round(750 + Math.sin(a) * 570), rx: 140, ry: 105 }; })),
      [L(0, -120, 1, -120), L(1, -60, 0, -60)].concat([0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return U(2 + i, 2 + (i + 1) % 8, { sand: true }); }), [U(2, 0, { bridge: 14 }), U(0, 6, { bridge: 14 }), U(4, 0, { bridge: 14 }), U(0, 8, { bridge: 14 })]),
      { islands: true, tunnels: 4 }),
  };
  function layoutKey(size, floors) {
    if (size === 'small') return 'small';
    return size + (floors ? 'F' : '');
  }

  const cache = {};
  function makeBoard(themeId, size, floors) {
    const key = themeId + ':' + layoutKey(size, floors);
    if (cache[key]) return cache[key];
    const T = THEMES[themeId], L = size === 'large' && floors && BIG[themeId] ? BIG[themeId] : themeId === 'hante' ? hanteLayout(size) : themeId === 'recif' ? recifLayout(size) : themeId === 'espace' ? espaceLayout(size) : (THEME_LAYOUTS[themeId] && THEME_LAYOUTS[themeId][layoutKey(size, floors)]) || LAYOUTS[layoutKey(size, floors)];
    const R = rng(T.seed * 31 + key.length * 7 + (floors ? 5 : 0) + (size === 'large' ? 3 : size === 'medium' ? 2 : 1));
    const nodes = [];
    const areaIds = [];
    // Chemin libre : points de passage [x, y, z] lissés (courbe), une case tous les ~78 px, hauteur qui varie le long du chemin
    function samplePath(A) {
      const P = A.pts, closed = !!A.closed, gap = A.gap || 78, dense = [];
      const at = function (i) { return closed ? P[(i + P.length) % P.length] : P[Math.max(0, Math.min(P.length - 1, i))]; };
      const segs = closed ? P.length : P.length - 1;
      for (let i = 0; i < segs; i++) {
        const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
        for (let k = 0; k < 24; k++) {
          const t = k / 24, t2 = t * t, t3 = t2 * t;
          const cr = function (a, b, c, d) { return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); };
          dense.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), (p1[2] || 0) + ((p2[2] || 0) - (p1[2] || 0)) * t]);
        }
      }
      if (!closed) dense.push([P[P.length - 1][0], P[P.length - 1][1], P[P.length - 1][2] || 0]); else dense.push(dense[0]);
      const cum = [0]; for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
      const Ltot = cum[cum.length - 1], n = closed ? Math.max(3, Math.round(Ltot / gap)) : Math.max(2, Math.round(Ltot / gap) + 1);
      const out = []; let j = 0;
      for (let i = 0; i < n; i++) {
        const d = closed ? Ltot * i / n : Ltot * i / (n - 1);
        while (j < cum.length - 2 && cum[j + 1] < d) j++;
        const f = (d - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]), a = dense[j], b = dense[j + 1];
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
      }
      return out;
    }
    L.areas.forEach(function (A, ai) {
      const ids = [];
      if (A.pts) {
        samplePath(A).forEach(function (q) { const z = Math.round(q[2]); nodes.push({ id: nodes.length, x: Math.round(q[0]), y: Math.round(q[1]), t: 'blue', next: [], level: Math.floor((z + 1) / 60), area: ai, z: z, stairs: z % 60 !== 0 || undefined, bridge: A.bridge || undefined, when: A.when || undefined, sand: A.sand || undefined }); ids.push(nodes.length - 1); });
        ids.forEach(function (id, i) { if (i < ids.length - 1) nodes[id].next.push(ids[i + 1]); else if (A.closed) nodes[id].next.push(ids[0]); });
        areaIds.push(ids);
        return;
      }
      const NN = A.N || Math.max(6, Math.round(2 * Math.PI * Math.sqrt((A.rx * A.rx + A.ry * A.ry) / 2) * (A.shape >= 4 ? 1.12 : 1) / (A.gap || 78)));
      for (let i = 0; i < NN; i++) {
        const a = (i / NN) * Math.PI * 2 - Math.PI / 2;
        const c = Math.cos(a), s = Math.sin(a), p = A.shape || (A.level ? 2 : T.shape);
        const k = Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), -1 / p);
        const w = 1 + (A.level || A.ship ? 0 : T.wobble) * Math.sin(a * T.waves + T.seed + ai);
        nodes.push({ id: nodes.length, x: Math.round(A.cx + A.rx * c * k * w), y: Math.round(A.cy + A.ry * s * k * w), t: 'blue', next: [], level: A.level || 0, area: ai, z: (A.level || 0) * 60 + (A.zOff || 0) });
        ids.push(nodes.length - 1);
      }
      ids.forEach(function (id, i) { nodes[id].next.push(ids[(i + 1) % ids.length]); });
      areaIds.push(ids);
    });
    function path(A, B, n, bend, level, bridge, sand, when) {
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const AR = L.areas[A.area], cx = AR && AR.cx != null ? AR.cx : mx, cy = AR && AR.cy != null ? AR.cy : my;
      const px = mx + (cx - mx) * (bend || 0), py = my + (cy - my) * (bend || 0);
      let prev = A;
      for (let j = 1; j <= n; j++) {
        const t = j / (n + 1);
        const x = (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * px + t * t * B.x;
        const y = (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * py + t * t * B.y;
        const lv = level != null ? level : (t < 0.5 ? A.level : B.level);
        const nd = { id: nodes.length, x: Math.round(x), y: Math.round(y), t: 'blue', next: [], level: lv, area: A.area, branch: true, z: Math.round((A.z || 0) * (1 - t) + (B.z || 0) * t) };
        if (A.level !== B.level) nd.stairs = true;
        if (bridge) { nd.z += Math.round(Math.sin(t * Math.PI) * bridge); nd.bridge = true; }
        if (sand) nd.sand = true;
        if (when) nd.when = when; // 'nuit' : passage spectral, 'jour' : allée du jardin
        nodes.push(nd);
        prev.next.push(nd.id);
        prev = nd;
      }
      prev.next.push(B.id);
      A.fork = true; B.join = true;
    }
    const ix = function (a, v) { const ids = areaIds[a]; if (typeof v === 'string' && v[0] === '#') { const q = v.slice(1).split(',').map(Number); let best = ids[0], bd = 1e9; ids.forEach(function (id) { const d = Math.hypot(nodes[id].x - q[0], nodes[id].y - q[1]); if (d < bd) { bd = d; best = id; } }); return best; } if (v === '^') return ids[0]; if (v === '$') return ids[ids.length - 1]; if (typeof v === 'string' && v[0] === '%') return ids[Math.max(0, Math.min(ids.length - 1, Math.round(parseFloat(v.slice(1)) * ids.length)))]; if (typeof v === 'string' && v[0] === '@') { const ang = parseFloat(v.slice(1)) * Math.PI / 180; return ids[((Math.round((ang + Math.PI / 2) / (Math.PI * 2) * ids.length) % ids.length) + ids.length) % ids.length]; } return ids[v]; };
    L.areas.forEach(function (A, ai) { // chemins ouverts : on les accroche à leurs deux bouts
      if (!A.pts || A.closed) return;
      const ids = areaIds[ai];
      if (A.from) { const f = nodes[ix(A.from[0], A.from[1])]; f.next.push(ids[0]); f.fork = true; nodes[ids[0]].join = true; }
      if (A.to) { const t = nodes[ix(A.to[0], A.to[1])]; nodes[ids[ids.length - 1]].next.push(t.id); t.join = true; }
    });
    L.branches.forEach(function (b) { path(nodes[ix(b.a, b.from)], nodes[ix(b.a, b.to)], b.n, b.bend, nodes[ix(b.a, b.from)].level, b.bridge, false, b.when); });
    const lifts = [];
    const angTo = function (a, b, off) { const A = L.areas[a], B2 = L.areas[b]; return '@' + Math.round(Math.atan2((B2.cy - A.cy) / A.ry, (B2.cx - A.cx) / A.rx) * 180 / Math.PI + (off || 0)); };
    const autoA = function (v, a, b) { return typeof v === 'string' && v.indexOf('auto') === 0 ? angTo(a, b, parseFloat(v.slice(4)) || 0) : v; };
    L.links.forEach(function (l) {
      const fa = autoA(l.from[1], l.from[0], l.to[0]), ta = autoA(l.to[1], l.to[0], l.from[0]);
      const A = nodes[ix(l.from[0], fa)], B2 = nodes[ix(l.to[0], ta)];
      if (l.lift) { A.next.push(B2.id); A.fork = true; B2.join = true; A.door = (A.z || 0) < (B2.z || 0) ? 'up' : 'down'; lifts.push([A.id, B2.id]); return; } // ascenseur : un seul pas
      const n = l.n != null ? l.n : Math.max(1, Math.round(Math.hypot(B2.x - A.x, B2.y - A.y) / (l.gap || 72)) - 1);
      path(A, B2, n, l.bend || 0, undefined, l.bridge, l.sand, l.when);
    });
    (L.bridges || []).forEach(function (b) { path(nodes[ix(b.a, b.from)], nodes[ix(b.a, b.to)], b.n, 0, undefined, b.h); });
    // Embranchement : la sortie « boucle » doit rester la première option.
    // Types de cases
    const W = { blue: 47, red: 17, event: 13, item: 9, special: 9 };
    const keys = Object.keys(W), tot = keys.reduce(function (s, k) { return s + W[k]; }, 0);
    nodes.forEach(function (nd) {
      if (nd.id === 0) { nd.t = 'start'; return; }
      if (nd.fork || nd.join || nd.stairs) { nd.t = 'blue'; return; }
      let r = R() * tot;
      for (const k of keys) { r -= W[k]; if (r <= 0) { nd.t = k; break; } }
    });
    const free = function () { return nodes.filter(function (n) { return n.id > 2 && !n.fork && !n.join && !n.stairs && (n.t === 'blue' || n.t === 'red'); }); };
    const placed = [];
    const placeFar = function (type) {
      const cands = free();
      let best = null, bestD = -1;
      for (let i = 0; i < 12; i++) {
        const c = cands[Math.floor(R() * cands.length)];
        if (!c) break;
        const d = placed.length ? Math.min.apply(null, placed.map(function (p) { return Math.hypot(p.x - c.x, p.y - c.y); })) : 999;
        if (d > bestD) { bestD = d; best = c; }
      }
      if (best) { best.t = type; placed.push(best); }
      return best;
    };
    Object.keys(L.force).forEach(function (type) { for (let i = 0; i < L.force[type]; i++) placeFar(type); });
    {
      (L.tunnelPairs || []).forEach(function (tp) { const a = nodes[ix(tp[0][0], tp[0][1])], b = nodes[ix(tp[1][0], tp[1][1])]; a.t = 'tunnel'; b.t = 'tunnel'; a.pair = b.id; b.pair = a.id; });
      for (let i = 0; i < (L.tunnelPairs ? 0 : themeId === 'mine' ? L.tunnels : Math.min(2, L.tunnels)); i++) {
        const a = placeFar('tunnel'), b = placeFar('tunnel');
        if (a && b) { a.pair = b.id; b.pair = a.id; } else { if (a) a.t = 'blue'; if (b) b.t = 'blue'; }
      }
    }
    // PNJ : chaque case PNJ reçoit un personnage de la région
    (function () { const list = NPC_BY_THEME[themeId] || ['banque']; let i = 0; nodes.filter(function (n) { return n.t === 'npc'; }).forEach(function (n) { n.npc = list[i++ % list.length]; }); })();
    // Décor : emojis dispersés loin des cases
    const decor = [];
    let tries = 0;
    const want = Math.round(26 * (L.W * L.H) / (1000 * 700));
    while (decor.length < want && tries++ < 6000) {
      const x = 30 + R() * (L.W - 60), y = 30 + R() * (L.H - 60);
      if (nodes.some(function (n) { return Math.hypot(n.x - x, n.y - y) < 50; })) continue;
      if (decor.some(function (d) { return Math.hypot(d.x - x, d.y - y) < 60; })) continue;
      decor.push({ x: Math.round(x), y: Math.round(y), e: T.decor[Math.floor(R() * T.decor.length)], s: 22 + Math.round(R() * 26) });
    }
    // Plateformes d'étage
    const floorsList = L.areas.filter(function (A) { return A.level; }).map(function (A) { return { cx: A.cx, cy: A.cy, rx: A.rx + 46, ry: A.ry + 46, level: A.level }; });
    // Les cases d'escalier (à mi-hauteur) doivent être hors de la falaise, sinon elles s'enfoncent dans le mur
    nodes.forEach(function (n) {
      if (!(n.z > 0 && n.z % 60 !== 0) || n.bridge) return;
      floorsList.forEach(function (pf) {
        if (pf.level * 60 <= n.z) return; // plateforme plus basse que la case : rien à faire
        const dx = n.x - pf.cx, dy = n.y - pf.cy, q = Math.pow(dx / pf.rx, 2) + Math.pow(dy / pf.ry, 2);
        const want = n.z % 60 >= 40 ? 1.3 : 1.6;
        if (q < want) { const k = Math.sqrt(want / Math.max(q, 0.05)); n.x = Math.round(Math.max(36, Math.min(L.W - 36, pf.cx + dx * k))); n.y = Math.round(Math.max(36, Math.min(L.H - 36, pf.cy + dy * k))); }
      });
    });
    // Petits ajustements : cases jamais collées entre elles ni hors du plateau
    for (let it = 0; it < 8; it++) {
      nodes.forEach(function (a) { nodes.forEach(function (b) {
        if (a.id >= b.id || Math.abs((a.z || 0) - (b.z || 0)) >= 30) return;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        if (d >= 48) return;
        const push = (48 - d) / 2, ux = dx / d, uy = dy / d;
        const ma = a.branch ? 1 : b.branch ? 0 : 0.5, mb = 1 - ma;
        a.x -= ux * push * 2 * ma; a.y -= uy * push * 2 * ma; b.x += ux * push * 2 * mb; b.y += uy * push * 2 * mb;
      }); });
    }
    nodes.forEach(function (n) { n.x = Math.round(Math.max(34, Math.min(L.W - 34, n.x))); n.y = Math.round(Math.max(34, Math.min(L.H - 34, n.y))); });
    const B = {
      id: themeId, key: key, size: size, floors: !!floors && size !== 'small', W: L.W, H: L.H,
      name: T.name, emoji: T.emoji, desc: T.desc, bg: T.bg, path: T.path, floorColor: T.floor,
      special: T.special, warp: T.warp, countGame: T.countGame, coin: T.coin, star: T.star,
      stars: themeId === 'heroes' ? Math.max(2, L.stars) : L.stars,
      nodes: nodes, decor: decor, platforms: L.islands && themeId === 'espace' ? [] : floorsList, islands: L.islands ? L.areas.filter(function (A) { return themeId === 'espace' || !A.level; }).map(function (A) { return { cx: A.cx, cy: A.cy, rx: A.rx, ry: A.ry, level: A.level || 0 }; }) : L.islandOnly ? L.islandOnly.map(function (k) { const A = L.areas[k]; return { cx: A.cx, cy: A.cy, rx: A.rx, ry: A.ry }; }) : null, ships: L.areas.filter(function (A) { return A.ship; }).map(function (A) { return { cx: A.cx, cy: A.cy, rx: A.rx, ry: A.ry, z: A.zOff || 0 }; }), river: L.river || null, pyramid: !!L.pyramid, zones: L.zones || [], areaNames: L.areas.map(function (A) { return A.name || null; }), lifts: lifts, labels: L.labels || [], props: L.props || [], moats: L.areas.map(function (A, i) { return A.moat ? { cx: A.cx, cy: A.cy, rx: A.rx, ry: A.ry, area: i } : null; }).filter(Boolean), lakes: L.areas.map(function (A, i) { return A.lake ? { cx: A.cx, cy: A.cy, rx: A.rx, ry: A.ry, area: i } : null; }).filter(Boolean),
    };
    cache[key] = B;
    return B;
  }

  /*
   * L'univers : l'archipel de Monstralia. Chaque année, les Monstros s'affrontent dans la
   * Grande Fête des Étoiles pour décrocher le titre de Superstar. Chaque plateau est une
   * région de l'archipel, gardée par son boss.
   */
  const WORLD = {
    title: 'Monstro Party',
    tagline: 'La Grande Fête des Étoiles de Monstralia',
    bosses: {
      jurassic: { name: 'Magmator', desc: 'un T-Rex de lave qui dort dans le volcan' },
      pirate: { name: 'Capitaine Calamarde', desc: 'une pieuvre pirate à huit sabres' },
      heroes: { name: 'Docteur Chaos', desc: 'un savant fou qui vole l’électricité de la ville' },
      mine: { name: 'La Reine Taupe', desc: 'une taupe géante qui garde les cristaux' },
      atlantide: { name: 'Kraken Abyssal', desc: 'une pieuvre géante qui garde le trident' },
      espace: { name: 'Empereur Zorg', desc: 'un extraterrestre qui veut toutes les planètes d’or' },
      chevaliers: { name: 'Dragon Braise', desc: 'un dragon qui crache du feu sur les remparts' },
      polaire: { name: 'Yéti Grognon', desc: 'un yéti géant qui déteste qu’on marche sur sa glace' },
      egypte: { name: 'Pharaon Momie', desc: 'une momie réveillée qui garde la grande pyramide' },
      hante: { name: 'Comte Vampirus', desc: 'un vampire qui hante le manoir' },
      recif: { name: 'Reine Méduse', desc: 'une méduse géante qui règne sur le lagon' },
    },
  };

  // Les Monstros : dessinés par le jeu (corps, yeux, cornes, accessoire).
  const CHARACTERS = [
    { id: 'gromp', name: 'Gromp', body: 'blob', c: '#4ade80', c2: '#bbf7d0', eyes: 1, top: 'antenna', mouth: 'fangs', extra: '', lore: 'Un seul œil, un seul estomac… sans fond. Il mange les pièces quand personne ne regarde.' },
    { id: 'zazou', name: 'Zazou', body: 'round', c: '#a855f7', c2: '#e9d5ff', eyes: 2, top: 'horns', mouth: 'smile', extra: '', lore: 'Farceur officiel de Monstralia. Ses blagues font rire tout le monde sauf ses victimes.' },
    { id: 'bulle', name: 'Bulle', body: 'ghost', c: '#38bdf8', c2: '#e0f2fe', eyes: 2, top: '', mouth: 'o', extra: 'shine', lore: 'Un blob en gelée. Il pleure quand il perd… et il perd souvent. Tout le monde l’adore.' },
    { id: 'pikrok', name: 'Pikrok', body: 'rock', c: '#f97316', c2: '#fed7aa', eyes: 2, top: 'spikes', mouth: 'grin', extra: '', lore: 'Un rocher vivant né au fond de la Mine Profonde. Il ne dort jamais et creuse pour le plaisir.' },
    { id: 'fifi', name: 'Fifi Flamme', body: 'flame', c: '#fb7185', c2: '#fde68a', eyes: 2, top: '', mouth: 'smile', extra: 'blush', lore: 'Petite flamme échappée du volcan de Magmator. Attention, elle s’enflamme vite (au sens propre).' },
    { id: 'krakos', name: 'Krakos', body: 'squid', c: '#14b8a6', c2: '#99f6e4', eyes: 3, top: '', mouth: 'o', extra: 'bandana', lore: 'Neveu de la Capitaine Calamarde. Il rêve d’avoir son propre bateau, mais il a le mal de mer.' },
    { id: 'volt', name: 'Volt', body: 'round', c: '#facc15', c2: '#fef9c3', eyes: 2, top: 'bolt', mouth: 'smile', extra: 'cape', lore: 'Super-héros de Méga City. Super-pouvoir : allumer les ampoules. Il s’entraîne pour le reste.' },
    { id: 'dinomite', name: 'Dino-Mite', body: 'dino', c: '#ef4444', c2: '#fecaca', eyes: 2, top: 'spikes', mouth: 'fangs', extra: '', lore: 'Bébé dinosaure explosif. Il est petit, mais son rugissement fait trembler la Vallée.' },
    { id: 'nuage', name: 'Nuagou', body: 'cloud', c: '#e2e8f0', c2: '#ffffff', eyes: 2, top: '', mouth: 'smile', extra: 'blush', lore: 'Doux comme un oreiller. Quand il est en colère, il fait pleuvoir sur ton tour.' },
    { id: 'ombrette', name: 'Ombrette', body: 'ghost', c: '#334155', c2: '#64748b', eyes: 2, top: 'ears', mouth: 'grin', extra: 'glow', lore: 'Elle vit dans les galeries sans lumière. Ses yeux brillent : c’est tout ce qu’on voit d’elle.' },
    { id: 'moustache', name: 'Capitaine Moustache', body: 'round', c: '#b45309', c2: '#fde68a', eyes: 1, top: 'hat', mouth: 'smile', extra: 'mustache', lore: 'Ancien pirate à la retraite. Il raconte toujours la même histoire de trésor perdu.' },
    { id: 'patapouf', name: 'Patapouf', body: 'blob', c: '#f472b6', c2: '#fce7f3', eyes: 2, top: 'ears', mouth: 'o', extra: 'blush', lore: 'Une boule rose qui rebondit partout. Imbattable aux jeux de vitesse, nul en calcul.' },
  ];
  const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#ec4899', '#14b8a6'];

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = function (v) { return Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); };
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(function (v) { return ch(v).toString(16).padStart(2, '0'); }).join('');
  }

  /** Dessin SVG d'un Monstro (viewBox 100×100). */
  let svgCount = 0;
  function charSVG(ch, mood) {
    const c = ch.c, c2 = ch.c2, d = shade(c, -0.45);
    const id = 'mc' + ch.id + '_' + (++svgCount); // identifiant unique : sinon un dessin caché masque les autres
    const B = 'url(#' + id + 'b)', L = 'url(#' + id + 'l)';
    // Volume : dégradés (lumière en haut à gauche), ombre portée, reflets.
    const o = ['<defs>' +
      '<radialGradient id="' + id + 'b" cx="34%" cy="28%" r="80%"><stop offset="0" stop-color="' + shade(c, 0.55) + '"/><stop offset=".45" stop-color="' + c + '"/><stop offset="1" stop-color="' + shade(c, -0.42) + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'l" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="' + c2 + '"/><stop offset="1" stop-color="' + shade(c2, -0.25) + '"/></radialGradient>' +
      '<linearGradient id="' + id + 's" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>' +
      '<radialGradient id="' + id + 'e" cx="40%" cy="35%" r="70%"><stop offset=".6" stop-color="#fff"/><stop offset="1" stop-color="#cbd5e1"/></radialGradient>' +
      '<radialGradient id="' + id + 'g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
      '</defs>', '<ellipse cx="50" cy="95" rx="34" ry="5" fill="url(#' + id + 'g)"/>'];
    const st = 'stroke="' + d + '" stroke-width="3" stroke-linejoin="round"';
    // Cornes / oreilles / antenne (derrière le corps)
    if (ch.top === 'horns') o.push('<path d="M30 30 L22 8 L42 24 Z M70 30 L78 8 L58 24 Z" fill="' + L + '" ' + st + '/>');
    if (ch.top === 'ears') o.push('<path d="M26 34 L20 12 L42 26 Z M74 34 L80 12 L58 26 Z" fill="' + B + '" ' + st + '/>');
    if (ch.top === 'antenna') o.push('<path d="M50 26 Q46 12 54 6" fill="none" stroke="' + d + '" stroke-width="3"/><circle cx="54" cy="6" r="5" fill="' + L + '" ' + st + '/>');
    if (ch.top === 'spikes') o.push('<path d="M28 34 L34 14 L42 30 L50 10 L58 30 L66 14 L72 34 Z" fill="' + L + '" ' + st + '/>');
    if (ch.top === 'bolt') o.push('<path d="M52 2 L40 22 L50 22 L44 36 L62 16 L52 16 Z" fill="#fde047" stroke="#a16207" stroke-width="2.5" stroke-linejoin="round"/>');
    if (ch.extra === 'cape') o.push('<path d="M22 50 Q10 80 18 96 L82 96 Q90 80 78 50 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="3"/>');
    // Corps
    const bodies = {
      blob: 'M16 70 Q12 30 50 24 Q88 30 84 70 Q86 92 50 92 Q14 92 16 70 Z',
      round: 'M50 22 C80 22 88 46 88 62 C88 84 72 94 50 94 C28 94 12 84 12 62 C12 46 20 22 50 22 Z',
      ghost: 'M18 90 L18 52 Q18 20 50 20 Q82 20 82 52 L82 90 L71 82 L61 92 L50 82 L39 92 L29 82 Z',
      rock: 'M20 86 L12 58 L22 32 L46 22 L72 26 L88 50 L84 84 L56 94 Z',
      flame: 'M50 6 Q60 26 74 34 Q92 50 84 72 Q76 94 50 94 Q24 94 16 72 Q10 50 30 36 Q34 50 40 48 Q34 24 50 6 Z',
      squid: 'M22 56 Q20 18 50 18 Q80 18 78 56 L84 90 L72 78 L64 94 L56 80 L50 94 L44 80 L36 94 L28 78 L16 90 Z',
      dino: 'M20 92 Q14 60 26 44 Q30 22 52 20 Q80 20 84 44 Q90 60 84 92 Z',
      cloud: 'M24 86 Q8 84 10 66 Q8 50 24 48 Q24 26 46 28 Q58 14 74 28 Q92 30 90 50 Q98 66 86 78 Q84 92 66 88 Q50 96 36 88 Q30 90 24 86 Z',
    };
    o.push('<path d="' + bodies[ch.body] + '" fill="' + B + '" ' + st + '/>');
    o.push('<path d="' + bodies[ch.body] + '" fill="url(#' + id + 's)"/>');
    o.push('<ellipse cx="36" cy="33" rx="11" ry="6" fill="#fff" opacity=".38" transform="rotate(-25 36 33)"/>');
    // Ventre
    if (ch.body !== 'cloud' && ch.body !== 'flame') o.push('<ellipse cx="50" cy="74" rx="20" ry="14" fill="' + L + '" opacity="0.9"/>');
    if (ch.body === 'flame') o.push('<path d="M50 40 Q62 56 62 70 Q62 86 50 86 Q38 86 38 70 Q38 56 50 40 Z" fill="' + c2 + '"/>');
    if (ch.extra === 'shine') o.push('<ellipse cx="34" cy="38" rx="6" ry="10" fill="#fff" opacity="0.6" transform="rotate(25 34 38)"/>');
    // Yeux
    const eyeY = ch.body === 'flame' ? 58 : 50;
    const eyeX = ch.eyes === 1 ? [50] : ch.eyes === 2 ? [38, 62] : [34, 50, 66];
    const r = ch.eyes === 1 ? 13 : ch.eyes === 3 ? 7 : 9;
    const sad = mood === 'sad', happy = mood === 'happy';
    eyeX.forEach(function (x, i) {
      const y = ch.eyes === 3 && i === 1 ? eyeY - 8 : eyeY;
      if (happy) { o.push('<path d="M' + (x - r) + ' ' + (y + 2) + ' Q' + x + ' ' + (y - r - 2) + ' ' + (x + r) + ' ' + (y + 2) + '" fill="none" stroke="#111" stroke-width="3.5" stroke-linecap="round"/>'); return; }
      const glow = ch.extra === 'glow';
      o.push('<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + (glow ? '#fef08a' : 'url(#' + id + 'e)') + '" stroke="#111" stroke-width="2"/>');
      o.push('<circle cx="' + (x + 1.5) + '" cy="' + (y + (sad ? 3 : 1.5)) + '" r="' + (r * 0.5) + '" fill="#111"/>');
      o.push('<circle cx="' + (x + 3) + '" cy="' + (y - 1.5) + '" r="' + (r * 0.22) + '" fill="#fff"/><circle cx="' + (x - 1) + '" cy="' + (y + 3) + '" r="' + (r * 0.1) + '" fill="#fff" opacity=".8"/>');
      if (sad) o.push('<path d="M' + (x - r) + ' ' + (y - r - 4) + ' L' + (x + r) + ' ' + (y - r + (i ? -2 : 2)) + '" stroke="#111" stroke-width="3" stroke-linecap="round"/>');
    });
    if (ch.extra === 'bandana') o.push('<path d="M22 34 Q50 22 78 34 L78 42 Q50 30 22 42 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/><circle cx="30" cy="38" r="2" fill="#fff"/><circle cx="50" cy="33" r="2" fill="#fff"/><circle cx="70" cy="38" r="2" fill="#fff"/>');
    if (ch.top === 'hat') o.push('<path d="M20 30 Q50 4 80 30 Q50 22 20 30 Z" fill="#1f2937" stroke="#000" stroke-width="2"/><path d="M44 16 L50 22 L56 16 M44 22 L56 16" stroke="#fff" stroke-width="2"/>');
    if (ch.extra === 'blush') o.push('<ellipse cx="28" cy="62" rx="6" ry="3.5" fill="#f43f5e" opacity="0.45"/><ellipse cx="72" cy="62" rx="6" ry="3.5" fill="#f43f5e" opacity="0.45"/>');
    // Bouche
    const my = eyeY + 18;
    if (sad) o.push('<path d="M40 ' + (my + 4) + ' Q50 ' + (my - 4) + ' 60 ' + (my + 4) + '" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round"/>');
    else if (ch.mouth === 'smile' || happy) o.push('<path d="M38 ' + my + ' Q50 ' + (my + 12) + ' 62 ' + my + ' Z" fill="#7f1d1d" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>');
    else if (ch.mouth === 'fangs') o.push('<path d="M36 ' + my + ' Q50 ' + (my + 10) + ' 64 ' + my + '" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round"/><path d="M41 ' + (my + 2) + ' L44 ' + (my + 9) + ' L47 ' + (my + 4) + ' Z M53 ' + (my + 4) + ' L56 ' + (my + 9) + ' L59 ' + (my + 2) + ' Z" fill="#fff" stroke="#111" stroke-width="1.5"/>');
    else if (ch.mouth === 'o') o.push('<ellipse cx="50" cy="' + (my + 2) + '" rx="5" ry="6" fill="#7f1d1d" stroke="#111" stroke-width="2.5"/>');
    else o.push('<path d="M36 ' + my + ' L64 ' + my + ' Q50 ' + (my + 10) + ' 36 ' + my + ' Z" fill="#fff" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/><path d="M43 ' + my + ' V' + (my + 5) + ' M50 ' + my + ' V' + (my + 7) + ' M57 ' + my + ' V' + (my + 5) + '" stroke="#111" stroke-width="1.5"/>');
    if (ch.extra === 'mustache') o.push('<path d="M50 ' + (my - 3) + ' Q38 ' + (my - 10) + ' 28 ' + (my + 2) + ' Q38 ' + (my - 2) + ' 50 ' + (my + 1) + ' Q62 ' + (my - 2) + ' 72 ' + (my + 2) + ' Q62 ' + (my - 10) + ' 50 ' + (my - 3) + ' Z" fill="#3f2a14"/>');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + o.join('') + '</svg>';
  }


  /* ---------------- Cartes à collectionner (boosters) ---------------- */
  // Communes : pour la collection, sans effet. Rares, épiques, légendaires : un bonus immédiat.
  const RARITY = {
    maudite: { name: 'Maudite', color: '#ef4444', weight: 5 },
    commune: { name: 'Commune', color: '#94a3b8', weight: 57 },
    rare: { name: 'Rare', color: '#38bdf8', weight: 25 },
    epique: { name: 'Épique', color: '#c084fc', weight: 10 },
    legendaire: { name: 'Légendaire', color: '#fbbf24', weight: 3 },
  };
  const CARDS = {};
  CHARACTERS.forEach(function (c) { CARDS['m_' + c.id] = { name: c.name, char: c.id, rarity: 'commune', desc: c.lore }; });
  [['b_magmator', '🌋', 'Magmator', 'Le T-Rex de lave qui dort sous la Vallée Jurassique.'],
   ['b_calamarde', '🐙', 'Capitaine Calamarde', 'Huit bras, huit sabres, zéro pitié.'],
   ['b_chaos', '🧪', 'Docteur Chaos', 'Il vole l’électricité de Méga City pour ses inventions.'],
   ['b_taupe', '👑', 'La Reine Taupe', 'Elle garde les cristaux de la Mine Profonde.'],
   ['l_vallee', '🦖', 'La Vallée Jurassique', 'Fougères géantes et œufs dorés.'],
   ['l_ile', '🏝️', 'L’Île aux Pirates', 'On dit qu’une perle noire dort dans le lagon.'],
   ['l_ville', '🏙️', 'Méga City', 'La ville qui ne dort jamais (sauf pendant les pannes).'],
   ['l_mine', '⛏️', 'La Mine Profonde', 'Plus on descend, plus ça brille.'],
   ['l_atlantide', '🏛️', 'La Cité d’Atlantide', 'Engloutie depuis 10 000 ans, toujours aussi chic.'],
   ['b_kraken', '🐙', 'Kraken Abyssal', 'Huit bras, zéro câlin.'],
   ['c_sirene', '🧜', 'Sirène', 'Sa chanson fait danser les poissons.'],
   ['c_hippocampe', '🌊', 'Hippocampe', 'Le cheval le plus lent… et le plus mignon.'],
   ['c_tortue', '🐢', 'Tortue géante', 'Elle a vu couler la cité.'],
   ['l_espace', '🌌', 'La Station Spatiale', 'Ici, personne ne t’entend tomber.'],
   ['b_zorg', '👽', 'Empereur Zorg', 'Il a trois yeux et zéro patience.'],
   ['c_astronaute', '🧑‍🚀', 'Astronaute', 'Premier Monstro à marcher sur un astéroïde.'],
   ['c_fusee', '🚀', 'Fusée', '3… 2… 1… Décollage !'],
   ['c_alien', '🛸', 'Soucoupe volante', 'Elle cherche des vaches, mais il n’y en a pas.'],
   ['l_chateau', '🏰', 'Le Château', 'Ses douves cachent un crocodile timide.'],
   ['b_dragon', '🐉', 'Dragon Braise', 'Il fait griller les guimauves… et les chevaliers.'],
   ['c_chevalier', '🛡️', 'Chevalier', 'Toujours une armure bien cirée.'],
   ['c_cheval', '🐴', 'Cheval royal', 'Il galope plus vite qu’un dé à 10 faces.'],
   ['c_forgeron', '⚒️', 'Forgeron', 'Il forge des épées et des fers à cheval.'],
   ['l_polaire', '🏔️', 'Le Pôle Nord', 'Là où la glace chante sous les aurores.'],
   ['b_yeti', '🦍', 'Yéti Grognon', 'Il éternue des avalanches.'],
   ['c_pingouin', '🐧', 'Pingouin glisseur', 'Champion de toboggan sur le ventre.'],
   ['c_ours', '🐻‍❄️', 'Ours polaire', 'Gros câlin, griffes froides.'],
   ['c_traineau', '🛷', 'Traîneau à chiens', 'Six huskies, zéro frein.'],
   ['l_egypte', '🏜️', 'Le Désert d’Égypte', 'Le Nil coule entre les pyramides.'],
   ['b_momie', '🧟', 'Pharaon Momie', 'Ses bandelettes cachent mille malédictions.'],
   ['c_sphinx', '🦁', 'Le Sphinx', 'Il pose des énigmes à ceux qui passent.'],
   ['c_scarabee', '🪲', 'Scarabée sacré', 'Il roule sa boule de sable depuis mille ans.'],
   ['c_chameau', '🐪', 'Chameau-taxi', 'Il ne boit qu’une fois par semaine.'],
   ['l_manoir', '🏚️', 'Le Manoir Hanté', 'Ses chemins changent quand la nuit tombe.'],
   ['b_vampire', '🧛', 'Comte Vampirus', 'Il ne sort que la nuit… sauf quand il a faim.'],
   ['c_fantome', '👻', 'Esprit farceur', 'Pour quelques pièces, il vole n’importe qui.'],
   ['c_citrouille', '🎃', 'Citrouille rieuse', 'Elle ricane quand tu tombes sur une case rouge.'],
   ['c_corbeau', '🐦‍⬛', 'Corbeau du clocher', 'Il voit tout depuis le toit du manoir.'],
   ['l_recif', '🏝️', 'Le Récif aux 8 Îlots', 'Huit îlots, des ponts de corde et un lagon turquoise.'],
   ['b_meduse', '🪼', 'Reine Méduse', 'Elle règne sur le lagon et pique les imprudents.'],
   ['c_tortue', '🐢', 'Tortue-taxi', 'La plus lente des taxis, mais la plus sûre.'],
   ['c_crabe', '🦀', 'Crabe ermite', 'Il change de coquille plus souvent que de chemin.'],
   ['c_dauphin', '🐬', 'Dauphin farceur', 'Il éclabousse tous ceux qui passent sur les ponts.'],
  ].forEach(function (c) { CARDS[c[0]] = { icon: c[1], name: c[2], rarity: 'commune', desc: c[3] }; });
  Object.assign(CARDS, {
    r_bourse: { icon: '👛', name: 'Petite bourse', rarity: 'rare', desc: '+5 pièces.', fx: 'coins5' },
    r_trouvaille: { icon: '🔍', name: 'Trouvaille', rarity: 'rare', desc: 'Un objet au hasard.', fx: 'item' },
    r_elan: { icon: '👟', name: 'Élan', rarity: 'rare', desc: '+2 à ton prochain lancer de dé.', fx: 'dice2' },
    r_assurance: { icon: '🛡️', name: 'Assurance', rarity: 'rare', desc: 'Un bouclier contre ta prochaine perte.', fx: 'shield' },
    r_de_petit: { icon: '🔹', name: 'Petit dé', rarity: 'rare', desc: 'Tu reçois le Petit dé (1 à 3).', fx: 'die:petit' },
    r_de_mini: { icon: '🔸', name: 'Mini dé', rarity: 'rare', desc: 'Tu reçois le Mini dé (1 ou 2).', fx: 'die:mini' },
    r_de_deux: { icon: '🎲', name: 'Deuxième dé', rarity: 'rare', desc: 'Tu reçois un deuxième dé de 6 pour un lancer.', fx: 'die:deux' },
    e_bourse: { icon: '💰', name: 'Grosse bourse', rarity: 'epique', desc: '+12 pièces.', fx: 'coins12' },
    e_ami: { icon: '🐾', name: 'Ami fidèle', rarity: 'epique', desc: 'Un compagnon au hasard te rejoint.', fx: 'companion' },
    e_turbo: { icon: '🚀', name: 'Turbo', rarity: 'epique', desc: '+5 à ton prochain lancer de dé.', fx: 'dice5' },
    e_raton: { icon: '🦝', name: 'Raton voleur', rarity: 'epique', desc: 'Vole 6 pièces au joueur en tête.', fx: 'steal' },
    x_poche: { icon: '🕳️', name: 'Poche trouée', rarity: 'maudite', desc: 'Tu perds 5 pièces.', fx: 'lose5' },
    x_escargot: { icon: '🐌', name: 'Escargot', rarity: 'maudite', desc: '−2 à ton prochain lancer de dé.', fx: 'slow2' },
    x_taxe: { icon: '💸', name: 'Taxe du boss', rarity: 'maudite', desc: 'Tu donnes 5 pièces au dernier du classement.', fx: 'tax5' },
    g_etoile: { icon: '🌠', name: 'Étoile filante', rarity: 'legendaire', desc: '+1 étoile !', fx: 'star' },
    g_jackpot: { icon: '🏆', name: 'Trésor de Monstralia', rarity: 'legendaire', desc: '+25 pièces.', fx: 'coins25' },
  });

  /* Familles de cartes : 3 cartes d'une famille = petit bonus, les 5 = bonus doublé + 10 pièces.
     Une famille par région : chaque nouvelle carte (plateau) ajoutera sa propre famille ici. */
  const FAMILIES = {
    jurassique: { icon: '🦖', name: 'Famille Jurassique', cards: ['l_vallee', 'b_magmator', 'm_dinomite', 'm_gromp', 'm_fifi'], bonus: ['+1 pièce sur chaque case bleue', '+2 pièces sur chaque case bleue'] },
    pirate: { icon: '🏴‍☠️', name: 'Famille Pirate', cards: ['l_ile', 'b_calamarde', 'm_krakos', 'm_moustache', 'm_bulle'], bonus: ['−1 pièce sur chaque achat en boutique', '−2 pièces sur chaque achat en boutique'] },
    ville: { icon: '🏙️', name: 'Famille Méga City', cards: ['l_ville', 'b_chaos', 'm_volt', 'm_zazou', 'm_nuage'], bonus: ['+1 pièce à chaque mini-jeu', '+2 pièces à chaque mini-jeu'] },
    atlantide: { icon: '🔱', name: 'Famille Atlantide', cards: ['l_atlantide', 'b_kraken', 'c_sirene', 'c_hippocampe', 'c_tortue'], bonus: ['+1 pièce au début de chacun de tes tours', '+3 pièces au début de chacun de tes tours'] },
    espace: { icon: '🚀', name: 'Famille Cosmos', cards: ['l_espace', 'b_zorg', 'c_astronaute', 'c_fusee', 'c_alien'], bonus: ['+1 pièce pour chaque joueur que tu dépasses', '+2 pièces pour chaque joueur que tu dépasses'] },
    chevaliers: { icon: '🏰', name: 'Famille Chevaliers', cards: ['l_chateau', 'b_dragon', 'c_chevalier', 'c_cheval', 'c_forgeron'], bonus: ['+5 pièces à chaque étoile achetée', '+10 pièces à chaque étoile achetée'] },
    polaire: { icon: '🐧', name: 'Famille Banquise', cards: ['l_polaire', 'b_yeti', 'c_pingouin', 'c_ours', 'c_traineau'], bonus: ['+1 pièce par case parcourue sur le lac gelé', '+2 pièces par case parcourue sur le lac gelé'] },
    egypte: { icon: '🐪', name: 'Famille Égypte', cards: ['l_egypte', 'b_momie', 'c_sphinx', 'c_scarabee', 'c_chameau'], bonus: ['+3 pièces à chaque mini-jeu gagné', '+6 pièces à chaque mini-jeu gagné'] },
    hante: { icon: '🏚️', name: 'Famille Manoir', cards: ['l_manoir', 'b_vampire', 'c_fantome', 'c_citrouille', 'c_corbeau'], bonus: ['La Banque ne te prend rien quand tu passes devant', 'La Banque te donne même 2 pièces quand tu passes'] },
    recif: { icon: '🐠', name: 'Famille Récif', cards: ['l_recif', 'b_meduse', 'c_tortue', 'c_crabe', 'c_dauphin'], bonus: ['+2 pièces à chaque transport (tortue, barque, métro…)', '+4 pièces à chaque transport'] },
    mine: { icon: '⛏️', name: 'Famille Mine', cards: ['l_mine', 'b_taupe', 'm_pikrok', 'm_ombrette', 'm_patapouf'], bonus: ['−1 pièce perdue sur les cases rouges', '−2 pièces perdues sur les cases rouges'] },
  };
  Object.keys(FAMILIES).forEach(function (f) { FAMILIES[f].cards.forEach(function (id) { CARDS[id].fam = f; }); });
  /* Cycle jour / nuit : 6 tours = jour, jour, crépuscule, nuit, nuit, aube */
  function levisOpen(turn) { return Math.max(1, turn) % 2 === 1; }
  function whenOpenAt(w, turn, phase) { return w === 'levis' || w === 'feuA' ? levisOpen(turn) : w === 'feuB' ? !levisOpen(turn) : w === phase; } // pont-levis baissé les tours impairs
  function dayPhase(turn, theme) { if (theme === 'mine' || theme === 'espace') return 'jour'; if (theme === 'hante') return Math.floor((Math.max(1, turn) - 1) / 4) % 2 ? 'nuit' : 'jour'; return ['jour', 'jour', 'crépuscule', 'nuit', 'nuit', 'aube'][((Math.max(1, turn) - 1) % 6)]; }
  function famLevel(cards, f) { const own = new Set(cards || []); const n = FAMILIES[f].cards.filter(function (id) { return own.has(id); }).length; return n >= 5 ? 2 : n >= 3 ? 1 : 0; }

  /* Personnages non joueurs (PNJ), comme dans Mario Party */
  const NPCS = {
    banque: { icon: '🏦', name: 'la Banque de Gobelin', desc: 'Chaque joueur qui passe devant dépose 3 pièces. Celui qui s’arrête dessus rafle tout le coffre !' },
    esprit: { icon: '👻', name: 'l’Esprit farceur', desc: 'Pour 10 pièces il vole 5 à 15 pièces à qui tu veux, pour 35 pièces il vole une étoile.' },
    voyante: { icon: '🔮', name: 'Madame Brume', desc: 'Pour 5 pièces, elle lit ton avenir : objet rare, pièces, étoile déplacée près de toi… ou rien du tout.' },
  };
  // Quels PNJ sur chaque région, et quand ils sont là (Manoir : certains seulement le jour ou la nuit)
  const NPC_BY_THEME = { atlantide: ['banque', 'esprit'], espace: ['banque', 'voyante'], chevaliers: ['banque', 'voyante'], polaire: ['banque', 'esprit'], egypte: ['banque', 'voyante'], jurassic: ['banque', 'voyante'], pirate: ['banque', 'esprit'], heroes: ['banque', 'voyante'], mine: ['banque', 'esprit'], recif: ['banque', 'voyante'], hante: ['banque', 'esprit', 'voyante'] };
  const NPC_WHEN = { hante: { esprit: 'nuit', voyante: 'jour' } };

  /* ---------------- Données de jeu ---------------- */
  const GAME = {
    // Dés proposés à chaque tour
    dice: {
      // Tout le monde a le dé classique. Les autres s'achètent en boutique ou se trouvent dans les boosters (un seul à la fois).
      classique: { label: 'Dé classique', desc: '1 à 6', icon: '🎲', faces: [1, 2, 3, 4, 5, 6] },
      deux: { label: 'Deuxième dé', desc: '2 dés de 6 (2 à 12), pour un seul lancer', icon: '🎲🎲', faces: [1, 2, 3, 4, 5, 6], count: 2, price: 6, uses: 1 },
      petit: { label: 'Petit dé', desc: '1 à 3, pour viser une case précise', icon: '🔹', faces: [1, 2, 3], price: 4 },
      mini: { label: 'Mini dé', desc: '1 ou 2, pour avancer tout doucement', icon: '🔸', faces: [1, 2], price: 3 },
    },
    // Objets : 3 maximum dans le sac
    items: {
      double: { icon: '🎲', name: 'Double dé', price: 5, desc: 'Lance 2 dés classiques et additionne.' },
      triple: { icon: '🎰', name: 'Triple dé', price: 10, desc: 'Lance 3 dés classiques et additionne.' },
      pipe: { icon: '🎯', name: 'Dé pipé', price: 8, desc: 'Choisis ton résultat de 1 à 6.' },
      grappin: { icon: '🪝', name: 'Grappin', price: 6, desc: 'Vole 5 à 15 pièces à un joueur.' },
      echange: { icon: '🔄', name: 'Échangeur', price: 8, desc: 'Échange ta place avec un joueur.' },
      bouclier: { icon: '🛡️', name: 'Bouclier', price: 5, desc: 'Annule ta prochaine perte (pièces ou étoile).' },
      piege: { icon: '🪤', name: 'Piège', price: 5, desc: 'Pose un piège sur ta case : qui s’y arrête te donne 10 pièces.' },
      sablier: { icon: '⏳', name: 'Sablier', price: 6, desc: 'Tu joueras en premier dès le prochain tour.' },
      tuyau: { icon: '🟡', name: 'Tuyau d’or', price: 32, desc: 'Te transporte directement sur l’étoile : achète-la et ton tour s’arrête.' },
      boussole: { icon: '🧭', name: 'Boussole d’étoile', price: 15, desc: 'Téléporte-toi juste avant l’étoile.' },
      fantome: { icon: '👻', name: 'Fantôme voleur', price: 40, desc: 'Vole une étoile à un joueur.' },
      mystere: { icon: '🎁', name: 'Boîte mystère', price: 4, desc: 'Se transforme en un objet au hasard.' },
      ticket: { icon: '🎟️', name: 'Ticket à gratter', price: 8, desc: 'Gratte-le : de 0 à 30 pièces !' },
    },
    // Compagnons : un seul à la fois, à adopter sur les nids
    companions: {
      piou: { icon: '🐣', name: 'Piou', desc: '+1 à chaque lancer de dé.' },
      chauvy: { icon: '🦇', name: 'Chauvy', desc: 'Vole 1 pièce à chaque joueur que tu croises.' },
      tortulle: { icon: '🐢', name: 'Tortulle', desc: 'Protège tes étoiles : personne ne peut te les voler.' },
      rouxi: { icon: '🦊', name: 'Rouxi', desc: '+2 pièces sur les cases bleues.' },
      bzz: { icon: '🐝', name: 'Bzz', desc: '+3 pièces à chaque mini-jeu.' },
      draki: { icon: '🐉', name: 'Draki', desc: '1 chance sur 4 de relancer un dé bonus.' },
      hibou: { icon: '🦉', name: 'Hibou', desc: 'L’étoile te coûte 5 pièces de moins.' },
      poulpi: { icon: '🐙', name: 'Poulpi', desc: 'Te trouve un objet gratuit tous les 3 tours.' },
    },
    // Pouvoirs spéciaux (option de partie, indépendants du Monstro)
    powers: {
      banquier: { icon: '💰', name: 'Banquier', desc: '+2 pièces au début de chacun de tes tours.' },
      chanceux: { icon: '🍀', name: 'Chanceux', desc: 'Ton dé ne fait jamais moins de 3.' },
      blinde: { icon: '🦾', name: 'Blindé', desc: 'Tu ne perds que la moitié des pièces.' },
      pickpocket: { icon: '🧤', name: 'Pickpocket', desc: 'Vole 2 pièces à chaque joueur que tu dépasses.' },
      negociateur: { icon: '🤝', name: 'Négociateur', desc: 'Boutique et nids 30 % moins chers.' },
      astronome: { icon: '🔭', name: 'Astronome', desc: 'L’étoile te coûte 5 pièces de moins.' },
      collectionneur: { icon: '🎒', name: 'Collectionneur', desc: 'Ton sac contient 4 objets au lieu de 3.' },
      champion: { icon: '🏆', name: 'Champion', desc: '+3 pièces à chaque mini-jeu gagné.' },
      dresseur: { icon: '🪺', name: 'Dresseur', desc: 'Tu commences avec un compagnon.' },
      revanchard: { icon: '💢', name: 'Revanchard', desc: 'Dernier au classement : un dé bonus de 1 à 6.' },
    },
    // Casino
    casino: {
      slots: { icon: '🎰', name: 'Machine à sous', desc: '3 identiques : ×5 (777 : ×10) · 2 identiques : ×2' },
      roulette: { icon: '🎡', name: 'Roulette', desc: 'Rouge ou noir : ×2 · Vert : ×14' },
      pile: { icon: '🪙', name: 'Pile ou face', desc: 'Bonne réponse : ×2' },
    },
    slotSymbols: ['🍒', '🍋', '🔔', '💎', '7️⃣'],
    booster: { icon: '🃏', name: 'Booster', price: 6, desc: '3 cartes : collection ou bonus (rare, épique, légendaire).' },
    // Étoiles bonus de la remise des prix (3 tirées au hasard à chaque partie)
    awards: {
      voyageur: { icon: '🥾', name: 'Grand voyageur', desc: 'le plus de cases parcourues', stat: 'steps', dir: 1 },
      escargot: { icon: '🐌', name: 'Escargot', desc: 'le moins de cases parcourues', stat: 'steps', dir: -1 },
      minijeux: { icon: '🎮', name: 'Roi des mini-jeux', desc: 'le plus de mini-jeux gagnés', stat: 'mgWins', dir: 1 },
      shopping: { icon: '🛍️', name: 'Accro du shopping', desc: 'le plus dépensé en boutique', stat: 'shopSpent', dir: 1 },
      objets: { icon: '🎒', name: 'Bricoleur', desc: 'le plus d’objets utilisés', stat: 'itemsUsed', dir: 1 },
      embrouilles: { icon: '❓', name: 'Aimant à embrouilles', desc: 'le plus de cases événement', stat: 'events', dir: 1 },
      dresseur: { icon: '🐾', name: 'Ami des bêtes', desc: 'le plus de compagnons adoptés', stat: 'companions', dir: 1 },
      malchance: { icon: '🌧️', name: 'Pas de chance', desc: 'le plus de cases rouges', stat: 'red', dir: 1 },
      riche: { icon: '💰', name: 'Gros magot', desc: 'le plus de pièces gagnées au total', stat: 'earned', dir: 1 },
      bleu: { icon: '🔵', name: 'Fan de bleu', desc: 'le plus de cases bleues', stat: 'blue', dir: 1 },
      flambeur: { icon: '🎰', name: 'Flambeur', desc: 'le plus misé au casino et aux paris', stat: 'wagered', dir: 1 },
      cartes: { icon: '🃏', name: 'Collectionneur', desc: 'le plus de cartes différentes', stat: 'cards', dir: 1 },
      veinard: { icon: '🤑', name: 'Veinard', desc: 'le plus gagné au jeu', stat: 'gambleWon', dir: 1 },
    },
  };

  const api = { NPCS: NPCS, NPC_BY_THEME: NPC_BY_THEME, NPC_WHEN: NPC_WHEN, CARDS: CARDS, RARITY: RARITY, FAMILIES: FAMILIES, famLevel: famLevel, dayPhase: dayPhase, levisOpen: levisOpen, whenOpenAt: whenOpenAt, THEMES: THEMES, makeBoard: makeBoard, CHARACTERS: CHARACTERS, COLORS: COLORS, WORLD: WORLD, charSVG: charSVG, GAME: GAME };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PARTY = api;
})(this);
