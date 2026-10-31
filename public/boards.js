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
      id: 'jurassic', name: 'Vallée Jurassique', emoji: '🦖', seed: 7, wobble: 0.08, waves: 3, shape: 2,
      desc: 'Volcans, fougères géantes et dinosaures affamés.',
      bg: ['#2f5d34', '#7a9b3f'], path: '#d9c38a', floor: '#8b6b3e',
      decor: ['🌴', '🌿', '🦴', '🥚', '🌋', '🦕', '🍃', '🪨'],
      coin: { name: 'os', one: 'os', icon: '🦴' }, star: { name: 'Œuf d’or', a: 'un Œuf d’or', icon: '🥚', rule: 'L’Œuf d’or coûte 20 os.' },
      special: { icon: '🌋', name: 'Éruption', desc: 'Magmator crache de la lave : tous les autres perdent 5 os.' },
      countGame: { target: '🦖', others: ['🦕', '🌴', '🥚', '🦴'] },
    },
    pirate: {
      id: 'pirate', name: 'Île aux Pirates', emoji: '🏴‍☠️', seed: 21, wobble: 0.12, waves: 4, shape: 2.3,
      desc: 'Trésors, canons et ponts de corde au-dessus des requins.',
      bg: ['#0e5a8a', '#1fa2c7'], path: '#f2d49b', floor: '#7c4a1e',
      decor: ['🌊', '🦈', '⚓', '🏝️', '🐚', '🦜', '⛵', '🐠'],
      coin: { name: 'doublons', one: 'doublon', icon: '🪙' }, star: { name: 'Perle', a: 'une Perle', icon: '🦪', rule: 'Le prix de la Perle change à chaque fois (10 à 30 doublons).' },
      special: { icon: '💣', name: 'Canon', desc: 'Boum ! Le canon de Calamarde t’envoie sur une case au hasard.' },
      countGame: { target: '🦜', others: ['💰', '🏴‍☠️', '⚓', '🐚'] },
    },
    heroes: {
      id: 'heroes', name: 'Méga City', emoji: '🦸', seed: 42, wobble: 0, waves: 3, shape: 6,
      desc: 'Une ville de super-héros : gratte-ciel, éclairs et super-vitesse.',
      bg: ['#24135f', '#6d28d9'], path: '#fde68a', floor: '#334155',
      decor: ['🏙️', '🏢', '⚡', '🚁', '🌃', '💥', '🛸', '🚓'],
      coin: { name: 'crédits', one: 'crédit', icon: '💠' }, star: { name: 'Médaille', a: 'une Médaille', icon: '🏅', rule: 'Deux Médailles à 20 crédits sont cachées en ville.' },
      special: { icon: '⚡', name: 'Super-vitesse', desc: 'Tu fonces juste avant une Médaille !' },
      countGame: { target: '🦸', others: ['⚡', '🏙️', '💥', '🦹'] },
    },
    mine: {
      id: 'mine', name: 'Mine Profonde', emoji: '⛏️', seed: 99, wobble: 0.1, waves: 5, shape: 2.6,
      desc: 'Galeries sombres, wagons, cristaux… et passages secrets.',
      bg: ['#1c1917', '#57534e'], path: '#a8a29e', floor: '#44403c',
      decor: ['⛏️', '💎', '🪨', '🔦', '🕯️', '🪵', '💰', '🦇'],
      coin: { name: 'pépites', one: 'pépite', icon: '🔶' }, star: { name: 'Cristal', a: 'un Cristal', icon: '💎', rule: 'Le Cristal coûte 20 pépites. Une fois sur quatre, c’est un Cristal géant qui en vaut deux !' },
      special: { icon: '🪨', name: 'Éboulement', desc: 'La Reine Taupe secoue la galerie : tu perds 8 pépites.' },
      countGame: { target: '💎', others: ['🪨', '⛏️', '🔦', '🦇'] },
    },
  };

  /* ---------------- Formes : petit, moyen, grand, avec ou sans étage ---------------- */
  // areas : boucles (centre, rayons, nombre de cases, étage) ; branches : raccourcis ; links : passages d'une boucle à l'autre.
  const LAYOUTS = {
    small: { W: 1000, H: 700, areas: [{ cx: 500, cy: 350, rx: 410, ry: 260, N: 26 }], branches: [{ a: 0, from: 3, to: 11, n: 4, bend: 0.5 }], links: [],
      force: { shop: 1, nest: 1, chance: 1, chaos: 1, casino: 1, trade: 1 }, tunnels: 2, stars: 1 },
    medium: { W: 1200, H: 840, areas: [{ cx: 600, cy: 420, rx: 530, ry: 345, N: 40 }], branches: [{ a: 0, from: 3, to: 13, n: 5, bend: 0.45 }, { a: 0, from: 23, to: 33, n: 5, bend: 0.45 }], links: [],
      force: { shop: 2, nest: 1, chance: 2, chaos: 1, casino: 2, trade: 2 }, tunnels: 3, stars: 1 },
    mediumF: { W: 1200, H: 840, areas: [{ cx: 600, cy: 420, rx: 540, ry: 355, N: 36 }, { cx: 600, cy: 410, rx: 260, ry: 155, N: 16, level: 1 }], branches: [],
      links: [{ from: [0, 5], to: [1, 2], n: 2 }, { from: [1, 10], to: [0, 22], n: 2 }],
      force: { shop: 2, nest: 1, chance: 2, chaos: 1, casino: 2, trade: 2 }, tunnels: 3, stars: 1 },
    large: { W: 1600, H: 1120, areas: [{ cx: 380, cy: 560, rx: 300, ry: 460, N: 32 }, { cx: 1220, cy: 560, rx: 300, ry: 460, N: 32 }],
      branches: [{ a: 0, from: 15, to: 27, n: 5, bend: 0.5 }, { a: 1, from: 2, to: 13, n: 5, bend: 0.5 }],
      links: [{ from: [0, 6], to: [1, 26], n: 3 }, { from: [1, 22], to: [0, 10], n: 3 }],
      force: { shop: 3, nest: 2, chance: 2, chaos: 2, casino: 3, trade: 2 }, tunnels: 4, stars: 2 },
    largeF: { W: 1600, H: 1120, areas: [{ cx: 380, cy: 690, rx: 300, ry: 380, N: 30 }, { cx: 1220, cy: 690, rx: 300, ry: 380, N: 30 }, { cx: 800, cy: 150, rx: 230, ry: 92, N: 14, level: 1 }],
      branches: [{ a: 0, from: 14, to: 25, n: 5, bend: 0.5 }, { a: 1, from: 5, to: 15, n: 5, bend: 0.5 }],
      links: [{ from: [0, 7], to: [1, 23], n: 3 }, { from: [1, 21], to: [0, 9], n: 3 }, { from: [0, 3], to: [2, 11], n: 1 }, { from: [2, 3], to: [1, 27], n: 1 }],
      force: { shop: 3, nest: 2, chance: 2, chaos: 2, casino: 3, trade: 2 }, tunnels: 4, stars: 2 },
  };

  function layoutKey(size, floors) {
    if (size === 'small') return 'small';
    return size + (floors ? 'F' : '');
  }

  const cache = {};
  function makeBoard(themeId, size, floors) {
    const key = themeId + ':' + layoutKey(size, floors);
    if (cache[key]) return cache[key];
    const T = THEMES[themeId], L = LAYOUTS[layoutKey(size, floors)];
    const R = rng(T.seed * 31 + key.length * 7 + (floors ? 5 : 0) + (size === 'large' ? 3 : size === 'medium' ? 2 : 1));
    const nodes = [];
    const areaIds = [];
    L.areas.forEach(function (A, ai) {
      const ids = [];
      for (let i = 0; i < A.N; i++) {
        const a = (i / A.N) * Math.PI * 2 - Math.PI / 2;
        const c = Math.cos(a), s = Math.sin(a), p = A.level ? 2 : T.shape;
        const k = Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), -1 / p);
        const w = 1 + (A.level ? 0 : T.wobble) * Math.sin(a * T.waves + T.seed + ai);
        nodes.push({ id: nodes.length, x: Math.round(A.cx + A.rx * c * k * w), y: Math.round(A.cy + A.ry * s * k * w), t: 'blue', next: [], level: A.level || 0, area: ai, z: (A.level || 0) * 60 });
        ids.push(nodes.length - 1);
      }
      ids.forEach(function (id, i) { nodes[id].next.push(ids[(i + 1) % ids.length]); });
      areaIds.push(ids);
    });
    function path(A, B, n, bend, level) {
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const cx = L.areas[A.area] ? L.areas[A.area].cx : mx, cy = L.areas[A.area] ? L.areas[A.area].cy : my;
      const px = mx + (cx - mx) * (bend || 0), py = my + (cy - my) * (bend || 0);
      let prev = A;
      for (let j = 1; j <= n; j++) {
        const t = j / (n + 1);
        const x = (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * px + t * t * B.x;
        const y = (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * py + t * t * B.y;
        const lv = level != null ? level : (t < 0.5 ? A.level : B.level);
        const nd = { id: nodes.length, x: Math.round(x), y: Math.round(y), t: 'blue', next: [], level: lv, area: A.area, branch: true, z: Math.round(((A.level || 0) * (1 - t) + (B.level || 0) * t) * 60) };
        if (A.level !== B.level) nd.stairs = true;
        nodes.push(nd);
        prev.next.push(nd.id);
        prev = nd;
      }
      prev.next.push(B.id);
      A.fork = true; B.join = true;
    }
    L.branches.forEach(function (b) { path(nodes[areaIds[b.a][b.from]], nodes[areaIds[b.a][b.to]], b.n, b.bend, nodes[areaIds[b.a][b.from]].level); });
    L.links.forEach(function (l) { path(nodes[areaIds[l.from[0]][l.from[1]]], nodes[areaIds[l.to[0]][l.to[1]]], l.n, 0); });
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
    if (themeId === 'mine') {
      for (let i = 0; i < L.tunnels; i++) {
        const a = placeFar('tunnel'), b = placeFar('tunnel');
        if (a && b) { a.pair = b.id; b.pair = a.id; } else { if (a) a.t = 'blue'; if (b) b.t = 'blue'; }
      }
    }
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
    const floorsList = L.areas.filter(function (A) { return A.level; }).map(function (A) { return { cx: A.cx, cy: A.cy, rx: A.rx + 46, ry: A.ry + 46 }; });
    const B = {
      id: themeId, key: key, size: size, floors: !!floors && size !== 'small', W: L.W, H: L.H,
      name: T.name, emoji: T.emoji, desc: T.desc, bg: T.bg, path: T.path, floorColor: T.floor,
      special: T.special, countGame: T.countGame, coin: T.coin, star: T.star,
      stars: themeId === 'heroes' ? Math.max(2, L.stars) : L.stars,
      nodes: nodes, decor: decor, platforms: floorsList,
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
    mine: { icon: '⛏️', name: 'Famille Mine', cards: ['l_mine', 'b_taupe', 'm_pikrok', 'm_ombrette', 'm_patapouf'], bonus: ['−1 pièce perdue sur les cases rouges', '−2 pièces perdues sur les cases rouges'] },
  };
  Object.keys(FAMILIES).forEach(function (f) { FAMILIES[f].cards.forEach(function (id) { CARDS[id].fam = f; }); });
  function famLevel(cards, f) { const own = new Set(cards || []); const n = FAMILIES[f].cards.filter(function (id) { return own.has(id); }).length; return n >= 5 ? 2 : n >= 3 ? 1 : 0; }

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

  const api = { CARDS: CARDS, RARITY: RARITY, FAMILIES: FAMILIES, famLevel: famLevel, THEMES: THEMES, makeBoard: makeBoard, CHARACTERS: CHARACTERS, COLORS: COLORS, WORLD: WORLD, charSVG: charSVG, GAME: GAME };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PARTY = api;
})(this);
