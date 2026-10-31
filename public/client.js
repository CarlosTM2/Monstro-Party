/* Monstro Party — client navigateur */
(function () {
  const { THEMES, makeBoard, CHARACTERS, WORLD, GAME, CARDS, RARITY, FAMILIES, famLevel, charSVG } = window.PARTY;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CH = {}; CHARACTERS.forEach((c) => { CH[c.id] = c; });
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const PORTRAIT = {}; // portraits 3D (si la 3D est disponible)
  const svg = (id, mood) => (PORTRAIT[id] ? '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><image href="' + PORTRAIT[id] + '" width="100" height="100"/></svg>' : CH[id] ? charSVG(CH[id], mood) : '');
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
      case 'teleport': animTeleport(m.pid, m.to, m.fly, m.ride); break;
      case 'fx': onFx(m); break;
      case 'banner': banner(m.text); break;
      case 'land': landShow(m); break;
      case 'order': orderShow(m); break;
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
    if (S.phase === 'lobby') { show('lobby'); renderLobby(me); hideOverlay(); END = null; cam.init = false; if (USE3D) Scene3D.reset(); }
    else { show('game'); renderGame(prev); }
    if (S.phase === 'minigame') renderMinigame(); else if (S.phase === 'end') renderEnd(); else if (lastPhase === 'minigame' || lastPhase === 'end') hideOverlay();
    lastPhase = S.phase;
  }

  /* ---------- Accueil ---------- */
  function renderCharGrid(el, selected, taken, onPick) {
    el.innerHTML = CHARACTERS.map((c) => '<div class="char' + (c.id === selected ? ' sel' : '') + (taken.includes(c.id) ? ' taken' : '') + '" data-id="' + c.id + '">' + svg(c.id, c.id === selected ? 'happy' : '') + '<span class="cn">' + esc(c.name) + '</span></div>').join('');
    el.querySelectorAll('.char').forEach((d) => d.addEventListener('click', () => { if (!d.classList.contains('taken')) onPick(d.dataset.id); }));
  }
  function showLore(id) { const c = CH[id]; $('charLore').innerHTML = '<b>' + esc(c.name) + '</b> — ' + esc(c.lore); }
  function initHome() {
    $('name').value = store.get('mp_name') || '';
    const pathCode = (location.pathname.match(/^\/([A-Z0-9]{4})$/i) || [])[1];
    if (pathCode) $('code').value = pathCode.toUpperCase();
    const pickHome = (id) => { store.set('mp_char', id); renderCharGrid($('charGrid'), id, [], pickHome); showLore(id); };
    pickHome(myChar());
    window.__rerenderHome = () => pickHome(myChar());
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
    $('lobbyPlayers').innerHTML = S.players.map((p) => '<div class="lp' + (p.online ? '' : ' off') + '" style="border-color:' + p.color + '">' + svg(p.char) + '<div class="nm">' + (p.host ? '👑 ' : '') + esc(p.name) + '<small>' + esc(CH[p.char].name) + (p.id === ME ? ' · toi' : '') + (st.powers === 'choice' && p.power && !p.bot ? ' · ' + GAME.powers[p.power].icon : '') + '</small></div>' + (st.teams ? '<button class="tm tm' + p.team + '" data-t="' + p.id + '"' + (H ? '' : ' disabled') + ' title="Changer d’équipe">' + (p.team === 'B' ? '🔴 Rouge' : '🔵 Bleue') + '</button>' : '') + (H && p.id !== ME ? '<button class="kick" data-k="' + p.id + '" title="Retirer">✕</button>' : '') + '</div>').join('');
    $('lobbyPlayers').querySelectorAll('.kick').forEach((b) => (b.onclick = () => send({ t: 'kick', pid: b.dataset.k })));
    $('lobbyPlayers').querySelectorAll('.tm').forEach((b) => (b.onclick = () => send({ t: 'team', pid: b.dataset.t })));
    renderCharGrid($('lobbyChars'), me.char, S.players.filter((p) => p.id !== ME).map((p) => p.char), (id) => { store.set('mp_char', id); send({ t: 'char', char: id }); });
    $('boardChoice').innerHTML = Object.values(THEMES).map((b) => '<div class="bc' + (st.theme === b.id ? ' sel' : '') + (H ? '' : ' ro') + '" data-b="' + b.id + '" style="background:linear-gradient(135deg,' + b.bg[0] + ',' + b.bg[1] + ')"><div class="be">' + b.emoji + '</div><b>' + esc(b.name) + '</b><p>' + esc(b.desc) + '</p><p class="bmeta">Boss : ' + esc(WORLD.bosses[b.id].name) + '<br>Monnaie : ' + b.coin.icon + ' ' + esc(b.coin.name) + ' · Étoile : ' + b.star.icon + ' ' + esc(b.star.name) + '</p></div>').join('');
    if (H) $('boardChoice').querySelectorAll('.bc').forEach((d) => (d.onclick = () => send({ t: 'settings', theme: d.dataset.b })));
    seg($('sizeChoice'), [['small', 'Petit'], ['medium', 'Moyen'], ['large', 'Grand']], st.size, H, (v) => send({ t: 'settings', size: v }));
    seg($('floorChoice'), [[false, 'Sans étage'], [true, 'Avec étage']], st.floors, H && st.size !== 'small', (v) => send({ t: 'settings', floors: v }));
    seg($('turnsChoice'), [[5, '5'], [10, '10'], [15, '15'], [20, '20'], [25, '25']], st.turns, H, (v) => send({ t: 'settings', turns: v }));
    seg($('powersChoice'), [['off', 'Désactivés'], ['choice', 'Au choix'], ['random', 'Aléatoires']], st.powers, H, (v) => send({ t: 'settings', powers: v }));
    seg($('eventsChoice'), [[true, 'Oui'], [false, 'Non']], st.events, H, (v) => send({ t: 'settings', events: v }));
    seg($('bonusChoice'), [[true, st.turns <= 10 ? '2 au hasard' : '3 au hasard'], [false, 'Aucune']], st.bonus, H, (v) => send({ t: 'settings', bonus: v }));
    seg($('boosterChoice'), [[true, 'Oui'], [false, 'Non']], st.boosters, H, (v) => send({ t: 'settings', boosters: v }));
    seg($('botsChoice'), [['easy', 'Facile'], ['normal', 'Normal'], ['hard', 'Difficile']], st.bots || 'normal', H, (v) => send({ t: 'settings', bots: v }));
    seg($('mgSoloChoice'), [[false, 'Mélangés'], [true, 'Chacun pour soi']], !!st.mgSolo, H, (v) => send({ t: 'settings', mgSolo: v }));
    seg($('marketChoice'), [[true, 'Oui'], [false, 'Non']], st.market !== false, H, (v) => send({ t: 'settings', market: v }));
    seg($('teamsChoice'), [[false, 'Chacun pour soi'], [true, 'En équipes']], !!st.teams, H, (v) => send({ t: 'settings', teams: v }));
    seg($('gamblingChoice'), [[true, 'Oui'], [false, 'Non']], st.gambling, H, (v) => send({ t: 'settings', gambling: v }));
    const B = makeBoard(st.theme, st.size, st.floors);
    $('boardInfo').textContent = (st.teams ? (S.players.length < 4 ? '⚠️ Les équipes demandent au moins 4 joueurs (ajoute des robots). · ' : '🤝 En équipes, on additionne les étoiles et les pièces de l’équipe. · ') : '') + B.nodes.length + ' cases · ' + B.stars + ' ' + B.star.name.toLowerCase() + (B.stars > 1 ? 's' : '') + ' en jeu · ' + B.star.rule;
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
    const cases = [['#3b82f6', '+', 'Case bleue : +3 pièces'], ['#ef4444', '−', 'Case rouge : −3 pièces'], ['#a855f7', '?', 'Événement surprise'], ['#06b6d4', '🎁', 'Objet gratuit'], ['#ec4899', '🛒', 'Boutique (aussi en passant)'], ['#84cc16', '🪺', 'Nid : adopter un compagnon'], ['#facc15', '🎲', 'Chance : deux joueurs tirés au sort, un transfert qui peut tout changer'], ['#0f172a', '🌀', 'Chamboulement : remet tout en jeu'], ['#f59e0b', th.special.icon, th.special.name + ' : ' + th.special.desc], ['#111827', th.warp.icon, th.warp.name + ' : un transport qui t’emmène vers une autre case (ptéro-taxi, barque, métro ou wagon selon la région)'], ['#15803d', '🎰', 'Casino : machine à sous, roulette ou pile ou face (mise 5, 10 ou 20)'], ['#0d9488', '🔁', 'Troc : échange une carte de famille avec un joueur'], ['#7f1d1d', '😈', 'Boss : le boss de la région fait tourner sa roue des punitions'], ['#b45309', '⚙️', 'Terrain : le plateau bouge, un chemin se ferme ou se rouvre']];
    const box = document.createElement('div');
    box.className = 'help';
    box.innerHTML = '<div class="help-in"><button class="btn small ghost hx">Fermer ✕</button><h1>Comment jouer</h1>' +
      '<p>À ton tour : utilise un objet (facultatif), choisis ton dé, avance. Achète l’étoile (' + th.star.icon + ' ici) quand tu passes dessus. Après chaque tour de table : un mini-jeu. À la fin, le plus d’étoiles gagne (puis les pièces).</p>' +
      '<p>La couleur de ta dernière case décide des équipes : bleu contre rouge (1 contre 3, 2 contre 2…). Si tout le monde est de la même couleur : chacun pour soi ou coopération. Les 3 derniers tours, la roue de la Dernière ligne droite aide le dernier.</p>' +
      '<h2>Les cases</h2><div class="hgrid">' + cases.map((c) => '<div><span class="hn" style="background:' + c[0] + '">' + c[1] + '</span>' + esc(c[2]) + '</div>').join('') + '</div>' +
      '<h2>Les dés</h2><p>Tout le monde a le dé classique (1 à 6). Tu peux posséder <b>un seul dé en plus à la fois</b> : le Deuxième dé (tu lances 2 dés de 6, pour un seul lancer), le Petit dé (1 à 3) ou le Mini dé (1 ou 2). Achète-le en boutique ou trouve-le dans un booster. À chaque tour, tu choisis lequel lancer.</p><div class="hgrid">' + Object.values(GAME.dice).map((d) => '<div><span class="hi">' + d.icon + '</span><b>' + esc(d.label) + '</b> : ' + esc(d.desc) + (d.price ? ' (' + d.price + ' pièces)' : '') + '</div>').join('') + '</div>' +
      '<h2>Jeux d’argent (option)</h2><div class="hgrid">' + Object.values(GAME.casino).map((d) => '<div><span class="hi">' + d.icon + '</span><b>' + esc(d.name) + '</b> : ' + esc(d.desc) + '</div>').join('') + '<div><span class="hi">💸</span><b>Paris sur les mini-jeux</b> : mise 5 ou 10 avant chaque mini-jeu. Chacun pour soi : ×3 si ton favori gagne. Équipes ou coopération : ×2.</div><div><span class="hi">🎟️</span><b>Ticket à gratter</b> : objet de la boutique (8 pièces), de 0 à 30 pièces.</div></div>' +
      '<h2>Boosters et cartes (option)</h2><p>Un booster (boutique : ' + GAME.booster.price + ' pièces, gagnant d’un mini-jeu chacun pour soi, ou case 🎁) contient 3 cartes. ' + Object.values(RARITY).map((r) => '<b style="color:' + r.color + '">' + r.name + '</b> ' + r.weight + ' %').join(' · ') + '. Les communes forment <b>4 familles de 5 cartes</b> : 3 cartes d’une famille donnent un petit bonus permanent, les 5 le doublent et rapportent 10 pièces. Sur une case 🔁 Troc, propose un échange de carte à un autre joueur (il accepte ou refuse).</p><div class="hgrid">' + Object.values(FAMILIES).map((F) => '<div><span class="hi">' + F.icon + '</span><b>' + esc(F.name) + '</b> : ' + esc(F.bonus[0]) + ' (les 5 : ' + esc(F.bonus[1]) + ')</div>').join('') + '</div><p>Les cartes spéciales vont dans ton sac 🎒 : à ton tour, tu peux en jouer une (en plus d’un objet) avant de lancer le dé. Sac limité à 5 cartes. Les cartes maudites (5 %) s’appliquent tout de suite.</p><div class="hgrid">' + Object.values(CARDS).filter((c) => c.fx).map((c) => '<div><span class="hi">' + c.icon + '</span><b style="color:' + RARITY[c.rarity].color + '">' + esc(c.name) + '</b> : ' + esc(c.desc) + '</div>').join('') + '</div>' +
      '<h2>Les objets (3 max dans le sac)</h2><div class="hgrid">' + Object.values(GAME.items).map((d) => '<div><span class="hi">' + d.icon + '</span><b>' + esc(d.name) + '</b> (' + d.price + ') : ' + esc(d.desc) + '</div>').join('') + '</div>' +
      '<h2>Les compagnons (2 maximum : sur un nid, tu peux en échanger un)</h2><div class="hgrid">' + Object.values(GAME.companions).map((d) => '<div><span class="hi">' + d.icon + '</span><b>' + esc(d.name) + '</b> : ' + esc(d.desc) + '</div>').join('') + '</div>' +
      '<h2>Les pouvoirs (option)</h2><div class="hgrid">' + Object.values(GAME.powers).map((d) => '<div><span class="hi">' + d.icon + '</span><b>' + esc(d.name) + '</b> : ' + esc(d.desc) + '</div>').join('') + '</div>' +
      '<h2>Équipes (option)</h2><p>Bleus contre rouges : à la fin, on additionne les étoiles puis les pièces de chaque équipe. La plupart des mini-jeux se jouent alors en équipe.</p><h2>Événements de région</h2><p>De temps en temps, un chemin est bloqué pendant 2 tours : dino qui fait la sieste, marée haute, travaux ou éboulement. Les flèches ne proposent alors que le chemin libre.</p>' +
      '<h2>Étoiles bonus possibles (2 tirées au hasard en partie de 5 ou 10 tours, 3 au-delà)</h2><div class="hgrid">' + Object.values(GAME.awards).map((d) => '<div><span class="hi">' + d.icon + '</span><b>' + esc(d.name) + '</b> : ' + esc(d.desc) + '</div>').join('') + '</div></div>';
    document.body.appendChild(box);
    box.querySelector('.hx').onclick = () => box.remove();
    box.onclick = (e) => { if (e.target === box) box.remove(); };
  }

  /* ---------------- Plateau (rendu en perspective) ---------------- */
  const cv = $('board'), g = cv.getContext('2d');
  const disp = {}, anims = {};
  let fxs = [], arrows = [];
  const TILT = 0.6; // inclinaison du plateau
  const cam = { x: 0, y: 0, w: 1000, h: 700, overview: false, init: false };
  const P3 = (x, y, z) => ({ X: x, Y: y * TILT - (z || 0) });
  // Vraie 3D (Three.js) si l'appareil la gère, sinon affichage 2D
  let USE3D = false;
  function try3D() {
    if (USE3D || !window.Scene3D) return;
    USE3D = window.Scene3D.init($('board3d'), { onArrow: (v) => { initAudio(); sfx.tap(); send({ t: 'answer', value: v }); }, onTile: tileTip });
    document.body.classList.toggle('three', USE3D);
    if (USE3D) {
      Object.assign(PORTRAIT, window.Scene3D.portraits());
      Object.keys(PORTRAIT).forEach((id) => { if (IMG[id]) IMG[id].src = PORTRAIT[id]; });
      if (window.__rerenderHome) window.__rerenderHome();
      if (S) setState(S, ME);
    }
  }
  window.addEventListener('scene3d-ready', try3D);
  setTimeout(try3D, 0);
  function nodePos(id) { const n = board().nodes[id]; return n ? { x: n.x, y: n.y, z: n.z || 0 } : { x: 0, y: 0, z: 0 }; }

  let ASPECT = 0.7;
  function resize() {
    const wrap = cv.parentElement.getBoundingClientRect();
    const cssW = Math.max(200, Math.floor(wrap.width)), cssH = Math.max(160, Math.floor(wrap.height));
    ASPECT = Math.min(1.6, Math.max(0.45, cssH / cssW));
    if (cv.style.width !== cssW + 'px' || cv.style.height !== cssH + 'px') { cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px'; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }
  function updateCamera(B, focus) {
    const PH = B.H * TILT + 90;
    const full = Math.max(B.W + 100, (PH + 60) / ASPECT);
    const zoomed = !cam.overview;
    let tw = zoomed ? (B.size === 'large' ? 780 : B.size === 'medium' ? 820 : 860) : full;
    if (zoomed && ASPECT > 0.9) tw *= 0.62; // téléphone en portrait : on zoome plus
    const th = tw * ASPECT;
    let tx, ty;
    if (zoomed && focus) { const f = P3(focus.x, focus.y, focus.z); tx = Math.max(-50, Math.min(B.W + 50 - tw, f.X - tw / 2)); ty = Math.max(-80, Math.min(PH + 20 - th, f.Y - th * 0.55)); }
    else { tx = (B.W - tw) / 2; ty = (B.H * TILT - th) / 2 - 10; }
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.w = tw; cam.h = th; cam.init = true; }
    const k = 0.08;
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.w += (tw - cam.w) * k; cam.h = cam.w * ASPECT;
  }
  function toScreen(pos) {
    const r = cv.getBoundingClientRect(), wr = $('fxLayer').getBoundingClientRect();
    if (USE3D) { const c3 = $('board3d').getBoundingClientRect(), s3 = Scene3D.project(pos); return { x: c3.left - wr.left + s3.x, y: c3.top - wr.top + s3.y - 20 }; }
    const p = P3(pos.x, pos.y, pos.z);
    return { x: r.left - wr.left + ((p.X - cam.x) / cam.w) * r.width, y: r.top - wr.top + ((p.Y - cam.y) / cam.h) * r.height };
  }
  window.addEventListener('resize', resize);

  function animMove(pid, path) {
    if (!S) return;
    const p0 = S.players.find((p) => p.id === pid);
    const from = disp[pid] ? Object.assign({}, disp[pid]) : nodePos(p0.pos);
    anims[pid] = { kind: 'path', pts: [from].concat(path.map(nodePos)), t0: performance.now(), step: 260, lastStep: 0 };
    if (p0) p0.pos = path[path.length - 1];
  }
  function animTeleport(pid, to, fly, ride) {
    if (!S) return;
    const from = disp[pid] ? Object.assign({}, disp[pid]) : nodePos(to);
    if (ride) { anims[pid] = { kind: 'fly', from, to: nodePos(to), t0: performance.now(), dur: 2400, fly: ride === 'ptero' || ride === 'heli' || ride === 'bat', ride }; const p0 = S.players.find((p) => p.id === pid); if (p0) p0.pos = to; sfx.item(); return; }
    anims[pid] = { kind: 'fly', from, to: nodePos(to), t0: performance.now(), dur: fly ? 900 : 600, fly };
    const p0 = S.players.find((p) => p.id === pid); if (p0) p0.pos = to;
    if (!fly) { fxs.push({ kind: 'ring', x: from.x, y: from.y, z: from.z, t0: performance.now() }); if (USE3D) Scene3D.fx('ring', from); }
  }
  function onFx(m) {
    if (!S) return;
    const p = S.players.find((x) => x.id === m.pid);
    const pos = p && disp[p.id] ? disp[p.id] : null;
    if (m.kind === 'coins' && pos && m.n) { floatText((m.n > 0 ? '+' : '') + m.n + ' ' + coinIcon(), pos, m.n > 0 ? '#fde047' : '#f87171'); (m.n > 0 ? sfx.coin : sfx.bad)(); }
    if (m.kind === 'gotstar' && pos) { floatText('+' + (m.n || 1) + ' ' + starIcon(), pos, '#fde047', 34); sfx.star(); fxs.push({ kind: 'burst', x: pos.x, y: pos.y, z: pos.z, t0: performance.now() }); if (USE3D) Scene3D.fx('burst', pos); }
    if (m.kind === 'special' && pos) { floatText(m.icon, pos, '#fff', 54); sfx.bad(); if (USE3D && S.settings.theme === 'jurassic' && Scene3D.erupt) Scene3D.erupt(); }
    if (m.kind === 'item' && pos) { floatText(m.icon, pos, '#fff', 44); sfx.item(); }
    if (m.kind === 'shield' && pos) floatText('🛡️', pos, '#fff', 44);
    if (m.kind === 'event' && pos) floatText('❓', pos, '#fff', 44);
    if (m.kind === 'quake') { sfx.bad(); if (USE3D && Scene3D.quake) Scene3D.quake(); }
    if (m.kind === 'boss' && pos) { sfx.bad(); if (USE3D && Scene3D.boss) Scene3D.boss(pos, S.settings.theme); else floatText('😈', pos, '#fff', 70); }
    if (m.kind === 'pipe' && pos) { sfx.item(); if (USE3D && Scene3D.pipe) Scene3D.pipe(pos); else floatText('🟡', pos, '#fff', 54); }
    if (m.kind === 'star') { const n = nodePos(m.node); fxs.push({ kind: 'burst', x: n.x, y: n.y, z: n.z, t0: performance.now() }); }
  }
  function floatText(txt, pos, color, size) {
    if ($('game').classList.contains('hidden')) return;
    const s = toScreen({ x: pos.x, y: pos.y, z: (pos.z || 0) + 50 });
    const d = document.createElement('div');
    d.className = 'float'; d.textContent = txt; d.style.color = color; if (size) d.style.fontSize = size + 'px';
    d.style.left = s.x + 'px'; d.style.top = s.y + 'px';
    $('fxLayer').appendChild(d);
    setTimeout(() => d.remove(), 1500);
  }

  const COL = { blue: '#3b82f6', red: '#ef4444', event: '#a855f7', item: '#06b6d4', shop: '#ec4899', nest: '#84cc16', chance: '#facc15', chaos: '#1e293b', special: '#f59e0b', tunnel: '#111827', start: '#ffffff', casino: '#15803d', trade: '#0d9488', boss: '#7f1d1d', shift: '#b45309', npc: '#a21caf' };
  const ICON = { item: '🎁', shop: '🛒', nest: '🪺', chance: '🎲', chaos: '🌀', tunnel: '🕳️', casino: '🎰', trade: '🔁', boss: '😈', shift: '⚙️', npc: '🙂' };
  const SWAY = ['🌴', '🌿', '🍃', '🌾', '🪵'];
  const FLYERS = { jurassic: ['🦅', '🦋'], pirate: ['🦜', '🕊️'], heroes: ['🚁', '🦸'], mine: ['🦇', '🦇'] };
  const shadeC = (hex, f) => { const n = parseInt(hex.slice(1), 16); const ch = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); return 'rgb(' + ch(n >> 16) + ',' + ch((n >> 8) & 255) + ',' + ch(n & 255) + ')'; };

  /* --- Couche fixe (plateau, chemins, cases) dessinée une seule fois par plateau --- */
  let STATIC = null;
  function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function buildStatic(B) {
    const SC = 1.5, PAD = 80, PH = B.H * TILT;
    const c = document.createElement('canvas');
    c.width = Math.round((B.W + PAD * 2) * SC); c.height = Math.round((PH + PAD * 2 + 40) * SC);
    const x = c.getContext('2d');
    x.setTransform(SC, 0, 0, SC, PAD * SC, PAD * SC);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const R = seeded(B.W + B.nodes.length * 7);
    // Plateau de jeu épais, posé sur la table
    const round = (rx, ry, w, h, r) => { x.beginPath(); x.moveTo(rx + r, ry); x.arcTo(rx + w, ry, rx + w, ry + h, r); x.arcTo(rx + w, ry + h, rx, ry + h, r); x.arcTo(rx, ry + h, rx, ry, r); x.arcTo(rx, ry, rx + w, ry, r); x.closePath(); };
    x.fillStyle = 'rgba(0,0,0,.45)'; round(-36, -20, B.W + 72, PH + 70, 40); x.fill();
    x.fillStyle = shadeC(B.bg[0], -0.45); round(-40, -40, B.W + 80, PH + 80, 40); x.fill();
    const gr = x.createLinearGradient(0, -40, 0, PH + 40); gr.addColorStop(0, shadeC(B.bg[1], 0.08)); gr.addColorStop(1, B.bg[0]);
    x.fillStyle = gr; round(-40, -46, B.W + 80, PH + 64, 40); x.fill();
    x.save(); round(-40, -46, B.W + 80, PH + 64, 40); x.clip();
    // Sol selon la région
    if (B.id === 'pirate') {
      x.fillStyle = '#0b6aa0'; x.fillRect(-60, -60, B.W + 120, PH + 120);
      const isl = (k, col) => { x.fillStyle = col; x.beginPath(); x.ellipse(B.W / 2, PH / 2, B.W * 0.48 * k, PH * 0.48 * k, 0, 0, Math.PI * 2); x.fill(); };
      isl(1.05, 'rgba(125,211,252,.55)'); isl(1, '#f6dfa4'); isl(0.92, '#e9cf8d'); isl(0.7, 'rgba(101,163,13,.55)');
    } else if (B.id === 'heroes') {
      x.fillStyle = '#1f1147'; x.fillRect(-60, -60, B.W + 120, PH + 120);
      x.strokeStyle = 'rgba(167,139,250,.18)'; x.lineWidth = 18;
      for (let i = -40; i < B.W + 60; i += 160) { x.beginPath(); x.moveTo(i, -60); x.lineTo(i, PH + 60); x.stroke(); }
      for (let j = -40; j < PH + 60; j += 110) { x.beginPath(); x.moveTo(-60, j); x.lineTo(B.W + 60, j); x.stroke(); }
      for (let i = 0; i < 70; i++) { const bx = R() * B.W, by = R() * PH; x.fillStyle = 'rgba(253,224,71,' + (0.08 + R() * 0.15) + ')'; x.fillRect(bx, by, 6, 6); }
    } else if (B.id === 'mine') {
      x.fillStyle = '#292524'; x.fillRect(-60, -60, B.W + 120, PH + 120);
      for (let i = 0; i < 90; i++) { x.fillStyle = 'rgba(' + (R() < 0.5 ? '68,64,60' : '28,25,23') + ',.7)'; x.beginPath(); x.ellipse(R() * B.W, R() * PH, 20 + R() * 60, 10 + R() * 30, R() * 3, 0, Math.PI * 2); x.fill(); }
      x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 2;
      for (let i = 0; i < 25; i++) { let px = R() * B.W, py = R() * PH; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (R() - 0.5) * 80; py += (R() - 0.5) * 40; x.lineTo(px, py); } x.stroke(); }
    } else {
      for (let i = 0; i < 120; i++) { x.fillStyle = R() < 0.6 ? 'rgba(20,83,45,.25)' : 'rgba(163,230,53,.12)'; x.beginPath(); x.ellipse(R() * B.W, R() * PH, 25 + R() * 70, 12 + R() * 30, 0, 0, Math.PI * 2); x.fill(); }
      for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(120,53,15,.18)'; x.beginPath(); x.ellipse(R() * B.W, R() * PH, 60 + R() * 60, 20 + R() * 20, 0, 0, Math.PI * 2); x.fill(); }
    }
    // Lumière douce en haut, ombre en bas
    const vg = x.createRadialGradient(B.W * 0.35, PH * 0.2, 50, B.W / 2, PH / 2, B.W * 0.75);
    vg.addColorStop(0, 'rgba(255,255,255,.10)'); vg.addColorStop(1, 'rgba(0,0,0,.35)');
    x.fillStyle = vg; x.fillRect(-60, -60, B.W + 120, PH + 120);
    x.restore();

    const P = (n) => P3(n.x, n.y, n.z || 0);
    const drawPaths = (lv) => {
      B.nodes.forEach((n) => n.next.forEach((id) => {
        const m = B.nodes[id];
        if (Math.max(n.level, m.level) !== lv) return;
        const a = P(n), b = P(m);
        x.lineCap = 'round';
        x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 22; x.beginPath(); x.moveTo(a.X, a.Y + 7); x.lineTo(b.X, b.Y + 7); x.stroke();
        x.strokeStyle = shadeC(B.path, -0.35); x.lineWidth = 18; x.beginPath(); x.moveTo(a.X, a.Y + 4); x.lineTo(b.X, b.Y + 4); x.stroke();
        x.strokeStyle = B.path; x.lineWidth = 16; x.beginPath(); x.moveTo(a.X, a.Y); x.lineTo(b.X, b.Y); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 3; x.beginPath(); x.moveTo(a.X, a.Y - 3); x.lineTo(b.X, b.Y - 3); x.stroke();
        if (n.stairs || m.stairs) {
          const dx = b.X - a.X, dy = b.Y - a.Y, L = Math.hypot(dx, dy) || 1, ux = -dy / L * 10, uy = dx / L * 10;
          x.strokeStyle = shadeC(B.path, -0.5); x.lineWidth = 3;
          for (let t = 0.12; t < 0.95; t += 0.14) { const px = a.X + dx * t, py = a.Y + dy * t; x.beginPath(); x.moveTo(px - ux, py - uy); x.lineTo(px + ux, py + uy); x.stroke(); }
        }
      }));
    };
    const drawTiles = (lv) => {
      B.nodes.slice().filter((n) => n.level === lv).sort((a, b) => a.y - b.y).forEach((n) => {
        const p = P(n), col = COL[n.t], rx = 19, ry = 19 * TILT, h = 8;
        x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(p.X + 3, p.Y + h + 4, rx + 2, ry + 2, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = shadeC(col === '#ffffff' ? '#cbd5e1' : col, -0.4);
        x.beginPath(); x.ellipse(p.X, p.Y + h, rx, ry, 0, 0, Math.PI); x.lineTo(p.X - rx, p.Y); x.ellipse(p.X, p.Y, rx, ry, 0, Math.PI, 0, true); x.closePath(); x.fill();
        const tg = x.createRadialGradient(p.X - 6, p.Y - 4, 2, p.X, p.Y, rx);
        tg.addColorStop(0, shadeC(col, 0.45)); tg.addColorStop(1, col);
        x.fillStyle = tg; x.beginPath(); x.ellipse(p.X, p.Y, rx, ry, 0, 0, Math.PI * 2); x.fill();
        x.strokeStyle = n.t === 'start' ? '#3b0764' : 'rgba(255,255,255,.95)'; x.lineWidth = 2.5; x.stroke();
        if (n.t === 'event') { x.fillStyle = '#fff'; x.font = 'bold 17px Fredoka, sans-serif'; x.fillText('?', p.X, p.Y); }
        else if (n.t === 'special') { x.font = '16px serif'; x.fillText(B.special.icon, p.X, p.Y - 2); }
        else if (ICON[n.t]) { x.font = '15px serif'; x.fillText(n.t === 'tunnel' && B.warp ? B.warp.icon : n.t === 'npc' && window.PARTY.NPCS[n.npc] ? window.PARTY.NPCS[n.npc].icon : ICON[n.t], p.X, p.Y - 1); }
        else if (n.t === 'start') { x.fillStyle = '#3b0764'; x.font = 'bold 11px Fredoka, sans-serif'; x.fillText('GO', p.X, p.Y); }
        else { x.fillStyle = 'rgba(255,255,255,.9)'; x.font = 'bold 14px Fredoka, sans-serif'; x.fillText(n.t === 'blue' ? '+' : '−', p.X, p.Y); }
      });
    };
    drawPaths(0); drawTiles(0);
    // Étages : dalle surélevée
    B.platforms.forEach((pf) => {
      const top = P3(pf.cx, pf.cy, 60), bot = P3(pf.cx, pf.cy, 0), rx = pf.rx, ry = pf.ry * TILT;
      x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(bot.X + 18, bot.Y + 16, rx, ry, 0, 0, Math.PI * 2); x.fill();
      const side = x.createLinearGradient(bot.X - rx, 0, bot.X + rx, 0);
      side.addColorStop(0, shadeC(B.floorColor, -0.55)); side.addColorStop(0.5, shadeC(B.floorColor, -0.3)); side.addColorStop(1, shadeC(B.floorColor, -0.6));
      x.fillStyle = side; x.beginPath(); x.ellipse(bot.X, bot.Y, rx, ry, 0, 0, Math.PI); x.lineTo(top.X - rx, top.Y); x.ellipse(top.X, top.Y, rx, ry, 0, Math.PI, 0, true); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 2;
      for (let a = 0.08; a < 1; a += 0.08) { const px = bot.X + Math.cos(Math.PI * a) * rx, py = bot.Y + Math.sin(Math.PI * a) * ry; x.beginPath(); x.moveTo(px, py); x.lineTo(px, py - 60); x.stroke(); }
      const tg = x.createRadialGradient(top.X - rx * 0.3, top.Y - ry * 0.4, 10, top.X, top.Y, rx);
      tg.addColorStop(0, shadeC(B.floorColor, 0.3)); tg.addColorStop(1, B.floorColor);
      x.fillStyle = tg; x.beginPath(); x.ellipse(top.X, top.Y, rx, ry, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 3; x.stroke();
      x.fillStyle = 'rgba(255,255,255,.35)'; x.font = 'bold 15px Fredoka, sans-serif'; x.fillText('ÉTAGE', top.X, top.Y);
    });
    if (B.platforms.length) { drawPaths(1); drawTiles(1); }
    return { canvas: c, SC, PAD, key: B.key };
  }

  /* --- Décor animé --- */
  let DECOR = null;
  function buildDecor(B) {
    const R = seeded(B.nodes.length * 13 + B.W);
    const insidePlatform = (d) => B.platforms.some((pf) => Math.pow((d.x - pf.cx) / pf.rx, 2) + Math.pow((d.y - pf.cy) / pf.ry, 2) < 1);
    const items = B.decor.filter((d) => !insidePlatform(d)).map((d) => ({ x: d.x, y: d.y, e: d.e, s: d.s, ph: R() * 6.28 }));
    const flyers = (FLYERS[B.id] || []).map((e, i) => ({ e, y: 80 + R() * (B.H - 160), speed: 30 + R() * 40, ph: R() * 1000, dir: i % 2 ? -1 : 1 }));
    const parts = Array.from({ length: 26 }, () => ({ x: R() * B.W, y: R() * B.H, ph: R() * 6.28, sp: 0.3 + R() }));
    return { key: B.key, items, flyers, parts };
  }

  function drawSprite(img, X, Y, size) { if (img && img.complete) g.drawImage(img, X - size / 2, Y - size + 6, size, size); }

  function draw(now) {
    requestAnimationFrame(draw);
    if (!S || S.phase === 'lobby' || $('game').classList.contains('hidden')) return;
    resize();
    const B = board();
    const focusP = S.players.find((p) => p.id === S.current) || S.players.find((p) => p.id === ME);
    if (USE3D) {
      const wrap = cv.parentElement.getBoundingClientRect();
      Scene3D.resize(Math.max(200, Math.floor(wrap.width)), Math.max(160, Math.floor(wrap.height)));
      const pv = playerViews(now);
      const pr = S.prompt;
      Scene3D.frame(now, {
        board: B, players: pv, current: S.current, stars: S.stars, traps: S.traps, blocks: S.blocks, tide: S.tide, levis: window.PARTY.levisOpen(S.turn), day: S.settings.theme === 'mine' ? 'jour' : (window.__day || window.PARTY.dayPhase(S.turn, S.settings.theme)),
        fork: pr && pr.kind === 'fork' && pr.pid === ME ? pr.data.options : null, mePos: disp[ME],
        focus: focusP ? (disp[focusP.id] || nodePos(focusP.pos)) : null,
      });
      return;
    }
    if (!STATIC || STATIC.key !== B.key) { STATIC = buildStatic(B); DECOR = buildDecor(B); }
    updateCamera(B, focusP && (disp[focusP.id] || nodePos(focusP.pos)));
    const k = cv.width / cam.w;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const bgc = g.createLinearGradient(0, 0, 0, cv.height); bgc.addColorStop(0, '#120a2b'); bgc.addColorStop(1, '#2a1259');
    g.fillStyle = bgc; g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    g.drawImage(STATIC.canvas, -STATIC.PAD, -STATIC.PAD, STATIC.canvas.width / STATIC.SC, STATIC.canvas.height / STATIC.SC);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const t = now / 1000;
    // Ambiance animée
    if (B.id === 'pirate') {
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2, rr = 1.12 + 0.04 * Math.sin(t + i);
        const wx = B.W / 2 + Math.cos(a) * B.W * 0.48 * rr, wy = B.H * TILT / 2 + Math.sin(a) * B.H * TILT * 0.48 * rr;
        const o = Math.sin(t * 1.5 + i) * 6;
        g.beginPath(); g.moveTo(wx - 14 + o, wy); g.quadraticCurveTo(wx + o, wy - 6, wx + 14 + o, wy); g.stroke();
      }
    }
    if (B.id === 'heroes') {
      for (let i = 0; i < 2; i++) {
        const bx = B.W * (0.25 + 0.5 * i), a = Math.sin(t * 0.6 + i * 2) * 0.5;
        g.save(); g.translate(bx, B.H * TILT + 30); g.rotate(a - Math.PI / 2 * 0);
        const lg = g.createLinearGradient(0, 0, 0, -B.H * TILT); lg.addColorStop(0, 'rgba(253,224,71,.18)'); lg.addColorStop(1, 'rgba(253,224,71,0)');
        g.fillStyle = lg; g.beginPath(); g.moveTo(-10, 0); g.lineTo(-90, -B.H * TILT - 60); g.lineTo(90, -B.H * TILT - 60); g.lineTo(10, 0); g.fill(); g.restore();
      }
    }
    if (B.id === 'mine' || B.id === 'jurassic') {
      DECOR.parts.forEach((pt) => {
        const yy = ((pt.y - t * 12 * pt.sp) % B.H + B.H) % B.H, xx = pt.x + Math.sin(t + pt.ph) * 10;
        const p = P3(xx, yy, 20 + Math.sin(t * 2 + pt.ph) * 8);
        g.fillStyle = B.id === 'mine' ? 'rgba(253,224,71,' + (0.25 + 0.25 * Math.sin(t * 3 + pt.ph)) + ')' : 'rgba(190,242,100,.35)';
        g.beginPath(); g.arc(p.X, p.Y, B.id === 'mine' ? 1.8 : 2.4, 0, Math.PI * 2); g.fill();
      });
    }
    // Objets à trier par profondeur : décor, étoiles, joueurs
    const list = [];
    DECOR.items.forEach((d) => list.push({ y: d.y, z: 0, kind: 'decor', d }));
    (S.stars || []).forEach((s) => { const n = B.nodes[s.node]; if (n) list.push({ y: n.y + 1, z: n.z || 0, kind: 'star', n, s }); });
    (S.blocks || []).forEach((b) => { const a = B.nodes[b.from], c = B.nodes[b.to]; if (a && c) list.push({ y: (a.y + c.y) / 2, z: ((a.z || 0) + (c.z || 0)) / 2, kind: 'block', x: (a.x * 0.6 + c.x * 0.4), yy: (a.y * 0.6 + c.y * 0.4), b }); });
    Object.keys(S.traps || {}).forEach((nid) => { const n = B.nodes[nid]; if (n) list.push({ y: n.y + 0.5, z: n.z || 0, kind: 'trap', n }); });
    playerViews(now).forEach((o) => list.push(Object.assign({ y: o.pos.y + 2, z: o.pos.z, kind: 'player' }, o)));
    list.sort((a, b) => a.y - b.y);
    list.forEach((o) => {
      if (o.kind === 'decor') {
        const d = o.d, p = P3(d.x, d.y, 0);
        g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(p.X, p.Y + 3, d.s * 0.45, d.s * 0.14, 0, 0, Math.PI * 2); g.fill();
        g.save(); g.translate(p.X, p.Y);
        if (SWAY.includes(d.e)) g.rotate(Math.sin(t * 1.3 + d.ph) * 0.07);
        const bob = SWAY.includes(d.e) ? 0 : Math.sin(t * 1.6 + d.ph) * 2;
        g.font = d.s + 'px serif'; g.fillText(d.e, 0, -d.s * 0.45 + bob);
        g.restore();
        if (d.e === '🌋') { for (let i = 0; i < 4; i++) { const ph = ((t * 0.5 + i / 4 + d.ph) % 1); g.fillStyle = 'rgba(120,113,108,' + (0.45 * (1 - ph)) + ')'; g.beginPath(); g.arc(p.X + Math.sin(ph * 6 + d.ph) * 6, p.Y - d.s - ph * 50, 4 + ph * 10, 0, Math.PI * 2); g.fill(); } }
        if (d.e === '💎' || d.e === '⚡') { const tw = 0.5 + 0.5 * Math.sin(t * 4 + d.ph); g.fillStyle = 'rgba(255,255,255,' + tw * 0.8 + ')'; g.font = '12px serif'; g.fillText('✦', p.X + d.s * 0.3, p.Y - d.s * 0.8); }
        if (d.e === '🕯️' || d.e === '🔦') { const fl = 0.25 + 0.15 * Math.sin(t * 9 + d.ph); const rg = g.createRadialGradient(p.X, p.Y - d.s * 0.6, 2, p.X, p.Y - d.s * 0.6, 50); rg.addColorStop(0, 'rgba(253,224,71,' + fl + ')'); rg.addColorStop(1, 'rgba(253,224,71,0)'); g.fillStyle = rg; g.beginPath(); g.arc(p.X, p.Y - d.s * 0.6, 50, 0, Math.PI * 2); g.fill(); }
      } else if (o.kind === 'star') {
        const p = P3(o.n.x, o.n.y, o.z), bob = Math.sin(t * 2.5) * 5;
        const rg = g.createRadialGradient(p.X, p.Y - 40, 4, p.X, p.Y - 40, 55); rg.addColorStop(0, 'rgba(253,224,71,.8)'); rg.addColorStop(1, 'rgba(253,224,71,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(p.X, p.Y - 40, 55, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(p.X, p.Y + 4, 16, 5, 0, 0, Math.PI * 2); g.fill();
        g.save(); g.translate(p.X, p.Y - 42 + bob); g.scale(Math.cos(t * 2) * 0.25 + 0.95, 1);
        g.font = '42px serif'; g.fillText(B.star.icon, 0, 0); g.restore();
        for (let i = 0; i < 3; i++) { const a = t * 2 + i * 2.1; g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '11px serif'; g.fillText('✦', p.X + Math.cos(a) * 28, p.Y - 42 + Math.sin(a) * 12 + bob); }
        g.font = 'bold 13px Fredoka, sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3;
        const lbl = o.s.price + ' ' + B.coin.icon; g.strokeText(lbl, p.X, p.Y - 76 + bob); g.fillText(lbl, p.X, p.Y - 76 + bob);
      } else if (o.kind === 'block') {
        const p = P3(o.x, o.yy, o.z); g.font = '34px serif'; g.fillText(o.b.icon, p.X, p.Y - 8); g.font = '16px serif'; g.fillText('⛔', p.X + 16, p.Y - 30);
      } else if (o.kind === 'trap') {
        const p = P3(o.n.x, o.n.y, o.z); g.font = '18px serif'; g.fillText('🪤', p.X + 14, p.Y - 12);
      } else {
        const p = o.p, pos = o.pos, pp = P3(pos.x, pos.y, pos.z);
        const cur = p.id === S.current, size = cur ? 66 : 54;
        const bob = cur && !o.moving ? Math.abs(Math.sin(t * 4.5)) * 7 : 0;
        const squash = cur && !o.moving ? 1 + Math.sin(t * 9) * 0.03 : 1;
        g.globalAlpha = o.alpha;
        const sh = Math.max(0.35, 1 - o.hop / 200);
        g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(pp.X, pp.Y + 4, size * 0.34 * sh, size * 0.11 * sh, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = p.color; g.lineWidth = 4; g.beginPath(); g.ellipse(pp.X, pp.Y + 4, size * 0.4, size * 0.13, 0, 0, Math.PI * 2); g.stroke();
        if (cur) { g.strokeStyle = 'rgba(253,224,71,' + (0.5 + 0.4 * Math.sin(t * 5)) + ')'; g.lineWidth = 3; g.beginPath(); g.ellipse(pp.X, pp.Y + 4, size * 0.52, size * 0.17, 0, 0, Math.PI * 2); g.stroke(); }
        g.save(); g.translate(pp.X, pp.Y - o.hop - bob); g.scale(1 / squash, squash);
        drawSprite(IMG[p.char], 0, 0, size); g.restore();
        if (p.companion) { g.font = '22px serif'; g.fillText(GAME.companions[p.companion].icon, pp.X + size * 0.48, pp.Y - 14 - o.hop * 0.8 + Math.sin(t * 3) * 4); }
        if (p.shield) { g.font = '17px serif'; g.fillText('🛡️', pp.X - size * 0.48, pp.Y - 16 - o.hop); }
        g.globalAlpha = 1;
      }
    });
    // Créatures volantes
    DECOR.flyers.forEach((f) => {
      const span = B.W + 300, xx = ((t * f.speed + f.ph) % span) - 150;
      const fx = f.dir > 0 ? xx : B.W - xx, fy = f.y + Math.sin(t * 2 + f.ph) * 20;
      const p = P3(fx, fy, 140);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(fx, fy * TILT + 6, 12, 4, 0, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(p.X, p.Y); if (f.dir < 0) g.scale(-1, 1); g.font = '26px serif'; g.fillText(f.e, 0, 0); g.restore();
    });
    fxs = fxs.filter((f) => now - f.t0 < 900);
    fxs.forEach((f) => {
      const tt = (now - f.t0) / 900, p = P3(f.x, f.y, f.z || 0);
      g.strokeStyle = f.kind === 'burst' ? 'rgba(253,224,71,' + (1 - tt) + ')' : 'rgba(255,255,255,' + (1 - tt) + ')';
      g.lineWidth = 6 * (1 - tt) + 1; g.beginPath(); g.ellipse(p.X, p.Y, 10 + tt * 70, (10 + tt * 70) * TILT, 0, 0, Math.PI * 2); g.stroke();
    });
    drawArrows(B, t);
  }

  function playerViews(now) {
    const out = [];
    const groups = {};
    S.players.forEach((p) => { (groups[p.pos] = groups[p.pos] || []).push(p); });
    S.players.forEach((p) => {
      const grp = groups[p.pos] || [p], i = grp.indexOf(p), nG = grp.length;
      const base = nodePos(p.pos);
      const off = nG > 1 ? { x: Math.cos((i / nG) * Math.PI * 2) * (USE3D ? 30 : 20), y: Math.sin((i / nG) * Math.PI * 2) * (USE3D ? 26 : 16) } : { x: 0, y: 0 };
      let pos = { x: base.x + off.x, y: base.y + off.y, z: base.z }, hop = 0, alpha = 1, ride = null;
      const a = anims[p.id];
      if (a) {
        const el = Math.max(0, now - a.t0);
        if (a.kind === 'path') {
          const seg = Math.min(a.pts.length - 2, Math.floor(el / a.step));
          if (el >= (a.pts.length - 1) * a.step || seg < 0) delete anims[p.id];
          else {
            const tt = (el - seg * a.step) / a.step, A = a.pts[seg], Bp = a.pts[seg + 1];
            pos = { x: A.x + (Bp.x - A.x) * tt, y: A.y + (Bp.y - A.y) * tt, z: (A.z || 0) + ((Bp.z || 0) - (A.z || 0)) * tt }; hop = Math.sin(tt * Math.PI) * 22;
            if (seg !== a.lastStep) { a.lastStep = seg; sfx.step(); }
          }
        } else {
          const tt = Math.min(1, el / a.dur);
          if (tt >= 1) delete anims[p.id];
          else { pos = { x: a.from.x + (a.to.x - a.from.x) * tt, y: a.from.y + (a.to.y - a.from.y) * tt, z: (a.from.z || 0) + ((a.to.z || 0) - (a.from.z || 0)) * tt }; hop = a.fly ? Math.sin(tt * Math.PI) * (a.ride ? 220 : 160) : a.ride === 'metro' ? -Math.sin(tt * Math.PI) * 30 : 0; if (!a.fly && !a.ride) alpha = tt < 0.5 ? 1 - tt * 2 : (tt - 0.5) * 2; ride = a.ride; }
        }
      }
      disp[p.id] = pos;
      out.push({ p, pos, hop, alpha, moving: !!a, ride });
    });
    return out;
  }

  /* --- Flèches de direction à côté du joueur --- */
  function drawArrows(B, t) {
    arrows = [];
    const pr = S.prompt;
    if (!pr || pr.kind !== 'fork' || pr.pid !== ME) return;
    const me = S.players.find((p) => p.id === ME); if (!me) return;
    const pos = disp[ME] || nodePos(me.pos), pp = P3(pos.x, pos.y, pos.z);
    pr.data.options.forEach((o, i) => {
      const n = B.nodes[o.value]; if (!n) return;
      const q = P3(n.x, n.y, n.z || 0);
      let dx = q.X - pp.X, dy = q.Y - pp.Y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const pulse = 1 + Math.sin(t * 6) * 0.08, dist = 62;
      const cx = pp.X + dx * dist, cy = pp.Y - 18 + dy * dist;
      const col = o.label === 'Continuer' ? '#facc15' : '#f472b6';
      g.save(); g.translate(cx, cy); g.rotate(Math.atan2(dy, dx)); g.scale(pulse, pulse);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.moveTo(-20, -11 + 4); g.lineTo(6, -11 + 4); g.lineTo(6, -22 + 4); g.lineTo(30, 4); g.lineTo(6, 26); g.lineTo(6, 15); g.lineTo(-20, 15); g.closePath(); g.fill();
      g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-20, -11); g.lineTo(6, -11); g.lineTo(6, -22); g.lineTo(30, 0); g.lineTo(6, 22); g.lineTo(6, 11); g.lineTo(-20, 11); g.closePath(); g.fill(); g.stroke();
      g.restore();
      g.font = '18px serif'; g.fillText(o.icon, cx + dx * 4, cy - 30);
      g.font = 'bold 12px Fredoka, sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(o.label, cx, cy + 32); g.fillText(o.label, cx, cy + 32);
      arrows.push({ X: cx, Y: cy, value: o.value });
    });
  }
  cv.addEventListener('pointerdown', (e) => {
    if (!arrows.length) return;
    const r = cv.getBoundingClientRect();
    const X = cam.x + ((e.clientX - r.left) / r.width) * cam.w, Y = cam.y + ((e.clientY - r.top) / r.height) * cam.h;
    const hit = arrows.find((a) => Math.hypot(a.X - X, a.Y - Y) < 40);
    if (hit) { initAudio(); sfx.tap(); send({ t: 'answer', value: hit.value }); arrows = []; }
  });
  requestAnimationFrame(draw);

  /* ---------- Interface autour du plateau ---------- */
  let promptTimer = null;
  const CAS = { game: null };
  let TRADE = {};
  const FXK = { coins5: 'coins5', coins12: 'coins12', coins25: 'coins25', item: 'item', dice2: 'dice2', dice5: 'dice5', shield: 'shield', companion: 'companion', steal: 'steal', star: 'star', lose5: 'lose5', slow2: 'slow2', tax5: 'tax5', 'die:petit': 'petit', 'die:mini': 'mini', 'die:deux': 'deux' };
  const ICO = () => (USE3D && window.Scene3D && window.Scene3D.icons ? window.Scene3D.icons() : {});
  function ico(key, emoji, size) { const u = ICO()[key]; return u ? '<img class="ico" src="' + u + '" alt="" style="width:' + (size || 26) + 'px;height:' + (size || 26) + 'px">' : (emoji || ''); }
  window.__ico = ico;
  function renderGame(prev) {
    const B = board();
    $('gTitle').innerHTML = B.emoji + ' ' + esc(B.name) + (S.lastChance && S.lastChance.label ? ' <span class="tag">🔥 ' + esc(S.lastChance.label) + '</span>' : '') + (S.mods && S.mods.sale ? ' <span class="tag">🏷️ Soldes</span>' : '') + (S.mods && S.mods.blackout ? ' <span class="tag">🔌 Panne</span>' : '');
    $('gTurn').textContent = S.phase === 'end' ? 'Fin !' : 'Tour ' + Math.max(1, S.turn) + ' / ' + S.settings.turns;
    let tp = $('turnPill'); if (!tp) { tp = document.createElement('div'); tp.id = 'turnPill'; tp.className = 'turn-pill'; document.querySelector('.board-wrap').appendChild(tp); }
    const DPI = { jour: '☀️', 'crépuscule': '🌇', nuit: '🌙', aube: '🌅' };
    tp.innerHTML = S.phase === 'end' ? 'Fin !' : 'Tour<b>' + Math.max(1, S.turn) + '/' + S.settings.turns + '</b>' + (S.settings.theme !== 'mine' ? '<span class="dp" title="' + window.PARTY.dayPhase(S.turn, S.settings.theme) + '">' + DPI[window.PARTY.dayPhase(S.turn, S.settings.theme)] + '</span>' : '');
    let ob = $('orderBar'); if (!ob) { ob = document.createElement('div'); ob.id = 'orderBar'; ob.className = 'order-bar'; document.querySelector('.board-wrap').appendChild(ob); }
    ob.innerHTML = '<small>Ordre</small>' + S.players.map((p, i) => '<span class="ob' + (p.id === S.current ? ' cur' : '') + '" style="border-color:' + p.color + '" title="' + esc(p.name) + '">' + mini(p.char, 26) + '<i>' + (i + 1) + '</i></span>').join('');
    if (S.settings.market && S.market) {
      const M = S.market, h = M.hist || [], prev = h.length > 1 ? h[h.length - 2] : [1, 1];
      const st = S.stars && S.stars[0] ? Math.round(S.stars[0].price * M.star) : Math.round(20 * M.star);
      const arrow = (a, b) => (a > b + 0.001 ? '<em class="up">▲</em>' : a < b - 0.001 ? '<em class="dn">▼</em>' : '');
      const spark = (k) => { if (h.length < 2) return ''; const W = 46, Hh = 16, mn = 0.6, mx = 1.6; return '<svg width="' + W + '" height="' + Hh + '"><polyline fill="none" stroke="currentColor" stroke-width="2" points="' + h.map((v, i) => (i * W / (h.length - 1)).toFixed(1) + ',' + (Hh - (v[k] - mn) / (mx - mn) * Hh).toFixed(1)).join(' ') + '"/></svg>'; };
      let mk = $('mktBar'); if (!mk) { mk = document.createElement('div'); mk.id = 'mktBar'; mk.className = 'mkt-bar'; document.querySelector('.board-wrap').appendChild(mk); }
      mk.innerHTML = '<b>📈 Bourse</b><span>' + starIcon() + ' ' + st + ' ' + arrow(M.star, prev[0]) + spark(0) + '</span><span>🛒 ' + (M.shop >= 1 ? '+' : '') + Math.round((M.shop - 1) * 100) + ' % ' + arrow(M.shop, prev[1]) + spark(1) + '</span>';
    } else { const mk = $('mktBar'); if (mk) mk.remove(); }
    $('btnCam').classList.remove('hidden');
    $('btnBag').classList.remove('hidden');
    $('btnAlbum').classList.toggle('hidden', !S.settings.boosters);
    const rank = S.players.slice().sort((a, b) => b.stars - a.stars || b.coins - a.coins);
    const tm = S.settings.teams ? ['A', 'B'].map((t) => { const m = S.players.filter((p) => p.team === t); return { t, st: m.reduce((a, p) => a + p.stars, 0), co: m.reduce((a, p) => a + p.coins, 0) }; }) : null;
    $('side').innerHTML = (tm ? '<div class="teambar">' + tm.map((x) => '<div class="tb tb' + x.t + '"><b>' + (x.t === 'A' ? '🔵 Bleus' : '🔴 Rouges') + '</b><span>' + starIcon() + ' ' + x.st + ' · ' + coinIcon() + ' ' + x.co + '</span></div>').join('') + '</div>' : '') + S.players.map((p) => '<div class="pc' + (S.settings.teams ? ' team' + p.team : '') + (p.id === S.current ? ' cur' : '') + (p.online ? '' : ' off') + '" style="border-color:' + p.color + '"><span class="rk">' + (rank.indexOf(p) + 1) + '<sup>' + (rank.indexOf(p) ? 'e' : 'er') + '</sup></span>' + svg(p.char) + '<div style="min-width:0;flex:1"><div class="nm">' + esc(p.name) + (p.id === ME ? ' (toi)' : '') + '</div><div class="st">' + starIcon() + ' ' + p.stars + ' &nbsp; ' + coinIcon() + ' ' + p.coins + '</div><div class="inv">' +
      (p.power ? '<span title="' + esc(GAME.powers[p.power].name + ' : ' + GAME.powers[p.power].desc) + '">' + GAME.powers[p.power].icon + '</span>' : '') +
      (p.comps || []).map((k) => '<span title="' + esc(GAME.companions[k].name + ' : ' + GAME.companions[k].desc) + '">' + GAME.companions[k].icon + '</span>').join('') +
      (S.settings.boosters && p.cards && p.cards.length ? '<span class="sep">|</span><span title="Cartes différentes">🃏' + new Set(p.cards).size + '</span>' + Object.keys(FAMILIES).map((f) => { const l = famLevel(p.cards, f); return l ? '<span class="fam' + l + '" title="' + esc(FAMILIES[f].name + ' : ' + FAMILIES[f].bonus[l - 1]) + '">' + FAMILIES[f].icon + (l === 2 ? '★' : '') + '</span>' : ''; }).join('') : '') + (p.buff ? '<span title="Bonus au prochain dé">' + (p.buff < 0 ? '🐌' + p.buff : '👟+' + p.buff) + '</span>' : '') + (p.die ? '<span title="' + esc(GAME.dice[p.die].label + ' : ' + GAME.dice[p.die].desc) + '">' + GAME.dice[p.die].icon + (p.dieUses ? '<sub>' + p.dieUses + '</sub>' : '') + '</span>' : '') +
      (p.items.length ? '<span class="sep">|</span>' + p.items.map((k) => '<span title="' + esc(GAME.items[k].name) + '">' + ico(k, GAME.items[k].icon, 20) + '</span>').join('') : '') + '</div></div></div>').join('');
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
        const hand = d.hand || [];
        const sec = (title, body) => '<div class="inv-sec"><div class="inv-h">' + title + '</div><div class="inv-b">' + body + '</div></div>';
        html = '<span class="msg">À toi ! ' + (d.items.length || hand.length ? 'Utilise un objet et/ou une carte si tu veux, puis lance un dé.' : 'Choisis ton dé.') + '</span><div class="inv-panel">' +
          sec('🎲 Dés', d.dice.map((k) => '<button class="btn opt" data-a="' + A({ dice: k }) + '">' + ico(k, GAME.dice[k].icon) + ' ' + esc(GAME.dice[k].label) + '<small>' + esc(GAME.dice[k].desc) + (k === me.die && me.dieUses ? ' — encore ' + me.dieUses : '') + '</small></button>').join('')) +
          sec('🎒 Objets <small>' + me.items.length + '/3</small>', d.items.length ? d.items.map((it) => '<button class="btn opt ghosty" data-a="' + A({ item: it.i }) + '">' + ico(it.k, GAME.items[it.k].icon) + ' ' + esc(GAME.items[it.k].name) + '<small>' + esc(GAME.items[it.k].desc) + '</small></button>').join('') : '<span class="inv-empty">' + (me.items.length ? 'Déjà utilisé ce tour' : 'Vide') + '</span>') +
          (S.settings.boosters ? sec('🃏 Cartes <small>' + (me.hand || []).length + '/5</small>', hand.length ? hand.map((h) => { const c = CARDS[h.id]; return '<button class="btn opt cardb ' + c.rarity + '" data-a="' + A({ card: h.i }) + '">' + ico(FXK[c.fx], c.icon) + ' ' + esc(c.name) + '<small>' + esc(c.desc) + '</small></button>'; }).join('') : '<span class="inv-empty">' + ((me.hand || []).length ? 'Déjà jouée ce tour' : 'Aucune carte à jouer') + '</span>') : '') +
          '</div>';
      } else if (pr.kind === 'fork') {
        $('dice').classList.add('hidden');
        html = '<span class="msg">👆 Embranchement ! Touche une flèche à côté de ton Monstro pour choisir ta direction.</span><div class="opts small-opts">' + d.options.map((o) => '<button class="btn small ghost" data-a="' + A(o.value) + '">' + o.icon + ' ' + esc(o.label) + '</button>').join('') + '</div>';
      } else if (pr.kind === 'buy' || pr.kind === 'nest') {
        html = '<span class="msg">' + esc(d.text) + (pr.kind === 'nest' ? '<br><small>' + esc(GAME.companions[d.k].desc) + (d.replace ? ' (remplace ' + GAME.companions[d.replace].icon + ')' : '') + '</small>' : '') + '</span><div class="opts"><button class="btn big" data-a="true">Oui !</button><button class="btn big ghost" data-a="false">Non</button></div>';
      } else if (pr.kind === 'shop') {
        html = '<span class="msg">🛒 ' + esc(d.text) + (d.sale ? ' <b>(soldes −50 %)</b>' : '') + '</span><div class="opts">' + d.options.map((o) => { const it = o.k === 'booster' ? GAME.booster : o.k === 'die' ? { icon: GAME.dice[o.d].icon, name: GAME.dice[o.d].label + (me.die ? ' (remplace ' + GAME.dice[me.die].icon + ')' : ''), desc: GAME.dice[o.d].desc + ' — à toi pour le reste de la partie' } : GAME.items[o.k]; return '<button class="btn opt' + (o.k === 'booster' ? ' alt' : '') + '" data-a="' + A(o.k) + '"' + (o.price > me.coins || (d.full && o.k !== 'booster' && o.k !== 'die') ? ' disabled' : '') + '>' + ico(o.k === 'die' ? o.d : o.k, it.icon) + ' ' + esc(it.name) + ' · ' + o.price + ' ' + B.coin.icon + '<small>' + esc(it.desc) + '</small></button>'; }).join('') + '<button class="btn ghost" data-a="null">Rien, merci</button></div>';
      } else if (pr.kind === 'target') {
        html = '<span class="msg">' + esc(d.text) + '</span><div class="opts">' + d.options.map((id) => { const p = S.players.find((x) => x.id === id); return '<button class="btn opt alt" data-a="' + A(id) + '">' + mini(p.char, 28) + ' ' + esc(p.name) + '<small>' + starIcon() + ' ' + p.stars + ' · ' + coinIcon() + ' ' + p.coins + '</small></button>'; }).join('') + '</div>';
      } else if (pr.kind === 'casino') {
        const g = CAS.game, B2 = B;
        if (!g) html = '<span class="msg">🎰 ' + esc(d.text) + '</span><div class="opts">' + Object.entries(GAME.casino).map(([k, c]) => '<button class="btn opt" data-cg="' + k + '">' + c.icon + ' ' + esc(c.name) + '<small>' + esc(c.desc) + '</small></button>').join('') + '<button class="btn ghost" data-a="null">Je passe</button></div>';
        else {
          const choices = g === 'roulette' ? [['rouge', '🔴 Rouge ×2'], ['noir', '⚫ Noir ×2'], ['vert', '🟢 Vert ×14']] : g === 'pile' ? [['pile', 'Pile'], ['face', 'Face']] : [[null, '']];
          html = '<span class="msg">' + GAME.casino[g].icon + ' ' + esc(GAME.casino[g].name) + ' — ' + esc(GAME.casino[g].desc) + '</span>' + choices.map(([c, l]) => '<div class="opts">' + (l ? '<span class="chl">' + l + '</span>' : '') + d.bets.map((b) => '<button class="btn opt ' + (c === 'rouge' ? 'red' : c === 'noir' ? 'dark' : c === 'vert' ? 'green' : '') + '" data-a="' + A({ game: g, bet: b, choice: c }) + '">Miser ' + b + ' ' + B2.coin.icon + '</button>').join('') + '</div>').join('') + '<div class="opts"><button class="btn ghost small" data-cg="">← Autre jeu</button><button class="btn ghost small" data-a="null">Je passe</button></div>';
        }
      } else if (pr.kind === 'trade') {
        const T = TRADE.key === pr.deadline ? TRADE : (TRADE = { key: pr.deadline, pid: d.others[0].pid, take: null, give: null });
        const chip = (id, attr, sel, own) => { const c = CARDS[id], F = FAMILIES[c.fam]; const n = own ? me.cards.filter((x) => x === id).length : 0; return '<button class="btn small chip' + (sel ? ' sel' : '') + (own || me.cards.includes(id) ? '' : ' want') + '" ' + attr + '>' + F.icon + ' ' + esc(c.name) + (n > 1 ? ' ×' + n : '') + '</button>'; };
        const o = d.others.find((x) => x.pid === T.pid) || d.others[0];
        html = '<span class="msg">🔁 ' + esc(d.text) + '</span>' +
          '<div class="opts small-opts">' + d.others.map((x) => { const q = S.players.find((y) => y.id === x.pid); return '<button class="btn small' + (x.pid === o.pid ? ' alt' : ' ghost') + '" data-tp="' + x.pid + '">' + mini(q.char, 22) + ' ' + esc(q.name) + '</button>'; }).join('') + '</div>' +
          '<div class="trade-row"><b>Je prends :</b> ' + o.cards.map((id) => chip(id, 'data-tt="' + id + '"', T.take === id, false)).join('') + '</div>' +
          '<div class="trade-row"><b>Je donne :</b> ' + d.mine.map((id) => chip(id, 'data-tg="' + id + '"', T.give === id, true)).join('') + '</div>' +
          '<div class="opts"><button class="btn" id="tradeGo"' + (T.take && T.give ? '' : ' disabled') + ' data-a="' + A({ pid: o.pid, take: T.take, give: T.give }) + '">Proposer le troc</button><button class="btn ghost" data-a="null">Passer</button></div><small class="muted">En vert : les cartes qui te manquent.</small>';
      } else if (pr.kind === 'tradeok') {
        const from = S.players.find((x) => x.id === d.from), G = CARDS[d.give], Tk = CARDS[d.take];
        html = '<span class="msg">🔁 <b>' + esc(from ? from.name : '') + '</b> te propose un troc : tu reçois <b>' + FAMILIES[G.fam].icon + ' ' + esc(G.name) + '</b>' + (me.cards.includes(d.give) ? ' (tu l’as déjà)' : ' (nouvelle !)') + ' contre ta carte <b>' + FAMILIES[Tk.fam].icon + ' ' + esc(Tk.name) + '</b>' + (me.cards.filter((x) => x === d.take).length > 1 ? ' (tu l’as en double)' : '') + '.</span><div class="opts"><button class="btn big" data-a="true">J’accepte</button><button class="btn big ghost" data-a="false">Non merci</button></div>';
      } else if (pr.kind === 'choice') {
        html = '<span class="msg">' + esc(d.text) + '</span><div class="opts">' + d.options.map((o) => '<button class="btn opt" data-a="' + A(o.value) + '"' + (o.disabled ? ' disabled' : '') + '>' + esc(o.label) + (o.small ? '<small>' + esc(o.small) + '</small>' : '') + '</button>').join('') + '<button class="btn ghost" data-a="null">Non merci</button></div>';
      } else if (pr.kind === 'number') {
        html = '<span class="msg">🎯 ' + esc(d.text) + '</span><div class="opts">' + Array.from({ length: d.max - d.min + 1 }, (_, i) => '<button class="btn numb" data-a="' + (d.min + i) + '">' + (d.min + i) + '</button>').join('') + '</div>';
      }
      bar.innerHTML = html + '<span class="timer" id="aTimer"></span>';
      bar.querySelectorAll('[data-tp]').forEach((b) => (b.onclick = () => { TRADE.pid = b.dataset.tp; TRADE.take = null; renderPrompt(S); }));
      bar.querySelectorAll('[data-tt]').forEach((b) => (b.onclick = () => { TRADE.take = b.dataset.tt; renderPrompt(S); }));
      bar.querySelectorAll('[data-tg]').forEach((b) => (b.onclick = () => { TRADE.give = b.dataset.tg; renderPrompt(S); }));
      bar.querySelectorAll('[data-cg]').forEach((b) => (b.onclick = () => { CAS.game = b.dataset.cg || null; renderPrompt(S); }));
      bar.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { initAudio(); send({ t: 'answer', value: JSON.parse(b.dataset.a) }); }));
      const tick = () => { const s = Math.max(0, Math.ceil((pr.deadline - Date.now()) / 1000)); const t = $('aTimer'); if (t) t.textContent = s <= 10 ? s + ' s' : ''; };
      tick(); promptTimer = setInterval(tick, 500);
      if (!prev || !prev.prompt || prev.prompt.pid !== ME) beep(660, 0.12, 'triangle', 0.06);
    } else if (cur) {
      const what = pr && pr.pid === cur.id ? { turn: ' choisit son dé…', casino: ' hésite devant le casino…', fork: ' choisit son chemin…', buy: ' réfléchit à l’étoile…', shop: ' fait ses courses…', nest: ' regarde le nid…', target: ' choisit sa cible…', number: ' choisit son résultat…', trade: ' prépare un troc…', tradeok: ' réfléchit à un troc…', choice: ' discute avec un personnage…' }[pr.kind] : ' joue…';
      bar.innerHTML = '<span class="msg">' + mini(cur.char, 34) + ' <b>' + esc(cur.name) + '</b>' + what + '</span>';
    } else bar.innerHTML = '<span class="msg muted">' + (S.phase === 'minigame' ? 'Mini-jeu !' : '…') + '</span>';
  }

  function toast(text) {
    const d = document.createElement('div'); d.className = 'toast'; d.textContent = text;
    $('toasts').appendChild(d);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => d.remove(), 4200);
  }
  const LAND = { blue: ['Case bleue', '#2f7cf6'], red: ['Case rouge', '#e5383b'], event: ['Case événement', '#9b4dff'], item: ['Case objet', '#06b6d4'], shop: ['Boutique', '#ec4899'], nest: ['Nid à compagnon', '#65a30d'], chance: ['Case Chance', '#f5c518'], chaos: ['Chamboulement !', '#1e293b'], tunnel: ['Passage secret', '#111827'], casino: ['Casino', '#15803d'], trade: ['Case Troc', '#0d9488'], boss: ['Case Boss !', '#7f1d1d'], shift: ['Case Terrain', '#b45309'], npc: ['Personnage', '#a21caf'], start: ['Départ', '#94a3b8'] };
  function landShow(m) {
    let L = LAND[m.tile]; if (m.tile === 'npc') { const n = board().nodes[S.players.find((q) => q.id === m.pid).pos]; const N = n && window.PARTY.NPCS[n.npc]; if (N) L = [N.icon + ' ' + N.name.replace(/^l[ae’'] ?/i, (x) => x.toUpperCase()), '#a21caf']; } if (m.tile === 'tunnel') { const B = board(); L = [B.warp.name, '#111827']; } if (m.tile === 'special') { const B = board(); L = [B.special && B.special.name ? B.special.name : 'Case du boss', '#f59e0b']; }
    if (!L) return;
    const d = document.createElement('div'); d.className = 'landb';
    d.innerHTML = '<i style="background:' + L[1] + '"></i><span>' + esc(L[0]) + '</span>';
    const host = document.querySelector('.board-wrap') || document.body; host.appendChild(d);
    setTimeout(() => d.remove(), 1900);
  }
  function orderShow(m) {
    const d = document.createElement('div'); d.className = 'roul';
    d.innerHTML = '<div class="roul-in"><h2>' + esc(m.title) + '</h2><div class="olist">' + m.order.map((o, i) => { const q = S.players.find((x) => x.id === o.pid); return q ? '<div class="orow" style="animation-delay:' + (i * 0.35) + 's"><b>' + (i + 1) + '</b>' + mini(q.char, 34) + '<span>' + esc(q.name) + '</span>' + (o.n != null ? '<i>🎲 ' + o.n + '</i>' : '') + '</div>' : ''; }).join('') + '</div></div>';
    document.body.appendChild(d); sfx.item();
    setTimeout(() => d.remove(), 3600);
  }
  // Détail d'une case au survol (PC) ou en la touchant (téléphone)
  function tileInfo(n, B) {
    const C = B.coin.name, me = S && S.players.find((p) => p.id === ME);
    const I = {
      start: ['Départ', 'Tout le monde commence ici.'],
      blue: ['Case bleue', '+3 ' + C + ' (×2 pendant les 3 derniers tours). Famille Jurassique : +1 ou +2 en plus.'],
      red: ['Case rouge', '−3 ' + C + ' (×2 pendant les 3 derniers tours). Famille Mine : tu perds 1 ou 2 de moins.'],
      event: ['Case événement', 'Un événement au hasard : coffre de 10 ' + C + ', aimant (3 ' + C + ' de chaque joueur), échange de ' + C + ', tornade qui déplace l’étoile, bonne fée pour le plus pauvre, machine à sous, objet rare ou portail qui échange deux places.'],
      item: ['Case objet', 'Un objet gratuit, ou parfois un booster de 3 cartes.'],
      shop: ['Boutique', 'Tu peux acheter des objets, un booster ou un dé en passant dessus, même sans t’arrêter.'],
      nest: ['Nid à compagnon', 'Adopte le compagnon du nid pour 5 ' + C + '.'],
      chance: ['Case Chance', 'Deux joueurs tirés au sort : l’un donne à l’autre des ' + C + ' ou, à partir du tour 3, une étoile.'],
      chaos: ['Chamboulement', 'Remet tout en jeu : partage des ' + C + ', positions mélangées, Robin des bois, tas de ' + C + ' mélangés ou étoiles qui s’envolent.'],
      special: [B.special.name, B.special.desc],
      tunnel: [B.warp ? B.warp.name : 'Passage secret', (B.warp ? B.warp.icon + ' ' : '') + 'Transport : il t’emmène directement vers une autre case du plateau.'],
      casino: ['Casino', S && S.settings.gambling ? 'Machine à sous, roulette ou pile ou face : mise 5, 10 ou 20 ' + C + '.' : 'Jeux d’argent désactivés : rien ne se passe.'],
      trade: ['Case Troc', S && S.settings.boosters ? 'Propose à un joueur d’échanger une de tes cartes de famille contre une des siennes.' : 'Boosters désactivés : +3 ' + C + '.'],
      shift: ['Case Terrain', 'Le terrain bouge ! Un chemin se ferme pendant 2 tours (dino endormi, marée, travaux ou éboulement)… ou, s’il y en a déjà un de fermé, il se rouvre.'],
      boss: ['Case Boss', WORLD.bosses[B.id].name + ' débarque et fait tourner sa roue : −10, −20, impôt pour tous, retour au départ, objets confisqués, parfois une étoile… ou +5 s’il est de bonne humeur.'],
    };
    const NP = n.npc && window.PARTY.NPCS[n.npc], NW = n.npc && (window.PARTY.NPC_WHEN[B.id] || {})[n.npc];
    const info = NP ? [NP.icon + ' ' + NP.name, NP.desc + (n.npc === 'banque' && S ? ' Coffre : ' + (S.bank || 0) + ' ' + C + '.' : '') + (NW ? ' Présent seulement ' + (NW === 'nuit' ? 'la nuit.' : 'le jour.') : '')] : n.when === 'levis' ? ['Pont-levis', 'Baissé un tour sur deux (tours impairs) : on ne peut entrer au château que lorsqu’il est baissé.'] : n.when ? [n.when === 'nuit' ? 'Passage spectral' : 'Allée du jardin', 'Ce chemin n’est ouvert que ' + (n.when === 'nuit' ? 'la nuit' : 'le jour') + ' (le jour et la nuit changent tous les 4 tours).'] : n.sand ? ['Banc de sable', (I[n.t] ? I[n.t][0] + ' — ' : '') + 'On ne peut y aller qu’à marée basse (2 tours sur 4).'] : (I[n.t] || ['Case', '']);
    const star = S && (S.stars || []).find((x) => x.node === n.id);
    let extra = '';
    if (star && me) extra = '<p class="tt-star">' + starIcon() + ' Étoile ici : ' + Math.round(star.price * (S.settings.market && S.market ? S.market.star : 1)) + ' ' + C + '</p>';
    const bl = S && (S.blocks || []).find((b) => b.from === n.id);
    if (bl) extra += '<p class="tt-block">' + bl.icon + ' Un chemin est bloqué ici (' + bl.left + ' tour' + (bl.left > 1 ? 's' : '') + ')</p>';
    if (n.next && n.next.length > 1) extra += '<p class="muted">Embranchement : tu choisis ta direction.</p>';
    return '<b>' + esc(info[0]) + '</b><p>' + esc(info[1]) + '</p>' + extra;
  }
  let tipTimer = null;
  function tileTip(id, x, y, tap) {
    let tip = $('tileTip'); if (!tip) { tip = document.createElement('div'); tip.id = 'tileTip'; tip.className = 'tile-tip hidden'; document.body.appendChild(tip); }
    clearTimeout(tipTimer);
    if (id == null || !S || S.phase !== 'board') { tip.classList.add('hidden'); return; }
    const B = board(), n = B.nodes[id]; if (!n) return;
    tip.innerHTML = tileInfo(n, B);
    tip.classList.remove('hidden');
    const w = Math.min(300, window.innerWidth - 20);
    tip.style.left = Math.max(10, Math.min(window.innerWidth - w - 10, x + 14)) + 'px';
    tip.style.top = Math.max(10, Math.min(window.innerHeight - 160, y + 14)) + 'px';
    if (tap) tipTimer = setTimeout(() => tip.classList.add('hidden'), 4000);
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
    const art = c.char ? mini(c.char, 64) : (c.fx && ICO()[FXK[c.fx]] ? ico(FXK[c.fx], c.icon, 64) : '<span class="tc-ic">' + c.icon + '</span>');
    return '<div class="tcard ' + c.rarity + '" style="--rc:' + r.color + '"><div class="tc-r">' + r.name + '</div><div class="tc-art">' + art + '</div><b>' + esc(c.name) + '</b><small>' + esc(c.fx ? c.desc : c.fam ? FAMILIES[c.fam].icon + ' ' + FAMILIES[c.fam].name : 'Collection') + '</small></div>';
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
      if (r === 'legendaire') sfx.star(); else if (r === 'epique') sfx.item(); else if (r === 'maudite') sfx.bad(); else beep(600 + i * 120, 0.12, 'triangle');
    }, 900 + i * 1000));
    setTimeout(() => { const t = d.querySelector('.rtxt'); const fx = m.cards.map((id) => CARDS[id]).filter((c) => c.fx); if (t) t.textContent = fx.length ? fx.map((c) => c.icon + ' ' + c.name + (c.rarity === 'maudite' ? ' : ' + c.desc : ' → dans le sac 🎒')).join(' · ') : 'Que des cartes de famille !'; if (best) {} }, 3900);
    setTimeout(() => d.remove(), 4700);
  }
  function showAlbum() {
    const me = S && S.players.find((p) => p.id === ME);
    const mine = me ? me.cards : [];
    const owned = new Set(mine);
    const box = document.createElement('div'); box.className = 'help';
    const card = (id) => { const n = mine.filter((x) => x === id).length; return owned.has(id) ? '<div class="albc">' + cardHtml(id) + (n > 1 ? '<span class="dbl">×' + n + '</span>' : '') + '</div>' : '<div class="tcard missing"><div class="tc-in">?</div><small>' + esc(CARDS[id].name) + '</small></div>'; };
    const fams = Object.entries(FAMILIES).map(([f, F]) => { const n = F.cards.filter((id) => owned.has(id)).length, l = famLevel(mine, f); return '<div class="famblk' + (l ? ' on' + l : '') + '"><h2>' + F.icon + ' ' + esc(F.name) + ' <small>' + n + ' / 5</small></h2><p class="fb"><span' + (l >= 1 ? ' class="ok"' : '') + '>3 cartes : ' + esc(F.bonus[0]) + '</span><br><span' + (l >= 2 ? ' class="ok"' : '') + '>Les 5 : ' + esc(F.bonus[1]) + ' et +10 pièces</span></p><div class="tcards album">' + F.cards.map(card).join('') + '</div></div>'; }).join('');
    const specials = Object.keys(CARDS).filter((id) => !CARDS[id].fam).sort((a, b) => Object.keys(RARITY).indexOf(CARDS[a].rarity) - Object.keys(RARITY).indexOf(CARDS[b].rarity));
    box.innerHTML = '<div class="help-in"><button class="btn small ghost hx">Fermer ✕</button><h1>🃏 Mon album (' + owned.size + ' / ' + Object.keys(CARDS).length + ')</h1><p class="muted">Réunis les cartes d’une famille : avec 3 cartes tu gagnes un petit bonus permanent, avec les 5 il est doublé et tu gagnes 10 pièces. Sur une case 🔁 Troc, tu peux échanger une carte avec un autre joueur (il doit accepter). Les cartes spéciales vont dans ton sac 🎒 et se jouent à ton tour.</p>' + fams + '<div class="famblk"><h2>✨ Cartes spéciales</h2><div class="tcards album">' + specials.map(card).join('') + '</div></div></div>';
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

  function dieFace(v) {
    if (v >= 1 && v <= 6) {
      const P = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[v];
      return '<div class="d pips">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => '<i' + (P.includes(i) ? ' class="on"' : '') + '></i>').join('') + '<b class="dn">' + v + '</b></div>';
    }
    return '<div class="d">' + v + '</div>';
  }
  function showDice(m) {
    const p = S && S.players.find((x) => x.id === m.pid);
    const box = $('dice'); box.classList.remove('hidden');
    const maxF = Math.max(6, ...m.values);
    let i = 0;
    const iv = setInterval(() => {
      box.innerHTML = '<div class="drow rolling">' + m.values.map(() => dieFace(1 + Math.floor(Math.random() * maxF))).join('') + '</div>'; sfx.dice();
      if (++i > 10) {
        clearInterval(iv);
        const bonus = (m.bonus || []).map((b) => '<span class="db">' + b.icon + (b.cap ? ' max ' + b.cap : b.n < 0 ? ' ' + b.n : ' +' + b.n) + '</span>').join('');
        box.innerHTML = '<div class="drow landed">' + m.values.map(dieFace).join('') + '</div>' + (bonus ? '<div class="dbonus">' + bonus + '</div>' : '') + '<div class="who">' + esc(p ? p.name : '') + ' avance de ' + m.total + ' !</div>';
        beep(880, 0.15, 'triangle', 0.06);
        setTimeout(() => box.classList.add('hidden'), 1200 + m.values.length * 150);
      }
    }, 65);
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
    OV.classList.remove('hidden'); $('dice').classList.add('hidden');
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
    chrono(mg, changed) { blindTimer(mg, changed, mg.target || 7000, 'Objectif : ' + ((mg.target || 7000) / 1000).toFixed(2).replace('.', ',') + ' s'); },
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
      if (mg.phase === 'pick' || mg.phase === 'pick2') {
        if (changed) { MG.drawn = false; MG.door = null; MG.sel = []; MG.locked = false; }
        const out = !solo && !(mg.alive || []).includes(ME);
        if (out) { if (changed) OV.innerHTML = '<div class="mg"><h1 style="font-size:28px">🚪 Tu as été attrapé !</h1><p class="rules">Le Gardien a une chance de plus. Regarde si les autres s’en sortent…</p></div>'; return; }
        if (!changed && MG.drawn) { const st = $('pst'); if (st && !MG.door && !solo) st.textContent = (mg.picked || []).length + ' joueur(s) ont choisi'; return; }
        MG.drawn = true; MG.sel = MG.sel || [];
        OV.innerHTML = '<div class="mg"><h1 style="font-size:28px">🚪 ' + (mg.phase === 'pick2' ? '2e chance du Gardien ! ' : '') + (solo ? 'Tu es le Gardien : verrouille 2 portes' : 'Choisis une porte… sans te faire attraper') + '</h1><div class="doors">' + [0, 1, 2, 3, 4].map((i) => '<div class="door" data-i="' + i + '">🚪<small>' + (i + 1) + '</small></div>').join('') + '</div>' + (solo ? '<button class="btn big" id="lock" disabled>Verrouiller</button>' : '') + '<p class="muted" id="pst"></p></div>';
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
      } else if ((mg.phase === 'reveal' || mg.phase === 'reveal2') && changed) {
        OV.innerHTML = '<div class="mg"><h1 style="font-size:30px">🚪 Ouverture !</h1><div class="doors">' + [0, 1, 2, 3, 4].map((i) => '<div class="door ' + (mg.locks.includes(i) ? 'locked' : 'open') + '">' + (mg.locks.includes(i) ? '🔒' : '🚪') + '<div class="who">' + Object.keys(mg.picks).filter((pid) => mg.picks[pid] === i).map((pid) => mini(pl(pid).char, 30)).join('') + '</div></div>').join('') + '</div><p class="verdict">' + mg.caught.length + ' attrapé(s) !' + (mg.bonus ? ' Le Gardien a une 2e chance…' : '') + '</p></div>';
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
    rink(mg, changed) { if (mg.phase === 'rink') rinkGame(mg, changed); },
    tir(mg, changed) { if (mg.phase === 'pop') popGame(mg, changed); },
    taupes(mg, changed) { if (mg.phase === 'pop') popGame(mg, changed); },
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

  /* ---------- Stand de tir / Tape-taupes (3D) ---------- */
  function popGame(mg, changed) {
    if (!changed) return;
    const kind = mg.kind, DUR = mg.dur, t0 = performance.now(), mine = new Set();
    OV.innerHTML = '<div class="kart-wrap rink-wrap pop-wrap ' + kind + '"><div class="ktitle">' + (kind === 'tir' ? '🎯 Stand de tir' : '🔨 Tape-taupes') + '</div><div class="khud"><span id="ppS">0 pt</span><span id="ppP"></span><span id="ppT">0:30</span></div><canvas id="ppc"></canvas><p class="muted rkhelp">' + (kind === 'tir' ? 'Clique ou touche les cibles. Évite les bombes !' : 'Tape les taupes. Pas la Reine !') + '</p></div>';
    const cv = $('ppc');
    let R3 = null;
    if (USE3D && window.Scene3D && window.Scene3D.pop) { try { R3 = window.Scene3D.pop(cv, kind); } catch (e) { R3 = null; } }
    const g2 = R3 ? null : cv.getContext('2d');
    const live = () => (S.mg && S.mg.phase === 'pop' ? S.mg : mg);
    const colorOf = (pid) => { if (pid === 'me') pid = ME; const p = S.players.find((q) => q.id === pid); return p ? p.color : '#fff'; };
    const pos2d = (x, el, W, H) => { if (kind === 'tir') { const u = el - x.t0; return [W / 2 + (-x.dir * 8 + x.dir * x.sp * u / 1000) * W / 18, H * (0.25 + (2 - x.row) * 0.25), Math.min(W, H) * 0.06]; } return [W * (0.25 + (x.hole % 3) * 0.25), H * (0.25 + Math.floor(x.hole / 3) * 0.25), Math.min(W, H) * 0.07]; };
    cv.addEventListener('pointerdown', (e) => {
      const el = performance.now() - t0; if (el > DUR) return;
      let id = null;
      if (R3) id = R3.pick(e.clientX, e.clientY);
      else { const r = cv.getBoundingClientRect(), x0 = e.clientX - r.left, y0 = e.clientY - r.top; (live().targets || []).forEach((x) => { if (el < x.t0 || el > x.t0 + x.life || mine.has(x.id)) return; const [px, py, rad] = pos2d(x, el, r.width, r.height); if (Math.hypot(px - x0, py - y0) < rad * 1.3) id = x.id; }); }
      if (id == null) { sfx.tap(); return; }
      const x = (live().targets || []).find((q) => q.id === id);
      if (!x || mine.has(id)) return;
      mine.add(id); send({ t: 'mg', data: { hit: id } });
      if (x.k === 'bomb') sfx.bad(); else if (x.k === 'gold') sfx.star(); else sfx.coin();
    });
    let running = true;
    const loop = (now) => {
      if (!running || !document.body.contains(cv)) { stop(); return; }
      const el = now - t0, L = live();
      if (R3) R3.frame(now, { el, targets: L.targets, hits: {}, mine, colorOf });
      else {
        const W = cv.clientWidth, H = cv.clientHeight; if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        g2.fillStyle = kind === 'tir' ? '#4c1d95' : '#65a30d'; g2.fillRect(0, 0, W, H);
        (L.targets || []).forEach((x) => { if (el < x.t0 || el > x.t0 + x.life || mine.has(x.id)) return; const [px, py, rad] = pos2d(x, el, W, H); g2.fillStyle = x.k === 'gold' ? '#facc15' : x.k === 'bomb' ? '#111827' : '#ef4444'; g2.beginPath(); g2.arc(px, py, rad, 0, 7); g2.fill(); });
      }
      const sco = L.scores || {}, rank = S.players.slice().sort((a, b) => (sco[b.id] || 0) - (sco[a.id] || 0));
      const a1 = $('ppS'); if (a1) { a1.textContent = (sco[ME] || 0) + ' pt'; $('ppP').textContent = (rank.findIndex((p) => p.id === ME) + 1) + 'e / ' + rank.length; const tl = Math.max(0, Math.ceil((DUR - el) / 1000)); $('ppT').textContent = '0:' + String(tl).padStart(2, '0'); }
      requestAnimationFrame(loop);
    };
    let stopped = false;
    function stop() { if (stopped) return; stopped = true; running = false; if (R3) R3.dispose(); }
    MG.cleanup = stop;
    requestAnimationFrame(loop);
  }

  /* ---------- Patinoire Givrée (3D) ---------- */
  function rinkGame(mg, changed) {
    if (!changed) return;
    const R = mg.rink.R, IN = mg.rink.IN, DUR = mg.rink.dur;
    const s0 = mg.skaters[ME] || { x: 0, z: 6, a: 0 };
    const K = { x: s0.x, z: s0.z, a: s0.a, vx: 0, vz: 0, ix: 0, iz: 0, sent: 0, t0: performance.now() };
    const taken = new Set();
    OV.innerHTML = '<div class="kart-wrap rink-wrap"><div class="ktitle">⛸️ Patinoire Givrée</div><div class="khud"><span id="rkS">💎 0</span><span id="rkP"></span><span id="rkT">0:40</span></div><canvas id="rkc"></canvas><div class="stick hidden" id="stk"><i></i></div><p class="muted rkhelp">Fais glisser ton doigt (ou les flèches) pour patiner</p></div>';
    const cv = $('rkc');
    let R3 = null;
    if (USE3D && window.Scene3D && window.Scene3D.rink) { try { R3 = window.Scene3D.rink(cv, mg.rink); } catch (e) { R3 = null; } }
    const g2 = R3 ? null : cv.getContext('2d');
    // Commandes : joystick au doigt + clavier
    const keys = {};
    const kd = (e) => { const k = e.key; if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', 'q', 'z'].includes(k)) { keys[k] = true; e.preventDefault(); } };
    const ku = (e) => { keys[e.key] = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    const stk = $('stk'), knob = stk.querySelector('i'); let touch = null;
    const wrapEl = OV.querySelector('.rink-wrap');
    wrapEl.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; touch = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; stk.classList.remove('hidden'); stk.style.left = e.clientX + 'px'; stk.style.top = e.clientY + 'px'; knob.style.transform = ''; });
    wrapEl.addEventListener('pointermove', (e) => { if (!touch || e.pointerId !== touch.id) return; let dx = e.clientX - touch.x, dy = e.clientY - touch.y; const L = Math.hypot(dx, dy), M = 50; if (L > M) { dx *= M / L; dy *= M / L; } touch.dx = dx / M; touch.dy = dy / M; knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; });
    const up = (e) => { if (touch && e.pointerId === touch.id) { touch = null; stk.classList.add('hidden'); } };
    wrapEl.addEventListener('pointerup', up); wrapEl.addEventListener('pointercancel', up);
    let running = true, last = performance.now();
    const loop = (now) => {
      if (!running || !document.body.contains(cv)) { stopRink(); return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      let ix = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a || keys.q ? 1 : 0), iz = (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w || keys.z ? 1 : 0);
      if (touch) { ix = touch.dx; iz = touch.dy; }
      const L = Math.hypot(ix, iz); if (L > 1) { ix /= L; iz /= L; }
      const el = now - K.t0, playing = el < DUR;
      if (playing) { K.vx += ix * 13 * dt; K.vz += iz * 13 * dt; }
      const fr = Math.pow(0.55, dt); K.vx *= fr; K.vz *= fr; // glace : peu de frottement
      const sp = Math.hypot(K.vx, K.vz), MX = 6.5; if (sp > MX) { K.vx *= MX / sp; K.vz *= MX / sp; }
      K.x += K.vx * dt; K.z += K.vz * dt;
      let r = Math.hypot(K.x, K.z);
      if (r > R - 0.6) { const nx = K.x / r, nz = K.z / r, d = K.vx * nx + K.vz * nz; if (d > 0) { K.vx -= 1.6 * d * nx; K.vz -= 1.6 * d * nz; if (d > 2) sfx.tap(); } K.x = nx * (R - 0.6); K.z = nz * (R - 0.6); }
      r = Math.hypot(K.x, K.z);
      if (r < IN) { const nx = K.x / (r || 1), nz = K.z / (r || 1), d = K.vx * nx + K.vz * nz; if (d < 0) { K.vx -= 1.6 * d * nx; K.vz -= 1.6 * d * nz; } K.x = nx * IN; K.z = nz * IN; }
      Object.values(MG.others).forEach((o) => { const dx = K.x - o.x, dz = K.z - o.z, d = Math.hypot(dx, dz); if (d < 1.15 && d > 0.01) { const nx = dx / d, nz = dz / d; K.x += nx * (1.15 - d); K.z += nz * (1.15 - d); const vn = K.vx * nx + K.vz * nz; if (vn < 0) { K.vx -= 1.8 * vn * nx; K.vz -= 1.8 * vn * nz; } K.vx += nx * 1.5; K.vz += nz * 1.5; if (!K.bumpT || now - K.bumpT > 350) { K.bumpT = now; sfx.tap(); } } }); // chocs entre patineurs
      if (sp > 0.3) K.a = Math.atan2(K.vx, K.vz);
      const live = (S.mg && S.mg.phase === 'rink' ? S.mg : mg);
      const gems = live.gems || [];
      if (playing) gems.forEach((g) => { if (!taken.has(g.id) && Math.hypot(g.x - K.x, g.z - K.z) < 0.9) { taken.add(g.id); send({ t: 'mg', data: { gem: g.id } }); if (g.g === 3) sfx.star(); else sfx.coin(); } });
      if (now - K.sent > 100 && playing) { K.sent = now; send({ t: 'mg', data: { x: +K.x.toFixed(2), z: +K.z.toFixed(2), a: +K.a.toFixed(2), m: sp > 0.5 } }); }
      // Vue
      const sks = S.players.map((p) => { if (p.id === ME) return { id: p.id, char: p.char, color: p.color, x: K.x, z: K.z, a: K.a, m: sp > 0.5, me: true }; const t = (live.skaters || {})[p.id]; if (!t) return null; const o = MG.others[p.id] || (MG.others[p.id] = { x: t.x, z: t.z }); o.x += (t.x - o.x) * Math.min(1, dt * 9); o.z += (t.z - o.z) * Math.min(1, dt * 9); return { id: p.id, char: p.char, color: p.color, x: o.x, z: o.z, a: t.a, m: t.m }; }).filter(Boolean);
      if (R3) R3.frame(now, { gems, skaters: sks, hidden: taken });
      else {
        const W = cv.clientWidth, H = cv.clientHeight; if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        const sc = Math.min(W, H) / (2 * R + 2), cx = W / 2, cy = H / 2;
        g2.fillStyle = '#f8fafc'; g2.fillRect(0, 0, W, H);
        g2.fillStyle = '#bae6fd'; g2.beginPath(); g2.arc(cx, cy, R * sc, 0, 7); g2.fill(); g2.lineWidth = 6; g2.strokeStyle = '#ef4444'; g2.stroke();
        g2.fillStyle = '#fff'; g2.beginPath(); g2.arc(cx, cy, (IN - 0.2) * sc, 0, 7); g2.fill();
        gems.forEach((g) => { if (taken.has(g.id)) return; g2.fillStyle = g.g === 3 ? '#facc15' : '#0ea5e9'; g2.beginPath(); g2.arc(cx + g.x * sc, cy + g.z * sc, 0.32 * sc, 0, 7); g2.fill(); });
        sks.forEach((o) => { g2.fillStyle = o.color; g2.beginPath(); g2.arc(cx + o.x * sc, cy + o.z * sc, 0.6 * sc, 0, 7); g2.fill(); const im = IMG[o.char]; if (im && im.complete) g2.drawImage(im, cx + o.x * sc - 0.6 * sc, cy + o.z * sc - 1.3 * sc, 1.2 * sc, 1.2 * sc); });
      }
      const sco = live.scores || {}; const rank = S.players.slice().sort((a, b) => (sco[b.id] || 0) - (sco[a.id] || 0));
      const t = Math.max(0, Math.ceil((DUR - el) / 1000));
      const a1 = $('rkS'); if (a1) { a1.textContent = '💎 ' + (sco[ME] || 0); $('rkP').textContent = (rank.findIndex((p) => p.id === ME) + 1) + 'e / ' + rank.length; $('rkT').textContent = '0:' + String(t).padStart(2, '0'); }
      requestAnimationFrame(loop);
    };
    MG.others = {};
    requestAnimationFrame(loop);
    let stopped = false;
    function stopRink() { if (stopped) return; stopped = true; running = false; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); if (R3) R3.dispose(); }
    MG.cleanup = stopRink;
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
    // Décor autour du circuit (le même chez tout le monde)
    const R = seeded(1000 + (tr.variant || 0) * 97), deco = [];
    for (let i = 0; i < 400 && deco.length < 34; i++) {
      const dx = 30 + R() * 940, dy = 30 + R() * 640;
      if (tr.pts.some((p) => Math.hypot(p[0] - dx, p[1] - dy) < tr.w / 2 + 26)) continue;
      if (deco.some((d) => Math.hypot(d.x - dx, d.y - dy) < 50)) continue;
      deco.push({ x: dx, y: dy, e: (tr.deco || ['🌳'])[Math.floor(R() * (tr.deco || ['🌳']).length)], s: 24 + R() * 18 });
    }
    deco.sort((a, b) => a.y - b.y);
    OV.innerHTML = '<div class="kart-wrap"><div class="ktitle">🏁 ' + esc(tr.name || 'Circuit') + (tr.ice ? ' — ça glisse !' : '') + '</div><div class="khud"><span id="klap">Tour 1/' + tr.laps + '</span><span id="kpos"></span><span id="ktime">0:00</span></div><canvas id="kc"></canvas><div class="kctl"><button class="btn big kb" id="kl">◀</button><button class="btn big kb" id="kr">▶</button></div></div>';
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
        K.a += steer * (tr.ice ? 2.1 : 2.9) * dt * Math.min(1, K.v / 120);
        K.x += Math.cos(K.a) * K.v * dt; K.y += Math.sin(K.a) * K.v * dt;
        K.x = Math.max(20, Math.min(980, K.x)); K.y = Math.max(20, Math.min(680, K.y));
        Object.values(MG.others).forEach((o) => { const dx = K.x - o.x, dy = K.y - o.y, d = Math.hypot(dx, dy); if (d < 30 && d > 0.01) { K.x += dx / d * (30 - d); K.y += dy / d * (30 - d); K.v *= 0.55; if (!K.bumpT || now - K.bumpT > 400) { K.bumpT = now; sfx.tap(); } } }); // choc entre karts
        let dIdx = ni - K.idx; if (dIdx < -N / 2) dIdx += N; if (dIdx > N / 2) dIdx -= N;
        if (Math.abs(dIdx) < 15) { K.prog += dIdx; K.idx = ni; }
        if (K.prog >= N * tr.laps) { K.done = true; const ms = Math.round(now - K.t0); send({ t: 'mg', data: { prog: K.prog, fin: ms } }); sfx.star(); }
      }
      if (now - sendAt > 100 && !K.done) { sendAt = now; send({ t: 'mg', data: { x: Math.round(K.x), y: Math.round(K.y), a: +K.a.toFixed(2), prog: +K.prog.toFixed(1) } }); }
      const wrap = kc.parentElement.getBoundingClientRect();
      const cw = Math.max(240, Math.min(wrap.width, (window.innerHeight - 170) / 0.7));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (kc.width !== Math.round(cw * dpr)) { kc.width = Math.round(cw * dpr); kc.height = Math.round(cw * 0.7 * dpr); kc.style.width = cw + 'px'; kc.style.height = cw * 0.7 + 'px'; }
      const s = kc.width / 1000, Z = 2.1; // caméra qui suit le kart
      const camX = Math.max(500 / Z, Math.min(1000 - 500 / Z, K.x)), camY = Math.max(350 / Z, Math.min(700 - 350 / Z, K.y));
      kg.setTransform(s * Z, 0, 0, s * Z, s * (500 - camX * Z), s * (350 - camY * Z));
      const gg = kg.createRadialGradient(400, 250, 50, 500, 350, 700); gg.addColorStop(0, shadeC(tr.ground || '#4d7c0f', 0.15)); gg.addColorStop(1, shadeC(tr.ground || '#4d7c0f', -0.3));
      kg.fillStyle = gg; kg.fillRect(0, 0, 1000, 700);
      kg.lineJoin = 'round'; kg.lineCap = 'round';
      const path = () => { kg.beginPath(); tr.pts.forEach((p, i) => (i ? kg.lineTo(p[0], p[1]) : kg.moveTo(p[0], p[1]))); kg.closePath(); };
      path(); kg.strokeStyle = '#f8fafc'; kg.lineWidth = tr.w + 10; kg.stroke();
      kg.save(); kg.translate(0, 8); path(); kg.strokeStyle = 'rgba(0,0,0,.35)'; kg.lineWidth = tr.w + 14; kg.stroke(); kg.restore();
      path(); kg.setLineDash([22, 22]); kg.strokeStyle = '#ef4444'; kg.lineWidth = tr.w + 12; kg.stroke(); kg.setLineDash([]);
      path(); kg.strokeStyle = tr.road || '#475569'; kg.lineWidth = tr.w; kg.stroke();
      path(); kg.setLineDash([18, 18]); kg.strokeStyle = 'rgba(255,255,255,.5)'; kg.lineWidth = 3; kg.stroke(); kg.setLineDash([]);
      const p0 = tr.pts[0], p1 = tr.pts[1], ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + Math.PI / 2;
      for (let j = -4; j < 4; j++) { kg.fillStyle = (j + 4) % 2 ? '#000' : '#fff'; kg.fillRect(p0[0] + Math.cos(ang) * j * 10 - 5, p0[1] + Math.sin(ang) * j * 10 - 5, 10, 10); }
      kg.textAlign = 'center'; kg.textBaseline = 'middle';
      deco.forEach((d) => { kg.fillStyle = 'rgba(0,0,0,.25)'; kg.beginPath(); kg.ellipse(d.x, d.y + d.s * 0.35, d.s * 0.4, d.s * 0.12, 0, 0, Math.PI * 2); kg.fill(); kg.font = d.s + 'px serif'; kg.fillText(d.e, d.x, d.y + Math.sin(now / 700 + d.x) * 1.5); });
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
      // Mini-carte
      { const ms = s * 0.2, ox = kc.width - 1000 * ms - 10 * s, oy = 10 * s;
        kg.setTransform(1, 0, 0, 1, 0, 0); kg.fillStyle = 'rgba(15,10,40,.7)'; kg.beginPath(); if (kg.roundRect) kg.roundRect(ox - 6 * s, oy - 6 * s, 1000 * ms + 12 * s, 700 * ms + 12 * s, 10 * s); else kg.rect(ox - 6 * s, oy - 6 * s, 1000 * ms + 12 * s, 700 * ms + 12 * s); kg.fill();
        kg.setTransform(ms, 0, 0, ms, ox, oy); kg.lineJoin = 'round';
        kg.beginPath(); tr.pts.forEach((p, i) => (i ? kg.lineTo(p[0], p[1]) : kg.moveTo(p[0], p[1]))); kg.closePath(); kg.strokeStyle = '#e2e8f0'; kg.lineWidth = tr.w * 0.6; kg.stroke();
        S.players.forEach((p) => { const o = p.id === ME ? K : MG.others[p.id]; if (!o) return; kg.fillStyle = p.color; kg.beginPath(); kg.arc(o.x, o.y, p.id === ME ? 34 : 24, 0, 7); kg.fill(); if (p.id === ME) { kg.lineWidth = 10; kg.strokeStyle = '#fff'; kg.stroke(); } });
        kg.setTransform(s, 0, 0, s, 0, 0); }
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
    const sd = !!(MG && MG.statsDone);
    MG = { endShown: true, statsDone: sd };
    OV.classList.remove('hidden');
    const rk = END.ranking.map(pl).filter(Boolean);
    const me = pl(ME);
    const top = rk.slice(0, 3);
    const podOrder = [top[1], top[0], top[2]].filter(Boolean);
    const h = {}; if (top[0]) h[top[0].id] = 150; if (top[1]) h[top[1].id] = 105; if (top[2]) h[top[2].id] = 75;
    if (!MG.statsDone) { MG.statsDone = true; return renderStats(rk); }
    const tw = END.teams && END.teams[0];
    OV.innerHTML = '<div class="mg"><div class="ic">👑</div>' + (tw ? '<h1>' + (tw.team === 'A' ? '🔵 L’équipe bleue' : '🔴 L’équipe rouge') + ' gagne !</h1><p class="teamres">' + END.teams.map((t) => (t.team === 'A' ? '🔵 Bleus' : '🔴 Rouges') + ' : ' + starIcon() + ' ' + t.stars + ' · ' + coinIcon() + ' ' + t.coins).join(' &nbsp; — &nbsp; ') + '</p><h2 class="aw-t">' + esc(top[0].name) + ' est la Superstar de Monstralia</h2>' : '<h1>' + esc(top[0].name) + ' est la Superstar de Monstralia !</h1>') +
      (END.awards.length ? '<h2 class="aw-t">Étoiles bonus</h2><div class="awards">' + END.awards.map((a) => '<div class="award"><span class="ai">' + a.icon + '</span><div><b>' + esc(a.name) + '</b> <small>(' + esc(a.desc) + ' : ' + a.value + ')</small><br>' + a.winners.map((id) => mini(pl(id).char, 24) + ' ' + esc(pl(id).name)).join(', ') + ' <b>+1 ' + starIcon() + '</b></div></div>').join('') + '</div>' : '') +
      '<div class="podium">' + podOrder.map((p) => '<div class="pod">' + svg(p.char, p === top[0] ? 'happy' : '') + '<div><b>' + esc(p.name) + '</b></div><div class="blk" style="height:' + h[p.id] + 'px">' + (rk.indexOf(p) + 1) + '</div></div>').join('') + '</div>' +
      '<div class="results">' + rk.map((p, i) => '<div class="res" style="border-color:' + p.color + '"><span class="pl">' + (i + 1) + '</span>' + svg(p.char, i === 0 ? 'happy' : i === rk.length - 1 ? 'sad' : '') + '<span><b>' + esc(p.name) + '</b><br><span class="sh">' + p.stats.steps + ' cases · ' + p.stats.mgWins + ' mini-jeux gagnés</span></span><span>' + starIcon() + ' ' + p.stars + '</span><span class="gain">' + coinIcon() + ' ' + p.coins + '</span></div>').join('') + '</div>' +
      (me && me.host ? '<button class="btn big" id="again">Nouvelle partie</button>' : '<p class="muted">L’hôte peut relancer une partie.</p>') + '</div>';
    const a = $('again'); if (a) a.onclick = () => send({ t: 'again' });
    sfx.star();
  }
  function renderStats(rk) {
    const ROWS = [['steps', '👣', 'Cases parcourues'], ['earned', '💰', 'Pièces gagnées en mini-jeux'], ['mgWins', '🏆', 'Mini-jeux gagnés'], ['blue', '🔵', 'Cases bleues'], ['red', '🔴', 'Cases rouges'], ['events', '❓', 'Cases événement'], ['itemsUsed', '🎒', 'Objets utilisés'], ['shopSpent', '🛒', 'Dépensé en boutique'], ['companions', '🐣', 'Compagnons adoptés']];
    if (S.settings.gambling) ROWS.push(['wagered', '🎰', 'Misé au jeu'], ['gambleWon', '🍀', 'Gagné au jeu']);
    if (S.settings.boosters) ROWS.push(['boosters', '🃏', 'Boosters ouverts']);
    const bonus = {}; END.awards.forEach((a) => a.winners.forEach((id) => { bonus[id] = (bonus[id] || 0) + 1; }));
    const ps = S.players;
    OV.innerHTML = '<div class="mg stats"><div class="ic">📊</div><h1>Les statistiques de la partie</h1><div class="stwrap"><table class="sttab"><thead><tr><th></th>' + ps.map((p) => '<th>' + mini(p.char, 34) + '<br><small>' + esc(p.name) + '</small></th>').join('') + '</tr></thead><tbody>' +
      '<tr class="strow-main"><td>' + starIcon() + ' Étoiles avant les bonus</td>' + ps.map((p) => '<td>' + (p.stars - (bonus[p.id] || 0)) + '</td>').join('') + '</tr>' +
      ROWS.map(([k, ic, lbl]) => { const v = ps.map((p) => (p.stats[k] || 0)); const mx = Math.max(...v); return '<tr><td>' + ic + ' ' + lbl + '</td>' + v.map((x) => '<td' + (x === mx && mx > 0 ? ' class="best"' : '') + '>' + x + '</td>').join('') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="muted">Les étoiles bonus vont récompenser certaines de ces statistiques…</p><button class="btn big" id="toAwards">Voir les étoiles bonus ✨</button></div>';
    let done = false; const go = () => { if (done || !END || !MG || !MG.endShown) return; done = true; MG.endShown = false; MG.statsDone = true; renderEnd(); };
    $('toAwards').onclick = go; setTimeout(go, 14000);
  }

  function showBag() {
    const me = S && S.players.find((p) => p.id === ME); if (!me) return;
    const box = document.createElement('div'); box.className = 'help';
    const row = (ic, name, desc, cls) => '<div class="bagrow ' + (cls || '') + '"><span class="hi">' + ic + '</span><div><b>' + esc(name) + '</b><br><small>' + esc(desc) + '</small></div></div>';
    const dice = ['classique'].concat(me.die ? [me.die] : []).map((k) => row(ico(k, GAME.dice[k].icon, 34), GAME.dice[k].label, GAME.dice[k].desc + (k === me.die && me.dieUses ? ' (encore ' + me.dieUses + ')' : ''))).join('');
    const items = me.items.length ? me.items.map((k) => row(ico(k, GAME.items[k].icon, 34), GAME.items[k].name, GAME.items[k].desc)).join('') : '<p class="muted">Aucun objet. La boutique 🛒 et les cases 🎁 en donnent.</p>';
    const hand = (me.hand || []).length ? me.hand.map((id) => { const c = CARDS[id]; return row(ico(FXK[c.fx], c.icon, 34), c.name + ' (' + RARITY[c.rarity].name + ')', c.desc, 'r-' + c.rarity); }).join('') : '<p class="muted">Aucune carte à jouer. Les cartes rares, épiques et légendaires des boosters arrivent ici.</p>';
    const fams = Object.entries(FAMILIES).map(([f, F]) => { const n = F.cards.filter((id) => me.cards.includes(id)).length, l = famLevel(me.cards, f); return row(F.icon, F.name + ' : ' + n + '/5', l ? 'Actif : ' + F.bonus[l - 1] : '3 cartes pour : ' + F.bonus[0], l ? 'on' : ''); }).join('');
    const extra = [(me.comps || []).map((k) => row(GAME.companions[k].icon, GAME.companions[k].name + ' (compagnon)', GAME.companions[k].desc)).join(''), me.power ? row(GAME.powers[me.power].icon, GAME.powers[me.power].name + ' (pouvoir)', GAME.powers[me.power].desc) : '', me.shield ? row('🛡️', 'Bouclier actif', 'Annule ta prochaine perte.') : '', me.buff ? row(me.buff < 0 ? '🐌' : '👟', 'Prochain lancer ' + (me.buff > 0 ? '+' : '') + me.buff, 'S’ajoute à ton prochain dé.') : ''].join('');
    box.innerHTML = '<div class="help-in bag"><button class="btn small ghost hx">Fermer ✕</button><h1>🎒 Mon sac</h1><p class="muted">À ton tour, tu peux utiliser 1 objet et 1 carte avant de lancer ton dé. Tout est remis à zéro à la fin de la partie.</p>' +
      '<h2>🎲 Dés</h2><div class="bagg">' + dice + '</div><h2>🎒 Objets (' + me.items.length + '/3)</h2><div class="bagg">' + items + '</div>' +
      (S.settings.boosters ? '<h2>🃏 Cartes à jouer (' + (me.hand || []).length + '/5)</h2><div class="bagg">' + hand + '</div><h2>👪 Familles</h2><div class="bagg">' + fams + '</div>' : '') +
      (extra ? '<h2>✨ Autres</h2><div class="bagg">' + extra + '</div>' : '') + '</div>';
    document.body.appendChild(box);
    box.querySelector('.hx').onclick = () => box.remove();
    box.onclick = (e) => { if (e.target === box) box.remove(); };
  }
  $('btnBag').onclick = showBag;
  $('btnAlbum').onclick = showAlbum;
  $('btnCam').onclick = () => { cam.overview = !cam.overview; if (USE3D) Scene3D.setOverview(cam.overview); $('btnCam').textContent = cam.overview ? '🔍 Suivre' : '🗺️ Vue d’ensemble'; };
  initHome(); initLobby(); connect();
})();
