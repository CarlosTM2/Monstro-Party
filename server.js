// Monstro Party — serveur de jeu (Node.js seul, aucune dépendance).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { attach } = require('./ws');
const { THEMES, makeBoard, CHARACTERS, COLORS, WORLD, GAME, CARDS, RARITY } = require('./public/boards.js');
const MINIGAMES = require('./minigames.js');

const PORT = process.env.PORT || 3000;
const SPEED = Number(process.env.SPEED || 1); // 0.3 pour tester plus vite
const STEP_MS = 260; // durée d'un pas sur le plateau (identique côté navigateur)
const MAX_PLAYERS = 8;

/* ---------------- Serveur web (fichiers du dossier public) ---------------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const PUB = path.join(__dirname, 'public');
const server = http.createServer((req, res) => {
  let p = '/';
  try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) {}
  if (p === '/' || /^\/[A-Z0-9]{4}$/i.test(p)) p = '/index.html'; // /KX7P = lien d'invitation
  if (p === '/health') { res.writeHead(200); res.end('ok'); return; }
  const f = path.join(PUB, path.normalize(p));
  if (!f.startsWith(PUB)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('Introuvable'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

/* ---------------- Outils ---------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.round(ms * SPEED)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[rand(0, 31)]).join(''); } while (rooms.has(c)); return c; };
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
const ITEM_KEYS = Object.keys(GAME.items);
const CHEAP_ITEMS = ['double', 'pipe', 'grappin', 'bouclier', 'piege', 'mystere', 'echange', 'ticket'];
const COMP_KEYS = Object.keys(GAME.companions);
const POWER_KEYS = Object.keys(GAME.powers);

const rooms = new Map();

class Room {
  constructor(code) {
    this.code = code;
    this.players = [];
    this.phase = 'lobby'; // lobby | board | minigame | end
    this.settings = { theme: 'jurassic', size: 'medium', floors: false, turns: 10, powers: 'off', events: true, bonus: true, gambling: true, boosters: true };
    this.reset();
    this.alive = true;
    this.waiters = new Map();
    this.emptySince = null;
  }
  reset() {
    this.turn = 0; this.current = null; this.stars = []; this.traps = {}; this.prompt = null; this.mg = null;
    this.log = []; this.lastMg = []; this.mods = {}; this.endInfo = null; this.lastChance = null; this.roundEvent = null;
  }
  get board() { return makeBoard(this.settings.theme, this.settings.size, this.settings.floors); }
  player(id) { return this.players.find((p) => p.id === id); }
  humans() { return this.players.filter((p) => !p.bot); }
  coin() { return this.board.coin; }
  money(n) { return n + ' ' + (Math.abs(n) === 1 ? this.board.coin.one : this.board.coin.name); }

  publicState() {
    return {
      code: this.code, phase: this.phase, settings: this.settings, turn: this.turn,
      current: this.current, stars: this.stars, traps: this.traps, log: this.log.slice(-6), mods: this.mods, roundEvent: this.roundEvent, lastChance: this.lastChance,
      prompt: this.prompt ? { pid: this.prompt.pid, kind: this.prompt.kind, data: this.prompt.data, deadline: this.prompt.deadline } : null,
      mg: this.mg ? this.mg.pub : null,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, char: p.char, color: p.color, coins: p.coins, stars: p.stars, pos: p.pos, host: p.host, bot: p.bot,
        online: p.bot || !!p.client, cards: p.cards, buff: p.buff, items: p.items, companion: p.companion, power: p.power, shield: p.shield, lastColor: p.lastColor, stats: p.stats,
      })),
    };
  }
  broadcast() {
    const st = this.publicState();
    for (const p of this.players) if (p.client) p.client.send({ t: 'state', state: st, you: p.id });
  }
  emit(msg) { for (const p of this.players) if (p.client) p.client.send(msg); }
  say(text) { this.log.push({ id: Date.now() + Math.random(), text }); this.emit({ t: 'toast', text }); }

  /** Pose une question à un joueur et attend sa réponse. Un robot, un absent ou un joueur trop lent : choix automatique. */
  ask(pid, kind, data, fallback, valid, timeout = 25000) {
    const p = this.player(pid);
    return new Promise((resolve) => {
      const done = (v) => { if (!this.prompt || this.prompt.pid !== pid) return; clearTimeout(timer); this.prompt = null; this.waiters.delete(pid); this.broadcast(); resolve(v); };
      const auto = p.bot ? rand(600, 1300) * SPEED : (p.client ? timeout : 3000);
      const timer = setTimeout(() => done(fallback()), auto);
      this.prompt = { pid, kind, data, deadline: Date.now() + auto };
      this.waiters.set(pid, (v) => { if (!valid || valid(v)) done(v); });
      this.broadcast();
    });
  }

  addPlayer(name, charId, bot = false) {
    const used = new Set(this.players.map((p) => p.char));
    const ch = CHARACTERS.find((c) => c.id === charId && !used.has(c.id)) || CHARACTERS.find((c) => !used.has(c.id));
    const colorsUsed = new Set(this.players.map((p) => p.color));
    const color = COLORS.find((c) => !colorsUsed.has(c));
    const p = { id: crypto.randomBytes(6).toString('hex'), token: crypto.randomBytes(16).toString('hex'), name: name || ch.name, char: ch.id, color, host: this.players.length === 0, bot, client: null, power: null };
    this.resetPlayer(p);
    this.players.push(p);
    return p;
  }
  resetPlayer(p) {
    p.coins = 10; p.stars = 0; p.pos = 0; p.items = []; p.companion = null; p.shield = false; p.lastColor = 'blue';
    p.stats = { steps: 0, mgWins: 0, shopSpent: 0, itemsUsed: 0, events: 0, companions: 0, red: 0, blue: 0, earned: 0, wagered: 0, gambleWon: 0, cards: 0, boosters: 0 };
    p.cards = []; p.buff = 0;
  }

  /* ---------------- Outils de règles ---------------- */
  bagSize(p) { return p.power === 'collectionneur' ? 4 : 3; }
  ranking() { return this.players.slice().sort((a, b) => b.stars - a.stars || b.coins - a.coins); }
  isLast(p) { const r = this.ranking(); return r.length > 1 && r[r.length - 1] === p && (r[r.length - 2].stars !== p.stars || r[r.length - 2].coins !== p.coins); }
  mul() { return this.lastChance && this.lastChance.triple ? 3 : this.inFinal() ? 2 : 1; }
  inFinal() { return this.settings.turns >= 5 && this.turn > this.settings.turns - 3; }

  gain(p, n, text) {
    if (n <= 0) return 0;
    p.coins += n; p.stats.earned += n;
    this.emit({ t: 'fx', kind: 'coins', pid: p.id, n });
    if (text) this.say(text);
    return n;
  }
  /** Perte de pièces : bouclier, pouvoir Blindé. Renvoie ce qui a vraiment été perdu. */
  lose(p, n, text) {
    if (n <= 0) return 0;
    if (p.shield) { p.shield = false; this.say('🛡️ Le bouclier de ' + p.name + ' le protège !'); this.emit({ t: 'fx', kind: 'shield', pid: p.id }); return 0; }
    if (p.power === 'blinde') n = Math.ceil(n / 2);
    const real = Math.min(p.coins, n);
    p.coins -= real;
    if (real) this.emit({ t: 'fx', kind: 'coins', pid: p.id, n: -real });
    if (text) this.say(text);
    return real;
  }
  canLoseStar(p) {
    if (p.stars <= 0) return false;
    if (p.companion === 'tortulle') { this.say('🐢 Tortulle protège l’étoile de ' + p.name + ' !'); return false; }
    if (p.shield) { p.shield = false; this.say('🛡️ Le bouclier de ' + p.name + ' protège son étoile !'); return false; }
    return true;
  }
  giveItem(p, key, text) {
    if (p.items.length >= this.bagSize(p)) { this.say('🎒 Le sac de ' + p.name + ' est plein.'); return false; }
    p.items.push(key);
    this.emit({ t: 'fx', kind: 'item', pid: p.id, icon: GAME.items[key].icon });
    if (text) this.say(text);
    return true;
  }
  adopt(p, key) {
    p.companion = key; p.stats.companions++;
    this.emit({ t: 'fx', kind: 'item', pid: p.id, icon: GAME.companions[key].icon });
    this.say(GAME.companions[key].icon + ' ' + p.name + ' adopte ' + GAME.companions[key].name + ' : ' + GAME.companions[key].desc);
  }
  starPrice(p, s) {
    let price = s.price;
    if (p.power === 'astronome') price -= 5;
    if (p.companion === 'hibou') price -= 5;
    if (this.lastChance && this.lastChance.halfStar) price = Math.ceil(price / 2);
    return Math.max(5, price);
  }
  placeStar(i) {
    const B = this.board;
    const taken = new Set(this.stars.map((s) => s && s.node));
    const ok = B.nodes.filter((n) => n.t === 'blue' && !n.fork && !n.join && !n.stairs && n.id > 2 && !taken.has(n.id) && !this.players.some((p) => p.pos === n.id));
    const node = pick(ok).id;
    const price = B.id === 'pirate' ? pick([10, 15, 20, 25, 30]) : 20;
    this.stars[i] = { node, price };
    this.emit({ t: 'fx', kind: 'star', node });
  }
  moveStars() { for (let i = 0; i < this.stars.length; i++) this.placeStar(i); }

  /* ---------------- La partie ---------------- */
  async run() {
    try {
      const B = this.board;
      this.reset();
      this.phase = 'board';
      this.players = shuffle(this.players);
      this.players.forEach((p) => this.resetPlayer(p));
      // Pouvoirs
      if (this.settings.powers === 'random') { const ps = shuffle(POWER_KEYS); this.players.forEach((p, i) => { p.power = ps[i % ps.length]; }); }
      else if (this.settings.powers === 'choice') this.players.forEach((p) => { if (!p.power || p.bot) p.power = pick(POWER_KEYS); });
      else this.players.forEach((p) => { p.power = null; });
      this.players.forEach((p) => { if (p.power === 'dresseur') this.adopt(p, pick(COMP_KEYS)); });
      const nStars = B.stars + (this.players.length >= 6 ? 1 : 0); // plus d'étoiles quand on est nombreux
      for (let i = 0; i < nStars; i++) this.placeStar(i);
      this.broadcast();
      this.say('Bienvenue dans la ' + B.name + ' ! ' + WORLD.bosses[B.id].name + ', ' + WORLD.bosses[B.id].desc + ', vous observe…');
      await sleep(2600);
      for (this.turn = 1; this.turn <= this.settings.turns; this.turn++) {
        this.mods = {};
        this.broadcast();
        if (this.settings.turns >= 5 && this.turn === this.settings.turns - 2) await this.finalStretch();
        if (this.settings.events && this.turn >= 2 && Math.random() < 0.35) await this.randomEvent();
        for (const p of this.players) {
          if (!this.alive) return;
          await this.playTurn(p);
        }
        if (!this.alive) return;
        await this.runMinigame();
      }
      await this.finish();
    } catch (e) {
      console.error('Erreur de partie', this.code, e);
      this.say('Oups, une erreur est survenue. Retour au salon.');
      this.phase = 'lobby'; this.prompt = null; this.mg = null; this.broadcast();
    }
  }

  /** Roulette affichée chez tout le monde (Chance, Dernière ligne droite…). */
  async roulette(title, entries, index, text) {
    this.emit({ t: 'roulette', title, entries, index, text });
    await sleep(4300);
  }

  async finalStretch() {
    const last = this.ranking()[this.players.length - 1];
    const effects = [
      { label: '+20 pour le dernier', run: () => this.gain(last, 20) },
      { label: 'Étoiles à moitié prix', run: () => { this.lastChance.halfStar = true; } },
      { label: '2 objets + 1 compagnon', run: () => { this.giveItem(last, pick(ITEM_KEYS)); this.giveItem(last, pick(ITEM_KEYS)); this.adopt(last, pick(COMP_KEYS)); } },
      { label: 'Cases ×3 !', run: () => { this.lastChance.triple = true; } },
    ];
    this.lastChance = {};
    this.say('🔥 Dernière ligne droite ! ' + last.name + ', dernier du classement, fait tourner la roue…');
    await sleep(1500);
    const i = rand(0, effects.length - 1);
    await this.roulette('🔥 Dernière ligne droite', effects.map((e) => e.label), i, effects[i].label);
    effects[i].run();
    this.lastChance.label = effects[i].label;
    this.say('🔥 ' + effects[i].label + ' jusqu’à la fin ! Les cases bleues et rouges comptent ' + (this.lastChance.triple ? 'triple' : 'double') + '.');
    this.broadcast();
    await sleep(1500);
  }

  async randomEvent() {
    const B = this.board;
    const all = this.players;
    const events = [
      { t: '🌧️ Pluie de pièces ! Tout le monde gagne 5 ' + B.coin.name + '.', run: () => all.forEach((p) => this.gain(p, 5)) },
      { t: '🏷️ Soldes ! La boutique est à moitié prix pendant ce tour.', run: () => { this.mods.sale = true; } },
      { t: '🌪️ Tornade ! ' + (B.stars > 1 ? 'Les étoiles s’envolent' : 'L’étoile s’envole') + ' ailleurs.', run: () => this.moveStars() },
      { t: '💸 Impôts ! Le plus riche donne 10 ' + B.coin.name + ' au plus pauvre.', run: () => { const r = all.slice().sort((a, b) => b.coins - a.coins); const n = this.lose(r[0], 10); this.gain(r[r.length - 1], n); } },
      { t: '📦 Livraison ! Chacun reçoit un objet surprise.', run: () => all.forEach((p) => this.giveItem(p, pick(CHEAP_ITEMS))) },
    ];
    const special = {
      jurassic: { t: '☄️ Pluie de météores ! Tout le monde perd 3 os.', run: () => all.forEach((p) => this.lose(p, 3)) },
      pirate: { t: '⚔️ Abordage ! Calamarde vole 5 doublons à tous ceux qui en ont plus de 20.', run: () => all.forEach((p) => { if (p.coins > 20) this.lose(p, 5); }) },
      heroes: { t: '🔌 Panne de courant ! Docteur Chaos limite tous les dés à 6 pendant ce tour.', run: () => { this.mods.blackout = true; } },
      mine: { t: '🛤️ Wagon fou ! Un joueur au hasard est emporté 6 cases plus loin.', run: async () => { const p = pick(all); this.say('🛤️ ' + p.name + ' saute dans le wagon !'); await this.slide(p, 6); } },
    };
    if (B.id in special) events.push(special[B.id], special[B.id]);
    const ev = pick(events);
    this.roundEvent = ev.t;
    this.emit({ t: 'banner', text: ev.t });
    this.say(ev.t);
    await sleep(2200);
    await ev.run();
    this.broadcast();
    await sleep(1400);
  }

  /** Déplacement sans arrêt (wagon) : suit toujours le grand chemin. */
  async slide(p, n) {
    const B = this.board; const path = [];
    for (let i = 0; i < n; i++) { p.pos = B.nodes[p.pos].next[0]; path.push(p.pos); }
    this.emit({ t: 'move', pid: p.id, path });
    await sleep(path.length * STEP_MS + 200);
    this.broadcast();
  }

  diceOptions(p) {
    const opts = ['normal', 'prudent', 'risque'];
    if (this.turn >= 3 && this.isLast(p)) opts.push('revanche');
    return opts;
  }
  rollDie(kind) {
    if (kind === 'prudent') return rand(3, 6);
    if (kind === 'risque') return pick([1, 2, 3, 12, 13, 14, 15, 16]);
    if (kind === 'revanche') return rand(5, 12);
    return rand(1, 10);
  }

  forkLabel(fromId, toId) {
    const B = this.board, from = B.nodes[fromId];
    let n = B.nodes[toId], guard = 0;
    if (!n.branch) return { label: 'Continuer', icon: '➡️' };
    const stairs = n.stairs;
    while (n.branch && guard++ < 20) n = B.nodes[n.next[0]];
    if (stairs || n.level !== from.level) return n.level > from.level ? { label: 'Monter à l’étage', icon: '⬆️' } : { label: 'Descendre', icon: '⬇️' };
    if (n.area !== from.area) return { label: 'Pont vers l’autre zone', icon: '🌉' };
    return { label: 'Raccourci', icon: '✂️' };
  }

  async playTurn(p) {
    const B = this.board;
    this.current = p.id;
    this.broadcast();
    if (p.power === 'banquier') this.gain(p, 2);
    if (p.companion === 'poulpi' && this.turn % 3 === 0) this.giveItem(p, pick(CHEAP_ITEMS), '🐙 Poulpi a trouvé un objet pour ' + p.name + ' !');
    // 1) Objet éventuel, puis choix du dé
    let forced = null; // dés imposés par un objet
    let usedItem = false;
    for (let guard = 0; guard < 3; guard++) {
      const dice = this.diceOptions(p);
      const items = usedItem || forced ? [] : p.items.map((k, i) => ({ i, k }));
      const fallback = () => {
        if (p.bot && items.length && Math.random() < 0.45) return { item: pick(items).i };
        return { dice: p.bot && this.isLast(p) && dice.includes('revanche') ? 'revanche' : 'normal' };
      };
      const ans = forced ? { dice: 'normal' } : await this.ask(p.id, 'turn', { dice, items, canUse: !usedItem }, fallback,
        (v) => v && ((v.dice && dice.includes(v.dice)) || (typeof v.item === 'number' && items.some((x) => x.i === v.item))));
      if (ans.item != null && !usedItem) {
        usedItem = true;
        const key = p.items.splice(ans.item, 1)[0];
        p.stats.itemsUsed++;
        const r = await this.useItem(p, key);
        if (r && r.dice) forced = r.dice;
        this.broadcast();
        continue;
      }
      // 2) Lancer
      let values;
      if (forced) values = forced;
      else values = [this.rollDie(ans.dice)];
      const bonus = [];
      if (p.companion === 'piou') bonus.push({ icon: '🐣', n: 1 });
      if (p.buff) { bonus.push({ icon: '🃏', n: p.buff }); p.buff = 0; }
      if (p.companion === 'draki' && Math.random() < 0.25) bonus.push({ icon: '🐉', n: rand(1, 6) });
      if (p.power === 'revanchard' && this.isLast(p)) bonus.push({ icon: '💢', n: rand(1, 6) });
      let total = values.reduce((a, b) => a + b, 0) + bonus.reduce((a, b) => a + b.n, 0);
      if (p.power === 'chanceux' && total < 3) { bonus.push({ icon: '🍀', n: 3 - total }); total = 3; }
      if (this.mods.blackout && total > 6) { total = 6; bonus.push({ icon: '🔌', n: 0, cap: 6 }); }
      this.emit({ t: 'dice', pid: p.id, values, bonus, total });
      await sleep(1600 + values.length * 200);
      await this.moveSteps(p, total);
      break;
    }
    this.broadcast();
    await this.landOn(p);
    this.broadcast();
    await sleep(800);
  }

  async chooseTarget(p, text, filter) {
    const others = this.players.filter((o) => o !== p && (!filter || filter(o)));
    if (!others.length) return null;
    const best = others.slice().sort((a, b) => b.stars - a.stars || b.coins - a.coins)[0];
    const id = await this.ask(p.id, 'target', { text, options: others.map((o) => o.id) }, () => best.id, (v) => others.some((o) => o.id === v));
    return this.player(id);
  }

  async useItem(p, key) {
    const it = GAME.items[key];
    this.say(it.icon + ' ' + p.name + ' utilise : ' + it.name + ' !');
    this.emit({ t: 'fx', kind: 'item', pid: p.id, icon: it.icon });
    await sleep(700);
    switch (key) {
      case 'double': return { dice: [rand(1, 10), rand(1, 10)] };
      case 'triple': return { dice: [rand(1, 10), rand(1, 10), rand(1, 10)] };
      case 'pipe': {
        const n = await this.ask(p.id, 'number', { text: 'Choisis ton résultat', min: 1, max: 10 }, () => rand(6, 10), (v) => Number.isInteger(v) && v >= 1 && v <= 10);
        return { dice: [n] };
      }
      case 'grappin': {
        const t = await this.chooseTarget(p, 'Voler des pièces à qui ?', (o) => o.coins > 0);
        if (!t) { this.say('Personne à voler…'); return null; }
        const n = this.lose(t, rand(5, 15));
        this.gain(p, n, '🪝 ' + p.name + ' vole ' + this.money(n) + ' à ' + t.name + ' !');
        return null;
      }
      case 'echange': {
        const t = await this.chooseTarget(p, 'Échanger ta place avec qui ?');
        if (!t) return null;
        const a = p.pos; p.pos = t.pos; t.pos = a;
        this.emit({ t: 'teleport', pid: p.id, to: p.pos }); this.emit({ t: 'teleport', pid: t.id, to: t.pos });
        this.say('🔄 ' + p.name + ' et ' + t.name + ' échangent leurs places !');
        await sleep(900);
        return null;
      }
      case 'bouclier': p.shield = true; this.say('🛡️ ' + p.name + ' est protégé contre la prochaine perte.'); return null;
      case 'piege': this.traps[p.pos] = p.id; this.say('🪤 ' + p.name + ' pose un piège sur sa case…'); return null;
      case 'boussole': {
        const B = this.board; const s = this.stars[0];
        const before = B.nodes.find((n) => n.next.includes(s.node) && !n.branch) || B.nodes.find((n) => n.next.includes(s.node));
        p.pos = before.id;
        this.emit({ t: 'teleport', pid: p.id, to: p.pos, fly: true });
        await sleep(1000);
        return null;
      }
      case 'fantome': {
        const t = await this.chooseTarget(p, 'Voler une étoile à qui ?', (o) => o.stars > 0);
        if (!t) { this.say('👻 Personne n’a d’étoile… le fantôme repart bredouille.'); return null; }
        if (this.canLoseStar(t)) { t.stars--; p.stars++; this.emit({ t: 'fx', kind: 'gotstar', pid: p.id }); this.say('👻 ' + p.name + ' vole une étoile à ' + t.name + ' !'); }
        await sleep(1200);
        return null;
      }
      case 'ticket': {
        const prize = pick([0, 0, 0, 2, 2, 5, 5, 8, 10, 15, 20, 50]);
        p.stats.wagered += 4;
        this.emit({ t: 'casino', pid: p.id, game: 'ticket', prize, win: prize });
        await sleep(2600);
        if (prize) { p.stats.gambleWon += prize; this.gain(p, prize, '🎟️ ' + p.name + ' gratte son ticket : ' + this.money(prize) + ' !'); }
        else this.say('🎟️ ' + p.name + ' gratte son ticket… perdu !');
        return null;
      }
      case 'mystere': { const k = pick(ITEM_KEYS.filter((x) => x !== 'mystere')); p.items.push(k); this.say('🎁 La boîte contenait : ' + GAME.items[k].icon + ' ' + GAME.items[k].name + ' !'); return null; }
    }
    return null;
  }

  async moveSteps(p, total) {
    const B = this.board;
    let left = total, path = [];
    const flush = async () => { if (!path.length) return; this.emit({ t: 'move', pid: p.id, path }); await sleep(path.length * STEP_MS + 150); path = []; this.broadcast(); };
    while (left > 0) {
      const node = B.nodes[p.pos];
      let nextId = node.next[0];
      if (node.next.length > 1) {
        await flush();
        const opts = node.next.map((id) => Object.assign({ value: id }, this.forkLabel(node.id, id)));
        nextId = await this.ask(p.id, 'fork', { text: 'Embranchement ! Où vas-tu ?', options: opts }, () => pick(opts).value, (v) => opts.some((o) => o.value === v));
      }
      p.pos = nextId; path.push(nextId); left--; p.stats.steps++;
      // Croiser des joueurs : Pickpocket / Chauvy
      const here = this.players.filter((o) => o !== p && o.pos === p.pos);
      if (here.length && left > 0) {
        here.forEach((o) => {
          let n = 0;
          if (p.power === 'pickpocket') n += 2;
          if (p.companion === 'chauvy') n += 1;
          if (n) { const got = this.lose(o, n); if (got) this.gain(p, got, (p.power === 'pickpocket' ? '🧤 ' : '🦇 ') + p.name + ' chipe ' + this.money(got) + ' à ' + o.name + ' en passant.'); }
        });
      }
      // Étoile
      const si = this.stars.findIndex((s) => s.node === p.pos);
      if (si >= 0) { await flush(); await this.starStop(p, si); }
      // Boutique (en passant ou en s'arrêtant)
      if (B.nodes[p.pos].t === 'shop') { await flush(); await this.shop(p); }
    }
    await flush();
  }

  async starStop(p, si) {
    const B = this.board, s = this.stars[si];
    const price = this.starPrice(p, s);
    if (p.coins < price) { this.say(p.name + ' n’a pas assez de ' + B.coin.name + ' pour ' + B.star.a + ' (' + price + ').'); await sleep(1200); return; }
    const buy = await this.ask(p.id, 'buy', { text: 'Acheter ' + B.star.a + ' ' + B.star.icon + ' pour ' + this.money(price) + ' ?', price }, () => true, (v) => typeof v === 'boolean');
    if (!buy) return;
    p.coins -= price;
    const giant = B.id === 'mine' && Math.random() < 0.25;
    p.stars += giant ? 2 : 1;
    this.emit({ t: 'fx', kind: 'gotstar', pid: p.id, n: giant ? 2 : 1 });
    this.say(B.star.icon + ' ' + p.name + (giant ? ' trouve un Cristal géant : +2 !' : ' obtient ' + B.star.a + ' !'));
    await sleep(1800);
    this.placeStar(si);
    this.broadcast();
    await sleep(700);
  }

  async shop(p) {
    const offer = shuffle(ITEM_KEYS.filter((k) => this.settings.gambling || k !== 'ticket')).slice(0, 5);
    const mult = (this.mods.sale ? 0.5 : 1) * (p.power === 'negociateur' ? 0.7 : 1);
    const opts = offer.map((k) => ({ k, price: Math.max(1, Math.round(GAME.items[k].price * mult)) }));
    if (this.settings.boosters) opts.push({ k: 'booster', price: Math.max(1, Math.round(GAME.booster.price * mult)) });
    const full = p.items.length >= this.bagSize(p);
    const affordable = opts.filter((o) => o.price <= p.coins);
    const onlyBooster = full && this.settings.boosters && affordable.some((o) => o.k === 'booster');
    if ((full && !onlyBooster) || !affordable.length) { this.say('🛒 ' + p.name + ' passe devant la boutique' + (full ? ' (sac plein).' : ' (pas assez de ' + this.board.coin.name + ').')); return; }
    const fb = () => (p.bot && Math.random() < 0.6 ? pick(affordable).k : null);
    const k = await this.ask(p.id, 'shop', { text: 'Bienvenue à la boutique de Monstralia !', options: opts, sale: !!this.mods.sale, full }, fb, (v) => v === null || opts.some((o) => o.k === v && o.price <= p.coins));
    if (!k) return;
    const o = opts.find((x) => x.k === k);
    if (k !== 'booster' && p.items.length >= this.bagSize(p)) return;
    p.coins -= o.price; p.stats.shopSpent += o.price;
    if (k === 'booster') { this.broadcast(); await this.openBooster(p, 'acheté à la boutique'); return; }
    this.giveItem(p, k, '🛒 ' + p.name + ' achète ' + GAME.items[k].icon + ' ' + GAME.items[k].name + '.');
    this.broadcast();
    await sleep(700);
  }

  async landOn(p) {
    const B = this.board, node = B.nodes[p.pos], m = this.mul();
    const others = this.players.filter((o) => o !== p);
    // Piège
    const trapOwner = this.traps[p.pos];
    if (trapOwner && trapOwner !== p.id) {
      delete this.traps[p.pos];
      const o = this.player(trapOwner);
      const n = this.lose(p, 10);
      if (o) this.gain(o, n, '🪤 ' + p.name + ' tombe dans le piège de ' + o.name + ' (' + this.money(n) + ') !');
      await sleep(1200);
    }
    p.lastColor = ['red', 'special', 'chaos'].includes(node.t) ? 'red' : 'blue';
    switch (process.env.FORCE_LAND && p.pos !== 0 ? process.env.FORCE_LAND : node.t) { // FORCE_LAND : réservé aux tests
      case 'blue': p.stats.blue++; this.gain(p, (3 + (p.companion === 'rouxi' ? 2 : 0)) * m, p.name + ' gagne ' + this.money((3 + (p.companion === 'rouxi' ? 2 : 0)) * m) + '.'); break;
      case 'red': p.stats.red++; this.lose(p, 3 * m, p.name + ' perd ' + this.money(3 * m) + '.'); break;
      case 'start': break;
      case 'item': if (this.settings.boosters && Math.random() < 0.3) { await this.openBooster(p, 'trouvé sur une case cadeau'); break; } { const k = pick(CHEAP_ITEMS); this.giveItem(p, k, '🎁 ' + p.name + ' trouve ' + GAME.items[k].icon + ' ' + GAME.items[k].name + ' !'); await sleep(900); break; }
      case 'shop': break; // déjà proposé en passant
      case 'nest': await this.nest(p); break;
      case 'tunnel': {
        this.say('🕳️ Passage secret ! ' + p.name + ' ressort ailleurs dans la mine.');
        await sleep(800);
        p.pos = node.pair;
        this.emit({ t: 'teleport', pid: p.id, to: p.pos });
        this.broadcast();
        await sleep(900);
        break;
      }
      case 'special': await this.special(p, others); break;
      case 'event': p.stats.events++; await this.event(p, others); break;
      case 'chance': p.stats.events++; await this.chance(p); break;
      case 'chaos': p.stats.events++; await this.chaos(p); break;
      case 'casino':
        if (this.settings.gambling) await this.casino(p);
        else { p.stats.blue++; this.gain(p, 3 * m, p.name + ' gagne ' + this.money(3 * m) + '.'); }
        break;
    }
    this.broadcast();
  }

  async nest(p) {
    const k = pick(COMP_KEYS.filter((x) => x !== p.companion));
    const price = Math.round(5 * (p.power === 'negociateur' ? 0.7 : 1));
    const c = GAME.companions[k];
    if (p.coins < price) { this.say('🪺 Un nid ! Mais ' + p.name + ' n’a pas les ' + price + ' ' + this.board.coin.name + ' pour adopter ' + c.name + '.'); return; }
    const yes = await this.ask(p.id, 'nest', { text: 'Un nid ! Adopter ' + c.icon + ' ' + c.name + ' pour ' + this.money(price) + ' ?', k, price, replace: p.companion }, () => true, (v) => typeof v === 'boolean');
    if (!yes) return;
    p.coins -= price;
    this.adopt(p, k);
    await sleep(1000);
  }

  /** Ouvre un booster de 3 cartes et applique les bonus. */
  async openBooster(p, why) {
    const ids = Object.keys(CARDS);
    const draw = () => {
      let r = Math.random() * 100, rar = 'commune';
      for (const k of Object.keys(RARITY)) { r -= RARITY[k].weight; if (r <= 0) { rar = k; break; } }
      return pick(ids.filter((id) => CARDS[id].rarity === rar));
    };
    const got = [draw(), draw(), draw()];
    p.stats.boosters++;
    this.say('🃏 ' + p.name + ' ouvre un booster' + (why ? ' (' + why + ')' : '') + ' !');
    this.emit({ t: 'booster', pid: p.id, cards: got });
    await sleep(4800);
    for (const id of got) {
      p.cards.push(id);
      const c = CARDS[id];
      switch (c.fx) {
        case 'coins5': this.gain(p, 5); break;
        case 'coins12': this.gain(p, 12); break;
        case 'coins25': this.gain(p, 25); break;
        case 'item': this.giveItem(p, pick(CHEAP_ITEMS)); break;
        case 'dice2': p.buff += 2; break;
        case 'dice5': p.buff += 5; break;
        case 'shield': p.shield = true; break;
        case 'companion': this.adopt(p, pick(COMP_KEYS.filter((k) => k !== p.companion))); break;
        case 'steal': { const lead = this.ranking().find((o) => o !== p); if (lead) this.gain(p, this.lose(lead, 6), '🦝 Le raton voleur de ' + p.name + ' chipe des pièces à ' + lead.name + ' !'); break; }
        case 'star': p.stars++; this.emit({ t: 'fx', kind: 'gotstar', pid: p.id }); this.say('🌠 ÉTOILE FILANTE ! ' + p.name + ' gagne une étoile grâce à sa carte légendaire !'); break;
      }
    }
    p.stats.cards = new Set(p.cards).size;
    this.broadcast();
    await sleep(600);
  }

  /** Casino : le joueur choisit un jeu et sa mise (5, 10 ou 20). */
  async casino(p) {
    const B = this.board;
    const bets = [5, 10, 20].filter((b) => b <= p.coins);
    if (!bets.length) { this.say('🎰 Le casino refuse ' + p.name + ' : pas assez de ' + B.coin.name + ' (5 minimum).'); await sleep(1000); return; }
    const valid = (v) => v === null || (v && GAME.casino[v.game] && bets.includes(v.bet) &&
      (v.game === 'slots' || (v.game === 'roulette' && ['rouge', 'noir', 'vert'].includes(v.choice)) || (v.game === 'pile' && ['pile', 'face'].includes(v.choice))));
    const fb = () => (p.bot && p.coins > 15 ? { game: pick(['slots', 'roulette', 'pile']), bet: bets[0], choice: pick(['rouge', 'noir', 'pile', 'face']).replace(/^(rouge|noir)$/, (x) => x) } : null);
    let v = await this.ask(p.id, 'casino', { text: 'Bienvenue au Casino de Monstralia ! Tente ta chance ?', bets }, () => { const f = fb(); if (f && f.game === 'roulette' && !['rouge', 'noir'].includes(f.choice)) f.choice = 'rouge'; if (f && f.game === 'pile' && !['pile', 'face'].includes(f.choice)) f.choice = 'pile'; return f; }, valid);
    if (!v) { this.say('🎰 ' + p.name + ' passe devant le casino sans jouer.'); return; }
    p.coins -= v.bet; p.stats.wagered += v.bet;
    let mult = 0, result;
    if (v.game === 'slots') {
      const W = [30, 27, 22, 13, 8], sym = GAME.slotSymbols;
      const roll = () => { let r = Math.random() * 100; for (let i = 0; i < W.length; i++) { r -= W[i]; if (r <= 0) return i; } return 0; };
      result = [roll(), roll(), roll()];
      const same = result[0] === result[1] && result[1] === result[2];
      const two = result[0] === result[1] || result[1] === result[2] || result[0] === result[2];
      mult = same ? (result[0] === 4 ? 10 : 5) : two ? 2 : 0;
      result = result.map((i) => sym[i]);
    } else if (v.game === 'roulette') {
      const n = rand(0, 14); // 0 = vert, 1-7 rouge, 8-14 noir
      result = n === 0 ? 'vert' : n <= 7 ? 'rouge' : 'noir';
      mult = result === v.choice ? (result === 'vert' ? 14 : 2) : 0;
      result = { n, color: result };
    } else {
      result = Math.random() < 0.5 ? 'pile' : 'face';
      mult = result === v.choice ? 2 : 0;
    }
    const win = v.bet * mult;
    this.emit({ t: 'casino', pid: p.id, game: v.game, bet: v.bet, choice: v.choice, result, win });
    await sleep(3600);
    if (win) { p.stats.gambleWon += win; this.gain(p, win, (mult >= 5 ? '💰 JACKPOT ! ' : '🎰 ') + p.name + ' mise ' + v.bet + ' et gagne ' + this.money(win) + ' !'); }
    else this.say('🎰 ' + p.name + ' perd sa mise de ' + this.money(v.bet) + '.');
    this.broadcast();
    await sleep(800);
  }

  /** Paris sur le mini-jeu, pris pendant la présentation. */
  placeBet(p, on, amount) {
    const mg = this.mg;
    if (!this.settings.gambling || !mg || mg.pub.phase !== 'intro' || mg.pub.bets[p.id]) return false;
    if (![5, 10].includes(amount) || p.coins < amount || !mg.pub.betOptions.includes(on)) return false;
    p.coins -= amount; p.stats.wagered += amount;
    mg.pub.bets[p.id] = { on, amount };
    return true;
  }
  payBets(choice, rows, res) {
    const out = [];
    const bets = this.mg.pub.bets || {};
    const firsts = rows.filter((r) => r.place === 1).map((r) => r.pid);
    let winSide = null;
    if (choice.mode === 'teams' || choice.mode === '1vx') { const r = rows.find((x) => x.place === 1 && x.coins > 0); winSide = r ? r.side : null; }
    Object.entries(bets).forEach(([pid, b]) => {
      const p = this.player(pid); if (!p) return;
      let ok = false, mult = 2;
      if (choice.mode === 'ffa') { ok = firsts.includes(b.on); mult = 3; }
      else if (choice.mode === 'coop') ok = (b.on === 'ok') === !!res.success;
      else ok = b.on === winSide;
      const win = ok ? b.amount * mult : 0;
      if (win) { p.coins += win; p.stats.gambleWon += win; }
      out.push({ pid, on: b.on, amount: b.amount, win });
    });
    return out;
  }

  async special(p, others) {
    const B = this.board;
    this.emit({ t: 'fx', kind: 'special', pid: p.id, icon: B.special.icon });
    if (B.id === 'jurassic') {
      this.say('🌋 Magmator se réveille ! Éruption : tous les autres perdent 5 os.');
      others.forEach((o) => this.lose(o, 5));
    } else if (B.id === 'pirate') {
      const dest = pick(B.nodes.filter((n) => n.id !== p.pos && n.t !== 'tunnel')).id;
      this.say('💣 Le canon de la Capitaine Calamarde tire… ' + p.name + ' s’envole !');
      await sleep(900);
      p.pos = dest;
      this.emit({ t: 'teleport', pid: p.id, to: dest, fly: true });
    } else if (B.id === 'heroes') {
      const s = pick(this.stars);
      const before = B.nodes.find((n) => n.next.includes(s.node) && !n.branch) || B.nodes.find((n) => n.next.includes(s.node));
      this.say('⚡ Super-vitesse ! ' + p.name + ' fonce juste avant une Médaille.');
      await sleep(700);
      p.pos = before.id;
      this.emit({ t: 'teleport', pid: p.id, to: p.pos, fly: true });
    } else if (B.id === 'mine') {
      this.lose(p, 8, '🪨 Éboulement ! La Reine Taupe secoue la galerie : ' + p.name + ' perd 8 pépites.');
    }
    this.broadcast();
    await sleep(1200);
  }

  async event(p, others) {
    const C = this.board.coin.name;
    const events = [
      () => { this.gain(p, 10, '🎁 Coffre surprise : ' + p.name + ' gagne 10 ' + C + ' !'); },
      () => { if (!others.length) return; let tot = 0; others.forEach((o) => { tot += this.lose(o, 3); }); this.gain(p, tot, '🧲 Aimant : ' + p.name + ' prend 3 ' + C + ' à chaque joueur (' + tot + ') !'); },
      () => { if (!others.length) return; const o = pick(others); const a = p.coins; p.coins = o.coins; o.coins = a; this.say('🔄 Échange ! ' + p.name + ' et ' + o.name + ' échangent leurs ' + C + '.'); },
      () => { this.moveStars(); this.say('🌪️ Une tornade emporte ' + (this.stars.length > 1 ? 'les étoiles' : 'l’étoile') + ' ailleurs !'); },
      () => { const poorest = this.players.reduce((a, b) => (b.coins < a.coins ? b : a)); this.gain(poorest, 8, '💝 Bonne fée : ' + poorest.name + ', le plus pauvre, reçoit 8 ' + C + '.'); },
      () => { const n = rand(1, 3) * 5; if (Math.random() < 0.5) this.gain(p, n, '🎰 Machine à sous : +' + n + ' ' + C + ' pour ' + p.name + '.'); else this.lose(p, n, '🎰 Machine à sous : −' + n + ' ' + C + ' pour ' + p.name + '.'); },
      () => { this.giveItem(p, pick(ITEM_KEYS), '📦 Colis piégé ? Non : un objet rare pour ' + p.name + ' !'); },
      () => { if (!others.length) return; const o = pick(others); const a = p.pos; p.pos = o.pos; o.pos = a; this.emit({ t: 'teleport', pid: p.id, to: p.pos }); this.emit({ t: 'teleport', pid: o.id, to: o.pos }); this.say('🌀 Portail ! ' + p.name + ' et ' + o.name + ' échangent leurs places.'); },
    ];
    this.emit({ t: 'fx', kind: 'event', pid: p.id });
    await sleep(600);
    pick(events)();
    this.broadcast();
    await sleep(1500);
  }

  /** Case Chance : deux joueurs tirés au sort, un transfert qui peut tout changer. */
  async chance(p) {
    if (this.players.length < 2) return;
    const C = this.board.coin.name;
    const a = pick(this.players), b = pick(this.players.filter((x) => x !== a));
    const effects = [
      { label: 'donne 10 ' + C + ' à', run: () => this.gain(b, this.lose(a, 10)) },
      { label: 'donne 20 ' + C + ' à', run: () => this.gain(b, this.lose(a, 20)) },
      { label: 'donne la moitié de ses ' + C + ' à', run: () => this.gain(b, this.lose(a, Math.floor(a.coins / 2))) },
      { label: 'donne 1 étoile à', run: () => { if (this.canLoseStar(a)) { a.stars--; b.stars++; this.emit({ t: 'fx', kind: 'gotstar', pid: b.id }); } else this.say('Raté, pas d’étoile à prendre !'); } },
      { label: 'échange ses ' + C + ' avec', run: () => { const x = a.coins; a.coins = b.coins; b.coins = x; } },
      { label: 'échange ses étoiles avec', run: () => { const x = a.stars; a.stars = b.stars; b.stars = x; } },
    ];
    const i = rand(0, effects.length - 1);
    this.say('🎲 Case Chance ! Qui va donner quoi à qui ?');
    await this.roulette('🎲 Chance !', effects.map((e) => e.label), i, a.name + ' ' + effects[i].label + ' ' + b.name + ' !');
    effects[i].run();
    this.say('🎲 ' + a.name + ' ' + effects[i].label + ' ' + b.name + ' !');
    this.broadcast();
    await sleep(1500);
  }

  /** Case Chamboulement : remet tout en jeu pour tout le monde. */
  async chaos(p) {
    const C = this.board.coin.name;
    const all = this.players;
    const effects = [
      { label: 'Partage équitable', text: 'Toutes les ' + C + ' sont réunies et partagées équitablement !', run: () => { const tot = all.reduce((s, x) => s + x.coins, 0); all.forEach((x) => { x.coins = Math.floor(tot / all.length); }); } },
      { label: 'Positions mélangées', text: 'Tout le monde est téléporté au hasard !', run: () => { const pos = shuffle(all.map((x) => x.pos)); all.forEach((x, i) => { x.pos = pos[i]; this.emit({ t: 'teleport', pid: x.id, to: x.pos, fly: true }); }); } },
      { label: 'Robin des bois', text: 'Les 2 premiers donnent un tiers de leurs ' + C + ' aux 2 derniers !', run: () => { const r = this.ranking(); const top = r.slice(0, 2), bot = r.slice(-2).reverse(); top.forEach((t, i) => { if (bot[i] && bot[i] !== t) this.gain(bot[i], this.lose(t, Math.floor(t.coins / 3))); }); } },
      { label: 'Pièces mélangées', text: 'Les tas de ' + C + ' sont mélangés entre les joueurs !', run: () => { const c = shuffle(all.map((x) => x.coins)); all.forEach((x, i) => { x.coins = c[i]; }); } },
      { label: 'Étoiles envolées', text: 'Les étoiles du plateau changent de place, et le dernier reçoit 10 ' + C + '.', run: () => { this.moveStars(); const r = this.ranking(); this.gain(r[r.length - 1], 10); } },
    ];
    const i = rand(0, effects.length - 1);
    this.say('🌀 Chamboulement ! ' + p.name + ' déclenche le grand mélange…');
    await this.roulette('🌀 Chamboulement', effects.map((e) => e.label), i, effects[i].text);
    effects[i].run();
    this.say('🌀 ' + effects[i].text);
    this.broadcast();
    await sleep(1600);
  }

  /* ---------------- Mini-jeux ---------------- */
  chooseMode() {
    const N = this.players.length;
    const blue = this.players.filter((p) => p.lastColor !== 'red'), red = this.players.filter((p) => p.lastColor === 'red');
    if (N >= 3 && (blue.length === 1 || red.length === 1)) { const solo = blue.length === 1 ? blue : red; return { mode: '1vx', A: solo.map((p) => p.id), B: this.players.filter((p) => p !== solo[0]).map((p) => p.id) }; }
    if (N >= 4 && blue.length >= 2 && red.length >= 2) return { mode: 'teams', A: blue.map((p) => p.id), B: red.map((p) => p.id) };
    if (Math.random() < 0.2) return { mode: 'coop', A: this.players.map((p) => p.id), B: [] };
    return { mode: 'ffa', A: [], B: [] };
  }

  async runMinigame() {
    const choice = this.chooseMode();
    let pool = Object.keys(MINIGAMES).filter((k) => k[0] !== '_' && MINIGAMES[k].modes.includes(choice.mode));
    const fresh = pool.filter((k) => !this.lastMg.includes(k));
    let id = pick(fresh.length ? fresh : pool);
    if (process.env.FORCE_MG) { const f = process.env.FORCE_MG.split(','); const want = f[(this.turn - 1) % f.length]; if (MINIGAMES[want]) { id = want; if (!MINIGAMES[want].modes.includes(choice.mode)) { const m = MINIGAMES[want].modes[0]; choice.mode = m; if (m === '1vx') { choice.A = [this.players[0].id]; choice.B = this.players.slice(1).map((p) => p.id); } else if (m === 'coop') { choice.A = this.players.map((p) => p.id); choice.B = []; } else if (m === 'teams') { choice.A = this.players.slice(0, 2).map((p) => p.id); choice.B = this.players.slice(2).map((p) => p.id); } } } } // pour les tests
    this.lastMg = [id].concat(this.lastMg).slice(0, 4);
    const mg = MINIGAMES[id];
    this.phase = 'minigame';
    this.current = null;
    const teams = { A: choice.A, B: choice.B };
    const betOptions = choice.mode === 'ffa' ? this.players.map((p) => p.id) : choice.mode === 'coop' ? ['ok', 'ko'] : ['A', 'B'];
    this.mg = { id, inputs: {}, pub: { id, name: mg.name, icon: mg.icon, rules: mg.rules, mode: choice.mode, teams, phase: 'intro', ready: [], bets: {}, betOptions, gambling: this.settings.gambling } };
    if (this.settings.gambling) this.players.filter((p) => p.bot && p.coins >= 15 && Math.random() < 0.35).forEach((b) => this.placeBet(b, Math.random() < 0.5 && betOptions.includes(b.id) ? b.id : pick(betOptions), pick([5, 10])));
    this.broadcast();
    const t0 = Date.now();
    while (Date.now() - t0 < 15000 * SPEED) {
      const humans = this.humans().filter((p) => p.client);
      if (humans.every((p) => this.mg.pub.ready.includes(p.id))) break;
      await wait(250);
    }
    this.mg.pub.phase = 'countdown';
    this.broadcast();
    await sleep(3000);
    const ctx = {
      room: this, players: this.players, mode: choice.mode, teams, sleep, wait, rand, pick, shuffle, board: this.board, SPEED,
      later: (ms, fn) => setTimeout(fn, ms * SPEED),
      set: (pub) => { Object.assign(this.mg.pub, pub); this.broadcast(); },
      inputs: this.mg.inputs,
    };
    const res = await mg.play(ctx);
    const out = this.resolveMinigame(choice, res);
    const betResults = this.payBets(choice, out.rows, res);
    this.mg.pub = Object.assign({}, this.mg.pub, { phase: 'results', results: out.rows, verdict: out.verdict, note: res.note || '', betResults });
    this.broadcast();
    await sleep(6500);
    const firstFFA = choice.mode === 'ffa' && this.settings.boosters ? out.rows.filter((r) => r.place === 1).map((r) => this.player(r.pid)) : [];
    this.mg = null;
    if (firstFFA.length === 1) { this.phase = 'board'; this.broadcast(); await this.openBooster(firstFFA[0], 'gagnant du mini-jeu'); }
    this.phase = 'board';
    this.broadcast();
    await sleep(500);
  }

  resolveMinigame(choice, res) {
    const rows = [];
    const pay = (p, n, win) => {
      if (win && p.companion === 'bzz') n += 3;
      if (win && p.power === 'champion') n += 3;
      if (!win && p.companion === 'bzz') n += 3;
      p.coins += n; p.stats.earned += n;
      if (win) p.stats.mgWins++;
      return n;
    };
    const show = (pid) => (res.shows ? res.shows[pid] || '' : '');
    if (choice.mode === 'ffa') {
      const list = this.players.map((p) => ({ p, s: res.scores[p.id] })).sort((a, b) => b.s - a.s);
      const rewards = [10, 7, 5, 3, 2, 1, 1, 0];
      let place = 0;
      list.forEach((x, i) => { if (i > 0 && x.s < list[i - 1].s) place = i; rows.push({ pid: x.p.id, place: place + 1, show: show(x.p.id), coins: pay(x.p, rewards[place], place === 0) }); });
      return { rows, verdict: '' };
    }
    if (choice.mode === 'coop') {
      this.players.forEach((p) => rows.push({ pid: p.id, place: res.success ? 1 : 2, show: show(p.id), coins: pay(p, res.success ? 10 : 0, res.success) }));
      return { rows, verdict: res.success ? 'Réussi ! Tout le monde gagne.' : 'Raté… personne ne gagne.' };
    }
    // Équipes / 1 contre tous
    let winner = res.winner;
    if (!winner) {
      const avg = (team) => team.reduce((s, pid) => s + (res.scores[pid] || 0), 0) / team.length;
      const a = avg(choice.A), b = avg(choice.B);
      winner = a === b ? 'tie' : a > b ? 'A' : 'B';
    }
    const solo = choice.mode === '1vx';
    this.players.forEach((p) => {
      const side = choice.A.includes(p.id) ? 'A' : 'B';
      const win = winner === side;
      const n = winner === 'tie' ? 5 : win ? (solo && side === 'A' ? 15 : solo ? 8 : 10) : 0;
      rows.push({ pid: p.id, place: win ? 1 : winner === 'tie' ? 1 : 2, side, show: show(p.id), coins: pay(p, n, win) });
    });
    const names = (team) => team.map((pid) => this.player(pid).name).join(', ');
    return { rows, verdict: winner === 'tie' ? 'Égalité !' : (solo ? (winner === 'A' ? names(choice.A) + ' gagne seul contre tous !' : 'L’équipe gagne contre ' + names(choice.A) + ' !') : 'L’équipe ' + (winner === 'A' ? 'bleue' : 'rouge') + ' gagne !') };
  }

  async finish() {
    this.current = null;
    this.phase = 'end';
    const awards = [];
    if (this.settings.bonus) {
      const keys = shuffle(Object.keys(GAME.awards));
      for (const k of keys) {
        if (awards.length >= 3) break;
        const a = GAME.awards[k];
        const vals = this.players.map((p) => p.stats[a.stat] || 0);
        const best = a.dir > 0 ? Math.max(...vals) : Math.min(...vals);
        if (a.dir > 0 && best <= 0) continue;
        const winners = this.players.filter((p) => (p.stats[a.stat] || 0) === best);
        if (winners.length === this.players.length) continue; // tout le monde à égalité : pas de prix
        winners.forEach((w) => w.stars++);
        awards.push({ key: k, name: a.name, icon: a.icon, desc: a.desc, value: best, winners: winners.map((w) => w.id) });
      }
    }
    const ranking = this.ranking().map((p) => p.id);
    this.endInfo = { awards, ranking };
    this.emit({ t: 'end', awards, ranking });
    this.broadcast();
  }
}

/* ---------------- Connexions ---------------- */
attach(server, (client) => {
  let room = null, me = null;
  const fail = (text) => client.send({ t: 'error', text });
  const bind = (r, p) => {
    if (p.client && p.client !== client) p.client.close();
    room = r; me = p; p.client = client; r.emptySince = null;
    client.send({ t: 'joined', code: r.code, token: p.token, you: p.id });
    if (r.endInfo && r.phase === 'end') client.send({ t: 'end', awards: r.endInfo.awards, ranking: r.endInfo.ranking });
    r.broadcast();
  };
  client.on('message', (m) => {
    if (m.t === 'create') {
      const r = new Room(newCode());
      rooms.set(r.code, r);
      bind(r, r.addPlayer(clean(m.name, 16), m.char));
      return;
    }
    if (m.t === 'join') {
      const r = rooms.get(String(m.code || '').toUpperCase());
      if (!r) return fail('Aucune partie avec ce code.');
      if (r.phase !== 'lobby') return fail('La partie a déjà commencé.');
      if (r.players.length >= MAX_PLAYERS) return fail('La partie est pleine (8 joueurs).');
      bind(r, r.addPlayer(clean(m.name, 16), m.char));
      return;
    }
    if (m.t === 'rejoin') {
      const r = rooms.get(String(m.code || '').toUpperCase());
      const p = r && r.players.find((x) => x.token === m.token);
      if (!p) return client.send({ t: 'gone' });
      bind(r, p);
      return;
    }
    if (!room || !me) return;
    const isHost = me.host;
    switch (m.t) {
      case 'char':
        if (room.phase !== 'lobby') return;
        if (!CHARACTERS.some((c) => c.id === m.char) || room.players.some((p) => p.char === m.char && p !== me)) return;
        me.char = m.char; room.broadcast(); break;
      case 'power':
        if (room.phase !== 'lobby' || !GAME.powers[m.power]) return;
        me.power = m.power; room.broadcast(); break;
      case 'settings': {
        if (!isHost || room.phase !== 'lobby') return;
        const s = room.settings;
        if (THEMES[m.theme]) s.theme = m.theme;
        if (['small', 'medium', 'large'].includes(m.size)) s.size = m.size;
        if (typeof m.floors === 'boolean') s.floors = m.floors;
        if (s.size === 'small') s.floors = false;
        if ([5, 10, 15, 20, 25].includes(m.turns)) s.turns = m.turns;
        if (['off', 'choice', 'random'].includes(m.powers)) s.powers = m.powers;
        if (typeof m.events === 'boolean') s.events = m.events;
        if (typeof m.bonus === 'boolean') s.bonus = m.bonus;
        if (typeof m.gambling === 'boolean') s.gambling = m.gambling;
        if (typeof m.boosters === 'boolean') s.boosters = m.boosters;
        room.broadcast(); break;
      }
      case 'addbot': {
        if (!isHost || room.phase !== 'lobby' || room.players.length >= MAX_PLAYERS) return;
        const b = room.addPlayer('', null, true);
        b.name = CHARACTERS.find((c) => c.id === b.char).name + ' 🤖';
        room.broadcast(); break;
      }
      case 'kick': {
        if (!isHost || room.phase !== 'lobby') return;
        const k = room.player(m.pid);
        if (!k || k === me) return;
        room.players = room.players.filter((p) => p !== k);
        if (k.client) k.client.send({ t: 'gone' });
        room.broadcast(); break;
      }
      case 'start':
        if (!isHost || room.phase !== 'lobby') return;
        if (room.players.length < 2) return fail('Il faut au moins 2 joueurs (ajoute un robot pour tester).');
        room.run();
        break;
      case 'again':
        if (!isHost || room.phase !== 'end') return;
        room.phase = 'lobby'; room.reset();
        room.players.forEach((p) => room.resetPlayer(p));
        room.broadcast(); break;
      case 'answer': { const w = room.waiters.get(me.id); if (w) w(m.value); break; }
      case 'mg': {
        if (!room.mg) return;
        if (m.ready) { if (!room.mg.pub.ready.includes(me.id)) { room.mg.pub.ready.push(me.id); room.broadcast(); } return; }
        if (m.bet) { if (room.placeBet(me, m.bet.on, m.bet.amount)) room.broadcast(); return; }
        const mg = MINIGAMES[room.mg.id];
        if (mg.input) mg.input(room.mg, me.id, m.data || {}, room);
        break;
      }
      case 'leave': {
        if (room.phase === 'lobby') {
          room.players = room.players.filter((p) => p !== me);
          if (me.host && room.players.length) { const h = room.players.find((p) => !p.bot); if (h) h.host = true; }
          room.broadcast();
        }
        me.client = null; room = null; me = null;
        break;
      }
    }
  });
  client.on('close', () => {
    if (!room || !me || me.client !== client) return;
    me.client = null;
    if (me.host) {
      const h = room.players.find((p) => !p.bot && p.client);
      if (h) { me.host = false; h.host = true; }
    }
    if (!room.humans().some((p) => p.client)) room.emptySince = Date.now();
    room.broadcast();
  });
});

// Ménage : une partie vide depuis 20 minutes est supprimée.
setInterval(() => {
  for (const [code, r] of rooms) {
    if (r.emptySince && Date.now() - r.emptySince > 20 * 60000) { r.alive = false; rooms.delete(code); }
  }
}, 60000).unref();

server.listen(PORT, () => console.log('Monstro Party en ligne sur le port ' + PORT));
