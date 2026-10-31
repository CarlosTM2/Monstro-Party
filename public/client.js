/* Monstro Party — client navigateur */
(function () {
  const { THEMES, makeBoard, CHARACTERS, WORLD, GAME, CARDS, RARITY, charSVG } = window.PARTY;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CH = {}; CHARACTERS.forEach((c) => { CH[c.id] = c; });
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const svg = (id, mood) => (CH[id] ? charSVG(CH[id], mood) : '');
  const mini = (id, size) => svg(id).replace('<svg', '<svg style="width:' + (size || 30) + 'px;height:' + (size || 30) + 'px;vertical-align:middle"');
  const IMG = {};
  CHARACTERS.forEach((c) => { const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(charSVG(c)); IMG[c.id] = im; });

  /* ---------------- Sons ---------------- */
  let actx = null;
  function beep(freq, dur, type, vol) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'square'; o.frequency.value = freq; g.gain.value = vol || 0.05;
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
    } catch (e) {}
  }
  const sfx = {
    step: () => beep(520, 0.06, 'triangle', 0.04),
    coin: () => { beep(988, 0.08); setTimeout(() => beep(1319, 0.15), 70); },
    bad: () => beep(160, 0.25, 'sawtooth', 0.05),
    star: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'triangle', 0.07), i * 110)),
    dice: () => beep(300 + Math.random() * 400, 0.04, 'square', 0.03),
    tap: () => beep(700, 0.03, 'square', 0.03),
    go: () => beep(880, 0.25, 'square', 0.06),
    item: () => { beep(660, 0.08, 'triangle'); setTimeout(() => beep(990, 0.12, 'triangle'), 80); },
  };
  function initAudio() { beep(1, 0.01, 'sine', 0.0001); }

  /* ---------------- Connexion ---------------- */
  let ws = null, S = null, ME = null, retry = 0;
  const myChar = () => store.get('mp_char') || 'gromp';
  function connect() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws.onopen = () => {
      retry = 0; $('conn').classList.add('hidden');
      let sess = null; try { sess = JSON.parse(store.get('mp_sess') || 'null'); } catch (e) {}
      if (sess && sess.code && sess.token) send({ t: 'rejoin', code: sess.code, token: sess.token });
    };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMsg(m); };
    ws.onclose = () => { $('conn').classList.remove('hidden'); setTimeout(connect, Math.min(5000, 500 * Math.pow(2, retry++))); };
  }
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

  function onMsg(m) {
    switch (m.t) {
      case 'joined': store.set('mp_sess', JSON.stringify({ code: m.code, token: m.token })); history.replaceState(null, '', '/' + m.code); break;
      case 'gone': store.del('mp_sess'); S = null; ME = null; show('home'); hideOverlay(); break;
      case 'error': $('homeErr').textContent = m.text; $('lobbyErr').textContent = m.text; setTimeout(() => { $('homeErr').textContent = ''; $('lobbyErr').textContent = ''; }, 4000); break;
      case 'state': setState(m.state, m.you); break;
      case 'toast': toast(m.text); break;
      case 'dice': showDice(m); break;
      case 'move': animMove(m.pid, m.path); break;
      case 'teleport': animTeleport(m.pid, m.to, m.fly); break;
      case 'fx': onFx(m); break;
      case 'banner': banner(m.text); break;
      case 'roulette': roulette(m); break;
      case 'casino': casinoShow(m); break;
      case 'booster': boosterShow(m); break;
      case 'end': END = m; break;
    }
  }

  /* ---------------- Écrans ---------------- */
  function show(id) { ['home', 'lobby', 'game'].forEach((s) => $(s).classList.toggle('hidden', s !== id)); }
  let END = null, lastPhase = null;
  const board = () => makeBoard(S.settings.theme, S.settings.size, S.settings.floors);
  const coinIcon = () => (S ? THEMES[S.settings.theme].coin.icon : '🪙');
  const starIcon = () => (S ? THEMES[S.settings.theme].star.icon : '⭐');

  function setState(st, you) {
    const prev = S;
    S = st; ME = you;
    const me = S.players.find((p) => p.id === ME);
    if (S.phase === 'lobby') { show('lobby'); renderLobby(me); hideOverlay(); END = null; cam.init = false; }
    else { show('game'); renderGame(prev); }
    if (S.phase === 'minigame') renderMinigame(); else if (S.phase === 'end') renderEnd(); else if (lastPhase === 'minigame' || lastPhase === 'end') hideOverlay();
    lastPhase = S.phase;
  }

  /* ---------- Accueil ---------- */
  function renderCharGrid(el, selected, taken, onPick) {
    el.innerHTML = CHARACTERS.map((c) => '<div class="char' + (c.id === selected ? ' sel' : '') + (taken.includes(c.id) ? ' taken' : '') + '" data-id="' + c.id + '">' + charSVG(c, c.id === selected ? 'happy' : '') + '<span class="cn">' + esc(c.name) + '</span></div>').join('');
    el.querySelectorAll('.char').forEach((d) => d.addEventListener('click', () => { if (!d.classList.contains('taken')) onPick(d.dataset.id); }));
  }
  function showLore(id) { const c = CH[id]; $('charLore').innerHTML = '<b>' + esc(c.name) + '</b> — ' + esc(c.lore); }
  function initHome() {
    $('name').value = store.get('mp_name') || '';
    const pathCode = (location.pathname.match(/^\/([A-Z0-9]{4})$/i) || [])[1];
    if (pathCode) $('code').value = pathCode.toUpperCase();
    const pickHome = (id) => { store.set('mp_char', id); renderCharGrid($('charGrid'), id, [], pickHome); showLore(id); };
    pickHome(myChar());
    const nm = () => { const n = $('name').value.trim(); store.set('mp_name', n); return n; };
    const err = (t) => { $('homeErr').textContent = t; };
    $('btnCreate').onclick = () => { initAudio(); if (!nm()) return err('Choisis un pseudo.'); send({ t: 'create', name: nm(), char: myChar() }); };
    $('btnJoin').onclick = () => {
      initAudio();
      const code = $('code').value.trim().toUpperCase();
      if (!nm()) return err('Choisis un pseudo.');
      if (code.length !== 4) return err('Entre le code à 4 caractères.');
      send({ t: 'join', code, name: nm(), char: myChar() });
    };
    $('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnJoin').click(); });
    document.querySelectorAll('.btnHelp').forEach((b) => (b.onclick = showHelp));
  }

  /* ---------- Salle d'attente ---------- */
  function seg(el, values, current, enabled, onPick) {
    el.innerHTML = values.map(([v, l]) => '<button class="' + (current === v ? 'sel' : '') + '" data-v="' + v + '"' + (enabled ? '' : ' disabled') + '>' + l + '</button>').join('');
    el.querySelectorAll('button').forEach((b) => (b.onclick = () => { const v = values.find((x) => String(x[0]) === b.dataset.v)[0]; onPick(v); }));
  }
  function renderLobby(me) {
    if (!me) return;
    const st = S.settings, H = me.host;
    $('lobbyCode').textContent = S.code;
    $('pCount').textContent = '(' + S.players.length + '/8)';
    $('lobbyPlayers').innerHTML = S.players.map((p) => '<div class="lp' + (p.online ? '' : ' off') + '" style="border-color:' + p.color + '">' + svg(p.char) + '<div class="nm">' + (p.host ? '👑 ' : '') + esc(p.name) + '<small>' + esc(CH[p.char].name) + (p.id === ME ? ' · toi' : '') + (st.powers === 'choice' && p.power && !p.bot ? ' · ' + GAME.powers[p.power].icon : '') + '</small></div>' + (H && p.id !== ME ? '<button class="kick" data-k="' + p.id + '" title="Retirer">✕</button>' : '') + '</div>').join('');
    $('lobbyPlayers').querySelectorAll('.kick').forEach((b) => (b.onclick = () => send({ t: 'kick', pid: b.dataset.k })));
    renderCharGrid($('lobbyChars'), me.char, S.players.filter((p) => p.id !== ME).map((p) => p.char), (id) => { store.set('mp_char', id); send({ t: 'char', char: id }); });
    $('boardChoice').innerHTML = Object.values(THEMES).map((b) => '<div class="bc' + (st.theme === b.id ? ' sel' : '') + (H ? '' : ' ro') + '" data-b="' + b.id + '" style="background:linear-gradient(135deg,' + b.bg[0] + ',' + b.bg[1] + ')"><div class="be">' + b.emoji + '</div><b>' + esc(b.name) + '</b><p>' + esc(b.desc) + '</p><p class="bmeta">Boss : ' + esc(WORLD.bosses[b.id].name) + '<br>Monnaie : ' + b.coin.icon + ' ' + esc(b.coin.name) + ' · Étoile : ' + b.star.icon + ' ' + esc(b.star.name) + '</p></div>').join('');
    if (H) $('boardChoice').querySelectorAll('.bc').forEach((d) => (d.onclick = () => send({ t: 'settings', theme: d.dataset.b })));
    seg($('sizeChoice'), [['small', 'Petit'], ['medium', 'Moyen'], ['large', 'Grand']], st.size, H, (v) => send({ t: 'settings', size: v }));
    seg($('floorChoice'), [[false, 'Sans étage'], [true, 'Avec étage']], st.floors, H && st.size !== 'small', (v) => send({ t: 'settings', floors: v }));
    seg($('turnsChoice'), [[5, '5'], [10, '10'], [15, '15'], [20, '20'], [25, '25']], st.turns, H, (v) => send({ t: 'settings', turns: v }));
    seg($('powersChoice'), [['off', 'Désactivés'], ['choice', 'Au choix'], ['random', 'Aléatoires']], st.powers, H, (v) => send({ t: 'settings', powers: v }));
    seg($('eventsChoice'), [[true, 'Oui'], [false, 'Non']], st.events, H, (v) => send({ t: 'settings', events: v }));
    seg($('bonusChoice'), [[true, '3 au hasard'], [false, 'Aucune']], st.bonus, H, (v) => send({ t: 'settings', bonus: v }));
    seg($('boosterChoice'), [[true, 'Oui'], [false, 'Non']], st.boosters, H, (v) => send({ t: 'settings', boosters: v }));
    seg($('gamblingChoice'), [[true, 'Oui'], [false, 'Non']], st.gambling, H, (v) => send({ t: 'settings', gambling: v }));
    const B = makeBoard(st.theme, st.size, st.floors);
    $('boardInfo').textContent = B.nodes.length + ' cases · ' + B.stars + ' ' + B.star.name.toLowerCase() + (B.stars > 1 ? 's' : '') + ' en jeu · ' + B.star.rule;
    $('powerPick').classList.toggle('hidden', st.powers !== 'choice');
    if (st.powers === 'choice') {
      $('powerGrid').innerHTML = Object.entries(GAME.powers).map(([k, p]) => '<div class="pw' + (me.power === k ? ' sel' : '') + '" data-k="' + k + '"><span class="pi">' + p.icon + '</span><b>' + esc(p.name) + '</b><small>' + esc(p.desc) + '</small></div>').join('');
      $('powerGrid').querySelectorAll('.pw').forEach((d) => (d.onclick = () => send({ t: 'power', power: d.dataset.k })));
    }
    $('hostTools').classList.toggle('hidden', !H || S.players.length >= 8);
    $('btnStart').classList.toggle('hidden', !H);
    $('waitHost').classList.toggle('hidden', H);
  }
  function initLobby() {
    $('btnBot').onclick = () => send({ t: 'addbot' });
    $('btnStart').onclick = () => { initAudio(); send({ t: 'start' }); };
    $('btnLeave').onclick = () => { send({ t: 'leave' }); store.del('mp_sess'); S = null; history.replaceState(null, '', '/'); show('home'); };
    $('btnCopy').onclick = () => {
      const url = location.origin + '/' + S.code;
      const ok = () => { $('btnCopy').textContent = 'Lien copié ✔'; setTimeout(() => ($('btnCopy').textContent = 'Copier le lien d’invitation'), 2000); };
      if (navigator.share && /Mobi/.test(navigator.userAgent)) navigator.share({ title: 'Monstro Party', text: 'Rejoins ma partie ! Code ' + S.code, url }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, () => prompt('Copie ce lien :', url));
      else prompt('Copie ce lien :', url);
    };
  }

  /* ---------- Aide ---------- */
  function showHelp() {
    const th = S ? THEMES[S.settings.theme] : THEMES.jurassic;
    const cases = [['#3b82f6', '+', 'Case bleue : +3 pièces'], ['#ef4444', '−', 'Case rouge : −3 pièces'], ['#a855f7', '?', 'Événement surprise'], ['#06b6d4', '🎁', 'Objet gratuit'], ['#ec4899', '🛒', 'Boutique (aussi en passant)'], ['#84cc16', '🪺', 'Nid : adopter un compagnon'], ['#facc15', '🎲', 'Chance : deux joueurs tirés au sort, un transfert qui peut tout changer'], ['#0f172a', '🌀', 'Chamboulement : remet tout en jeu'], ['#f59e0b', th.special.icon, th.special.name + ' : ' + th.special.desc], ['#111827', '🕳️', 'Passage secret (Mine)'], ['#15803d', '🎰', 'Casino : machine à sous, roulette ou pile ou face (mise 5, 10 ou 20)']];
    const box = document.createElement('div');
    box.className = 'help';
    box.innerHTML = '<div class="help-in"><button class="btn small ghost hx">Fermer ✕</button><h1>Comment jouer</h1>' +
      '<p>À ton tour : utilise un objet (facultatif), choisis ton dé, avance. Achète l’étoile (' + th.star.icon + ' ici) quand tu passes dessus. Après chaque tour de table : un mini-jeu. À la fin, le plus d’étoiles gagne (puis les pièces).</p>' +
      '<p>La couleur de ta dernière case décide des équipes : bleu contre rouge (1 contre 3, 2 contre 2…). Si tout le monde est de la même couleur : chacun pour soi ou coopération. Les 3 derniers tours, la roue de la Dernière ligne droite aide le dernier.</p>' +
      '<h2>Les cases</h2><div class="hgrid">' + cases.map((c) => '<div><span class="hn" style="background:' + c[0] + '">' + c[1] + '</span>' + esc(c[2]) + '</div>').join('') + '</div>' +
      '<h2>Les dés</h2><div class="hgrid">' + Object.values(GAME.dice).map((d) => '<div><span class="hi">' + d.icon + '</span><b>' + esc(d.label) + '</b> : ' + esc(d.desc) + '</div>').join('') + '</div>' +
      '<h2>Jeux d’argent (option)</h2><div class="hgrid">' + Object.values(GAME.casino).map((d) => '<div><span class="hi">' + d.icon + '</span><b>' + esc(d.name) + '</b> : ' + esc(d.desc) + '</div>').join('') + '<div><span class="hi">💸</span><b>Paris sur les mini-jeux</b> : mise 5 ou 10 avant chaque mini-jeu. Chacun pour soi : ×3 si ton favori gagne. Équipes ou coopération : ×2.</div><div><span class="hi">🎟️</span><b>Ticket à gratter</b> : objet de la boutique, de 0 à 50 pièces.</div></div>' +
      '<h2>Boosters et cartes (option)</h2><p>Un booster (boutique : ' + GAME.booster.price + ' pièces, gagnant d’un mini-jeu chacun pour soi, ou case 🎁) contient 3 cartes. ' + Object.values(RARITY).map((r) => '<b style="color:' + r.color + '">' + r.name + '</b> ' + r.weight + ' %').join(' · ') + '. Les communes sont pour la collection ; les autres donnent un bonus :</p><div class="hgrid">' + Object.values(CARDS).filter((c) => c.fx).map((c) => '<div><span class="hi">' + c.icon + '</span><b style="color:' + RARITY[c.rarity].color + '">' + esc(c.name) + '</b> : ' + esc(c.desc) + '</div>').join('') + '</div>' +
      '<h2>Les objets (3 max dans le sac)</h2><div class="hgrid">' + Object.values(GAME.items).map((d) => '<div><span class="hi">' + d.icon + '</span><b>' + esc(d.name) + '</b> (' + d.price + ') : ' + esc(d.desc) + '</div>').join('') + '</div>' +
      '<h2>Les compagnons (1 à la fois)</h2><div class="hgrid">' + Object.values(GAME.companions).map((d) => '<div><span class="hi">' + d.icon + '</span><b>' + esc(d.name) + '</b> : ' + esc(d.desc) + '</div>').join('') + '</div>' +
      '<h2>Les pouvoirs (option)</h2><div class="hgrid">' + Object.values(GAME.powers).map((d) => '<div><span class="hi">' + d.icon + '</span><b>' + esc(d.name) + '</b> : ' + esc(d.desc) + '</div>').join('') + '</div>' +
      '<h2>Étoiles bonus possibles (3 tirées au hasard)</h2><div class="hgrid">' + Object.values(GAME.awards).map((d) => '<div><span class="hi">' + d.icon + '</span><b>' + esc(d.name) + '</b> : ' + esc(d.desc) + '</div>').join('') + '</div></div>';
    document.body.appendChild(box);
    box.querySelector('.hx').onclick = () => box.remove();
    box.onclick = (e) => { if (e.target === box) box.remove(); };
  }

  /* ---------------- Plateau ---------------- */
  const cv = $('board'), g = cv.getContext('2d');
  const disp = {}, anims = {};
  let fxs = [];
  const cam = { x: 0, y: 0, w: 1000, h: 700, overview: false, init: false };
  function nodePos(id) { const n = board().nodes[id]; return n ? { x: n.x, y: n.y } : { x: 0, y: 0 }; }

  function resize() {
    const wrap = cv.parentElement.getBoundingClientRect();
    const cssW = Math.max(200, Math.floor(Math.min(wrap.width, wrap.height / 0.7)));
    if (cv.style.width !== cssW + 'px') { cv.style.width = cssW + 'px'; cv.style.height = Math.round(cssW * 0.7) + 'px'; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cssW * dpr), h = Math.round(cssW * 0.7 * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }
  function updateCamera(B, focus) {
    const zoomed = !cam.overview && B.W > 1000;
    const tw = zoomed ? (B.size === 'large' ? 950 : 1000) : B.W, th = tw * 0.7;
    let tx, ty;
    if (zoomed && focus) { tx = Math.max(0, Math.min(B.W - tw, focus.x - tw / 2)); ty = Math.max(0, Math.min(B.H - th, focus.y - th / 2)); }
    else { tx = (B.W - tw) / 2; ty = (B.H - th) / 2; }
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.w = tw; cam.h = th; cam.init = true; }
    const f = 0.08;
    cam.x += (tx - cam.x) * f; cam.y += (ty - cam.y) * f; cam.w += (tw - cam.w) * f; cam.h = cam.w * 0.7;
  }
  function toScreen(pos) {
    const r = cv.getBoundingClientRect(), wr = $('fxLayer').getBoundingClientRect();
    return { x: r.left - wr.left + ((pos.x - cam.x) / cam.w) * r.width, y: r.top - wr.top + ((pos.y - cam.y) / cam.h) * r.height };
  }
  window.addEventListener('resize', resize);

  function animMove(pid, path) {
    if (!S) return;
    const p0 = S.players.find((p) => p.id === pid);
    const from = disp[pid] ? { x: disp[pid].x, y: disp[pid].y } : nodePos(p0.pos);
    anims[pid] = { kind: 'path', pts: [from].concat(path.map(nodePos)), t0: performance.now(), step: 260, lastStep: 0 };
    if (p0) p0.pos = path[path.length - 1];
  }
  function animTeleport(pid, to, fly) {
    if (!S) return;
    const from = disp[pid] ? { x: disp[pid].x, y: disp[pid].y } : nodePos(to);
    anims[pid] = { kind: 'fly', from, to: nodePos(to), t0: performance.now(), dur: fly ? 900 : 600, fly };
    const p0 = S.players.find((p) => p.id === pid); if (p0) p0.pos = to;
    if (!fly) fxs.push({ kind: 'ring', x: from.x, y: from.y, t0: performance.now() });
  }
  function onFx(m) {
    if (!S) return;
    const p = S.players.find((x) => x.id === m.pid);
    const pos = p && disp[p.id] ? disp[p.id] : null;
    if (m.kind === 'coins' && pos && m.n) { floatText((m.n > 0 ? '+' : '') + m.n + ' ' + coinIcon(), pos, m.n > 0 ? '#fde047' : '#f87171'); (m.n > 0 ? sfx.coin : sfx.bad)(); }
    if (m.kind === 'gotstar' && pos) { floatText('+' + (m.n || 1) + ' ' + starIcon(), pos, '#fde047', 34); sfx.star(); fxs.push({ kind: 'burst', x: pos.x, y: pos.y, t0: performance.now() }); }
    if (m.kind === 'special' && pos) { floatText(m.icon, pos, '#fff', 54); sfx.bad(); }
    if (m.kind === 'item' && pos) { floatText(m.icon, pos, '#fff', 44); sfx.item(); }
    if (m.kind === 'shield' && pos) floatText('🛡️', pos, '#fff', 44);
    if (m.kind === 'event' && pos) floatText('❓', pos, '#fff', 44);
    if (m.kind === 'star') { const n = nodePos(m.node); fxs.push({ kind: 'burst', x: n.x, y: n.y, t0: performance.now() }); }
  }
  function floatText(txt, pos, color, size) {
    if ($('game').classList.contains('hidden')) return;
    const s = toScreen(pos);
    const d = document.createElement('div');
    d.className = 'float'; d.textContent = txt; d.style.color = color; if (size) d.style.fontSize = size + 'px';
    d.style.left = s.x + 'px'; d.style.top = (s.y - 30) + 'px';
    $('fxLayer').appendChild(d);
    setTimeout(() => d.remove(), 1500);
  }

  const COL = { blue: '#3b82f6', red: '#ef4444', event: '#a855f7', item: '#06b6d4', shop: '#ec4899', nest: '#84cc16', chance: '#facc15', chaos: '#0f172a', special: '#f59e0b', tunnel: '#111827', start: '#ffffff', casino: '#15803d' };
  const ICON = { item: '🎁', shop: '🛒', nest: '🪺', chance: '🎲', chaos: '🌀', tunnel: '🕳️', casino: '🎰' };
  function draw(now) {
    requestAnimationFrame(draw);
    if (!S || S.phase === 'lobby' || $('game').classList.contains('hidden')) return;
    resize();
    const B = board();
    const focusP = S.players.find((p) => p.id === S.current) || S.players.find((p) => p.id === ME);
    updateCamera(B, focusP && (disp[focusP.id] || nodePos(focusP.pos)));
    const k = cv.width / cam.w;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = B.bg[0]; g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    const gr = g.createLinearGradient(0, 0, B.W, B.H); gr.addColorStop(0, B.bg[0]); gr.addColorStop(1, B.bg[1]);
    g.fillStyle = gr; g.fillRect(-200, -200, B.W + 400, B.H + 400);
    if (B.id === 'mine') { const rg = g.createRadialGradient(B.W / 2, B.H / 2, 50, B.W / 2, B.H / 2, B.W * 0.6); rg.addColorStop(0, 'rgba(250,204,21,.12)'); rg.addColorStop(1, 'rgba(0,0,0,.45)'); g.fillStyle = rg; g.fillRect(0, 0, B.W, B.H); }
    if (B.id === 'pirate') { g.fillStyle = 'rgba(253,230,138,.8)'; g.beginPath(); g.ellipse(B.W / 2, B.H / 2, B.W * 0.48, B.H * 0.47, 0, 0, Math.PI * 2); g.fill(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.globalAlpha = 0.6;
    B.decor.forEach((d) => { g.font = d.s + 'px serif'; g.fillText(d.e, d.x, d.y + Math.sin(now / 900 + d.x) * 2); });
    g.globalAlpha = 1;
    const drawLevel = (lv) => {
      [[18, 'rgba(0,0,0,.35)'], [12, B.path]].forEach(([w, c]) => {
        g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round';
        B.nodes.forEach((n) => n.next.forEach((id) => {
          const m = B.nodes[id];
          if (Math.max(n.level, m.level) !== lv) return;
          g.beginPath(); g.moveTo(n.x, n.y); g.lineTo(m.x, m.y); g.stroke();
        }));
      });
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 3;
      B.nodes.forEach((n) => n.next.forEach((id) => {
        const m = B.nodes[id];
        if (!(n.stairs || m.stairs) || Math.max(n.level, m.level) !== lv) return;
        const dx = m.x - n.x, dy = m.y - n.y, L = Math.hypot(dx, dy) || 1, ux = -dy / L * 9, uy = dx / L * 9;
        for (let t = 0.2; t < 0.9; t += 0.2) { const x = n.x + dx * t, y = n.y + dy * t; g.beginPath(); g.moveTo(x - ux, y - uy); g.lineTo(x + ux, y + uy); g.stroke(); }
      }));
      B.nodes.forEach((n) => {
        if (n.level !== lv) return;
        g.beginPath(); g.arc(n.x, n.y + 3, 17, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
        g.beginPath(); g.arc(n.x, n.y, 17, 0, Math.PI * 2); g.fillStyle = COL[n.t]; g.fill();
        g.lineWidth = 3; g.strokeStyle = n.t === 'start' ? '#3b0764' : 'rgba(255,255,255,.9)'; g.stroke();
        if (n.t === 'event') { g.fillStyle = '#fff'; g.font = 'bold 18px Fredoka, sans-serif'; g.fillText('?', n.x, n.y + 1); }
        else if (n.t === 'special') { g.font = '18px serif'; g.fillText(B.special.icon, n.x, n.y + 1); }
        else if (ICON[n.t]) { g.font = '17px serif'; g.fillText(ICON[n.t], n.x, n.y + 1); }
        else if (n.t === 'start') { g.fillStyle = '#3b0764'; g.font = 'bold 12px Fredoka, sans-serif'; g.fillText('GO', n.x, n.y + 1); }
        else { g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 15px Fredoka, sans-serif'; g.fillText(n.t === 'blue' ? '+' : '−', n.x, n.y + 1); }
        if (S.traps && S.traps[n.id]) { g.font = '16px serif'; g.fillText('🪤', n.x + 14, n.y - 14); }
      });
    };
    drawLevel(0);
    B.platforms.forEach((pf) => {
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(pf.cx + 10, pf.cy + 18, pf.rx, pf.ry, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = B.floorColor; g.beginPath(); g.ellipse(pf.cx, pf.cy, pf.rx, pf.ry, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 4; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.font = 'bold 14px Fredoka, sans-serif'; g.fillText('ÉTAGE', pf.cx, pf.cy);
    });
    if (B.platforms.length) drawLevel(1);
    (S.stars || []).forEach((s) => {
      const n = B.nodes[s.node]; if (!n) return;
      const pulse = 1 + Math.sin(now / 250) * 0.08;
      const rg = g.createRadialGradient(n.x, n.y - 30, 4, n.x, n.y - 30, 46); rg.addColorStop(0, 'rgba(253,224,71,.85)'); rg.addColorStop(1, 'rgba(253,224,71,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(n.x, n.y - 30, 46, 0, Math.PI * 2); g.fill();
      g.font = Math.round(38 * pulse) + 'px serif'; g.fillText(B.star.icon, n.x, n.y - 32);
      g.font = 'bold 13px Fredoka, sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3;
      const lbl = s.price + ' ' + B.coin.icon; g.strokeText(lbl, n.x, n.y - 62); g.fillText(lbl, n.x, n.y - 62);
    });
    fxs = fxs.filter((f) => now - f.t0 < 900);
    fxs.forEach((f) => {
      const t = (now - f.t0) / 900;
      g.strokeStyle = f.kind === 'burst' ? 'rgba(253,224,71,' + (1 - t) + ')' : 'rgba(255,255,255,' + (1 - t) + ')';
      g.lineWidth = 6 * (1 - t) + 1; g.beginPath(); g.arc(f.x, f.y, 10 + t * 60, 0, Math.PI * 2); g.stroke();
    });
    const groups = {};
    S.players.forEach((p) => { (groups[p.pos] = groups[p.pos] || []).push(p); });
    const order = S.players.slice().sort((a, b) => (a.id === S.current) - (b.id === S.current));
    order.forEach((p) => {
      const grp = groups[p.pos] || [p];
      const i = grp.indexOf(p), nG = grp.length;
      const base = nodePos(p.pos);
      const off = nG > 1 ? { x: Math.cos((i / nG) * Math.PI * 2) * 20, y: Math.sin((i / nG) * Math.PI * 2) * 13 } : { x: 0, y: 0 };
      let pos = { x: base.x + off.x, y: base.y + off.y }, hop = 0;
      const a = anims[p.id];
      if (a) {
        const el = Math.max(0, now - a.t0);
        if (a.kind === 'path') {
          const seg = Math.min(a.pts.length - 2, Math.floor(el / a.step));
          if (el >= (a.pts.length - 1) * a.step || seg < 0) delete anims[p.id];
          else {
            const t = (el - seg * a.step) / a.step, A = a.pts[seg], Bp = a.pts[seg + 1];
            pos = { x: A.x + (Bp.x - A.x) * t, y: A.y + (Bp.y - A.y) * t }; hop = Math.sin(t * Math.PI) * 18;
            if (seg !== a.lastStep) { a.lastStep = seg; sfx.step(); }
          }
        } else {
          const t = Math.min(1, el / a.dur);
          if (t >= 1) delete anims[p.id];
          else { pos = { x: a.from.x + (a.to.x - a.from.x) * t, y: a.from.y + (a.to.y - a.from.y) * t }; hop = a.fly ? Math.sin(t * Math.PI) * 140 : 0; if (!a.fly) g.globalAlpha = t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2; }
        }
      }
      disp[p.id] = pos;
      const cur = p.id === S.current, size = cur ? 56 : 46, bob = cur && !a ? Math.abs(Math.sin(now / 220)) * 6 : 0;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(pos.x, pos.y + 6, size * 0.38, size * 0.14, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = p.color; g.lineWidth = 4; g.beginPath(); g.ellipse(pos.x, pos.y + 6, size * 0.42, size * 0.17, 0, 0, Math.PI * 2); g.stroke();
      const im = IMG[p.char];
      if (im && im.complete) g.drawImage(im, pos.x - size / 2, pos.y - size + 8 - hop - bob, size, size);
      if (p.companion) { g.font = '20px serif'; g.fillText(GAME.companions[p.companion].icon, pos.x + size * 0.45, pos.y - 6 - hop * 0.8 + Math.sin(now / 300) * 3); }
      if (p.shield) { g.font = '16px serif'; g.fillText('🛡️', pos.x - size * 0.45, pos.y - 8 - hop); }
      g.globalAlpha = 1;
    });
  }
  requestAnimationFrame(draw);

  /* ---------- Interface autour du plateau ---------- */
  let promptTimer = null;
  const CAS = { game: null };
  function renderGame(prev) {
    const B = board();
    $('gTitle').innerHTML = B.emoji + ' ' + esc(B.name) + (S.lastChance && S.lastChance.label ? ' <span class="tag">🔥 ' + esc(S.lastChance.label) + '</span>' : '') + (S.mods && S.mods.sale ? ' <span class="tag">🏷️ Soldes</span>' : '') + (S.mods && S.mods.blackout ? ' <span class="tag">🔌 Panne</span>' : '');
    $('gTurn').textContent = S.phase === 'end' ? 'Fin !' : 'Tour ' + Math.max(1, S.turn) + ' / ' + S.settings.turns;
    $('btnCam').classList.toggle('hidden', B.W <= 1000);
    $('btnAlbum').classList.toggle('hidden', !S.settings.boosters);
    const rank = S.players.slice().sort((a, b) => b.stars - a.stars || b.coins - a.coins);
    $('side').innerHTML = S.players.map((p) => '<div class="pc' + (p.id === S.current ? ' cur' : '') + (p.online ? '' : ' off') + '" style="border-color:' + p.color + '"><span class="rk">' + (rank.indexOf(p) + 1) + '</span>' + svg(p.char) + '<div style="min-width:0;flex:1"><div class="nm">' + esc(p.name) + (p.id === ME ? ' (toi)' : '') + '</div><div class="st">' + starIcon() + ' ' + p.stars + ' &nbsp; ' + coinIcon() + ' ' + p.coins + '</div><div class="inv">' +
      (p.power ? '<span title="' + esc(GAME.powers[p.power].name + ' : ' + GAME.powers[p.power].desc) + '">' + GAME.powers[p.power].icon + '</span>' : '') +
      (p.companion ? '<span title="' + esc(GAME.companions[p.companion].name + ' : ' + GAME.companions[p.companion].desc) + '">' + GAME.companions[p.companion].icon + '</span>' : '') +
      (S.settings.boosters && p.cards && p.cards.length ? '<span class="sep">|</span><span title="Cartes différentes">🃏' + new Set(p.cards).size + '</span>' : '') + (p.buff ? '<span title="Bonus au prochain dé">👟+' + p.buff + '</span>' : '') +
      (p.items.length ? '<span class="sep">|</span>' + p.items.map((k) => '<span title="' + esc(GAME.items[k].name) + '">' + GAME.items[k].icon + '</span>').join('') : '') + '</div></div></div>').join('');
    renderPrompt(prev);
  }

  function renderPrompt(prev) {
    const bar = $('actionBar');
    clearInterval(promptTimer);
    const pr = S.prompt;
    const cur = S.players.find((p) => p.id === S.current);
    const me = S.players.find((p) => p.id === ME);
    if (!pr || pr.kind !== 'casino' || pr.pid !== ME) CAS.game = null;
    if (pr && pr.pid === ME) {
      const d = pr.data || {};
      const B = board();
      let html = '';
      const A = (v) => esc(JSON.stringify(v));
      if (pr.kind === 'turn') {
        html = '<span class="msg">À toi ! Choisis ton dé' + (d.items.length ? ' ou un objet' : '') + ' :</span><div class="opts">' +
          d.dice.map((k) => '<button class="btn opt' + (k === 'revanche' ? ' alt' : '') + '" data-a="' + A({ dice: k }) + '">' + GAME.dice[k].icon + ' ' + esc(GAME.dice[k].label) + '<small>' + esc(GAME.dice[k].desc) + '</small></button>').join('') +
          d.items.map((it) => '<button class="btn opt ghosty" data-a="' + A({ item: it.i }) + '">' + GAME.items[it.k].icon + ' ' + esc(GAME.items[it.k].name) + '<small>' + esc(GAME.items[it.k].desc) + '</small></button>').join('') + '</div>';
      } else if (pr.kind === 'fork') {
        html = '<span class="msg">' + esc(d.text) + '</span><div class="opts">' + d.options.map((o) => '<button class="btn opt' + (o.label === 'Continuer' ? '' : ' alt') + '" data-a="' + A(o.value) + '">' + o.icon + ' ' + esc(o.label) + '</button>').join('') + '</div>';
      } else if (pr.kind === 'buy' || pr.kind === 'nest') {
        html = '<span class="msg">' + esc(d.text) + (pr.kind === 'nest' ? '<br><small>' + esc(GAME.companions[d.k].desc) + (d.replace ? ' (remplace ' + GAME.companions[d.replace].icon + ')' : '') + '</small>' : '') + '</span><div class="opts"><button class="btn big" data-a="true">Oui !</button><button class="btn big ghost" data-a="false">Non</button></div>';
      } else if (pr.kind === 'shop') {
        html = '<span class="msg">🛒 ' + esc(d.text) + (d.sale ? ' <b>(soldes −50 %)</b>' : '') + '</span><div class="opts">' + d.options.map((o) => { const it = o.k === 'booster' ? GAME.booster : GAME.items[o.k]; return '<button class="btn opt' + (o.k === 'booster' ? ' alt' : '') + '" data-a="' + A(o.k) + '"' + (o.price > me.coins || (d.full && o.k !== 'booster') ? ' disabled' : '') + '>' + it.icon + ' ' + esc(it.name) + ' · ' + o.price + ' ' + B.coin.icon + '<small>' + esc(it.desc) + '</small></button>'; }).join('') + '<button class="btn ghost" data-a="null">Rien, merci</button></div>';
      } else if (pr.kind === 'target') {
        html = '<span class="msg">' + esc(d.text) + '</span><div class="opts">' + d.options.map((id) => { const p = S.players.find((x) => x.id === id); return '<button class="btn opt alt" data-a="' + A(id) + '">' + mini(p.char, 28) + ' ' + esc(p.name) + '<small>' + starIcon() + ' ' + p.stars + ' · ' + coinIcon() + ' ' + p.coins + '</small></button>'; }).join('') + '</div>';
      } else if (pr.kind === 'casino') {
        const g = CAS.game, B2 = B;
        if (!g) html = '<span class="msg">🎰 ' + esc(d.text) + '</span><div class="opts">' + Object.entries(GAME.casino).map(([k, c]) => '<button class="btn opt" data-cg="' + k + '">' + c.icon + ' ' + esc(c.name) + '<small>' + esc(c.desc) + '</small></button>').join('') + '<button class="btn ghost" data-a="null">Je passe</button></div>';
        else {
          const choices = g === 'roulette' ? [['rouge', '🔴 Rouge ×2'], ['noir', '⚫ Noir ×2'], ['vert', '🟢 Vert ×14']] : g === 'pile' ? [['pile', 'Pile'], ['face', 'Face']] : [[null, '']];
          html = '<span class="msg">' + GAME.casino[g].icon + ' ' + esc(GAME.casino[g].name) + ' — ' + esc(GAME.casino[g].desc) + '</span>' + choices.map(([c, l]) => '<div class="opts">' + (l ? '<span class="chl">' + l + '</span>' : '') + d.bets.map((b) => '<button class="btn opt ' + (c === 'rouge' ? 'red' : c === 'noir' ? 'dark' : c === 'vert' ? 'green' : '') + '" data-a="' + A({ game: g, bet: b, choice: c }) + '">Miser ' + b + ' ' + B2.coin.icon + '</button>').join('') + '</div>').join('') + '<div class="opts"><button class="btn ghost small" data-cg="">← Autre jeu</button><button class="btn ghost small" data-a="null">Je passe</button></div>';
        }
      } else if (pr.kind === 'number') {
        html = '<span class="msg">🎯 ' + esc(d.text) + '</span><div class="opts">' + Array.from({ length: d.max - d.min + 1 }, (_, i) => '<button class="btn numb" data-a="' + (d.min + i) + '">' + (d.min + i) + '</button>').join('') + '</div>';
      }
      bar.innerHTML = html + '<span class="timer" id="aTimer"></span>';
      bar.querySelectorAll('[data-cg]').forEach((b) => (b.onclick = () => { CAS.game = b.dataset.cg || null; renderPrompt(S); }));
      bar.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { initAudio(); send({ t: 'answer', value: JSON.parse(b.dataset.a) }); }));
      const tick = () => { const s = Math.max(0, Math.ceil((pr.deadline - Date.now()) / 1000)); const t = $('aTimer'); if (t) t.textContent = s <= 10 ? s + ' s' : ''; };
      tick(); promptTimer = setInterval(tick, 500);
      if (!prev || !prev.prompt || prev.prompt.pid !== ME) beep(660, 0.12, 'triangle', 0.06);
    } else if (cur) {
      const what = pr && pr.pid === cur.id ? { turn: ' choisit son dé…', casino: ' hésite devant le casino…', fork: ' choisit son chemin…', buy: ' réfléchit à l’étoile…', shop: ' fait ses courses…', nest: ' regarde le nid…', target: ' choisit sa cible…', number: ' choisit son résultat…' }[pr.kind] : ' joue…';
      bar.innerHTML = '<span class="msg">' + mini(cur.char, 34) + ' <b>' + esc(cur.name) + '</b>' + what + '</span>';
    } else bar.innerHTML = '<span class="msg muted">' + (S.phase === 'minigame' ? 'Mini-jeu !' : '…') + '</span>';
  }

  function toast(text) {
    const d = document.createElement('div'); d.className = 'toast'; d.textContent = text;
    $('toasts').appendChild(d);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => d.remove(), 4200);
  }
  function banner(text) {
    const d = document.createElement('div'); d.className = 'banner'; d.innerHTML = '<div>' + esc(text) + '</div>';
    document.body.appendChild(d); sfx.item();
    setTimeout(() => d.remove(), 3400);
  }
  function roulette(m) {
    const d = document.createElement('div'); d.className = 'roul';
    d.innerHTML = '<div class="roul-in"><h2>' + esc(m.title) + '</h2><div class="rl">' + m.entries.map((e, i) => '<div data-i="' + i + '">' + esc(e) + '</div>').join('') + '</div><p class="rtxt"></p></div>';
    document.body.appendChild(d);
    const els = d.querySelectorAll('.rl div'), L = els.length;
    const steps = L * 3 + m.index;
    let n = 0;
    const tick = () => {
      els.forEach((e) => e.classList.remove('on'));
      els[n % L].classList.add('on'); sfx.tap();
      if (n >= steps) { d.querySelector('.rtxt').textContent = m.text; sfx.star(); setTimeout(() => d.remove(), 1600); return; }
      n++;
      setTimeout(tick, 70 + Math.pow(n / steps, 3) * 260);
    };
    tick();
  }
  function cardHtml(id, back) {
    const c = CARDS[id], r = RARITY[c.rarity];
    if (back) return '<div class="tcard back"><div class="tc-in">🃏</div></div>';
    const art = c.char ? mini(c.char, 64) : '<span class="tc-ic">' + c.icon + '</span>';
    return '<div class="tcard ' + c.rarity + '" style="--rc:' + r.color + '"><div class="tc-r">' + r.name + '</div><div class="tc-art">' + art + '</div><b>' + esc(c.name) + '</b><small>' + esc(c.fx ? c.desc : 'Collection') + '</small></div>';
  }
  function boosterShow(m) {
    const p = S && S.players.find((x) => x.id === m.pid);
    const d = document.createElement('div'); d.className = 'roul';
    d.innerHTML = '<div class="roul-in wide"><h2>🃏 Booster de ' + esc(p ? p.name : '') + '</h2><div class="tcards">' + m.cards.map((id, i) => '<div class="flip" id="fl' + i + '">' + cardHtml(id, true) + '</div>').join('') + '</div><p class="rtxt"></p></div>';
    document.body.appendChild(d);
    const best = m.cards.map((id) => CARDS[id]).sort((a, b) => Object.keys(RARITY).indexOf(b.rarity) - Object.keys(RARITY).indexOf(a.rarity))[0];
    m.cards.forEach((id, i) => setTimeout(() => {
      const el = d.querySelector('#fl' + i); if (!el) return;
      el.innerHTML = cardHtml(id); el.classList.add('open');
      const r = CARDS[id].rarity;
      if (r === 'legendaire') sfx.star(); else if (r === 'epique') sfx.item(); else beep(600 + i * 120, 0.12, 'triangle');
    }, 900 + i * 1000));
    setTimeout(() => { const t = d.querySelector('.rtxt'); if (t) t.textContent = best.fx ? best.icon + ' ' + best.name + ' : ' + best.desc : 'Que des cartes de collection !'; }, 3900);
    setTimeout(() => d.remove(), 4700);
  }
  function showAlbum() {
    const me = S && S.players.find((p) => p.id === ME);
    const owned = new Set(me ? me.cards : []);
    const box = document.createElement('div'); box.className = 'help';
    const ids = Object.keys(CARDS).sort((a, b) => Object.keys(RARITY).indexOf(CARDS[a].rarity) - Object.keys(RARITY).indexOf(CARDS[b].rarity));
    box.innerHTML = '<div class="help-in"><button class="btn small ghost hx">Fermer ✕</button><h1>🃏 Mon album (' + owned.size + ' / ' + ids.length + ')</h1><p class="muted">Les cartes communes sont pour la collection. Les rares, épiques et légendaires donnent un bonus à l’ouverture. À la fin, le plus grand collectionneur peut gagner une étoile bonus.</p><div class="tcards album">' + ids.map((id) => owned.has(id) ? cardHtml(id) : '<div class="tcard missing"><div class="tc-in">?</div><small>' + RARITY[CARDS[id].rarity].name + '</small></div>').join('') + '</div></div>';
    document.body.appendChild(box);
    box.querySelector('.hx').onclick = () => box.remove();
    box.onclick = (e) => { if (e.target === box) box.remove(); };
  }

  function casinoShow(m) {
    const p = S && S.players.find((x) => x.id === m.pid);
    const d = document.createElement('div'); d.className = 'roul';
    const ci = coinIcon();
    let body = '', final = '';
    if (m.game === 'slots') { body = '<div class="reels">' + [0, 1, 2].map((i) => '<div class="reel" id="rl' + i + '">❔</div>').join('') + '</div>'; }
    else if (m.game === 'roulette') body = '<div class="wheel" id="wh">🎡</div><div class="rres" id="rr"></div>';
    else if (m.game === 'pile') body = '<div class="coinf" id="cf">🪙</div><div class="rres" id="rr"></div>';
    else body = '<div class="ticket" id="tk">🎟️ <span>Grattage…</span></div>';
    final = m.win ? '🤑 Gagné : +' + m.win + ' ' + ci : (m.game === 'ticket' ? 'Perdu… rien sous le ticket' : 'Perdu… −' + m.bet + ' ' + ci);
    d.innerHTML = '<div class="roul-in"><h2>' + (m.game === 'ticket' ? '🎟️ Ticket à gratter' : GAME.casino[m.game].icon + ' ' + esc(GAME.casino[m.game].name)) + '</h2><p class="muted">' + esc(p ? p.name : '') + (m.bet ? ' mise ' + m.bet + ' ' + ci + (m.choice ? ' sur ' + esc(m.choice) : '') : '') + '</p>' + body + '<p class="rtxt"></p></div>';
    document.body.appendChild(d);
    const SY = GAME.slotSymbols;
    if (m.game === 'slots') {
      [0, 1, 2].forEach((i) => {
        const el = d.querySelector('#rl' + i); let n = 0;
        const iv = setInterval(() => { el.textContent = SY[Math.floor(Math.random() * SY.length)]; sfx.dice(); if (++n > 14 + i * 7) { clearInterval(iv); el.textContent = m.result[i]; el.classList.add('stop'); beep(500 + i * 150, 0.1, 'triangle'); } }, 70);
      });
    } else if (m.game === 'roulette') {
      const wh = d.querySelector('#wh'); wh.classList.add('spin');
      setTimeout(() => { wh.classList.remove('spin'); const c = m.result.color; d.querySelector('#rr').innerHTML = '<span class="rc ' + c + '">' + m.result.n + '</span> ' + c; beep(700, 0.2, 'triangle'); }, 2200);
    } else if (m.game === 'pile') {
      const cf = d.querySelector('#cf'); cf.classList.add('flip');
      setTimeout(() => { cf.classList.remove('flip'); d.querySelector('#rr').textContent = m.result === 'pile' ? 'PILE' : 'FACE'; beep(700, 0.2, 'triangle'); }, 2000);
    } else {
      setTimeout(() => { d.querySelector('#tk').innerHTML = '🎟️ <b>' + (m.prize ? m.prize + ' ' + ci : '0') + '</b>'; }, 1500);
    }
    setTimeout(() => { d.querySelector('.rtxt').textContent = final; if (m.win) sfx.star(); else sfx.bad(); }, m.game === 'ticket' ? 1700 : 2600);
    setTimeout(() => d.remove(), m.game === 'ticket' ? 2700 : 3700);
  }

  function showDice(m) {
    const p = S && S.players.find((x) => x.id === m.pid);
    const box = $('dice'); box.classList.remove('hidden');
    let i = 0;
    const iv = setInterval(() => {
      box.innerHTML = '<div class="drow">' + m.values.map(() => '<div class="d">' + (1 + Math.floor(Math.random() * 10)) + '</div>').join('') + '</div>'; sfx.dice();
      if (++i > 9) {
        clearInterval(iv);
        const bonus = (m.bonus || []).map((b) => '<span class="db">' + b.icon + (b.cap ? ' max ' + b.cap : ' +' + b.n) + '</span>').join('');
        box.innerHTML = '<div class="drow">' + m.values.map((v) => '<div class="d">' + v + '</div>').join('') + '</div>' + (bonus ? '<div class="dbonus">' + bonus + '</div>' : '') + '<div class="who">' + esc(p ? p.name : '') + ' avance de ' + m.total + ' !</div>';
        beep(880, 0.15, 'triangle', 0.06);
        setTimeout(() => box.classList.add('hidden'), 1200 + m.values.length * 150);
      }
    }, 60);
  }

  /* ---------------- Mini-jeux ---------------- */
  const OV = $('overlay');
  let MG = null;
  function hideOverlay() { OV.classList.add('hidden'); OV.innerHTML = ''; if (MG && MG.cleanup) MG.cleanup(); MG = null; }
  function pl(id) { return S.players.find((p) => p.id === id); }
  const MODE_NAME = { ffa: 'Chacun pour soi', teams: 'Équipes', '1vx': 'Un contre tous', coop: 'Tous ensemble' };
  function modeLabel(mg) {
    if (mg.mode === '1vx') return '1 contre ' + mg.teams.B.length;
    if (mg.mode === 'teams') return 'Équipes : ' + mg.teams.A.length + ' contre ' + mg.teams.B.length;
    return MODE_NAME[mg.mode];
  }
  function teamsHtml(mg) {
    if (mg.mode !== 'teams' && mg.mode !== '1vx') return '';
    const col = (ids, c, t) => '<div class="team" style="border-color:' + c + '"><b style="color:' + c + '">' + t + '</b><div>' + ids.map((id) => mini(pl(id).char, 34) + ' <span>' + esc(pl(id).name) + '</span>').join('<br>') + '</div></div>';
    return '<div class="teams">' + col(mg.teams.A, '#60a5fa', mg.mode === '1vx' ? 'Seul contre tous' : 'Équipe bleue') + '<div class="vs">VS</div>' + col(mg.teams.B, '#f87171', mg.mode === '1vx' ? 'L’équipe' : 'Équipe rouge') + '</div>';
  }
  const BET = { on: null };
  function betLabel(mg, on) {
    if (on === 'A') return mg.mode === '1vx' ? 'le solo' : 'l’équipe bleue';
    if (on === 'B') return mg.mode === '1vx' ? 'l’équipe' : 'l’équipe rouge';
    if (on === 'ok') return 'la réussite'; if (on === 'ko') return 'l’échec';
    const p = pl(on); return p ? p.name : '?';
  }
  function betHtml(mg) {
    if (!mg.gambling) return '';
    const me = pl(ME), mine = mg.bets[ME];
    const others = Object.entries(mg.bets).filter(([pid]) => pid !== ME).map(([pid, b]) => esc(pl(pid).name) + ' : ' + b.amount + ' sur ' + esc(betLabel(mg, b.on)));
    let h = '<div class="bets"><b>💸 Paris</b> ';
    if (mine) h += '<span>Tu as misé ' + mine.amount + ' ' + coinIcon() + ' sur ' + esc(betLabel(mg, mine.on)) + '.</span>';
    else if (!me || me.coins < 5) h += '<span class="muted">Pas assez de pièces pour parier.</span>';
    else {
      h += '<span class="muted">' + (mg.mode === 'ffa' ? 'Qui va gagner ? Gain ×3' : 'Gain ×2') + '</span><div class="opts">' + mg.betOptions.map((o) => '<button class="btn small ghost bo' + (BET.on === o ? ' sel' : '') + '" data-bon="' + o + '">' + (pl(o) ? mini(pl(o).char, 22) + ' ' : '') + esc(betLabel(mg, o)) + '</button>').join('') + '</div><div class="opts">' + [5, 10].filter((a) => a <= me.coins).map((a) => '<button class="btn small" data-bam="' + a + '">Miser ' + a + ' ' + coinIcon() + '</button>').join('') + '</div>';
    }
    if (others.length) h += '<div class="muted small-info">' + others.join(' · ') + '</div>';
    return h + '</div>';
  }
  function mySide(mg) { return mg.teams && mg.teams.A.includes(ME) ? 'A' : 'B'; }

  function renderMinigame() {
    const mg = S.mg; if (!mg) return;
    OV.classList.remove('hidden');
    const key = mg.id + ':' + mg.phase;
    const changed = !MG || MG.key !== key;
    if (changed) {
      if (MG && MG.id !== mg.id && MG.cleanup) MG.cleanup();
      MG = Object.assign(MG && MG.id === mg.id ? MG : { id: mg.id }, { key, since: performance.now() });
    }
    const head = '<div class="ic">' + mg.icon + '</div><h1>' + esc(mg.name) + '</h1><div class="mode">' + esc(modeLabel(mg)) + '</div>';
    if (mg.phase === 'intro') {
      if (changed) BET.on = null;
      const ready = mg.ready.includes(ME);
      OV.innerHTML = '<div class="mg">' + head + '<p class="rules">' + esc(mg.rules) + '</p>' + teamsHtml(mg) + betHtml(mg) + '<div class="ready-list">' + S.players.map((p) => '<div class="r' + (p.bot || mg.ready.includes(p.id) ? ' ok' : '') + '" title="' + esc(p.name) + '">' + svg(p.char) + '</div>').join('') + '</div>' + (ready ? '<p class="muted">On attend les autres…</p>' : '<button class="btn big green" id="mgReady">Prêt !</button>') + '</div>';
      const b = $('mgReady'); if (b) b.onclick = () => { initAudio(); send({ t: 'mg', ready: true }); };
      OV.querySelectorAll('[data-bon]').forEach((x) => (x.onclick = () => { BET.on = x.dataset.bon; OV.querySelectorAll('[data-bon]').forEach((y) => y.classList.toggle('sel', y === x)); }));
      OV.querySelectorAll('[data-bam]').forEach((x) => (x.onclick = () => { if (!BET.on) return; send({ t: 'mg', bet: { on: BET.on, amount: +x.dataset.bam } }); sfx.coin(); }));
      return;
    }
    if (mg.phase === 'countdown') {
      if (!changed) return;
      let n = 3;
      OV.innerHTML = '<div class="mg">' + head + '<div class="count" id="cd">3</div></div>';
      beep(440, 0.15);
      const iv = setInterval(() => { n--; const el = $('cd'); if (!el || n <= 0) { clearInterval(iv); if (el) el.textContent = 'GO !'; sfx.go(); return; } el.textContent = n; beep(440, 0.15); }, 1000);
      return;
    }
    if (mg.phase === 'results') { renderResults(mg); return; }
    const fn = GAMES[mg.id];
    if (fn) fn(mg, changed);
  }

  function renderResults(mg) {
    if (MG.shownResults) return;
    if (MG.cleanup) MG.cleanup();
    MG.shownResults = true;
    let extra = '';
    if (mg.id === 'compte' && mg.answer != null) extra = '<p class="rules">Il y en avait <b>' + mg.answer + '</b> !</p>';
    if (mg.verdict) extra += '<p class="verdict">' + esc(mg.verdict) + '</p>';
    if (mg.note) extra += '<p class="muted">' + esc(mg.note) + '</p>';
    if (mg.betResults && mg.betResults.length) extra += '<div class="bets"><b>💸 Paris</b><br>' + mg.betResults.map((b) => mini(pl(b.pid).char, 22) + ' ' + esc(pl(b.pid).name) + ' (' + b.amount + ' sur ' + esc(betLabel(mg, b.on)) + ') : ' + (b.win ? '<b style="color:#4ade80">+' + b.win + '</b>' : '<span style="color:#f87171">perdu</span>')).join('<br>') + '</div>';
    const rows = mg.results.slice().sort((a, b) => a.place - b.place || b.coins - a.coins);
    OV.innerHTML = '<div class="mg"><div class="ic">🏆</div><h1>Résultats</h1>' + extra + '<div class="results">' + rows.map((r) => {
      const p = pl(r.pid); const win = r.coins > 0 && r.place === 1;
      return '<div class="res" style="border-color:' + (r.side ? (r.side === 'A' ? '#60a5fa' : '#f87171') : p.color) + '"><span class="pl">' + (mg.mode === 'ffa' ? r.place : win ? '✔' : '✖') + '</span>' + svg(p.char, win ? 'happy' : r.coins === 0 ? 'sad' : '') + '<span><b>' + esc(p.name) + '</b><br><span class="sh">' + esc(r.show) + '</span></span><span></span><span class="gain">+' + r.coins + ' ' + coinIcon() + '</span></div>';
    }).join('') + '</div></div>';
    const mine = mg.results.find((r) => r.pid === ME);
    if (mine && mine.coins >= 8) sfx.star(); else sfx.coin();
  }

  function mashButton(onTap) {
    const b = $('tap'); if (!b) return;
    b.onpointerdown = (e) => { e.preventDefault(); onTap(); sfx.tap(); b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 60); };
  }
  function startMashSender() {
    MG.count = MG.count || 0;
    clearInterval(MG.iv);
    MG.iv = setInterval(() => send({ t: 'mg', data: { count: MG.count } }), 250);
    MG.cleanup = () => clearInterval(MG.iv);
  }

  const GAMES = {
    degaine(mg, changed) {
      if (!changed) return;
      if (mg.phase === 'wait') {
        MG.tapped = false;
        OV.innerHTML = '<div class="mg" style="width:100%"><div class="zone wait" id="z">Attends le vert…</div></div>';
        const z = $('z');
        z.onpointerdown = () => { if (MG.tapped) return; MG.tapped = true; send({ t: 'mg', data: { early: true } }); sfx.bad(); z.className = 'zone done'; z.textContent = 'Faux départ ! 😱'; };
      } else if (mg.phase === 'go') {
        const z = $('z'); if (!z || MG.tapped) return;
        const t0 = performance.now();
        z.className = 'zone go'; z.textContent = 'TAPE !'; sfx.go();
        z.onpointerdown = () => { if (MG.tapped) return; MG.tapped = true; const ms = Math.round(performance.now() - t0); send({ t: 'mg', data: { ms } }); z.className = 'zone done'; z.textContent = ms + ' ms ⚡'; };
      }
    },
    turbo(mg, changed) {
      const max = Math.max(110, ...Object.values(mg.counts || {}).map((n) => n + 10));
      if (changed && mg.phase === 'play') {
        MG.count = 0; MG.end = performance.now() + mg.dur;
        OV.innerHTML = '<div class="mg"><h1 style="font-size:30px">🎂 Gâteau Turbo ! <span id="tl"></span></h1><div class="lanes" id="lanes"></div><button class="btn big alt tap-btn" id="tap">TAPE !</button></div>';
        mashButton(() => { if (performance.now() < MG.end) { MG.count++; lanes(); } });
        startMashSender();
        MG.tl = setInterval(() => { const t = $('tl'); if (t) t.textContent = Math.max(0, Math.ceil((MG.end - performance.now()) / 1000)) + ' s'; }, 200);
        const c0 = MG.cleanup; MG.cleanup = () => { c0(); clearInterval(MG.tl); };
      }
      if (mg.phase === 'done') { send({ t: 'mg', data: { count: MG.count || 0 } }); if (MG.cleanup) MG.cleanup(); }
      lanes();
      function lanes() {
        const el = $('lanes'); if (!el) return;
        const counts = Object.assign({}, mg.counts); counts[ME] = Math.max(counts[ME] || 0, MG.count || 0);
        el.innerHTML = S.players.map((p) => '<div class="lane"><span class="ln">' + esc(p.name) + '</span><span class="cake">🎂</span>' + svg(p.char).replace('<svg', '<svg style="left:' + Math.min(88, (counts[p.id] || 0) / max * 88) + '%"') + '</div>').join('');
      }
    },
    chrono(mg, changed) { blindTimer(mg, changed, 7000, 'Objectif : 7,00 s'); },
    synchro(mg, changed) { blindTimer(mg, changed, 5000, 'Tous ensemble : 5,00 s'); },
    compte(mg, changed) {
      if (!changed) return;
      if (mg.phase === 'show') {
        OV.innerHTML = '<div class="mg"><h1 style="font-size:30px">Compte les <span style="font-size:46px">' + mg.target + '</span> !</h1><div class="stage" id="stage"></div></div>';
        const st = $('stage');
        mg.items.forEach((it) => setTimeout(() => {
          if (!st.isConnected) return;
          const d = document.createElement('div'); d.className = 'it'; d.textContent = it.e; d.style.left = it.x + '%'; d.style.top = it.y + '%';
          st.appendChild(d); setTimeout(() => d.remove(), 750);
        }, it.t));
      } else if (mg.phase === 'answer') {
        MG.n = MG.n || 0; MG.sent = false;
        OV.innerHTML = '<div class="mg"><h1 style="font-size:30px">Combien de <span style="font-size:46px">' + mg.target + '</span> ?</h1><div class="num-pick"><button class="btn" id="mn">−</button><div class="n" id="nv">' + MG.n + '</div><button class="btn" id="pl">+</button></div><button class="btn big green" id="ok">Valider</button><p class="muted" id="rs"></p></div>';
        const upd = (d) => { if (MG.sent) return; MG.n = Math.max(0, Math.min(99, MG.n + d)); $('nv').textContent = MG.n; sfx.tap(); };
        $('mn').onclick = () => upd(-1); $('pl').onclick = () => upd(1);
        $('ok').onclick = () => { if (MG.sent) return; MG.sent = true; send({ t: 'mg', data: { n: MG.n } }); $('ok').disabled = true; $('rs').textContent = 'Réponse envoyée : ' + MG.n; };
      }
    },
    coffres(mg) {
      const picks = mg.picks || {};
      const mine = picks[ME];
      OV.innerHTML = '<div class="mg"><h1 style="font-size:32px">🧰 Choisis un coffre !</h1><div class="chests">' + Array.from({ length: mg.n }, (_, i) => {
        const who = S.players.filter((p) => picks[p.id] === i).map((p) => svg(p.char)).join('');
        const v = mg.phase === 'reveal' ? '<div class="val">' + (mg.values[i] ? '💰 ' + mg.values[i] : '💨 vide') + '</div>' : '';
        return '<div class="chest' + (mine === i ? ' mine' : '') + '" data-i="' + i + '"><div class="ce">' + (mg.phase === 'reveal' ? (mg.values[i] ? '💰' : '📦') : '🧰') + '</div>' + v + '<div class="who">' + who + '</div></div>';
      }).join('') + '</div><p class="muted">' + (mg.phase === 'reveal' ? 'Ouverture des coffres !' : mine != null ? 'Choix fait, on attend les autres…' : 'Clique sur un coffre') + '</p></div>';
      if (mg.phase === 'pick' && mine == null) OV.querySelectorAll('.chest').forEach((c) => (c.onclick = () => { send({ t: 'mg', data: { i: +c.dataset.i } }); sfx.tap(); }));
    },
    ballons(mg, changed) {
      if (changed && mg.phase === 'play') {
        MG.popped = new Set();
        OV.innerHTML = '<div class="mg" style="width:min(900px,100%)"><h1 style="font-size:28px">🎈 Ballons Pop !</h1><div class="scores" id="sc"></div><div class="field" id="fld"></div></div>';
        $('fld').addEventListener('pointerdown', (e) => {
          const b = e.target.closest('.bal'); if (!b) return;
          const id = +b.dataset.id; MG.popped.add(id); b.remove();
          send({ t: 'mg', data: { id } }); if (b.dataset.k === 'bomb') sfx.bad(); else sfx.tap();
        });
      }
      const fld = $('fld'); if (!fld) return;
      const alive = new Set((mg.balloons || []).map((b) => b.id));
      fld.querySelectorAll('.bal').forEach((el) => { if (!alive.has(+el.dataset.id)) el.remove(); });
      (mg.balloons || []).forEach((b) => {
        if (MG.popped.has(b.id) || fld.querySelector('[data-id="' + b.id + '"]')) return;
        const el = document.createElement('div'); el.className = 'bal ' + b.k; el.dataset.id = b.id; el.dataset.k = b.k;
        el.textContent = b.k === 'gold' ? '🌟' : b.k === 'bomb' ? '💣' : '🎈';
        el.style.left = b.x + '%'; el.style.top = b.y + '%';
        fld.appendChild(el);
      });
      const sc = $('sc'); if (sc) sc.innerHTML = S.players.map((p) => '<span>' + mini(p.char, 26) + ' ' + ((mg.points || {})[p.id] || 0) + '</span>').join('');
    },
    bombe(mg) {
      const holder = pl(mg.holder);
      const me = mg.holder === ME && mg.phase === 'play';
      OV.innerHTML = '<div class="mg"><h1 style="font-size:30px">💣 Patate Bombe' + (mg.round ? ' — manche ' + mg.round : '') + '</h1><div class="circle">' + (mg.alive || []).concat(mg.phase === 'boom' ? [mg.holder] : []).filter((v, i, a) => a.indexOf(v) === i).map((id) => '<div class="cp' + (id === mg.holder ? ' hold' : '') + '">' + svg(pl(id).char, id === mg.holder ? 'sad' : '') + '<small>' + esc(pl(id).name) + '</small>' + (id === mg.holder ? '<span class="bomb">' + (mg.phase === 'boom' ? '💥' : '💣') + '</span>' : '') + '</div>').join('') + '</div>' +
        (mg.phase === 'boom' ? '<p class="verdict">💥 BOUM ! ' + esc(holder ? holder.name : '') + ' est éliminé !</p>' : me ? '<button class="btn big alt tap-btn" id="pass">PASSER !</button>' : '<p class="muted">La bombe est chez ' + esc(holder ? holder.name : '') + '…</p>') +
        ((mg.out || []).length ? '<p class="muted">Éliminés : ' + mg.out.map((id) => esc(pl(id).name)).join(', ') + '</p>' : '') + '</div>';
      const b = $('pass'); if (b) b.onpointerdown = () => { send({ t: 'mg', data: { pass: true } }); sfx.tap(); b.disabled = true; };
      if (mg.phase === 'boom' && MG.boomed !== mg.round) { MG.boomed = mg.round; sfx.bad(); }
    },
    memo(mg, changed) {
      const COLS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308'];
      if (!changed) return;
      const pads = (cls) => '<div class="pads">' + COLS.map((c, i) => '<div class="pad ' + cls + '" data-i="' + i + '" style="background:' + c + '"></div>').join('') + '</div>';
      if (mg.phase === 'show') {
        OV.innerHTML = '<div class="mg"><h1 style="font-size:30px">🧠 Retiens la suite !</h1>' + pads('') + '<p class="muted" id="mc"></p></div>';
        mg.seq.forEach((v, i) => setTimeout(() => {
          const p = OV.querySelector('.pad[data-i="' + v + '"]'); if (!p) return;
          p.classList.add('lit'); beep([330, 392, 494, 587][v], 0.3, 'triangle', 0.07);
          const mc = $('mc'); if (mc) mc.textContent = (i + 1) + ' / ' + mg.len;
          setTimeout(() => p.classList.remove('lit'), mg.step * 0.7);
        }, i * mg.step));
      } else if (mg.phase === 'input') {
        MG.seq = [];
        OV.innerHTML = '<div class="mg"><h1 style="font-size:30px">🧠 À toi : reproduis la suite</h1>' + pads('tapme') + '<div class="dots" id="dots"></div></div>';
        const dots = () => { $('dots').innerHTML = MG.seq.map((v) => '<span style="background:' + COLS[v] + '"></span>').join('') + '<span class="empty"></span>'.repeat(Math.max(0, mg.len - MG.seq.length)); };
        dots();
        OV.querySelectorAll('.pad').forEach((p) => (p.onpointerdown = () => {
          if (MG.seq.length >= mg.len) return;
          const v = +p.dataset.i; MG.seq.push(v); beep([330, 392, 494, 587][v], 0.15, 'triangle', 0.06);
          p.classList.add('lit'); setTimeout(() => p.classList.remove('lit'), 150); dots();
          if (MG.seq.length === mg.len) { send({ t: 'mg', data: { seq: MG.seq } }); $('dots').insertAdjacentHTML('afterend', '<p class="muted">Envoyé !</p>'); }
        }));
      }
    },
    corde(mg, changed) {
      if (changed && mg.phase === 'play') {
        MG.count = 0;
        const side = mySide(mg);
        OV.innerHTML = '<div class="mg"><h1 style="font-size:30px">🪢 Tir à la corde</h1><p class="rules">Tu es ' + (side === 'A' ? (mg.mode === '1vx' ? 'seul, à gauche' : 'dans l’équipe bleue, à gauche') : (mg.mode === '1vx' ? 'dans l’équipe, à droite' : 'dans l’équipe rouge, à droite')) + ' : tape pour tirer !</p><div class="rope"><div class="rl-a">' + mg.teams.A.map((id) => mini(pl(id).char, 34)).join('') + '</div><div class="rbar"><div class="rmark" id="rm">🎀</div></div><div class="rl-b">' + mg.teams.B.map((id) => mini(pl(id).char, 34)).join('') + '</div></div><button class="btn big tap-btn ' + (side === 'A' ? 'blue' : 'alt') + '" id="tap">TIRE !</button></div>';
        mashButton(() => { MG.count++; });
        startMashSender();
      }
      const rm = $('rm'); if (rm) rm.style.left = (50 - (mg.pos || 0) / 2) + '%';
    },
    portes(mg, changed) {
      const solo = mg.solo === ME;
      if (mg.phase === 'pick') {
        if (!changed && MG.drawn) { const st = $('pst'); if (st && !MG.door && !solo) st.textContent = (mg.picked || []).length + ' joueur(s) ont choisi'; return; }
        MG.drawn = true; MG.sel = MG.sel || [];
        OV.innerHTML = '<div class="mg"><h1 style="font-size:28px">🚪 ' + (solo ? 'Tu es le Gardien : verrouille 2 portes' : 'Choisis une porte… sans te faire attraper') + '</h1><div class="doors">' + [0, 1, 2, 3, 4].map((i) => '<div class="door" data-i="' + i + '">🚪<small>' + (i + 1) + '</small></div>').join('') + '</div>' + (solo ? '<button class="btn big" id="lock" disabled>Verrouiller</button>' : '') + '<p class="muted" id="pst"></p></div>';
        OV.querySelectorAll('.door').forEach((d) => (d.onclick = () => {
          const i = +d.dataset.i;
          if (solo) {
            if (MG.locked) return;
            MG.sel = MG.sel.includes(i) ? MG.sel.filter((x) => x !== i) : MG.sel.concat(i).slice(-2);
            OV.querySelectorAll('.door').forEach((x) => x.classList.toggle('mine', MG.sel.includes(+x.dataset.i)));
            $('lock').disabled = MG.sel.length !== 2;
          } else if (MG.door == null) { MG.door = i; d.classList.add('mine'); send({ t: 'mg', data: { door: i } }); $('pst').textContent = 'Porte ' + (i + 1) + ' choisie…'; sfx.tap(); }
        }));
        const lk = $('lock'); if (lk) lk.onclick = () => { MG.locked = true; send({ t: 'mg', data: { locks: MG.sel } }); lk.disabled = true; lk.textContent = 'Verrouillé 🔒'; sfx.tap(); };
      } else if (mg.phase === 'reveal' && changed) {
        OV.innerHTML = '<div class="mg"><h1 style="font-size:30px">🚪 Ouverture !</h1><div class="doors">' + [0, 1, 2, 3, 4].map((i) => '<div class="door ' + (mg.locks.includes(i) ? 'locked' : 'open') + '">' + (mg.locks.includes(i) ? '🔒' : '🚪') + '<div class="who">' + Object.keys(mg.picks).filter((pid) => mg.picks[pid] === i).map((pid) => mini(pl(pid).char, 30)).join('') + '</div></div>').join('') + '</div><p class="verdict">' + mg.caught.length + ' attrapé(s) !</p></div>';
      }
    },
    coffrefort(mg, changed) {
      if (changed && mg.phase === 'play') {
        MG.count = 0;
        OV.innerHTML = '<div class="mg"><h1 style="font-size:30px">🏦 Forcez le coffre-fort, tous ensemble !</h1><div class="prog big"><i id="cfb"></i></div><p id="cft" class="rules"></p><button class="btn big green tap-btn" id="tap">TAPE !</button></div>';
        mashButton(() => { MG.count++; });
        startMashSender();
      }
      const b = $('cfb'); if (b) { b.style.width = Math.min(100, (mg.total || 0) / mg.target * 100) + '%'; $('cft').textContent = (mg.total || 0) + ' / ' + mg.target; }
    },
    kart(mg, changed) { if (mg.phase === 'race') kartGame(mg, changed); },
  };

  function blindTimer(mg, changed, target, title) {
    if (!changed || mg.phase !== 'play') return;
    const t0 = performance.now(); MG.stopped = false;
    OV.innerHTML = '<div class="mg"><h1>⏱️ ' + title + '</h1><div class="clock" id="clk">0,00</div><button class="btn big tap-btn" id="stop">STOP</button><p class="muted" id="res"></p></div>';
    const clk = $('clk');
    MG.iv = setInterval(() => {
      const el = performance.now() - t0;
      if (MG.stopped) return clearInterval(MG.iv);
      clk.textContent = el < mg.hideAfter ? (el / 1000).toFixed(2).replace('.', ',') : '?,??';
      if (el > 13000) clearInterval(MG.iv);
    }, 30);
    MG.cleanup = () => clearInterval(MG.iv);
    $('stop').onpointerdown = () => {
      if (MG.stopped) return; MG.stopped = true;
      const ms = Math.round(performance.now() - t0);
      send({ t: 'mg', data: { ms } }); sfx.go();
      clk.textContent = (ms / 1000).toFixed(2).replace('.', ',');
      $('stop').disabled = true; $('res').textContent = 'Écart : ' + (Math.abs(ms - target) / 1000).toFixed(2).replace('.', ',') + ' s';
    };
  }

  /* ---------- Monstro Kart ---------- */
  function kartGame(mg, changed) {
    if (!changed) return;
    const tr = mg.track, N = tr.N;
    const k0 = mg.karts[ME] || { x: tr.pts[0][0], y: tr.pts[0][1], a: 0 };
    const K = { x: k0.x, y: k0.y, a: k0.a, v: 0, idx: 0, prog: 0, steer: 0, done: false, t0: performance.now() };
    let best = 0, bd = 1e9; tr.pts.forEach((p, i) => { const d = Math.hypot(p[0] - K.x, p[1] - K.y); if (d < bd) { bd = d; best = i; } });
    K.idx = best; K.prog = best > N / 2 ? best - N : best;
    MG.K = K; MG.others = {};
    OV.innerHTML = '<div class="kart-wrap"><div class="khud"><span id="klap">Tour 1/' + tr.laps + '</span><span id="kpos"></span><span id="ktime">0:00</span></div><canvas id="kc"></canvas><div class="kctl"><button class="btn big kb" id="kl">◀</button><button class="btn big kb" id="kr">▶</button></div></div>';
    const kc = $('kc'), kg = kc.getContext('2d');
    const hold = (id, v) => { const b = $(id); const on = (e) => { e.preventDefault(); K.steer = v; }; const off = () => { if (K.steer === v) K.steer = 0; }; b.onpointerdown = on; b.onpointerup = off; b.onpointerleave = off; b.onpointercancel = off; };
    hold('kl', -1); hold('kr', 1);
    const keys = {};
    const kd = (e) => { if (['ArrowLeft', 'ArrowRight', 'q', 'd'].includes(e.key)) { keys[e.key] = true; e.preventDefault(); } };
    const ku = (e) => { keys[e.key] = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    let last = performance.now(), sendAt = 0, running = true;
    const loop = (now) => {
      if (!running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      const steer = ((keys.ArrowLeft || keys.q ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0)) || K.steer;
      let ni = K.idx, nd = 1e9;
      for (let j = -12; j <= 12; j++) { const i = (K.idx + j + N) % N, p = tr.pts[i]; const d = Math.hypot(p[0] - K.x, p[1] - K.y); if (d < nd) { nd = d; ni = i; } }
      const onTrack = nd < tr.w / 2 + 4;
      if (!K.done) {
        const vmax = onTrack ? 250 : 110;
        K.v += (vmax - K.v) * Math.min(1, dt * (K.v < vmax ? 1.4 : 3));
        K.a += steer * 2.9 * dt * Math.min(1, K.v / 120);
        K.x += Math.cos(K.a) * K.v * dt; K.y += Math.sin(K.a) * K.v * dt;
        K.x = Math.max(20, Math.min(980, K.x)); K.y = Math.max(20, Math.min(680, K.y));
        let dIdx = ni - K.idx; if (dIdx < -N / 2) dIdx += N; if (dIdx > N / 2) dIdx -= N;
        if (Math.abs(dIdx) < 15) { K.prog += dIdx; K.idx = ni; }
        if (K.prog >= N * tr.laps) { K.done = true; const ms = Math.round(now - K.t0); send({ t: 'mg', data: { prog: K.prog, fin: ms } }); sfx.star(); }
      }
      if (now - sendAt > 100 && !K.done) { sendAt = now; send({ t: 'mg', data: { x: Math.round(K.x), y: Math.round(K.y), a: +K.a.toFixed(2), prog: +K.prog.toFixed(1) } }); }
      const wrap = kc.parentElement.getBoundingClientRect();
      const cw = Math.max(240, Math.min(wrap.width, (window.innerHeight - 170) / 0.7));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (kc.width !== Math.round(cw * dpr)) { kc.width = Math.round(cw * dpr); kc.height = Math.round(cw * 0.7 * dpr); kc.style.width = cw + 'px'; kc.style.height = cw * 0.7 + 'px'; }
      const s = kc.width / 1000;
      kg.setTransform(s, 0, 0, s, 0, 0);
      kg.fillStyle = '#4d7c0f'; kg.fillRect(0, 0, 1000, 700);
      kg.lineJoin = 'round'; kg.lineCap = 'round';
      const path = () => { kg.beginPath(); tr.pts.forEach((p, i) => (i ? kg.lineTo(p[0], p[1]) : kg.moveTo(p[0], p[1]))); kg.closePath(); };
      path(); kg.strokeStyle = '#f8fafc'; kg.lineWidth = tr.w + 10; kg.stroke();
      path(); kg.strokeStyle = '#475569'; kg.lineWidth = tr.w; kg.stroke();
      path(); kg.setLineDash([18, 18]); kg.strokeStyle = 'rgba(255,255,255,.5)'; kg.lineWidth = 3; kg.stroke(); kg.setLineDash([]);
      const p0 = tr.pts[0], p1 = tr.pts[1], ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + Math.PI / 2;
      for (let j = -4; j < 4; j++) { kg.fillStyle = (j + 4) % 2 ? '#000' : '#fff'; kg.fillRect(p0[0] + Math.cos(ang) * j * 10 - 5, p0[1] + Math.sin(ang) * j * 10 - 5, 10, 10); }
      const drawKart = (x, y, a, p, me) => {
        kg.save(); kg.translate(x, y); kg.rotate(a);
        kg.fillStyle = '#111'; kg.fillRect(-15, -13, 9, 5); kg.fillRect(6, -13, 9, 5); kg.fillRect(-15, 8, 9, 5); kg.fillRect(6, 8, 9, 5);
        kg.fillStyle = p.color; kg.fillRect(-17, -10, 34, 20);
        kg.restore();
        const im = IMG[p.char]; if (im && im.complete) kg.drawImage(im, x - 18, y - 30, 36, 36);
        if (me) { kg.strokeStyle = '#fde047'; kg.lineWidth = 3; kg.beginPath(); kg.arc(x, y, 26, 0, Math.PI * 2); kg.stroke(); }
      };
      const live = (S.mg && S.mg.karts) || mg.karts || {};
      S.players.forEach((p) => {
        if (p.id === ME) return;
        const t = live[p.id]; if (!t) return;
        const o = MG.others[p.id] || (MG.others[p.id] = { x: t.x, y: t.y, a: t.a });
        o.x += (t.x - o.x) * Math.min(1, dt * 8); o.y += (t.y - o.y) * Math.min(1, dt * 8); o.a = t.a;
        drawKart(o.x, o.y, o.a, p, false);
      });
      const meP = S.players.find((p) => p.id === ME);
      if (meP && live[ME] !== undefined) drawKart(K.x, K.y, K.a, meP, true);
      const lap = Math.min(tr.laps, Math.floor(Math.max(0, K.prog) / N) + 1);
      const order = S.players.map((p) => ({ id: p.id, pr: p.id === ME ? (K.done ? 1e9 : K.prog) : (live[p.id] ? (live[p.id].fin ? 1e9 - live[p.id].fin / 1e3 : live[p.id].prog) : 0) })).sort((a, b) => b.pr - a.pr);
      const el = Math.floor((now - K.t0) / 1000);
      const kl = $('klap'); if (kl) { kl.textContent = K.done ? 'Arrivé ! 🏁' : 'Tour ' + lap + '/' + tr.laps; $('kpos').textContent = (order.findIndex((o) => o.id === ME) + 1) + 'e / ' + order.length; $('ktime').textContent = Math.floor(el / 60) + ':' + String(el % 60).padStart(2, '0'); }
    };
    requestAnimationFrame(loop);
    MG.cleanup = () => { running = false; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }

  /* ---------------- Fin de partie ---------------- */
  function renderEnd() {
    if (!END) return;
    if (MG && MG.endShown) return;
    if (MG && MG.cleanup) MG.cleanup();
    MG = { endShown: true };
    OV.classList.remove('hidden');
    const rk = END.ranking.map(pl).filter(Boolean);
    const me = pl(ME);
    const top = rk.slice(0, 3);
    const podOrder = [top[1], top[0], top[2]].filter(Boolean);
    const h = {}; if (top[0]) h[top[0].id] = 150; if (top[1]) h[top[1].id] = 105; if (top[2]) h[top[2].id] = 75;
    OV.innerHTML = '<div class="mg"><div class="ic">👑</div><h1>' + esc(top[0].name) + ' est la Superstar de Monstralia !</h1>' +
      (END.awards.length ? '<h2 class="aw-t">Étoiles bonus</h2><div class="awards">' + END.awards.map((a) => '<div class="award"><span class="ai">' + a.icon + '</span><div><b>' + esc(a.name) + '</b> <small>(' + esc(a.desc) + ' : ' + a.value + ')</small><br>' + a.winners.map((id) => mini(pl(id).char, 24) + ' ' + esc(pl(id).name)).join(', ') + ' <b>+1 ' + starIcon() + '</b></div></div>').join('') + '</div>' : '') +
      '<div class="podium">' + podOrder.map((p) => '<div class="pod">' + svg(p.char, p === top[0] ? 'happy' : '') + '<div><b>' + esc(p.name) + '</b></div><div class="blk" style="height:' + h[p.id] + 'px">' + (rk.indexOf(p) + 1) + '</div></div>').join('') + '</div>' +
      '<div class="results">' + rk.map((p, i) => '<div class="res" style="border-color:' + p.color + '"><span class="pl">' + (i + 1) + '</span>' + svg(p.char, i === 0 ? 'happy' : i === rk.length - 1 ? 'sad' : '') + '<span><b>' + esc(p.name) + '</b><br><span class="sh">' + p.stats.steps + ' cases · ' + p.stats.mgWins + ' mini-jeux gagnés</span></span><span>' + starIcon() + ' ' + p.stars + '</span><span class="gain">' + coinIcon() + ' ' + p.coins + '</span></div>').join('') + '</div>' +
      (me && me.host ? '<button class="btn big" id="again">Nouvelle partie</button>' : '<p class="muted">L’hôte peut relancer une partie.</p>') + '</div>';
    const a = $('again'); if (a) a.onclick = () => send({ t: 'again' });
    sfx.star();
  }

  $('btnAlbum').onclick = showAlbum;
  $('btnCam').onclick = () => { cam.overview = !cam.overview; $('btnCam').textContent = cam.overview ? '🔍 Suivre' : '🗺️ Vue d’ensemble'; };
  initHome(); initLobby(); connect();
})();
