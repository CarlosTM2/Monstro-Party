// Mini-jeux. Chacun indique les modes qu'il accepte :
//   ffa = chacun pour soi, teams = équipes (2c2, 3c3…), 1vx = un contre tous, coop = tous ensemble.
// play(ctx) renvoie { scores: {pid: nombre}, shows: {pid: texte} } (plus haut = mieux),
// ou { winner: 'A'|'B' } pour un jeu d'équipe, ou { success: bool } pour un jeu coopératif.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const until = async (ctx, ms, done) => { const t0 = Date.now(); while (Date.now() - t0 < ms * ctx.SPEED) { if (done()) return; await ctx.wait(100); } };
const bots = (ctx) => ctx.players.filter((p) => p.bot);
const result = (ctx, fn) => { const scores = {}, shows = {}; ctx.players.forEach((p) => { const [s, t] = fn(p); scores[p.id] = s; shows[p.id] = t; }); return { scores, shows }; };
const fmtS = (ms) => (ms / 1000).toFixed(2).replace('.', ',') + ' s';

/* ---------- Circuit de kart (le même pour tout le monde) ---------- */
// Circuits : forme (fonction de t), nom et ambiance (couleurs, décor).
const TRACKS = [
  { name: 'Ovale de Monstralia', ground: '#4d7c0f', road: '#475569', deco: ['🌳', '🌲', '🌼'], f: (t) => [500 + 390 * Math.cos(t) - 30 * Math.cos(2 * t), 350 + 240 * Math.sin(t) + 35 * Math.sin(3 * t)] },
  { name: 'Anneau de Méga City', ground: '#312e81', road: '#1f2937', deco: ['🏢', '🏙️', '🚦'], f: (t) => { const c = Math.cos(t), s = Math.sin(t); return [500 + 390 * Math.sign(c) * Math.pow(Math.abs(c), 0.6), 350 + 245 * Math.sign(s) * Math.pow(Math.abs(s), 0.6)]; } },
  { name: 'Grand Huit', ground: '#15803d', road: '#52525b', deco: ['🎡', '🎢', '🌳'], f: (t) => [500 + 400 * Math.sin(t), 350 + 250 * Math.sin(t) * Math.cos(t) * 1.6] },
  { name: 'Trèfle du Volcan', ground: '#7c2d12', road: '#292524', deco: ['🌋', '🔥', '🪨'], f: (t) => { const r = 1 + 0.2 * Math.cos(3 * t); return [500 + 330 * r * Math.cos(t), 360 + 245 * r * Math.sin(t)]; } },
  { name: 'Étoile du Désert', ground: '#d97706', road: '#78350f', deco: ['🌵', '🦂', '🐪'], f: (t) => { const r = 1 + 0.13 * Math.cos(5 * t); return [500 + 360 * r * Math.cos(t), 350 + 250 * r * Math.sin(t)]; } },
  { name: 'Cacahuète des Mines', ground: '#44403c', road: '#57534e', deco: ['⛏️', '💎', '🪨'], f: (t) => { const r = 1 + 0.32 * Math.cos(2 * t); return [500 + 320 * r * Math.cos(t), 350 + 290 * r * Math.sin(t) * 0.82]; } },
  { name: 'Côte des Pirates', ground: '#0369a1', road: '#a16207', deco: ['🌴', '⛵', '🐚'], f: (t) => [500 + 380 * Math.cos(t) + 50 * Math.sin(2 * t), 350 + 225 * Math.sin(t) + 45 * Math.cos(3 * t)] },
  { name: 'Glacier Glissant', ground: '#bae6fd', road: '#64748b', deco: ['⛄', '🌨️', '🐧'], f: (t) => { const r = 1 + 0.12 * Math.sin(4 * t); return [500 + 395 * r * Math.cos(t), 350 + 225 * r * Math.sin(t)]; }, ice: true },
];
function makeTrack(variant) {
  const T = TRACKS[variant % TRACKS.length];
  const pts = [];
  const N = 180;
  for (let i = 0; i < N; i++) { const p = T.f((i / N) * Math.PI * 2); pts.push([Math.round(p[0]), Math.round(p[1])]); }
  const cum = [0];
  for (let i = 1; i <= N; i++) { const a = pts[i - 1], b = pts[i % N]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  return { pts, cum, len: cum[N], w: 84, N, name: T.name, ground: T.ground, road: T.road, deco: T.deco, ice: !!T.ice, variant: variant % TRACKS.length };
}
function trackAt(tr, dist) {
  const d = ((dist % tr.len) + tr.len) % tr.len;
  let i = 0; while (tr.cum[i + 1] < d) i++;
  const a = tr.pts[i], b = tr.pts[(i + 1) % tr.N], f = (d - tr.cum[i]) / (tr.cum[i + 1] - tr.cum[i]);
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, a: Math.atan2(b[1] - a[1], b[0] - a[0]), idx: i + f };
}

module.exports = {
  degaine: {
    name: 'Dégaine !', icon: '🤠', modes: ['ffa', 'teams', '1vx'],
    rules: 'Attends que l’écran devienne VERT, puis tape le plus vite possible. Si tu tapes avant : faux départ !',
    async play(ctx) {
      ctx.set({ phase: 'wait' });
      await ctx.sleep(ctx.rand(2000, 5000));
      ctx.set({ phase: 'go' });
      bots(ctx).forEach((b) => { const ms = Math.round(ctx.rand(230, 560) / ctx.skill); ctx.later(ms, () => { if (!ctx.inputs[b.id]) ctx.inputs[b.id] = { ms }; }); });
      await until(ctx, 3000, () => ctx.players.every((p) => ctx.inputs[p.id]));
      return result(ctx, (p) => { const r = ctx.inputs[p.id]; if (!r) return [-2500, 'Trop lent']; if (r.early) return [-3000, 'Faux départ !']; return [-r.ms, r.ms + ' ms']; });
    },
    input(mg, pid, d) {
      if (mg.inputs[pid]) return;
      if (mg.pub.phase === 'wait' && d.early) mg.inputs[pid] = { early: true };
      else if (mg.pub.phase === 'go' && typeof d.ms === 'number') mg.inputs[pid] = { ms: Math.round(clamp(d.ms, 90, 5000)) };
    },
  },

  turbo: {
    name: 'Gâteau Turbo', icon: '🎂', modes: ['ffa', 'teams', '1vx'],
    rules: 'Tape le bouton le plus vite possible pendant 8 secondes pour foncer jusqu’au gâteau !',
    async play(ctx) { return mash(ctx, 8000); },
    input(mg, pid, d) { mashInput(mg, pid, d); },
  },

  chrono: {
    name: 'Chrono Parfait', icon: '⏱️', modes: ['ffa', 'teams', '1vx'],
    rules: 'Le chrono démarre puis disparaît au bout de 3 secondes. Arrête-le le plus près possible de 7,00 secondes !',
    async play(ctx) {
      ctx.set({ phase: 'play', target: 7000, hideAfter: 3000 });
      bots(ctx).forEach((b) => { const ms = 7000 + Math.round(ctx.rand(-800, 800) / ctx.skill); ctx.later(ms, () => { ctx.inputs[b.id] = { ms }; }); });
      await until(ctx, 13000, () => ctx.players.every((p) => ctx.inputs[p.id]));
      return result(ctx, (p) => { const r = ctx.inputs[p.id]; return r ? [-Math.abs(r.ms - 7000), fmtS(r.ms)] : [-7000, 'Pas arrêté']; });
    },
    input(mg, pid, d) { if (!mg.inputs[pid] && mg.pub.phase === 'play' && typeof d.ms === 'number') mg.inputs[pid] = { ms: Math.round(clamp(d.ms, 0, 20000)) }; },
  },

  compte: {
    name: 'Compte-les !', icon: '🔢', modes: ['ffa', 'teams', '1vx'],
    rules: 'Des objets défilent très vite. Compte combien de fois apparaît celui qu’on te montre. Le plus proche gagne, le plus rapide départage.',
    async play(ctx) {
      const cg = ctx.board.countGame;
      const total = ctx.rand(28, 38), good = ctx.rand(6, 13);
      const items = [];
      for (let i = 0; i < total; i++) items.push(i < good ? cg.target : ctx.pick(cg.others));
      const list = ctx.shuffle(items).map((e, i) => ({ e, t: Math.round(i * (6500 / total)), x: ctx.rand(8, 86), y: ctx.rand(10, 80) }));
      ctx.set({ phase: 'show', target: cg.target, items: list });
      await ctx.sleep(7600);
      const t0 = Date.now();
      ctx.room.mg.t0 = t0;
      ctx.set({ phase: 'answer', items: [] });
      bots(ctx).forEach((b) => { const n = Math.random() < Math.min(0.85, 0.4 * ctx.skill) ? good : good + ctx.rand(-2, 2); ctx.later(ctx.rand(2500, 6000), () => { if (!ctx.inputs[b.id]) ctx.inputs[b.id] = { n, ms: Date.now() - t0 }; }); });
      await until(ctx, 9500, () => ctx.players.every((p) => ctx.inputs[p.id]));
      ctx.set({ answer: good });
      return result(ctx, (p) => {
        const r = ctx.inputs[p.id]; if (!r) return [-20000, 'Pas répondu'];
        const diff = Math.abs(r.n - good);
        return [-diff * 1000 - Math.min(99, r.ms / 100), r.n + (diff === 0 ? ' ✔' : ' (' + (r.n > good ? '+' : '−') + diff + ')')];
      });
    },
    input(mg, pid, d) { if (!mg.inputs[pid] && mg.pub.phase === 'answer' && typeof d.n === 'number') mg.inputs[pid] = { n: clamp(Math.round(d.n), 0, 99), ms: Date.now() - (mg.t0 || Date.now()) }; },
  },

  coffres: {
    name: 'Les Coffres', icon: '🧰', modes: ['ffa'],
    rules: 'Choisis un coffre ! Certains sont pleins, d’autres vides. Plusieurs joueurs peuvent prendre le même. Pure chance…',
    async play(ctx) {
      const n = Math.min(9, Math.max(5, ctx.players.length + 1));
      const values = ctx.shuffle([10, 8, 6, 5, 4, 3, 2, 1, 0].slice(0, n - 2).concat([0, 0]));
      const picks = {};
      ctx.set({ phase: 'pick', n, picks });
      bots(ctx).forEach((b) => ctx.later(ctx.rand(1500, 6000), () => { if (picks[b.id] == null) { picks[b.id] = ctx.rand(0, n - 1); ctx.set({ picks }); } }));
      await until(ctx, 10500, () => ctx.players.every((p) => picks[p.id] != null));
      ctx.set({ phase: 'reveal', values });
      await ctx.sleep(3000);
      return result(ctx, (p) => { const i = picks[p.id]; if (i == null) return [-1, 'Aucun coffre']; return [values[i], values[i] ? values[i] + ' pépites' : 'Vide !']; });
    },
    input(mg, pid, d, room) {
      const picks = mg.pub.picks;
      if (!picks || mg.pub.phase !== 'pick' || picks[pid] != null || typeof d.i !== 'number' || d.i < 0 || d.i >= mg.pub.n) return;
      picks[pid] = Math.floor(d.i); room.broadcast();
    },
  },

  kart: {
    name: 'Monstro Kart', icon: '🏎️', modes: ['ffa', 'teams', '1vx'],
    rules: '2 tours de circuit ! Ton kart accélère tout seul : tourne avec ◀ ▶ (ou les flèches du clavier). Sortir de la piste te ralentit.',
    async play(ctx) {
      const variant = ctx.rand(0, TRACKS.length - 1);
      const tr = makeTrack(variant);
      const LAPS = 2;
      const karts = {};
      const grid = ctx.players.map((p, i) => p.id);
      grid.forEach((pid, i) => { const s = trackAt(tr, -12 - i * 26); karts[pid] = { x: Math.round(s.x), y: Math.round(s.y), a: s.a, prog: 0, fin: null, slot: i }; });
      const botSpeed = {};
      bots(ctx).forEach((b) => { botSpeed[b.id] = (175 + Math.random() * 45) * (0.7 + 0.3 * ctx.skill); });
      ctx.room.mg.track = tr;
      ctx.set({ phase: 'race', track: { pts: tr.pts, w: tr.w, laps: LAPS, N: tr.N, name: tr.name, ground: tr.ground, road: tr.road, deco: tr.deco, ice: tr.ice, variant: tr.variant }, karts, startAt: Date.now() });
      const t0 = Date.now();
      const botDist = {}; bots(ctx).forEach((b) => { botDist[b.id] = -12 - karts[b.id].slot * 26; });
      while (Date.now() - t0 < 55000 * ctx.SPEED) {
        await ctx.wait(150);
        const el = (Date.now() - t0);
        bots(ctx).forEach((b) => {
          const k = karts[b.id]; if (k.fin) return;
          botDist[b.id] += botSpeed[b.id] * 0.15 / ctx.SPEED * (0.9 + Math.random() * 0.2);
          const s = trackAt(tr, botDist[b.id]);
          k.x = Math.round(s.x); k.y = Math.round(s.y); k.a = s.a;
          k.prog = Math.max(0, botDist[b.id] / tr.len * tr.N);
          if (botDist[b.id] >= tr.len * LAPS) k.fin = Math.round(el / ctx.SPEED);
        });
        ctx.players.filter((p) => !p.bot).forEach((p) => { const r = ctx.inputs[p.id]; if (r) Object.assign(karts[p.id], r); });
        ctx.set({ karts });
        if (ctx.players.every((p) => karts[p.id].fin)) break;
        // Quand tout le monde sauf les retardataires a fini depuis 12 s, on arrête.
        const fins = ctx.players.filter((p) => karts[p.id].fin).length;
        if (fins > 0 && fins >= ctx.players.length - 1) { ctx.room.mg.lastWait = ctx.room.mg.lastWait || Date.now(); if (Date.now() - ctx.room.mg.lastWait > 12000 * ctx.SPEED) break; }
      }
      await ctx.wait(500);
      return result(ctx, (p) => {
        const k = karts[p.id];
        if (k.fin) { const s = Math.round(k.fin / 1000); return [1e6 - k.fin, Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')]; }
        return [k.prog, Math.min(99, Math.round(k.prog / (tr.N * LAPS) * 100)) + ' % du parcours'];
      });
    },
    input(mg, pid, d) {
      if (mg.pub.phase !== 'race') return;
      const k = mg.pub.karts && mg.pub.karts[pid]; if (!k || k.fin) return;
      const r = mg.inputs[pid] || {};
      if (typeof d.x === 'number') { r.x = Math.round(clamp(d.x, -50, 1050)); r.y = Math.round(clamp(d.y, -50, 750)); r.a = +d.a || 0; }
      if (typeof d.prog === 'number') r.prog = Math.max(r.prog || 0, Math.min(d.prog, (r.prog || 0) + 30)); // pas de téléportation
      if (typeof d.fin === 'number' && (r.prog || 0) >= mg.pub.track.N * mg.pub.track.laps - 6) r.fin = Math.round(clamp(d.fin, 5000, 120000));
      mg.inputs[pid] = r;
    },
  },

  rink: {
    name: 'Patinoire Givrée', icon: '⛸️', modes: ['ffa', 'teams', '1vx'],
    rules: 'Glisse sur la glace et ramasse un maximum de gemmes en 40 secondes ! Gemme bleue = 1 point, gemme dorée = 3. Dirige ton Monstro en faisant glisser ton doigt (ou avec les flèches du clavier). Attention, ça glisse !',
    async play(ctx) {
      const R = 9.5, IN = 2.6, DUR = 40000;
      const mg = ctx.room.mg;
      const skaters = {}, scores = {};
      ctx.players.forEach((p, i) => { const a = (i / ctx.players.length) * Math.PI * 2; skaters[p.id] = { x: +(Math.cos(a) * 6).toFixed(2), z: +(Math.sin(a) * 6).toFixed(2), a: a + Math.PI }; scores[p.id] = 0; });
      let gid = 0; const gems = [];
      const spawn = () => { const r = Math.sqrt(ctx.rand(0, 1000) / 1000) * (R - 1.2 - IN - 0.4) + IN + 0.4, a = Math.random() * Math.PI * 2; gems.push({ id: ++gid, x: +(Math.cos(a) * r).toFixed(2), z: +(Math.sin(a) * r).toFixed(2), g: Math.random() < 0.15 ? 3 : 1 }); };
      const want = 4 + ctx.players.length;
      for (let i = 0; i < want; i++) spawn();
      mg.pickups = [];
      const take = (pid, gem) => { const i = gems.indexOf(gem); if (i < 0) return; gems.splice(i, 1); scores[pid] += gem.g; };
      const t0 = Date.now();
      ctx.set({ phase: 'rink', rink: { R, IN, dur: DUR }, skaters, gems, scores, startAt: t0 });
      const bv = {}; bots(ctx).forEach((b) => { bv[b.id] = { vx: 0, vz: 0, sp: (1.5 + Math.random() * 0.4) * (0.6 + 0.4 * ctx.skill), tgt: null, next: 0 }; });
      let last = Date.now();
      while (Date.now() - t0 < DUR * ctx.SPEED) {
        await ctx.wait(120);
        const now = Date.now(), dt = Math.min(0.3, (now - last) / 1000 / ctx.SPEED); last = now;
        bots(ctx).forEach((b) => {
          const s = skaters[b.id], v = bv[b.id];
          if (!gems.includes(v.tgt) || now > v.next) { // hésite un peu avant de changer de cible
            let bd = 1e9; v.tgt = null; gems.forEach((g) => { const d = Math.hypot(g.x - s.x, g.z - s.z) / (g.g === 3 ? 1.6 : 1) + Math.random() * 3 / ctx.skill; if (d < bd) { bd = d; v.tgt = g; } });
            v.next = now + (700 + Math.random() * 900) / ctx.skill * ctx.SPEED;
          }
          const best = v.tgt;
          if (best) { const dx = best.x - s.x, dz = best.z - s.z, L = Math.hypot(dx, dz) || 1; v.vx += (dx / L * v.sp - v.vx) * Math.min(1, dt * 1.4); v.vz += (dz / L * v.sp - v.vz) * Math.min(1, dt * 1.4); }
          s.x += v.vx * dt; s.z += v.vz * dt;
          const r = Math.hypot(s.x, s.z);
          if (r > R - 0.6) { s.x *= (R - 0.6) / r; s.z *= (R - 0.6) / r; v.vx *= -0.4; v.vz *= -0.4; }
          if (r < IN) { s.x *= IN / (r || 1); s.z *= IN / (r || 1); }
          s.a = Math.atan2(v.vx, v.vz); s.m = 1;
          s.x = +s.x.toFixed(2); s.z = +s.z.toFixed(2);
          gems.slice().forEach((g) => { if (Math.hypot(g.x - s.x, g.z - s.z) < 0.85) take(b.id, g); });
        });
        ctx.players.filter((p) => !p.bot).forEach((p) => { const r = ctx.inputs[p.id]; if (r) Object.assign(skaters[p.id], { x: r.x, z: r.z, a: r.a, m: r.m }); });
        mg.pickups.splice(0).forEach(({ pid, id }) => { const g = gems.find((x) => x.id === id), s = skaters[pid]; if (g && s && Math.hypot(g.x - s.x, g.z - s.z) < 1.6) take(pid, g); });
        while (gems.length < want) spawn();
        ctx.set({ skaters, gems, scores });
      }
      ctx.set({ phase: 'done' });
      await ctx.wait(400);
      return result(ctx, (p) => [scores[p.id], scores[p.id] + ' point' + (scores[p.id] > 1 ? 's' : '')]);
    },
    input(mg, pid, d) {
      if (mg.pub.phase !== 'rink') return;
      const R = mg.pub.rink.R;
      if (typeof d.x === 'number' && typeof d.z === 'number') {
        const prev = mg.inputs[pid], now = Date.now();
        let x = clamp(d.x, -R, R), z = clamp(d.z, -R, R);
        if (prev && prev.t) { const dt = (now - prev.t) / 1000, L = Math.hypot(x - prev.x, z - prev.z), mx = 9 * dt + 0.6; if (L > mx) { x = prev.x + (x - prev.x) * mx / L; z = prev.z + (z - prev.z) * mx / L; } } // pas de téléportation
        mg.inputs[pid] = { x: +x.toFixed(2), z: +z.toFixed(2), a: +d.a || 0, m: d.m ? 1 : 0, t: now };
      }
      if (typeof d.gem === 'number') (mg.pickups || (mg.pickups = [])).push({ pid, id: d.gem });
    },
  },

  ballons: {
    name: 'Ballons Pop', icon: '🎈', modes: ['ffa', 'teams', '1vx'],
    rules: 'Des ballons apparaissent : éclate-les avant les autres ! Les ballons dorés valent 3 points, les bombes t’en retirent 2.',
    async play(ctx) {
      const balloons = []; const points = {}; ctx.players.forEach((p) => { points[p.id] = 0; });
      ctx.room.mg.balloons = balloons; ctx.room.mg.points = points;
      let id = 0;
      ctx.set({ phase: 'play', balloons, points });
      const t0 = Date.now();
      const botNext = {}; bots(ctx).forEach((b) => { botNext[b.id] = Date.now() + ctx.rand(600, 1400); });
      while (Date.now() - t0 < 15000 * ctx.SPEED) {
        await ctx.wait(350);
        const now = Date.now();
        for (let i = balloons.length - 1; i >= 0; i--) if (now - balloons[i].born > 2600) balloons.splice(i, 1);
        const kind = Math.random() < 0.12 ? 'gold' : Math.random() < 0.12 ? 'bomb' : 'red';
        balloons.push({ id: ++id, x: ctx.rand(6, 90), y: ctx.rand(8, 82), k: kind, born: now });
        bots(ctx).forEach((b) => {
          if (now < botNext[b.id]) return;
          botNext[b.id] = now + ctx.rand(700, 1500) / ctx.skill * ctx.SPEED;
          const target = balloons.filter((x) => x.k !== 'bomb' || Math.random() < 0.15)[0];
          if (target) popBalloon(ctx.room.mg, b.id, target.id);
        });
        ctx.set({ balloons, points });
      }
      ctx.set({ phase: 'done', balloons: [] });
      return result(ctx, (p) => [points[p.id], points[p.id] + ' points']);
    },
    input(mg, pid, d, room) { if (mg.pub.phase === 'play' && popBalloon(mg, pid, d.id)) room.broadcast(); },
  },

  bombe: {
    name: 'Patate Bombe', icon: '💣', modes: ['ffa'],
    rules: 'Une bombe passe de main en main. Si tu l’as, appuie vite sur PASSER ! Quand elle explose, celui qui la tient est éliminé.',
    async play(ctx) {
      const alive = ctx.players.map((p) => p.id);
      const out = [];
      const rounds = Math.min(3, ctx.players.length - 1);
      for (let r = 0; r < rounds; r++) {
        let holder = ctx.pick(alive);
        ctx.room.mg.holder = holder; ctx.room.mg.passAt = Date.now();
        ctx.set({ phase: 'play', holder, alive: alive.slice(), out: out.slice(), round: r + 1 });
        const fuse = ctx.rand(6000, 12000);
        const t0 = Date.now();
        let botAt = 0;
        while (Date.now() - t0 < fuse * ctx.SPEED) {
          await ctx.wait(100);
          const h = ctx.room.mg.holder;
          const hp = ctx.players.find((p) => p.id === h);
          if (hp && hp.bot) {
            if (!botAt) botAt = Date.now() + ctx.rand(400, 1600) / ctx.skill * ctx.SPEED;
            if (Date.now() >= botAt) { passBomb(ctx.room.mg, h); botAt = 0; ctx.set({ holder: ctx.room.mg.holder }); }
          } else botAt = 0;
          if (ctx.room.mg.holder !== ctx.pub_holder) { ctx.pub_holder = ctx.room.mg.holder; ctx.set({ holder: ctx.room.mg.holder }); }
        }
        holder = ctx.room.mg.holder;
        alive.splice(alive.indexOf(holder), 1); out.push(holder);
        ctx.set({ phase: 'boom', holder, alive: alive.slice(), out: out.slice() });
        await ctx.sleep(2200);
      }
      return result(ctx, (p) => { const i = out.indexOf(p.id); return i < 0 ? [100, 'Survivant !'] : [i, 'Boum ! (' + (i + 1) + 'e éliminé)']; });
    },
    input(mg, pid, d, room) { if (mg.pub.phase === 'play' && d.pass && mg.holder === pid && Date.now() - mg.passAt > 250) { passBomb(mg, pid); mg.pub.holder = mg.holder; room.broadcast(); } },
  },

  memo: {
    name: 'Mémo-Monstre', icon: '🧠', modes: ['ffa', 'teams', '1vx'],
    rules: 'Retiens la suite de couleurs, puis reproduis-la dans l’ordre. Le plus long sans erreur gagne, le plus rapide départage.',
    async play(ctx) {
      const len = 7;
      const seq = Array.from({ length: len }, () => ctx.rand(0, 3));
      ctx.set({ phase: 'show', seq, len, step: 650 });
      await ctx.sleep(650 * len + 900);
      const t0 = Date.now(); ctx.room.mg.t0 = t0; ctx.room.mg.seq = seq;
      ctx.set({ phase: 'input', seq: null });
      bots(ctx).forEach((b) => { const ok = Math.random() < Math.min(0.9, 0.5 * ctx.skill) ? len : ctx.rand(2, len - 1); ctx.later(ctx.rand(4000, 9000), () => { ctx.inputs[b.id] = { ok, ms: Date.now() - t0 }; }); });
      await until(ctx, 15000, () => ctx.players.every((p) => ctx.inputs[p.id]));
      ctx.set({ answer: seq });
      return result(ctx, (p) => { const r = ctx.inputs[p.id]; if (!r) return [0, 'Pas fini']; return [r.ok * 1000 - Math.min(999, r.ms / 20), r.ok + ' / ' + len + (r.ok === len ? ' ✔' : '')]; });
    },
    input(mg, pid, d) {
      if (mg.inputs[pid] || mg.pub.phase !== 'input' || !Array.isArray(d.seq) || !mg.seq) return;
      let ok = 0; while (ok < mg.seq.length && d.seq[ok] === mg.seq[ok]) ok++;
      mg.inputs[pid] = { ok, ms: Date.now() - mg.t0 };
    },
  },

  corde: {
    name: 'Tir à la corde', icon: '🪢', modes: ['teams', '1vx'],
    rules: 'Tape le plus vite possible pour tirer la corde de ton côté ! Ce qui compte, c’est la vitesse moyenne de chaque équipe.',
    async play(ctx) {
      const A = ctx.teams.A, B = ctx.teams.B;
      ctx.players.forEach((p) => { ctx.inputs[p.id] = { count: 0, start: Date.now() }; });
      const rate = {}; bots(ctx).forEach((b) => { rate[b.id] = (5 + Math.random() * 4) * ctx.skill; });
      let pos = 0;
      ctx.set({ phase: 'play', pos, dur: 10000 * ctx.SPEED });
      const t0 = Date.now(); let last = {}; ctx.players.forEach((p) => { last[p.id] = 0; });
      while (Date.now() - t0 < 10000 * ctx.SPEED && Math.abs(pos) < 100) {
        await ctx.wait(300);
        const el = (Date.now() - t0) / ctx.SPEED / 1000;
        const cnt = (pid) => (rate[pid] != null ? rate[pid] * el : ctx.inputs[pid].count);
        const avg = (team) => team.reduce((s, pid) => { const c = cnt(pid); const d = c - last[pid]; return s + d; }, 0) / team.length;
        const dA = avg(A), dB = avg(B);
        ctx.players.forEach((p) => { last[p.id] = cnt(p.id); });
        pos = clamp(pos + (dA - dB) * 6, -100, 100);
        ctx.set({ pos: Math.round(pos) });
      }
      return { winner: pos >= 0 ? 'A' : 'B', note: Math.abs(pos) >= 100 ? 'Corde gagnée !' : 'Temps écoulé' };
    },
    input(mg, pid, d) { mashInput(mg, pid, d); },
  },

  portes: {
    name: 'Les Portes du Gardien', icon: '🚪', modes: ['1vx'],
    rules: 'Le Gardien (seul) verrouille 2 portes sur 5. Les autres choisissent chacun une porte : ceux qui tombent sur une porte verrouillée sont attrapés !',
    async play(ctx) {
      const solo = ctx.teams.A[0], team = ctx.teams.B;
      const doors = 5;
      ctx.room.mg.locks = null; ctx.room.mg.picks = {};
      ctx.set({ phase: 'pick', doors, solo, picked: [] });
      const sp = ctx.players.find((p) => p.id === solo);
      if (sp.bot) ctx.later(ctx.rand(1500, 4000), () => { ctx.room.mg.locks = ctx.shuffle([0, 1, 2, 3, 4]).slice(0, 2); });
      bots(ctx).filter((b) => b.id !== solo).forEach((b) => ctx.later(ctx.rand(1500, 5000), () => { ctx.room.mg.picks[b.id] = ctx.rand(0, 4); ctx.set({ picked: Object.keys(ctx.room.mg.picks) }); }));
      await until(ctx, 15000, () => ctx.room.mg.locks && team.every((pid) => ctx.room.mg.picks[pid] != null));
      const locks = ctx.room.mg.locks || ctx.shuffle([0, 1, 2, 3, 4]).slice(0, 2);
      team.forEach((pid) => { if (ctx.room.mg.picks[pid] == null) ctx.room.mg.picks[pid] = ctx.rand(0, 4); });
      const caught = team.filter((pid) => locks.includes(ctx.room.mg.picks[pid]));
      ctx.set({ phase: 'reveal', locks, picks: ctx.room.mg.picks, caught });
      await ctx.sleep(3500);
      return { winner: caught.length * 2 >= team.length ? 'A' : 'B', note: caught.length + ' attrapé(s) sur ' + team.length };
    },
    input(mg, pid, d, room) {
      if (mg.pub.phase !== 'pick') return;
      if (pid === mg.pub.solo) { if (Array.isArray(d.locks) && d.locks.length === 2 && d.locks[0] !== d.locks[1] && d.locks.every((x) => x >= 0 && x < 5)) { mg.locks = d.locks.map(Number); room.broadcast(); } return; }
      if (mg.picks[pid] == null && typeof d.door === 'number' && d.door >= 0 && d.door < 5) { mg.picks[pid] = d.door; mg.pub.picked = Object.keys(mg.picks); room.broadcast(); }
    },
  },

  coffrefort: {
    name: 'Le Coffre-fort', icon: '🏦', modes: ['coop'],
    rules: 'Tous ensemble ! Tapez le plus vite possible pendant 8 secondes pour forcer le coffre-fort. Si la jauge est pleine, tout le monde gagne 10 pièces.',
    async play(ctx) {
      const target = ctx.players.length * 58;
      ctx.players.forEach((p) => { ctx.inputs[p.id] = { count: 0, start: Date.now() }; });
      const rate = {}; bots(ctx).forEach((b) => { rate[b.id] = (6 + Math.random() * 3) * ctx.skill; });
      ctx.set({ phase: 'play', target, total: 0, dur: 8000 * ctx.SPEED });
      const t0 = Date.now(); let total = 0;
      while (Date.now() - t0 < 8000 * ctx.SPEED) {
        await ctx.wait(300);
        const el = (Date.now() - t0) / ctx.SPEED / 1000;
        total = ctx.players.reduce((s, p) => s + (rate[p.id] != null ? Math.round(rate[p.id] * el) : ctx.inputs[p.id].count), 0);
        ctx.set({ total });
        if (total >= target) break;
      }
      return { success: total >= target, note: total + ' / ' + target };
    },
    input(mg, pid, d) { mashInput(mg, pid, d); },
  },

  synchro: {
    name: 'Synchro Parfaite', icon: '🤝', modes: ['coop'],
    rules: 'Tous ensemble ! Arrêtez votre chrono à 5,00 secondes (il disparaît après 2 s). Si l’écart moyen est sous 0,40 s, tout le monde gagne 10 pièces.',
    async play(ctx) {
      ctx.set({ phase: 'play', target: 5000, hideAfter: 2000 });
      bots(ctx).forEach((b) => { const ms = 5000 + Math.round(ctx.rand(-450, 450) / ctx.skill); ctx.later(ms, () => { ctx.inputs[b.id] = { ms }; }); });
      await until(ctx, 11000, () => ctx.players.every((p) => ctx.inputs[p.id]));
      const errs = ctx.players.map((p) => (ctx.inputs[p.id] ? Math.abs(ctx.inputs[p.id].ms - 5000) : 5000));
      const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
      return { success: mean <= 400, note: 'Écart moyen : ' + fmtS(mean) };
    },
    input(mg, pid, d) { if (!mg.inputs[pid] && mg.pub.phase === 'play' && typeof d.ms === 'number') mg.inputs[pid] = { ms: Math.round(clamp(d.ms, 0, 20000)) }; },
  },
};

/* ---------- Outils partagés ---------- */
async function mash(ctx, dur) {
  const counts = {};
  ctx.players.forEach((p) => { counts[p.id] = 0; ctx.inputs[p.id] = { count: 0, start: Date.now() }; });
  const rates = {}; bots(ctx).forEach((b) => { rates[b.id] = (5 + Math.random() * 4) * ctx.skill; });
  ctx.set({ phase: 'play', dur: dur * ctx.SPEED, counts });
  const t0 = Date.now();
  while (Date.now() - t0 < dur * ctx.SPEED) {
    await ctx.wait(350);
    const el = (Date.now() - t0) / ctx.SPEED / 1000;
    ctx.players.forEach((p) => { counts[p.id] = p.bot ? Math.round(rates[p.id] * el) : ctx.inputs[p.id].count; });
    ctx.set({ counts });
  }
  await ctx.wait(400);
  ctx.players.forEach((p) => { counts[p.id] = p.bot ? Math.round(rates[p.id] * dur / 1000) : ctx.inputs[p.id].count; });
  ctx.set({ counts, phase: 'done' });
  return result(ctx, (p) => [counts[p.id], counts[p.id] + ' taps']);
}
function mashInput(mg, pid, d) {
  const r = mg.inputs[pid];
  if (!r || typeof d.count !== 'number') return;
  const max = Math.round((Date.now() - r.start) / 1000 * 16) + 5; // 16 taps / seconde maximum
  r.count = clamp(Math.max(r.count, Math.round(d.count)), 0, max);
}
function popBalloon(mg, pid, id) {
  const i = mg.balloons.findIndex((b) => b.id === id);
  if (i < 0) return false;
  const b = mg.balloons[i];
  mg.balloons.splice(i, 1);
  mg.points[pid] = (mg.points[pid] || 0) + (b.k === 'gold' ? 3 : b.k === 'bomb' ? -2 : 1);
  return true;
}
function passBomb(mg, pid) {
  const others = mg.pub.alive.filter((x) => x !== pid);
  if (!others.length) return;
  mg.holder = others[Math.floor(Math.random() * others.length)];
  mg.passAt = Date.now();
}
module.exports._track = { makeTrack, trackAt, TRACKS };
