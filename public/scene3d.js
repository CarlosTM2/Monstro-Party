// Monstro Party — rendu 3D du plateau (Three.js). Si la 3D n'est pas disponible, le jeu garde l'affichage 2D.
import * as THREE from '/vendor/three.module.js';

const U = 20; // 20 pixels du plateau = 1 unité 3D
const TILE_H = 0.26; // hauteur du dessus des cases (plates, façon Mario Party)
const FLOOR_H = 3; // hauteur d'un étage (60 px)

const P = window.PARTY;
let renderer, scene, camera, canvas, onArrow = null;
let world = null; // tout ce qui dépend du plateau courant
const monsters = {}; // modèles 3D des joueurs
const clock = { last: 0 };
let overview = false;
const camState = { pos: new THREE.Vector3(0, 20, 20), look: new THREE.Vector3(), init: false };

/* ---------------- Outils ---------------- */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function noise2(seed) {
  const R = rng(seed), g = [];
  for (let i = 0; i < 256; i++) g.push(R());
  const h = (x, y) => g[((x * 73856093) ^ (y * 19349663)) & 255];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * sm(xf) + (c - a) * sm(yf) + (a - b - c + d) * sm(xf) * sm(yf);
  };
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const texCache = {};
function emojiTex(e, size = 128, bg) {
  const k = e + size + (bg || '');
  if (texCache[k]) return texCache[k];
  return (texCache[k] = canvasTex(size, size, (g, w, h) => {
    if (bg) { g.fillStyle = bg; g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); g.fill(); }
    g.font = Math.round(size * 0.72) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, w / 2, h / 2 + size * 0.04);
  }));
}
function textSprite(text, color = '#fff', size = 64) {
  const t = canvasTex(256, 96, (g, w, h) => {
    g.font = 'bold ' + size * 0.7 + 'px Fredoka, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(text, w / 2, h / 2); g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(2.6, 0.98, 1); s.renderOrder = 10;
  return s;
}
function emojiSprite(e, scale = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(e), transparent: true }));
  s.scale.set(scale, scale, 1);
  return s;
}
const glowTex = canvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,240,160,1)'); r.addColorStop(0.4, 'rgba(255,220,100,.45)'); r.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
const shadowTex = canvasTex(64, 64, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(0,0,0,.5)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0 }, o));
const toy = (color, o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 }, o));
function shade(hex, f) { const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + f))); return c; }
function mesh(geo, mat, cast = true, recv = false) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; }

/* ---------------- Monstros en 3D : vrais petits personnages ---------------- */
function lathe(pts, mat, seg = 40) { return mesh(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg), mat); }
function capsule(r, len, mat) { return mesh(new THREE.CapsuleGeometry(r, len, 8, 16), mat); }
function sphere(r, mat, w = 24, h = 18) { return mesh(new THREE.SphereGeometry(r, w, h), mat); }

/** Membre articulé : un pivot (épaule ou hanche) avec le segment qui pend dessous. */
function limb(len, r, mat, endMesh) {
  const pivot = new THREE.Group();
  const seg = capsule(r, len, mat); seg.position.y = -len / 2 - r * 0.5; pivot.add(seg);
  if (endMesh) { endMesh.position.y = -len - r; pivot.add(endMesh); }
  return pivot;
}

// Tenue de chaque Monstro (style « party game » : salopette, robe, marinière, costume…)
const OUTFIT = {
  gromp: { kind: 'overalls', top: '#fde047', bottom: '#8b5a2b' },
  zazou: { kind: 'overalls', top: '#f9a8d4', bottom: '#312e81' },
  pikrok: { kind: 'overalls', top: '#facc15', bottom: '#1e40af', helmet: true },
  fifi: { kind: 'dress', top: '#fb923c', bottom: '#f97316' },
  krakos: { kind: 'sailor', top: '#f8fafc', bottom: '#1e293b' },
  volt: { kind: 'suit', top: '#1d4ed8', bottom: '#1d4ed8', emblem: true },
  dinomite: { kind: 'vest', top: '#f59e0b', bottom: '#78350f' },
  moustache: { kind: 'coat', top: '#7f1d1d', bottom: '#1f2937' },
  patapouf: { kind: 'dress', top: '#a855f7', bottom: '#7e22ce' },
};

export function buildMonster(ch) {
  const g = new THREE.Group();
  const C = ch.c, C2 = ch.c2;
  const shine = ch.extra === 'shine';
  const body = toy(C, shine ? { transparent: true, opacity: 0.92, clearcoat: 1, roughness: 0.12 } : {});
  const bodyF = ch.body === 'rock' ? toy(C, { flatShading: true, roughness: 0.55 }) : body;
  const light = toy(C2);
  const O = OUTFIT[ch.id];
  const topM = O ? toy(O.top, { roughness: 0.6, clearcoat: 0.2 }) : body;
  const botM = O ? toy(O.bottom, { roughness: 0.6, clearcoat: 0.2 }) : body;
  const gold = toy('#facc15', { metalness: 0.85, roughness: 0.25 });
  const glove = toy('#fbfbfb', { roughness: 0.45 });
  const shoeCol = { volt: '#dc2626', moustache: '#111827', dinomite: '#7c2d12', zazou: '#be185d', gromp: '#7c2d12', patapouf: '#f472b6', pikrok: '#3f2a14', fifi: '#b91c1c', krakos: '#1e293b' }[ch.id] || shade(C, -0.35);
  const shoe = toy(shoeCol, { roughness: 0.3, clearcoat: 0.9 });
  const sole = toy('#f1f5f9', { roughness: 0.6 });
  const floating = ch.body === 'ghost' || ch.body === 'cloud';
  const rig = { arms: [], legs: [], floating, blink: [] };

  /* --- Jambes et grosses chaussures --- */
  const hipY = 0.36;
  if (ch.body === 'squid') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pv = new THREE.Group(); pv.position.set(Math.cos(a) * 0.16, hipY + 0.04, Math.sin(a) * 0.16);
      const t1 = capsule(0.085, 0.2, body); t1.position.y = -0.15; pv.add(t1);
      const t2 = capsule(0.065, 0.14, body); t2.position.set(Math.cos(a) * 0.08, -0.33, Math.sin(a) * 0.08); t2.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); pv.add(t2);
      g.add(pv); rig.legs.push(pv);
    }
  } else if (!floating) {
    [-1, 1].forEach((s) => {
      const foot = new THREE.Group();
      const sh = sphere(0.17, shoe); sh.scale.set(0.95, 0.66, 1.5); sh.position.z = 0.08; foot.add(sh);
      const so = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24), sole); so.scale.set(0.95, 1, 1.5); so.position.set(0, -0.09, 0.08); foot.add(so);
      const leg = limb(0.1, 0.08, O ? botM : toy(shade(C, -0.2)), foot);
      leg.position.set(s * 0.14, hipY, 0);
      g.add(leg); rig.legs.push(leg);
    });
  }

  /* --- Corps et tenue --- */
  const tY = 0.6;
  if (ch.body === 'ghost') { const t = lathe([[0, 0.05], [0.12, 0.0], [0.22, 0.12], [0.32, 0.35], [0.34, 0.55], [0.26, 0.7], [0, 0.74]], body); t.position.y = 0.08; g.add(t); }
  else if (ch.body === 'cloud') { [[0, 0.6, 0, 0.28], [-0.22, 0.52, 0.02, 0.2], [0.22, 0.52, 0.02, 0.2], [0, 0.4, 0.06, 0.22]].forEach(([x, y, z, r]) => { const sp = sphere(r, body); sp.position.set(x, y, z); g.add(sp); }); }
  else {
    const torso = ch.body === 'rock' && !O ? mesh(new THREE.IcosahedronGeometry(0.3, 0), bodyF) : capsule(0.25, 0.1, topM);
    torso.position.y = tY; torso.scale.set(1, 1, 0.85); g.add(torso);
    if (O && (O.kind === 'overalls' || O.kind === 'sailor' || O.kind === 'vest' || O.kind === 'suit' || O.kind === 'coat')) {
      const pants = sphere(0.275, botM); pants.position.y = tY - 0.14; pants.scale.set(1, 0.68, 0.9); g.add(pants);
    }
    if (O && O.kind === 'overalls') {
      const bib = mesh(new THREE.BoxGeometry(0.28, 0.2, 0.06), botM); bib.position.set(0, tY + 0.02, 0.2); g.add(bib);
      [-1, 1].forEach((s) => { const st = mesh(new THREE.BoxGeometry(0.06, 0.32, 0.04), botM); st.position.set(s * 0.12, tY + 0.13, 0.17); st.rotation.x = -0.35; g.add(st); const st2 = st.clone(); st2.position.z = -0.17; st2.rotation.x = 0.35; g.add(st2); const bt = sphere(0.035, gold, 12, 8); bt.position.set(s * 0.11, tY + 0.08, 0.235); g.add(bt); });
      if (O.helmet) { /* casque de mineur plus bas */ }
    }
    if (O && O.kind === 'dress') { const sk = mesh(new THREE.ConeGeometry(0.42, 0.42, 32, 1, true), toy(O.bottom, { side: THREE.DoubleSide, roughness: 0.55 })); sk.position.y = tY - 0.12; g.add(sk); const bow = sphere(0.06, toy('#fff'), 12, 8); bow.position.set(0, tY + 0.1, 0.23); g.add(bow); }
    if (O && O.kind === 'sailor') { for (let k = 0; k < 3; k++) { const st = mesh(new THREE.TorusGeometry(0.255, 0.022, 6, 30), toy('#2563eb')); st.rotation.x = Math.PI / 2; st.position.y = tY - 0.02 + k * 0.08; g.add(st); } const col = mesh(new THREE.BoxGeometry(0.34, 0.06, 0.2), toy('#2563eb')); col.position.set(0, tY + 0.17, -0.08); g.add(col); }
    if (O && O.kind === 'vest') { [-1, 1].forEach((s) => { const v = mesh(new THREE.BoxGeometry(0.12, 0.26, 0.05), topM); v.position.set(s * 0.13, tY + 0.02, 0.2); v.rotation.y = s * 0.3; g.add(v); }); }
    if (O && O.emblem) { const sh2 = new THREE.Shape(); sh2.moveTo(0.02, 0.1); sh2.lineTo(-0.05, 0.0); sh2.lineTo(0.0, 0.0); sh2.lineTo(-0.03, -0.09); sh2.lineTo(0.06, 0.03); sh2.lineTo(0.01, 0.03); sh2.closePath(); const em = mesh(new THREE.ExtrudeGeometry(sh2, { depth: 0.02, bevelEnabled: false }), toy('#facc15', { emissive: new THREE.Color('#facc15'), emissiveIntensity: 0.3 })); em.position.set(0, tY + 0.02, 0.21); em.scale.setScalar(1.3); g.add(em); const belt = mesh(new THREE.TorusGeometry(0.255, 0.03, 6, 30), toy('#facc15')); belt.rotation.x = Math.PI / 2; belt.position.y = tY - 0.08; g.add(belt); }
    if (O && O.kind === 'coat') { const coat = mesh(new THREE.CylinderGeometry(0.27, 0.36, 0.42, 28, 1, true), toy(O.top, { side: THREE.DoubleSide })); coat.position.y = tY - 0.08; g.add(coat); const belt = mesh(new THREE.TorusGeometry(0.27, 0.035, 8, 30), toy('#3f2a14')); belt.rotation.x = Math.PI / 2; belt.position.y = tY - 0.04; g.add(belt); const bk = mesh(new THREE.BoxGeometry(0.09, 0.07, 0.03), gold); bk.position.set(0, tY - 0.04, 0.27); g.add(bk); }
    if (!O) { const v = sphere(0.19, light); v.position.set(0, tY - 0.03, 0.15); v.scale.set(1, 1.05, 0.45); g.add(v); }
  }
  if (ch.body === 'dino') { const tail = lathe([[0, 0], [0.15, 0.05], [0.11, 0.33], [0, 0.55]], body, 20); tail.position.set(0, 0.42, -0.16); tail.rotation.x = -2.1; g.add(tail); }
  if (ch.extra === 'cape') { const cape = mesh(new THREE.CylinderGeometry(0.28, 0.48, 0.72, 24, 1, true, Math.PI * 0.55, Math.PI * 0.9), toy('#dc2626', { side: THREE.DoubleSide })); cape.position.set(0, 0.55, -0.05); g.add(cape); }

  /* --- Bras (manches + gros gants) --- */
  const shY = 0.76;
  [-1, 1].forEach((s) => {
    const hand = new THREE.Group();
    const hm = sphere(0.12, ch.body === 'squid' || ch.body === 'cloud' ? body : glove); hm.scale.set(1, 1, 0.9); hand.add(hm);
    if (ch.body !== 'squid' && ch.body !== 'cloud') { const cuff = mesh(new THREE.TorusGeometry(0.075, 0.03, 8, 16), glove); cuff.rotation.x = Math.PI / 2; cuff.position.y = 0.09; hand.add(cuff); const th = capsule(0.035, 0.05, glove); th.position.set(-s * 0.08, 0.02, 0.06); th.rotation.z = s * 0.6; hand.add(th); }
    const arm = limb(0.15, 0.065, O && O.kind !== 'dress' ? topM : body, hand);
    arm.position.set(s * (ch.body === 'cloud' ? 0.34 : 0.28), shY, 0.02);
    arm.rotation.z = s * 0.3;
    arm.userData.side = s;
    g.add(arm); rig.arms.push(arm);
  });

  /* --- Grosse tête expressive --- */
  const head = new THREE.Group();
  const hy = 1.26;
  head.position.y = hy;
  g.add(head);
  let face = 0.48;
  const HR = 0.54;
  switch (ch.body) {
    case 'flame': { const f = lathe([[0, -0.46], [0.42, -0.36], [0.52, -0.06], [0.42, 0.26], [0.24, 0.5], [0.07, 0.74], [0, 0.78]], body); head.add(f);
      const inner = lathe([[0, -0.4], [0.28, -0.32], [0.32, -0.06], [0.2, 0.2], [0, 0.36]], toy(C2, { emissive: new THREE.Color(C2), emissiveIntensity: 0.5 })); inner.position.z = 0.22; inner.scale.set(0.9, 0.9, 0.7); head.add(inner); face = 0.46; break; }
    case 'rock': { const h = mesh(new THREE.IcosahedronGeometry(HR, 1), bodyF); h.scale.set(1.05, 0.92, 0.95); head.add(h); break; }
    case 'cloud': [[0, 0, 0, 0.42], [-0.34, -0.06, 0, 0.3], [0.34, -0.06, 0, 0.3], [-0.18, 0.28, 0, 0.28], [0.2, 0.26, 0, 0.29], [0, -0.14, 0.14, 0.34]].forEach(([x, y, z, r]) => { const sp = sphere(r, body); sp.position.set(x, y, z); head.add(sp); }); face = 0.5; break;
    case 'squid': { const h = sphere(0.58, body, 40, 30); h.scale.set(1, 1.15, 0.95); h.position.y = 0.06; head.add(h); face = 0.52; break; }
    case 'dino': { const h = sphere(0.5, body, 40, 30); head.add(h); const sn = sphere(0.3, body); sn.position.set(0, -0.14, 0.36); sn.scale.set(1.05, 0.75, 0.9); head.add(sn); [-0.09, 0.09].forEach((x) => { const n = sphere(0.03, toy('#111')); n.position.set(x, -0.08, 0.63); head.add(n); }); for (let k = 0; k < 3; k++) { const sp = mesh(new THREE.ConeGeometry(0.07, 0.2, 10), light); sp.position.set(0, 0.42 - k * 0.12, -0.25 - k * 0.12); sp.rotation.x = -0.6 - k * 0.3; head.add(sp); } face = 0.46; break; }
    default: { const h = sphere(HR, bodyF, 40, 30); h.scale.set(ch.body === 'blob' ? 1.08 : 1.02, 0.96, 0.94); head.add(h); }
  }
  // Yeux (avec paupières qui clignent)
  const eyeY = ch.body === 'dino' ? 0.12 : ch.body === 'flame' ? -0.02 : 0.08;
  const eyesX = ch.eyes === 1 ? [0] : ch.eyes === 2 ? [-0.19, 0.19] : [-0.23, 0, 0.23];
  const er = ch.eyes === 1 ? 0.24 : ch.eyes === 3 ? 0.12 : 0.16;
  const glow = ch.extra === 'glow';
  const white = toy(glow ? '#fef08a' : '#ffffff', glow ? { emissive: new THREE.Color('#facc15'), emissiveIntensity: 0.9 } : { roughness: 0.1 });
  const pupilM = toy('#111111', { roughness: 0.05 });
  const irisM = toy({ gromp: '#16a34a', zazou: '#7c3aed', volt: '#2563eb', patapouf: '#db2777', krakos: '#0f766e', fifi: '#ea580c', moustache: '#4b5563' }[ch.id] || '#1e3a8a', { roughness: 0.08 });
  const lidM = toy(shade(C, -0.05));
  eyesX.forEach((x, i) => {
    const y = eyeY + (ch.eyes === 3 && i === 1 ? 0.13 : 0);
    const z = face - (Math.abs(x) > 0.16 ? 0.05 : 0) - (ch.eyes === 3 && i !== 1 ? 0.02 : 0);
    const eg = new THREE.Group(); eg.position.set(x, y, z); eg.rotation.y = x * 0.6; head.add(eg);
    const e = sphere(er, white); e.scale.set(0.92, 1.3, 0.62); eg.add(e);
    if (!glow) { const ir = sphere(er * 0.6, irisM, 16, 12); ir.position.set(0, -er * 0.12, er * 0.42); ir.scale.set(0.95, 1.25, 0.45); eg.add(ir); }
    const pu = sphere(er * 0.34, pupilM, 16, 12); pu.position.set(0, -er * 0.12, er * 0.55); pu.scale.set(0.95, 1.25, 0.45); eg.add(pu);
    const hi = sphere(er * 0.17, toy('#fff', { emissive: new THREE.Color('#fff'), emissiveIntensity: 1 }), 8, 8); hi.position.set(er * 0.2, er * 0.25, er * 0.62); eg.add(hi);
    if (ch.body !== 'cloud' && !glow) { const lid = mesh(new THREE.SphereGeometry(er * 1.06, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.38), lidM); lid.scale.set(0.92, 1.3, 0.66); lid.rotation.x = -0.25; eg.add(lid); }
    rig.blink.push(eg);
    if (ch.body !== 'cloud') { const br = capsule(0.024, er * 0.85, toy(shade(C, -0.45))); br.rotation.z = Math.PI / 2 + (x < 0 ? -0.22 : x > 0 ? 0.22 : 0) * (ch.id === 'zazou' || ch.id === 'dinomite' || ch.id === 'pikrok' ? -1.4 : 1); br.position.set(x, y + er * 1.55, z - 0.01); head.add(br); }
  });
  // Nez
  if (!['ghost', 'cloud', 'flame', 'squid', 'dino'].includes(ch.body)) { const n = sphere(0.075, toy(shade(C, 0.08)), 16, 12); n.position.set(0, eyeY - 0.13, face + 0.04); n.scale.set(1.15, 0.9, 0.9); head.add(n); }
  // Bouche
  const mY = eyeY - 0.25 - (ch.body === 'dino' ? 0.05 : 0);
  const mZ = face - 0.02 + (ch.body === 'dino' ? 0.16 : 0);
  const mouthM = toy('#7f1d1d', { roughness: 0.5 });
  if (ch.mouth === 'o') { const m = sphere(0.075, mouthM, 16, 12); m.position.set(0, mY, mZ); m.scale.set(1, 1.25, 0.5); head.add(m); }
  else {
    const m = sphere(0.13, mouthM, 24, 12); m.scale.set(1.15, 0.55, 0.35); m.position.set(0, mY, mZ); head.add(m);
    const lipCut = sphere(0.135, toy(ch.body === 'rock' ? C : C), 24, 12); lipCut.material = bodyF; lipCut.scale.set(1.2, 0.35, 0.36); lipCut.position.set(0, mY + 0.055, mZ + 0.005); head.add(lipCut);
    const tg = sphere(0.06, toy('#f87171'), 12, 8); tg.position.set(0, mY - 0.03, mZ + 0.02); tg.scale.set(1.2, 0.5, 0.5); head.add(tg);
    if (ch.mouth === 'fangs') [-0.06, 0.06].forEach((x) => { const f = mesh(new THREE.ConeGeometry(0.03, 0.08, 8), toy('#fff')); f.position.set(x, mY + 0.0, mZ + 0.04); f.rotation.x = Math.PI; head.add(f); });
    if (ch.mouth === 'grin') { const t = mesh(new THREE.BoxGeometry(0.2, 0.045, 0.03), toy('#fff')); t.position.set(0, mY + 0.015, mZ + 0.04); head.add(t); }
  }
  if (ch.extra === 'blush') [-1, 1].forEach((s) => { const m = sphere(0.08, toy('#fb7185', { transparent: true, opacity: 0.7 }), 12, 8); m.position.set(s * 0.32, mY + 0.06, face - 0.1); m.scale.set(1, 0.6, 0.3); head.add(m); });
  if (ch.extra === 'mustache') [-1, 1].forEach((s) => { const m = capsule(0.05, 0.18, toy('#3f2a14')); m.position.set(s * 0.11, mY + 0.1, mZ + 0.06); m.rotation.z = s * 1.25; head.add(m); });
  // Haut de la tête
  const top = ch.body === 'squid' ? 0.66 : 0.5;
  if (ch.top === 'horns') [-1, 1].forEach((s) => { const h = mesh(new THREE.ConeGeometry(0.11, 0.38, 16), light); h.position.set(s * 0.3, top - 0.04, -0.03); h.rotation.z = -s * 0.5; head.add(h); });
  if (ch.top === 'ears') [-1, 1].forEach((s) => { const h = mesh(new THREE.ConeGeometry(0.18, 0.38, 16), body); h.position.set(s * 0.34, top - 0.06, -0.05); h.rotation.z = -s * 0.45; head.add(h); const inn = mesh(new THREE.ConeGeometry(0.1, 0.25, 12), toy('#fda4af')); inn.position.set(s * 0.34, top - 0.08, 0.04); inn.rotation.z = -s * 0.45; head.add(inn); });
  if (ch.top === 'antenna') { const a = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.4, 8), toy(shade(C, -0.2))); a.position.set(0.04, top + 0.14, 0); a.rotation.z = -0.25; const ball = sphere(0.09, toy(C2, { emissive: new THREE.Color(C2), emissiveIntensity: 0.35 }), 16, 12); ball.position.set(0.1, top + 0.34, 0); head.add(a, ball); }
  if (ch.top === 'spikes') [-0.22, 0, 0.22].forEach((x, i) => { const sp = mesh(new THREE.ConeGeometry(0.1, 0.3, 12), light); sp.position.set(x, top - (i === 1 ? -0.02 : 0.07), -0.06); sp.rotation.z = -x * 1.4; head.add(sp); });
  if (ch.top === 'bolt') { const sh = new THREE.Shape(); sh.moveTo(0.05, 0.4); sh.lineTo(-0.12, 0.05); sh.lineTo(0.02, 0.05); sh.lineTo(-0.06, -0.25); sh.lineTo(0.14, 0.12); sh.lineTo(0.02, 0.12); sh.closePath(); const bm = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015 }), toy('#fde047', { emissive: new THREE.Color('#facc15'), emissiveIntensity: 0.35 })); bm.position.set(0, top + 0.18, -0.04); head.add(bm); }
  if (ch.top === 'hat') { const hm = toy('#1f2937'); const brim = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 32), hm); brim.position.y = top - 0.04; brim.scale.z = 0.72; const cr = mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.3, 32), hm); cr.position.y = top + 0.12; const sk = mesh(new THREE.CircleGeometry(0.08, 16), toy('#fff')); sk.position.set(0, top + 0.12, 0.38); const plume = capsule(0.04, 0.3, toy('#dc2626')); plume.position.set(0.28, top + 0.25, -0.05); plume.rotation.z = -0.6; head.add(brim, cr, sk, plume); }
  if (O && O.helmet) { const hm = toy('#facc15', { clearcoat: 1 }); const hel = mesh(new THREE.SphereGeometry(0.5, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), hm); hel.position.y = 0.12; head.add(hel); const lamp = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 16), new THREE.MeshStandardMaterial({ color: '#fef9c3', emissive: new THREE.Color('#fde047'), emissiveIntensity: 2 })); lamp.rotation.x = Math.PI / 2; lamp.position.set(0, 0.42, 0.33); head.add(lamp); }
  if (ch.extra === 'bandana') { const t = mesh(new THREE.TorusGeometry(0.53, 0.065, 10, 40), toy('#dc2626')); t.position.y = 0.24; t.rotation.x = Math.PI / 2 - 0.15; head.add(t); for (let i = 0; i < 5; i++) { const d = sphere(0.028, toy('#fff'), 8, 6); const a = -0.8 + i * 0.4; d.position.set(Math.sin(a) * 0.54, 0.26, Math.cos(a) * 0.52); head.add(d); } }
  if (ch.id === 'bulle' || ch.id === 'ombrette') { const sc = mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 24), toy(ch.id === 'bulle' ? '#facc15' : '#7c3aed')); sc.rotation.x = Math.PI / 2; sc.position.y = 0.8; g.add(sc); }

  g.userData.rig = rig; g.userData.head = head;
  return g;
}

/* ---------------- Compagnons, piège, bouclier (3D) ---------------- */
const PET = { piou: ['#fde047', '#f97316'], chauvy: ['#3f3f46', '#a1a1aa'], tortulle: ['#16a34a', '#a16207'], rouxi: ['#f97316', '#fff7ed'], bzz: ['#facc15', '#111827'], draki: ['#dc2626', '#fbbf24'], hibou: ['#92400e', '#fde68a'], poulpi: ['#f472b6', '#fbcfe8'] };
function petModel(k) {
  const [c1, c2] = PET[k] || ['#ffffff', '#cccccc'];
  const g = new THREE.Group(), m = toy(c1), m2 = toy(c2);
  const b = sphere(0.22, m); g.add(b);
  const bel = sphere(0.14, m2); bel.position.set(0, -0.04, 0.12); bel.scale.set(1, 1, 0.5); g.add(bel);
  [-0.08, 0.08].forEach((x) => { const e = sphere(0.05, toy('#fff')); e.position.set(x, 0.05, 0.18); const pu = sphere(0.028, toy('#111')); pu.position.set(x, 0.05, 0.22); g.add(e, pu); });
  if (k === 'bzz') [-0.1, 0.04].forEach((y) => { const st = mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 20), m2); st.rotation.x = Math.PI / 2; st.position.y = y; g.add(st); });
  if (k === 'tortulle') { const sh = sphere(0.22, m2); sh.scale.set(1, 0.7, 1); sh.position.set(0, 0.08, -0.08); g.add(sh); }
  if (k === 'rouxi' || k === 'hibou') [-1, 1].forEach((s2) => { const ear = mesh(new THREE.ConeGeometry(0.06, 0.14, 8), m); ear.position.set(s2 * 0.12, 0.22, 0); g.add(ear); });
  if (k === 'piou' || k === 'hibou' || k === 'draki') { const bk = mesh(new THREE.ConeGeometry(0.035, 0.09, 8), toy('#f59e0b')); bk.rotation.x = Math.PI / 2; bk.position.set(0, -0.01, 0.23); g.add(bk); }
  if (k === 'poulpi') for (let i = 0; i < 4; i++) { const t = capsule(0.03, 0.12, m); const a = i / 4 * Math.PI * 2; t.position.set(Math.cos(a) * 0.1, -0.22, Math.sin(a) * 0.1); g.add(t); }
  const wings = [];
  if (['piou', 'chauvy', 'bzz', 'draki', 'hibou'].includes(k)) [-1, 1].forEach((s2) => { const w = wing(0.32, 0.18, toy(k === 'bzz' ? '#e0f2fe' : c1, k === 'bzz' ? { transparent: true, opacity: 0.7 } : {})); const piv = new THREE.Group(); w.rotation.x = Math.PI / 2; w.scale.z = s2; piv.add(w); piv.rotation.y = s2 > 0 ? 0 : Math.PI; piv.position.set(s2 * 0.15, 0.05, -0.02); g.add(piv); wings.push(piv); });
  g.userData.wings = wings;
  return g;
}
function trapModel() {
  const g = new THREE.Group(), m = toy('#64748b', { metalness: 0.8, roughness: 0.3 });
  const base = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 24), m); g.add(base);
  [-1, 1].forEach((s2) => { const jaw = mesh(new THREE.TorusGeometry(0.35, 0.04, 6, 20, Math.PI), m); jaw.rotation.set(Math.PI / 2 - s2 * 0.6, 0, s2 > 0 ? 0 : Math.PI); jaw.position.y = 0.06; g.add(jaw); for (let i = 0; i < 5; i++) { const tth = mesh(new THREE.ConeGeometry(0.035, 0.12, 6), m); const a = (i + 0.5) / 5 * Math.PI; tth.position.set(Math.cos(a) * 0.33, 0.12, s2 * Math.sin(a) * 0.12); g.add(tth); } });
  return g;
}

/* ---------------- Créatures du décor (modèles 3D, pas d'icônes) ---------------- */
function wing(w, h, mat) { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(w * 0.5, h, w, h * 0.2); sh.quadraticCurveTo(w * 0.6, -h * 0.1, 0, -h * 0.2); const m = mesh(new THREE.ShapeGeometry(sh), mat); m.material.side = THREE.DoubleSide; return m; }
function flyerModel(kind) {
  const g = new THREE.Group(); const wings = [];
  if (kind === 'heli') {
    const b = capsule(0.45, 0.8, toy('#facc15')); b.rotation.z = Math.PI / 2; g.add(b);
    const win = sphere(0.36, toy('#7dd3fc', { transparent: true, opacity: 0.8 })); win.position.set(0.45, 0.08, 0); g.add(win);
    const tail = mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.4, 8), toy('#facc15')); tail.rotation.z = Math.PI / 2; tail.position.x = -1.2; g.add(tail);
    const rot = new THREE.Group(); [0, 1].forEach((i) => { const r = mesh(new THREE.BoxGeometry(2.6, 0.04, 0.16), toy('#334155')); r.rotation.y = i * Math.PI / 2; rot.add(r); }); rot.position.y = 0.55; g.add(rot);
    [-0.3, 0.3].forEach((z) => { const sk = mesh(new THREE.BoxGeometry(1.2, 0.05, 0.05), toy('#334155')); sk.position.set(0, -0.55, z); g.add(sk); });
    g.userData.rotor = rot; return g;
  }
  const col = { bird: '#dc2626', ptero: '#a16207', bat: '#292524', gull: '#f8fafc' }[kind];
  const mat = toy(col);
  const b = capsule(kind === 'ptero' ? 0.16 : 0.13, 0.35, mat); b.rotation.z = Math.PI / 2; g.add(b);
  const h = sphere(kind === 'ptero' ? 0.16 : 0.14, mat); h.position.x = 0.32; h.position.y = 0.05; g.add(h);
  const beak = mesh(new THREE.ConeGeometry(0.05, kind === 'ptero' ? 0.4 : 0.15, 8), toy(kind === 'bat' ? '#292524' : '#f59e0b')); beak.rotation.z = -Math.PI / 2; beak.position.set(kind === 'ptero' ? 0.6 : 0.47, 0.03, 0); g.add(beak);
  [-1, 1].forEach((s) => { const w = wing(kind === 'ptero' ? 1.3 : 0.8, 0.45, toy(kind === 'bird' ? '#16a34a' : col)); w.rotation.x = Math.PI / 2; w.scale.z = s; const piv = new THREE.Group(); piv.add(w); piv.rotation.y = s > 0 ? 0 : Math.PI; piv.position.z = 0; g.add(piv); wings.push(piv); });
  g.userData.wings = wings; return g;
}
function dino(R) {
  const g = new THREE.Group(), m = toy('#65a30d'), l = toy('#bef264');
  const b = sphere(0.7, m); b.scale.set(1.4, 0.85, 0.9); b.position.y = 1.0; g.add(b);
  const belly = sphere(0.5, l); belly.scale.set(1.3, 0.6, 0.8); belly.position.set(0, 0.85, 0.2); g.add(belly);
  const neck = mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.6, 12), m); neck.position.set(0.9, 1.75, 0); neck.rotation.z = -0.5; g.add(neck);
  const head = sphere(0.28, m); head.scale.set(1.4, 0.9, 0.9); head.position.set(1.35, 2.5, 0); g.add(head);
  [-0.1, 0.1].forEach((z) => { const e = sphere(0.06, toy('#111')); e.position.set(1.5, 2.6, z * 1.8); g.add(e); });
  const tail = mesh(new THREE.ConeGeometry(0.3, 1.8, 12), m); tail.rotation.z = 1.9; tail.position.set(-1.6, 0.8, 0); g.add(tail);
  [[0.55, 0.3], [0.55, -0.3], [-0.55, 0.3], [-0.55, -0.3]].forEach(([x, z]) => { const lg = mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.8, 10), m); lg.position.set(x, 0.4, z); g.add(lg); });
  g.userData.dinoHead = head; return g;
}
function parrotStand() { const g = new THREE.Group(); const post = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), std('#7c4a21')); post.position.y = 0.6; g.add(post); const bar = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), std('#7c4a21')); bar.rotation.z = Math.PI / 2; bar.position.y = 1.2; g.add(bar); const bird = flyerModel('bird'); bird.scale.setScalar(0.9); bird.position.y = 1.42; bird.rotation.z = 0.9; g.add(bird); g.userData.wingsOf = bird; return g; }
function ufo() { const g = new THREE.Group(); const d = sphere(0.9, toy('#94a3b8', { metalness: 0.8, roughness: 0.25 })); d.scale.set(1, 0.25, 1); g.add(d); const dome = sphere(0.45, toy('#a7f3d0', { transparent: true, opacity: 0.7, emissive: new THREE.Color('#34d399'), emissiveIntensity: 0.4 })); dome.position.y = 0.18; g.add(dome); for (let i = 0; i < 8; i++) { const l = sphere(0.07, new THREE.MeshStandardMaterial({ color: '#fde047', emissive: new THREE.Color('#fde047'), emissiveIntensity: 2 })); const a = i / 8 * Math.PI * 2; l.position.set(Math.cos(a) * 0.82, -0.02, Math.sin(a) * 0.82); g.add(l); } g.position.y = 3; g.userData.hover = true; return g; }
function anchor() { const g = new THREE.Group(), m = toy('#475569', { metalness: 0.7 }); const s = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 8), m); s.position.y = 0.6; g.add(s); const r = mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 20, Math.PI), m); r.rotation.z = Math.PI; r.position.y = 0.4; g.add(r); const top = mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 16), m); top.position.y = 1.28; g.add(top); g.rotation.z = 0.5; g.position.y = 0.1; return g; }
function shell() { const g = new THREE.Group(); const s = sphere(0.35, toy('#fbcfe8')); s.scale.set(1, 0.5, 1.2); s.position.y = 0.12; g.add(s); for (let i = -2; i <= 2; i++) { const r = mesh(new THREE.BoxGeometry(0.03, 0.06, 0.8), toy('#f9a8d4')); r.position.set(i * 0.12, 0.25, 0); r.rotation.z = i * 0.15; g.add(r); } return g; }

/* ---------------- Décors ---------------- */
function palm(R) {
  const g = new THREE.Group(), trunk = std('#8b5a2b', { roughness: 0.9 });
  let y = 0, x = 0; const lean = (R() - 0.5) * 0.5;
  for (let i = 0; i < 6; i++) { const s = mesh(new THREE.CylinderGeometry(0.13 - i * 0.012, 0.15 - i * 0.012, 0.42, 8), trunk); s.position.set(x, y + 0.21, 0); s.rotation.z = lean * 0.3; g.add(s); y += 0.4; x += lean * 0.12; }
  const leaf = std('#2f9e44', { side: THREE.DoubleSide, roughness: 0.6 });
  for (let i = 0; i < 7; i++) { const l = mesh(new THREE.ConeGeometry(0.22, 1.5, 4, 1), leaf); const a = (i / 7) * Math.PI * 2; l.position.set(x + Math.cos(a) * 0.55, y + 0.05, Math.sin(a) * 0.55); l.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); l.scale.set(1, 1, 0.25); g.add(l); }
  [0, 1, 2].forEach((i) => { const c = mesh(new THREE.SphereGeometry(0.1, 8, 8), std('#6b4423')); c.position.set(x + (i - 1) * 0.12, y - 0.1, 0.08); g.add(c); });
  g.userData.sway = true;
  return g;
}
function tree(R, col = '#3f9142') {
  const g = new THREE.Group();
  const t = mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.9, 8), std('#7c4a21')); t.position.y = 0.45; g.add(t);
  const leaf = std(col, { roughness: 0.8 });
  [[0, 1.25, 0, 0.62], [0.3, 1.05, 0.1, 0.45], [-0.3, 1.1, -0.1, 0.45], [0, 1.6, 0, 0.42]].forEach(([x, y, z, r]) => { const s = mesh(new THREE.IcosahedronGeometry(r, 1), leaf); s.position.set(x, y, z); g.add(s); });
  g.userData.sway = true;
  return g;
}
function pine(col = '#166534') { const g = new THREE.Group(); const t = mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 8), std('#5b3a1a')); t.position.y = 0.25; g.add(t); [0, 1, 2].forEach((i) => { const c = mesh(new THREE.ConeGeometry(0.75 - i * 0.18, 0.9, 10), std(col)); c.position.y = 0.75 + i * 0.5; g.add(c); }); g.userData.sway = true; return g; }
function bush(col = '#4d9a2a') { const g = new THREE.Group(), m = std(col); [[0, 0.3, 0, 0.42], [0.35, 0.22, 0.1, 0.3], [-0.32, 0.24, -0.05, 0.32]].forEach(([x, y, z, r]) => { const s = mesh(new THREE.IcosahedronGeometry(r, 1), m); s.position.set(x, y, z); g.add(s); }); return g; }
function rock(R, col = '#8b8178') { const r = mesh(new THREE.DodecahedronGeometry(0.5 + R() * 0.4, 0), std(col, { flatShading: true, roughness: 0.95 })); r.position.y = 0.25; r.rotation.set(R() * 3, R() * 3, R() * 3); r.scale.set(1, 0.7, 1); const g = new THREE.Group(); g.add(r); return g; }
function volcano() {
  const g = new THREE.Group();
  const c = mesh(new THREE.CylinderGeometry(0.6, 2.2, 2.4, 20, 4), std('#6b4a3a', { flatShading: true, roughness: 1 })); c.position.y = 1.2; g.add(c);
  const lava = mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshStandardMaterial({ color: '#ff6a00', emissive: new THREE.Color('#ff3d00'), emissiveIntensity: 1.6 })); lava.rotation.x = -Math.PI / 2; lava.position.y = 2.41; g.add(lava);
  for (let i = 0; i < 3; i++) { const f = mesh(new THREE.BoxGeometry(0.18, 1.2, 0.05), new THREE.MeshStandardMaterial({ color: '#ff5500', emissive: new THREE.Color('#ff3300'), emissiveIntensity: 1.2 })); const a = i * 2.1; f.position.set(Math.cos(a) * 1.15, 1.5, Math.sin(a) * 1.15); f.lookAt(0, 1.5, 0); f.rotateX(0.45); g.add(f); }
  g.userData.smoke = true;
  return g;
}
function egg() { const g = new THREE.Group(); const e = mesh(new THREE.SphereGeometry(0.3, 20, 16), toy('#f1f5f9')); e.scale.set(1, 1.3, 1); e.position.y = 0.38; g.add(e); for (let i = 0; i < 5; i++) { const d = mesh(new THREE.SphereGeometry(0.06, 8, 8), toy('#84cc16')); const a = i * 1.3; d.position.set(Math.cos(a) * 0.27, 0.3 + (i % 3) * 0.15, Math.sin(a) * 0.27); g.add(d); } return g; }
function crystal(R) { const g = new THREE.Group(); const cols = ['#22d3ee', '#a855f7', '#f472b6']; for (let i = 0; i < 3; i++) { const col = cols[Math.floor(R() * 3)]; const c = mesh(new THREE.OctahedronGeometry(0.3 + R() * 0.25, 0), new THREE.MeshPhysicalMaterial({ color: col, emissive: new THREE.Color(col), emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.88, flatShading: true })); c.scale.set(0.6, 1.6, 0.6); c.position.set((R() - 0.5) * 0.6, 0.45, (R() - 0.5) * 0.6); c.rotation.z = (R() - 0.5) * 0.6; g.add(c); } g.userData.glow = true; return g; }
function building(R, tall) {
  const g = new THREE.Group(), h = tall ? 3 + R() * 6 : 0.8 + R() * 1.4, w = 1.4 + R() * 1.2;
  const win = canvasTex(64, 128, (x, W, H) => { x.fillStyle = '#1e1b4b'; x.fillRect(0, 0, W, H); for (let yy = 6; yy < H; yy += 14) for (let xx = 6; xx < W; xx += 14) { x.fillStyle = Math.random() < 0.55 ? '#fde68a' : '#312e81'; x.fillRect(xx, yy, 8, 8); } });
  win.wrapS = win.wrapT = THREE.RepeatWrapping; win.repeat.set(w / 1.4, h / 2.5);
  const b = mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ map: win, emissiveMap: win, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.55, roughness: 0.6 }), true, true);
  b.position.y = h / 2; g.add(b);
  const roof = mesh(new THREE.BoxGeometry(w + 0.15, 0.15, w + 0.15), std('#4c1d95')); roof.position.y = h + 0.07; g.add(roof);
  return g;
}
function lamp() { const g = new THREE.Group(); const p = mesh(new THREE.CylinderGeometry(0.05, 0.07, 2, 8), std('#334155', { metalness: 0.6 })); p.position.y = 1; const l = mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: new THREE.Color('#fde047'), emissiveIntensity: 2 })); l.position.y = 2.05; g.add(p, l); g.userData.glow = true; return g; }
function lantern() { const g = new THREE.Group(); const p = mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), std('#5b3a1a')); p.position.y = 0.7; const l = mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshStandardMaterial({ color: '#fde68a', emissive: new THREE.Color('#f59e0b'), emissiveIntensity: 2.2 })); l.position.y = 1.45; g.add(p, l); g.userData.glow = true; g.userData.flicker = l; return g; }
function boat() { const g = new THREE.Group(); const hull = mesh(new THREE.BoxGeometry(1.8, 0.45, 0.7), std('#7c2d12')); hull.position.y = 0.2; const mast = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 6), std('#5b3a1a')); mast.position.y = 1.2; const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(1, 0); sh.lineTo(0, 1.4); sh.closePath(); const sail = mesh(new THREE.ShapeGeometry(sh), std('#f8fafc', { side: THREE.DoubleSide })); sail.position.set(0.05, 0.4, 0); g.add(hull, mast, sail); g.userData.bob = true; return g; }
function bone() { const g = new THREE.Group(); const m = toy('#f5f5f4'); const s = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), m); s.rotation.z = Math.PI / 2; s.position.y = 0.1; g.add(s); [-0.35, 0.35].forEach((x) => [-0.07, 0.07].forEach((z) => { const b = mesh(new THREE.SphereGeometry(0.09, 8, 8), m); b.position.set(x, 0.1, z); g.add(b); })); return g; }
function minecart() { const g = new THREE.Group(); const c = mesh(new THREE.BoxGeometry(1, 0.5, 0.7), std('#57534e', { metalness: 0.5, roughness: 0.5 })); c.position.y = 0.45; g.add(c); [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].forEach(([x, z]) => { const w = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 12), std('#1c1917')); w.rotation.x = Math.PI / 2; w.position.set(x, 0.15, z * 1.2); g.add(w); }); const o = mesh(new THREE.DodecahedronGeometry(0.3, 0), toy('#facc15', { metalness: 0.7, flatShading: true })); o.position.y = 0.75; g.add(o); return g; }

function decorModel(e, R, theme) {
  switch (e) {
    case '🌴': return palm(R);
    case '🌿': case '🍃': return bush(theme === 'jurassic' ? '#3f8f2a' : '#4d9a2a');
    case '🦴': return bone();
    case '🥚': return egg();
    case '🌋': return volcano();
    case '🪨': return rock(R);
    case '🏝️': return palm(R);
    case '⛵': return boat();
    case '🏙️': case '🏢': case '🌃': return building(R, R.tall);
    case '🚓': return lamp();
    case '💎': return crystal(R);
    case '⛏️': case '🪵': return minecart();
    case '🕯️': case '🔦': return lantern();
    case '💰': return minecart();
    case '🦕': return dino(R);
    case '🍎': return apple();
    case '🍊': return orange();
    case '🫐': return berries();
    case '🦜': return parrotStand();
    case '⚓': return anchor();
    case '🐚': return shell();
    case '🛸': return ufo();
    case '🚁': { const h = flyerModel('heli'); h.position.y = 2.5; h.userData.hover = true; return h; }
    case '🦇': { const b = flyerModel('bat'); b.position.y = 2.2; b.userData.hover = true; return b; }
    default: return null; // pas d'icône dans le décor
  }
}

/* ---------------- Grands monuments au fond du plateau ---------------- */
function addLandmark(B, root, dyn, R, W, H) {
  const back = -H / 2 - 16;
  if (B.id === 'jurassic') {
    const v = volcano(); v.scale.setScalar(7); v.position.set(-W * 0.15, -0.5, back - 8); root.add(v); dyn.push(v);
    for (let i = 0; i < 9; i++) { const m = mesh(new THREE.ConeGeometry(6 + R() * 6, 10 + R() * 12, 7), std(i % 2 ? '#4d7c0f' : '#3f6212', { flatShading: true })); m.position.set(-W * 0.7 + i * (W * 1.4 / 8), 4, back - 14 - R() * 10); root.add(m); }
    for (let i = 0; i < 2; i++) { const d = dino(R); d.scale.setScalar(2.8); d.position.set(W * (0.25 + i * 0.25), 0, back + 2 - i * 4); d.rotation.y = -0.6; root.add(d); dyn.push(d); }
  } else if (B.id === 'pirate') {
    const ship = new THREE.Group();
    const hull = mesh(new THREE.BoxGeometry(9, 2.2, 3.2), std('#6b3410')); hull.position.y = 1; ship.add(hull);
    const deck = mesh(new THREE.BoxGeometry(9.2, 0.3, 3.4), std('#a16207')); deck.position.y = 2.2; ship.add(deck);
    const prow = mesh(new THREE.ConeGeometry(1.6, 3, 4), std('#6b3410')); prow.rotation.z = -Math.PI / 2; prow.position.set(5.6, 1.2, 0); prow.scale.z = 1.4; ship.add(prow);
    [-2.5, 0.5, 3].forEach((x, k) => { const mast = mesh(new THREE.CylinderGeometry(0.15, 0.18, 7 - k, 8), std('#5b3a1a')); mast.position.set(x, 5.5 - k / 2, 0); ship.add(mast); const sail = mesh(new THREE.PlaneGeometry(3, 3.2 - k * 0.4), std('#f5f5f4', { side: THREE.DoubleSide })); sail.position.set(x + 0.1, 5.2 - k / 2, 0); sail.rotation.y = Math.PI / 2; ship.add(sail); });
    const flag = mesh(new THREE.PlaneGeometry(1.2, 0.8), std('#111', { side: THREE.DoubleSide })); flag.position.set(-2.5, 9.4, 0); flag.rotation.y = Math.PI / 2; ship.add(flag);
    ship.position.set(W * 0.2, -0.4, back - 6); ship.rotation.y = 0.3; ship.userData.bob = true; ship.userData.baseY = -0.4; root.add(ship); dyn.push(ship);
    const lh = new THREE.Group(); [0, 1, 2, 3].forEach((k) => { const c = mesh(new THREE.CylinderGeometry(1.4 - k * 0.2, 1.5 - k * 0.2, 2.5, 20), std(k % 2 ? '#dc2626' : '#f8fafc')); c.position.y = 1.25 + k * 2.5; lh.add(c); }); const lamp = sphere(0.9, new THREE.MeshStandardMaterial({ color: '#fef9c3', emissive: new THREE.Color('#fde047'), emissiveIntensity: 2 })); lamp.position.y = 10.8; lh.add(lamp); lh.position.set(-W * 0.45, 0, back + 2); root.add(lh);
  } else if (B.id === 'heroes') {
    for (let i = 0; i < 14; i++) { const b = building(R, true); b.scale.set(2.4, 2.2 + R() * 1.8, 2.4); b.position.set(-W * 0.75 + i * (W * 1.5 / 13), 0, back - 6 - R() * 8); root.add(b); }
    const tower = new THREE.Group(); const tw = mesh(new THREE.CylinderGeometry(1.2, 2.4, 26, 6), std('#4338ca', { metalness: 0.5, roughness: 0.3, emissive: new THREE.Color('#312e81'), emissiveIntensity: 0.4 })); tw.position.y = 13; tower.add(tw); const orb = sphere(1.6, new THREE.MeshStandardMaterial({ color: '#a5f3fc', emissive: new THREE.Color('#22d3ee'), emissiveIntensity: 1.6 })); orb.position.y = 27; tower.add(orb); tower.position.set(W * 0.1, 0, back - 14); root.add(tower);
  } else if (B.id === 'mine') {
    for (let i = 0; i < 6; i++) { const c = crystal(R); c.scale.setScalar(5 + R() * 4); c.position.set(-W * 0.55 + i * (W * 1.1 / 5), 0, back - 4 - R() * 8); root.add(c); }
    for (let i = 0; i < 10; i++) { const r = rock(R, i % 2 ? '#57534e' : '#44403c'); r.scale.setScalar(6 + R() * 5); r.position.set(-W * 0.8 + i * (W * 1.6 / 9), 0, back - 14 - R() * 6); root.add(r); }
  }
}

/* ---------------- Étoiles de chaque région ---------------- */
function starModel(id) {
  const g = new THREE.Group();
  let m;
  if (id === 'jurassic') { m = mesh(new THREE.SphereGeometry(0.5, 32, 24), new THREE.MeshPhysicalMaterial({ color: '#f5c542', metalness: 1, roughness: 0.18, emissive: new THREE.Color('#b45309'), emissiveIntensity: 0.35, clearcoat: 1 })); m.scale.set(0.85, 1.15, 0.85); }
  else if (id === 'pirate') { m = mesh(new THREE.SphereGeometry(0.48, 32, 24), new THREE.MeshPhysicalMaterial({ color: '#fdf4ff', roughness: 0.05, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, emissive: new THREE.Color('#a78bfa'), emissiveIntensity: 0.15 })); }
  else if (id === 'heroes') { m = new THREE.Group(); const d = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 40), new THREE.MeshPhysicalMaterial({ color: '#fbbf24', metalness: 1, roughness: 0.2, emissive: new THREE.Color('#b45309'), emissiveIntensity: 0.3 })); d.rotation.x = Math.PI / 2; const r = mesh(new THREE.BoxGeometry(0.4, 0.5, 0.05), toy('#dc2626')); r.position.y = 0.6; m.add(d, r); }
  else { m = mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshPhysicalMaterial({ color: '#67e8f9', emissive: new THREE.Color('#06b6d4'), emissiveIntensity: 0.7, roughness: 0.05, transparent: true, opacity: 0.9, flatShading: true, clearcoat: 1 })); m.scale.set(0.8, 1.35, 0.8); }
  m.castShadow = true;
  g.add(m);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(3.4, 3.4, 1); g.add(glow);
  g.userData.spin = m;
  return g;
}

/* ---------------- Cases ---------------- */
const TILE_COL = { blue: '#2f7cf6', red: '#e5383b', event: '#9b4dff', item: '#06b6d4', shop: '#ec4899', nest: '#65a30d', chance: '#f5c518', chaos: '#1e293b', special: '#f59e0b', tunnel: '#111827', start: '#f8fafc', casino: '#15803d', trade: '#0d9488' };
const TILE_ICON = { item: '🎁', shop: '🛒', nest: '🪺', chance: '🎲', chaos: '🌀', tunnel: '🕳️', casino: '🎰', trade: '🔁' };
const tileMats = {};
function tileMaterials(type, B) {
  const key = type + B.id;
  if (tileMats[key]) return tileMats[key];
  const col = TILE_COL[type];
  const top = canvasTex(256, 256, (g, w) => {
    const r = g.createRadialGradient(w * 0.4, w * 0.35, 10, w / 2, w / 2, w / 2);
    r.addColorStop(0, shade(col, 0.22).getStyle()); r.addColorStop(1, col);
    g.fillStyle = r; g.fillRect(0, 0, w, w);
    if (type === 'blue' || type === 'red') { g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 3; for (let i = 0; i < w; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, w); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } const hl = g.createRadialGradient(w * 0.35, w * 0.3, 4, w * 0.35, w * 0.3, w * 0.45); hl.addColorStop(0, 'rgba(255,255,255,.45)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hl; g.fillRect(0, 0, w, w); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let icon = TILE_ICON[type];
    if (type === 'special') icon = B.special.icon;
    if (icon) { g.font = '120px serif'; g.fillText(icon, w / 2, w / 2 + 6); }
    else if (type === 'event') { g.font = 'bold 150px Fredoka, Arial'; g.fillStyle = '#fff'; g.fillText('?', w / 2, w / 2 + 8); }
    else if (type === 'start') { g.font = 'bold 90px Fredoka, Arial'; g.fillStyle = '#3b0764'; g.fillText('GO', w / 2, w / 2 + 6); }
    else { g.font = 'bold 110px Fredoka, Arial'; g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText(type === 'blue' ? '+' : '−', w / 2, w / 2 + 6); }
  });
  top.center.set(0.5, 0.5); top.rotation = Math.PI / 2;
  const side = new THREE.MeshPhysicalMaterial({ color: shade(col === '#f8fafc' ? '#cbd5e1' : col, -0.18), roughness: 0.35, clearcoat: 0.6 });
  return (tileMats[key] = [side, new THREE.MeshPhysicalMaterial({ map: top, roughness: 0.3, clearcoat: 0.8 }), side]);
}

/* ---------------- Construction du plateau ---------------- */
const THEME_ENV = {
  jurassic: { sky: ['#7dd3fc', '#e0f2fe'], fog: '#cfe8d0', ground: ['#4f8f2f', '#6aa83b', '#8a6d3b'], hemi: ['#fff7e6', '#3b5323', 1.1], sun: ['#fff1c9', 2.6], hills: 5 },
  pirate: { sky: ['#38bdf8', '#e0f2fe'], fog: '#bfe6ff', ground: ['#d9c08a', '#f1dca5', '#5d9c2f'], hemi: ['#ffffff', '#2b6c8f', 1.15], sun: ['#fffbe8', 2.8], water: true, hills: 0 },
  heroes: { sky: ['#1e1b4b', '#7c3aed'], fog: '#2e1065', ground: ['#2a2a3a', '#33334a', '#1f1f2e'], hemi: ['#c4b5fd', '#1e1b4b', 0.9], sun: ['#e9d5ff', 1.5], hills: 0, city: true },
  mine: { sky: ['#0c0a09', '#292524'], fog: '#1c1917', ground: ['#44403c', '#57534e', '#292524'], hemi: ['#fde68a', '#1c1917', 0.55], sun: ['#fde68a', 1.0], hills: 7, cave: true },
};

function clearWorld() {
  if (!world) return;
  scene.remove(world.root);
  world.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  world = null;
}

/* ---------------- Éléments façon Mario Party ---------------- */
function apple() { const g = new THREE.Group(); const a = sphere(0.6, toy('#e11d48', { roughness: 0.25 })); a.scale.set(1, 0.92, 1); a.position.y = 0.55; g.add(a); const st = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.35, 6), std('#5b3a1a')); st.position.y = 1.15; st.rotation.z = 0.25; g.add(st); const lf = sphere(0.18, std('#22c55e')); lf.scale.set(1.6, 0.25, 0.8); lf.position.set(0.22, 1.18, 0); lf.rotation.z = -0.4; g.add(lf); return g; }
function orange() { const g = new THREE.Group(); const o = sphere(0.65, toy('#fb923c', { roughness: 0.55 })); o.position.y = 0.6; g.add(o); const lf = sphere(0.2, std('#16a34a')); lf.scale.set(1.5, 0.25, 0.9); lf.position.set(0.15, 1.22, 0.05); g.add(lf); return g; }
function berries() { const g = new THREE.Group(), m = toy('#7c3aed', { roughness: 0.2 }); [[0, 0.35, 0], [0.45, 0.3, 0.1], [-0.4, 0.3, 0.15], [0.1, 0.32, 0.45], [0.05, 0.75, 0.15], [-0.2, 0.3, -0.4], [0.3, 0.68, -0.15]].forEach(([x, y, z]) => { const b = sphere(0.32, m, 16, 12); b.position.set(x, y, z); g.add(b); }); return g; }
function cloud(R) { const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.35 }); const n = 4 + Math.floor(R() * 3); for (let i = 0; i < n; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(1.4 + R() * 1.2, 16, 12), m); s.position.set((i - n / 2) * 1.7, R() * 0.8, (R() - 0.5) * 1.5); s.scale.y = 0.75; g.add(s); } return g; }
const STONE = {
  jurassic: ['#b9c6cf', '#8fa1ad', '#6aa83b'], pirate: ['#d8d2c4', '#b5ab95', '#5fae3a'],
  heroes: ['#9ca3af', '#6b7280', null], mine: ['#57534e', '#3f3a36', null],
};
function stoneTex(c1, c2) {
  const t = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = shade(c2, -0.15).getStyle(); g.fillRect(0, 0, w, h);
    const R = rng(7); let y = 0;
    while (y < h) { const rh = 20 + R() * 16; let x = -R() * 30; while (x < w) { const rw = 34 + R() * 50; const c = shade(c1, (R() - 0.5) * 0.12); g.fillStyle = c.getStyle(); g.beginPath(); if (g.roundRect) g.roundRect(x + 2, y + 2, rw - 4, rh - 4, 7); else g.rect(x + 2, y + 2, rw - 4, rh - 4); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 6, y + 4, rw - 14, 3); x += rw; } y += rh; }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const arrowTex = canvasTex(128, 128, (g, w) => { g.fillStyle = '#fb923c'; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(64, 8); g.lineTo(118, 64); g.lineTo(84, 64); g.lineTo(84, 120); g.lineTo(44, 120); g.lineTo(44, 64); g.lineTo(10, 64); g.closePath(); g.fill(); });
function instanced(geo, mat, list, colorOf) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length); const o = new THREE.Object3D();
  list.forEach((d, i) => { o.position.set(d.x, d.y, d.z); o.rotation.set(d.rx || 0, d.ry || 0, d.rz || 0); o.scale.setScalar(d.s || 1); if (d.sv) o.scale.set(d.sv[0], d.sv[1], d.sv[2]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); if (colorOf) im.setColorAt(i, new THREE.Color(colorOf(d, i))); });
  im.receiveShadow = true; return im;
}

function mushroom(col = '#ef4444') { const g = new THREE.Group(); const st = mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.4, 10), toy('#fef3c7')); st.position.y = 0.2; g.add(st); const cap = mesh(new THREE.SphereGeometry(0.34, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), toy(col)); cap.scale.y = 0.75; cap.position.y = 0.36; g.add(cap); [[0.15, 0.55, 0.12], [-0.17, 0.52, 0.05], [0.02, 0.6, -0.18], [0.05, 0.5, 0.24]].forEach(([x, y, z]) => { const d = mesh(new THREE.SphereGeometry(0.06, 8, 6), toy('#fff')); d.position.set(x, y - 0.05, z); d.scale.y = 0.4; g.add(d); }); return g; }
function crate() { const g = new THREE.Group(); const b = mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), std('#b07a45')); b.position.y = 0.35; g.add(b); [-1, 1].forEach((k) => { const s = mesh(new THREE.BoxGeometry(0.74, 0.1, 0.74), std('#7c4a21')); s.position.y = 0.35 + k * 0.28; g.add(s); }); return g; }
function barrel() { const g = new THREE.Group(); const b = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 14), std('#9a6332')); b.position.y = 0.4; g.add(b); [0.15, 0.65].forEach((y) => { const r = mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.07, 14), std('#44403c', { metalness: 0.6 })); r.position.y = y; g.add(r); }); return g; }
function stalag(R) { const g = new THREE.Group(), m = std('#78716c', { flatShading: true, roughness: 1 }); for (let i = 0; i < 3; i++) { const h = 0.8 + R() * 1.6; const c = mesh(new THREE.ConeGeometry(0.25 + R() * 0.2, h, 7), m); c.position.set((R() - 0.5) * 0.7, h / 2, (R() - 0.5) * 0.7); g.add(c); } return g; }
function glowShroom(R) { const g = new THREE.Group(); const col = ['#22d3ee', '#a3e635', '#e879f9'][Math.floor(R() * 3)]; for (let i = 0; i < 3; i++) { const st = mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.4 + i * 0.12, 8), std('#e7e5e4')); st.position.set(i * 0.22 - 0.2, 0.2 + i * 0.06, (i % 2) * 0.15); g.add(st); const cap = mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: col, emissive: new THREE.Color(col), emissiveIntensity: 1.2 })); cap.position.set(st.position.x, 0.4 + i * 0.12, st.position.z); g.add(cap); } return g; }
function bench() { const g = new THREE.Group(), w = std('#b45309'), m = std('#334155', { metalness: 0.6 }); const s = mesh(new THREE.BoxGeometry(1.2, 0.08, 0.4), w); s.position.y = 0.45; g.add(s); const b = mesh(new THREE.BoxGeometry(1.2, 0.35, 0.06), w); b.position.set(0, 0.7, -0.18); g.add(b); [-0.5, 0.5].forEach((x) => { const l = mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), m); l.position.set(x, 0.22, 0); g.add(l); }); return g; }
function hydrant() { const g = new THREE.Group(), m = toy('#dc2626'); const b = mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.6, 12), m); b.position.y = 0.3; g.add(b); const t = mesh(new THREE.SphereGeometry(0.16, 12, 8), m); t.position.y = 0.62; g.add(t); return g; }
function planter(R) { const g = new THREE.Group(); const p = mesh(new THREE.BoxGeometry(1.3, 0.4, 1.3), std('#9ca3af')); p.position.y = 0.2; g.add(p); const t = tree(R, '#22c55e'); t.position.y = 0.35; g.add(t); return g; }
function car(R) { const g = new THREE.Group(); const col = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#f97316'][Math.floor(R() * 5)]; const b = mesh(new THREE.BoxGeometry(1.6, 0.45, 0.8), toy(col)); b.position.y = 0.4; g.add(b); const c = mesh(new THREE.BoxGeometry(0.9, 0.35, 0.72), toy('#bae6fd', { roughness: 0.1 })); c.position.set(-0.1, 0.78, 0); g.add(c); [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]].forEach(([x, z]) => { const w = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12), std('#111827')); w.rotation.x = Math.PI / 2; w.position.set(x, 0.18, z); g.add(w); }); return g; }
// Transforme un modèle statique en « kit » (morceaux réutilisables pour l'instanciation)
function kitFrom(g) { g.updateMatrixWorld(true); const parts = []; g.traverse((o) => { if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() }); }); return { parts, list: [] }; }
function flushKits(kits, root) {
  const P = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  Object.values(kits).forEach((k) => {
    if (!k.list.length) return;
    k.parts.forEach((pt) => {
      const im = new THREE.InstancedMesh(pt.geo, pt.mat, k.list.length);
      k.list.forEach((d, i) => { q.setFromAxisAngle(up, d.ry); P.compose(new THREE.Vector3(d.x, d.y, d.z), q, new THREE.Vector3(d.s, d.s * (d.sy || 1), d.s)); im.setMatrixAt(i, P.clone().multiply(pt.m)); });
      im.castShadow = true; im.receiveShadow = true; root.add(im);
    });
  });
}

function buildWorld(B) {
  clearWorld();
  const env = THEME_ENV[B.id];
  const root = new THREE.Group();
  scene.add(root);
  const W = B.W / U, H = B.H / U, cx = W / 2, cz = H / 2;
  const R = rng(B.nodes.length * 31 + B.W);
  const N = noise2(B.W + B.nodes.length);
  const toV = (x, y, z = 0) => new THREE.Vector3(x / U - cx, z / U, y / U - cz);

  // Ciel et brouillard
  scene.background = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, env.sky[0]); gr.addColorStop(1, env.sky[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  scene.fog = new THREE.Fog(env.fog, 70, 230);

  // Lumières
  const hemi = new THREE.HemisphereLight(env.hemi[0], env.hemi[1], env.hemi[2]); root.add(hemi);
  const sun = new THREE.DirectionalLight(env.sun[0], env.sun[1]);
  sun.position.set(-W * 0.35, 40, H * 0.55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(API.small ? 1024 : 2048, API.small ? 1024 : 2048);
  const ext = 30;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  sun.target.position.set(0, 0, 0); root.add(sun, sun.target);

  // Terrain : plat au centre, collines tout autour
  const TW = W + 140, TH = H + 140, segX = 160, segZ = Math.round(140 * TH / TW);
  const tg = new THREE.PlaneGeometry(TW, TH, segX, segZ); tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position, cols = [];
  const cA = new THREE.Color(env.ground[0]), cB = new THREE.Color(env.ground[1]), cC = new THREE.Color(env.ground[2]);
  const nodePts = B.nodes.map((n) => [n.x / U - cx, n.y / U - cz]);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const ex = Math.max(0, Math.abs(x) - W / 2 + 1), ez = Math.max(0, Math.abs(z) - H / 2 + 1);
    const edge = Math.hypot(ex, ez);
    let h = (N(x * 0.25, z * 0.25) - 0.5) * 0.35;
    if (env.water) { const d = Math.hypot(x / (W * 0.53), z / (H * 0.53)); h = d < 0.92 ? 0.04 + (N(x * 0.3, z * 0.3) - 0.5) * 0.1 : 0.04 - Math.pow((d - 0.92) * 9, 1.3); }
    else if (env.hills) h += Math.pow(edge / 8, 1.6) * env.hills * (0.6 + N(x * 0.15, z * 0.15) * 0.8);
    // aplatir sous les chemins
    let near = 99; for (let k = 0; k < nodePts.length; k += 1) { const d = Math.hypot(nodePts[k][0] - x, nodePts[k][1] - z); if (d < near) near = d; }
    if (near < 2.2 && !env.water) h = Math.min(h, 0.02);
    pos.setY(i, h);
    const n2 = N(x * 0.6 + 50, z * 0.6);
    let c;
    if (env.water) { const d = Math.hypot(x / (W * 0.53), z / (H * 0.53)); c = d > 0.8 ? cB.clone().lerp(cA, Math.min(1, (d - 0.8) * 4)) : cC.clone().lerp(cB, Math.min(1, Math.max(0, (d - 0.5) * 3.3))); }
    else c = cA.clone().lerp(cB, n2).lerp(cC, Math.min(1, Math.max(0, h / 4)));
    cols.push(c.r, c.g, c.b);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  tg.computeVertexNormals();
  const terrain = mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false }), false, true);
  root.add(terrain);

  // Eau
  let water = null;
  if (env.water) {
    const wg = new THREE.PlaneGeometry(TW + 80, TH + 80, 80, 60); wg.rotateX(-Math.PI / 2);
    water = mesh(wg, new THREE.MeshPhysicalMaterial({ color: '#1e90c8', roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.86, clearcoat: 1 }), false, true);
    water.position.y = -0.35; root.add(water);
    water.userData.base = Float32Array.from(wg.attributes.position.array);
  }
  // Ville : sol en damier de rues
  if (env.city) {
    const streets = canvasTex(256, 256, (g, w) => { g.fillStyle = '#2b2b3d'; g.fillRect(0, 0, w, w); g.fillStyle = '#3a3a52'; g.fillRect(0, 0, w, 40); g.fillRect(0, 0, 40, w); g.fillStyle = '#facc15'; for (let i = 50; i < w; i += 40) { g.fillRect(i, 18, 20, 4); g.fillRect(18, i, 4, 20); } });
    streets.wrapS = streets.wrapT = THREE.RepeatWrapping; streets.repeat.set(TW / 8, TH / 8);
    const sg = new THREE.PlaneGeometry(TW, TH); sg.rotateX(-Math.PI / 2);
    const street = mesh(sg, new THREE.MeshStandardMaterial({ map: streets, roughness: 0.9 }), false, true); street.position.y = 0.01; root.add(street);
  }

  // Chemins (selon la région)
  const tileY = (n) => (n.z || 0) / U;
  const planks = [], sleepers = [], rails = [];
  const pathMat = new THREE.MeshStandardMaterial({ color: B.id === 'jurassic' ? '#d9b77e' : B.id === 'heroes' ? '#9aa3b5' : B.path, roughness: 0.95 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: B.id === 'jurassic' ? '#b08850' : shade(B.path, -0.25), roughness: 0.95 });
  B.nodes.forEach((n) => n.next.forEach((id) => {
    const m = B.nodes[id];
    const a = toV(n.x, n.y, n.z || 0), b = toV(m.x, m.y, m.z || 0);
    const L = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a).normalize();
    const yaw = Math.atan2(dir.x, dir.z), pitch = -Math.asin(Math.max(-1, Math.min(1, dir.y)));
    if (B.id === 'pirate') { // ponton en planches
      const k = Math.max(2, Math.round(L / 0.36));
      for (let i = 0; i <= k; i++) { const p = a.clone().lerp(b, i / k); planks.push({ x: p.x, y: p.y + 0.1, z: p.z, ry: yaw, rx: pitch, sv: [1, 1, 1], r: i }); }
      [-0.62, 0.62].forEach((off) => { const bm = mesh(new THREE.BoxGeometry(0.1, 0.12, L), std('#8a6a45'), false, true); bm.position.copy(mid); bm.position.x += Math.cos(yaw) * off; bm.position.z -= Math.sin(yaw) * off; bm.position.y += 0.06; bm.lookAt(b.x + Math.cos(yaw) * off, b.y + 0.06, b.z - Math.sin(yaw) * off); root.add(bm); });
    } else if (B.id === 'mine') { // rails de mine
      const k = Math.max(2, Math.round(L / 0.5));
      for (let i = 0; i <= k; i++) { const p = a.clone().lerp(b, i / k); sleepers.push({ x: p.x, y: p.y + 0.05, z: p.z, ry: yaw, rx: pitch }); }
      [-0.38, 0.38].forEach((off) => { const r = mesh(new THREE.BoxGeometry(0.07, 0.08, L), std('#a8a29e', { metalness: 0.8, roughness: 0.3 }), false, true); r.position.copy(mid); r.position.x += Math.cos(yaw) * off; r.position.z -= Math.sin(yaw) * off; r.position.y += 0.14; r.lookAt(b.x + Math.cos(yaw) * off, b.y + 0.14, b.z - Math.sin(yaw) * off); root.add(r); });
    } else { // chemin de terre (jungle) ou trottoir (ville)
      [[1.35, 0.04, edgeMat, 0], [1.05, 0.06, pathMat, 0]].forEach(([w, h, mat, dy]) => {
        const p = mesh(new THREE.BoxGeometry(w, h, L + 0.4), mat, false, true);
        p.position.copy(mid); p.position.y += h / 2 + dy; p.lookAt(b.x, b.y + h / 2 + dy, b.z); root.add(p);
      });
    }
    if (n.stairs || m.stairs) {
      const steps = Math.max(2, Math.round(L / 0.45));
      for (let i = 1; i < steps; i++) { const t = i / steps; const s = mesh(new THREE.BoxGeometry(1.3, 0.12, 0.3), std(STONE[B.id][0]), true, true); s.position.lerpVectors(a, b, t); s.position.y += 0.1; s.lookAt(b.x, b.y + 0.1, b.z); root.add(s); }
    }
  }));
  const plankIM = instanced(new THREE.BoxGeometry(1.45, 0.08, 0.3), std('#e7d3b0', { roughness: 0.85 }), planks, (d) => shade('#d9bf94', ((d.r * 37) % 10) / 100 - 0.05).getStyle());
  if (plankIM) root.add(plankIM);
  const slIM = instanced(new THREE.BoxGeometry(1.2, 0.1, 0.22), std('#6b4a2b'), sleepers);
  if (slIM) root.add(slIM);
  // Piliers sous les escaliers et poteaux des pontons
  B.nodes.filter((n) => (n.z || 0) > 0 && n.stairs).forEach((n) => { const v = toV(n.x, n.y, 0); const h = (n.z || 0) / U; const p = mesh(new THREE.CylinderGeometry(0.25, 0.3, h, 10), std('#78716c')); p.position.set(v.x, h / 2, v.z); root.add(p); });

  // Étages : falaises en pierres empilées, herbe qui déborde, fleurs
  const flowerSpots = [];
  B.platforms.forEach((pf) => {
    const c = toV(pf.cx, pf.cy);
    const [c1, c2, grass] = STONE[B.id];
    const tex = stoneTex(c1, c2); tex.repeat.set(Math.round((pf.rx + pf.ry) / U / 1.6), 1.6);
    const wallMat = std('#fff', { map: tex, bumpMap: tex, bumpScale: 2.5, roughness: 0.9 });
    const topCol = grass || { heroes: '#5b6185', mine: '#6b5a47' }[B.id] || B.floorColor;
    const topMat = std(topCol, { roughness: 0.85 });
    const cyl = mesh(new THREE.CylinderGeometry(1, 1.04, FLOOR_H, 72, 1), [wallMat, topMat, topMat], true, true);
    cyl.scale.set(pf.rx / U, 1, pf.ry / U); cyl.position.set(c.x, FLOOR_H / 2 - 0.02, c.z);
    root.add(cyl);
    // couche du dessus qui déborde
    const lip = mesh(new THREE.CylinderGeometry(1.025, 1.025, 0.3, 72), std(shade(topCol, -0.05), { roughness: 0.9 }), true, true);
    lip.scale.set(pf.rx / U, 1, pf.ry / U); lip.position.set(c.x, FLOOR_H - 0.1, c.z); root.add(lip);
    if (grass) { // gouttes d'herbe sur le rebord
      const drips = []; const n = Math.round((pf.rx + pf.ry) / U * 3.2);
      for (let i = 0; i < n; i++) { const an = (i / n) * Math.PI * 2; const R2 = rng(i * 13 + pf.cx); drips.push({ x: c.x + Math.cos(an) * pf.rx / U * 1.02, y: FLOOR_H - 0.3 - R2() * 0.15, z: c.z + Math.sin(an) * pf.ry / U * 1.02, s: 0.22 + R2() * 0.16, sv: null }); }
      drips.forEach((d) => (d.sv = [d.s * 1.2, d.s * 1.6, d.s * 1.2]));
      const im = instanced(new THREE.SphereGeometry(1, 10, 8), std(shade(grass, -0.04)), drips); if (im) { im.castShadow = true; root.add(im); }
    } else { // bandeau lumineux (ville) / pierres (mine)
      const pts = []; for (let i = 0; i < 96; i++) { const a = (i / 96) * Math.PI * 2; pts.push(new THREE.Vector3(c.x + Math.cos(a) * pf.rx / U * 1.03, FLOOR_H - 0.05, c.z + Math.sin(a) * pf.ry / U * 1.03)); }
      const rim = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 192, 0.08, 6, true), new THREE.MeshStandardMaterial({ color: B.id === 'heroes' ? '#a78bfa' : '#fbbf24', emissive: new THREE.Color(B.id === 'heroes' ? '#8b5cf6' : '#f59e0b'), emissiveIntensity: 1.4 }), false); root.add(rim);
    }
    flowerSpots.push(pf);
  });

  // Cases : disque brillant posé dans un anneau blanc
  const ringGeo = new THREE.CylinderGeometry(1.0, 1.04, 0.12, 48);
  const ringMat = toy('#ffffff', { roughness: 0.3 });
  const discGeo = new THREE.CylinderGeometry(0.82, 0.82, 0.16, 48);
  B.nodes.forEach((n) => {
    const v = toV(n.x, n.y, n.z || 0);
    const base = B.id === 'pirate' || B.id === 'mine' ? 0.16 : 0.08;
    const r = mesh(ringGeo, ringMat, true, true); r.position.set(v.x, v.y + base + 0.06, v.z); root.add(r);
    const t = mesh(discGeo, tileMaterials(n.t, B), false, true); t.position.set(v.x, v.y + base + 0.09, v.z); root.add(t);
  });
  // Flèches peintes au sol aux embranchements
  B.nodes.filter((n) => n.next.length > 1).forEach((n) => n.next.forEach((id) => {
    const m = B.nodes[id]; const a = toV(n.x, n.y, n.z || 0), b = toV(m.x, m.y, m.z || 0);
    const d = b.clone().sub(a); d.y = 0; d.normalize();
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ map: arrowTex, transparent: true, depthWrite: false, roughness: 0.8 }));
    pl.rotation.x = -Math.PI / 2; pl.rotation.z = Math.atan2(d.x, d.z) + Math.PI;
    pl.position.set(a.x + d.x * 1.75, a.y + (B.id === 'pirate' ? 0.2 : 0.11), a.z + d.z * 1.75); root.add(pl);
  }));

  // Décor
  const dyn = [];
  const insidePf = (x, y) => B.platforms.some((pf) => Math.pow((x - pf.cx) / pf.rx, 2) + Math.pow((y - pf.cy) / pf.ry, 2) < 1);
  const distPath = (x, y) => { let d = 1e9; B.nodes.forEach((n) => { d = Math.min(d, Math.hypot(n.x - x, n.y - y)); n.next.forEach((id) => { const m = B.nodes[id]; const dx = m.x - n.x, dy = m.y - n.y, L = dx * dx + dy * dy || 1; let t = ((x - n.x) * dx + (y - n.y) * dy) / L; t = Math.max(0, Math.min(1, t)); d = Math.min(d, Math.hypot(n.x + dx * t - x, n.y + dy * t - y)); }); }); return d; };
  const BIG = { '🌋': 110, '🏙️': 85, '🏢': 85, '🌃': 85, '🌴': 55, '🏝️': 55, '⛵': 70, '⛏️': 55, '🪵': 55, '💰': 55, '🦕': 95, '🛸': 50 };
  const place = (e, x, y, s) => {
    R.tall = y < B.H * 0.75 && (x < 40 || x > B.W - 40 || y < 40); // grands immeubles seulement au fond et sur les côtés
    if (insidePf(x, y)) return;
    if (['🌊', '🐠', '🦈'].includes(e)) return; // créatures marines : pas sur la terre ferme
    if (distPath(x, y) < (BIG[e] || 32)) return;
    let m = decorModel(e, R, B.id);
    const v = toV(x, y);
    const groundY = 0;
    if (!m) return;
    let k = Math.min(2.1, s / 22) * (e === '🌋' ? 0.8 : 1) * (R.scaleMul || 1);
    if (m.userData.hover) k *= 0.6;
    m.scale.setScalar(k); m.position.set(v.x, groundY + (m.position.y || 0) * k, v.z); m.rotation.y = R() * Math.PI * 2; m.userData.baseY = m.position.y;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    root.add(m);
    if (m.userData.sway || m.userData.smoke || m.userData.bob || m.userData.flicker || m.userData.hover || m.userData.dinoHead || m.userData.wingsOf || m.userData.rotor || m.userData.wings) dyn.push(m);
  };
  R.scaleMul = 0.65; // sur le plateau : décor plus petit pour ne pas cacher le jeu
  B.decor.forEach((d) => place(d.e, d.x, d.y, d.s));
  R.scaleMul = 1;
  // Bordure de décor autour du plateau (comme un monde de Mario Party)
  const ring = { jurassic: ['🌴', '🌿', '🌴', '🪨', '🌋', '🦕', '🥚', '🍎', '🍊', '🫐', '🌿'], pirate: ['🌴', '🌴', '🪨', '🦜', '⚓', '🐚', '🍊', '🌿'], heroes: ['🏢', '🏢', '🏙️', '🚓', '🛸'], mine: ['🪨', '💎', '🪨', '🕯️', '⛏️', '🦇'] }[B.id];
  for (let i = 0; i < 140; i++) {
    const a = R() * Math.PI * 2, r = 1.05 + R() * 0.9;
    R.scaleMul = 1 + (r - 1) * 1.2; // plus grand quand c'est loin
    const x = B.W / 2 + Math.cos(a) * B.W * 0.55 * r, y = B.H / 2 + Math.sin(a) * B.H * 0.58 * r;
    if (B.id === 'pirate' && Math.hypot((x - B.W / 2) / (B.W * 0.53), (y - B.H / 2) / (B.H * 0.53)) > 0.9) continue;
    if (B.id === 'heroes') R.tall = true;
    place(ring[Math.floor(R() * ring.length)], x, y, 30 + R() * 30);
  }
  R.scaleMul = 1;
  addLandmark(B, root, dyn, R, W, H);
  // Fleurs et touffes d'herbe (régions en plein air)
  if (B.id === 'jurassic' || B.id === 'pirate') {
    const flowers = [], tufts = [], FC = ['#ef4444', '#fde047', '#ffffff', '#f472b6', '#fb923c', '#a78bfa'];
    const landOK = (x, z) => B.id !== 'pirate' || Math.hypot(x / (W * 0.53), z / (H * 0.53)) < 0.86;
    for (let i = 0; i < 1400; i++) {
      const x = (R() - 0.5) * (W + 30), z = (R() - 0.5) * (H + 30);
      if (!landOK(x, z)) continue;
      const px = (x + cx) * U, py = (z + cz) * U;
      const onPf = B.platforms.find((pf) => Math.pow((px - pf.cx) / pf.rx, 2) + Math.pow((py - pf.cy) / pf.ry, 2) < 0.9);
      const inPfEdge = B.platforms.some((pf) => { const q = Math.pow((px - pf.cx) / pf.rx, 2) + Math.pow((py - pf.cy) / pf.ry, 2); return q >= 0.9 && q < 1.15; });
      if (inPfEdge || distPath(px, py) < 26) continue;
      const y = onPf ? FLOOR_H + 0.05 : 0.02;
      if (R() < 0.45) flowers.push({ x, y, z, s: 0.7 + R() * 0.6, ry: R() * 6, c: FC[Math.floor(R() * FC.length)] });
      else tufts.push({ x, y, z, s: 0.6 + R() * 0.7, ry: R() * 6 });
    }
    const petal = new THREE.CylinderGeometry(0.17, 0.17, 0.04, 5); petal.translate(0, 0.2, 0);
    const fl = instanced(petal, toy('#fff', { roughness: 0.5 }), flowers, (d) => d.c); if (fl) root.add(fl);
    const ctr = new THREE.SphereGeometry(0.06, 8, 6); ctr.translate(0, 0.23, 0);
    const fc = instanced(ctr, toy('#facc15'), flowers); if (fc) root.add(fc);
    const tg2 = new THREE.ConeGeometry(0.12, 0.45, 4); tg2.translate(0, 0.22, 0);
    const tm = new THREE.Group(); [[0, 0], [0.1, 0.4], [-0.1, -0.4]].forEach(([dx, rz]) => { const im = instanced(tg2, std(B.id === 'pirate' ? '#4caf3a' : '#3f9a2c'), tufts.map((d) => ({ ...d, x: d.x + dx, rz }))); if (im) tm.add(im); }); root.add(tm);
  }
  // Remplissage du décor : tout l'espace libre du plateau est occupé
  {
    const KIT = {};
    const kit = (key, make) => (KIT[key] || (KIT[key] = kitFrom(make())));
    const KR = rng(B.W * 3 + 11);
    const T = {
      jurassic: [['tree', 30, 72, () => tree(KR, ['#3f9142', '#4caf50', '#2f855a'][Math.floor(KR() * 3)]), 3], ['bush', 30, 30, () => bush('#3f8f2a'), 3], ['bush2', 20, 30, () => bush('#5cb83a'), 3], ['pine', 10, 85, () => pine('#2f6f3a'), 2], ['rock', 10, 30, () => rock(KR, '#9a8f84'), 3], ['mush', 10, 26, () => mushroom(['#ef4444', '#f97316'][Math.floor(KR() * 2)]), 2], ['apple', 4, 70, () => apple(), 1], ['orange', 3, 70, () => orange(), 1], ['berry', 3, 70, () => berries(), 1], ['egg', 4, 26, () => egg(), 1], ['bone', 4, 26, () => bone(), 1]],
      pirate: [['palm', 22, 90, () => palm(KR), 4], ['bush', 25, 30, () => bush('#4d9a2a'), 3], ['rock', 12, 30, () => rock(KR, '#b8ad9a'), 3], ['crate', 10, 28, () => crate(), 1], ['barrel', 10, 28, () => barrel(), 1], ['shell', 8, 24, () => shell(), 2], ['orange', 3, 70, () => orange(), 1], ['mush', 4, 26, () => mushroom('#ef4444'), 1]],
      heroes: [['planter', 25, 60, () => planter(KR), 3], ['bench', 15, 30, () => bench(), 1], ['hydrant', 12, 26, () => hydrant(), 1], ['car', 15, 50, () => car(KR), 4], ['bush', 15, 30, () => bush('#22c55e'), 2], ['house', 18, 85, () => building(KR, false), 4]],
      mine: [['stalag', 30, 58, () => stalag(KR), 3], ['rock', 25, 30, () => rock(KR, '#6b625a'), 3], ['crystal', 18, 30, () => crystal(KR), 3], ['gshroom', 16, 26, () => glowShroom(KR), 2], ['cart', 6, 50, () => minecart(), 1], ['barrel', 6, 28, () => barrel(), 1]],
    }[B.id];
    const tot = T.reduce((a, t) => a + t[1], 0);
    const pick = (d) => { for (let tries = 0; tries < 6; tries++) { let r = KR() * tot; for (const t of T) { r -= t[1]; if (r <= 0) { if (d >= t[2]) return t; break; } } } return null; };
    const step = 34, mesas = [];
    const pfq = (px, py) => { let best = null; B.platforms.forEach((pf) => { const q = Math.pow((px - pf.cx) / pf.rx, 2) + Math.pow((py - pf.cy) / pf.ry, 2); if (best === null || q < best) best = q; }); return best === null ? 9 : best; };
    for (let py = -140; py < B.H + 140; py += step) for (let px = -140; px < B.W + 140; px += step) {
      const x0 = px + (KR() - 0.5) * step * 0.9, y0 = py + (KR() - 0.5) * step * 0.9;
      const x = x0 / U - cx, z = y0 / U - cz;
      if (B.id === 'pirate' && Math.hypot(x / (W * 0.53), z / (H * 0.53)) > 0.84) continue;
      const q = pfq(x0, y0); if (q > 0.82 && q < 1.25) continue;
      const onPf = q <= 0.82;
      const d = distPath(x0, y0); if (d < 26) continue;
      // Petits plateaux en falaise (relief) dans les grands espaces vides
      if (!onPf && d > 130 && B.id !== 'heroes' && KR() < 0.3 && !mesas.some((m) => Math.hypot(m.x - x0, m.y - y0) < m.r + 70)) {
        const r = Math.min(d - 75, 45 + KR() * 45); mesas.push({ x: x0, y: y0, r }); continue;
      }
      if (KR() < 0.12) continue;
      const t = pick(d); if (!t) continue;
      const k = kit(t[0] + (t[4] > 1 ? Math.floor(KR() * t[4]) : ''), t[3]);
      const sc = t[0] === 'house' ? 0.5 + KR() * 0.25 : t[0] === 'palm' ? 0.75 + KR() * 0.4 : t[0] === 'stalag' ? 0.7 + KR() * 0.5 : t[0] === 'tree' || t[0] === 'pine' ? 1.0 + KR() * 0.8 : 0.8 + KR() * 0.6;
      k.list.push({ x, y: onPf ? FLOOR_H : 0, z, s: sc * (d > 110 ? 1.25 : d < 45 ? 0.8 : 1), ry: KR() * Math.PI * 2 });
    }
    const [mc1, mc2, mgrass] = STONE[B.id];
    const mtex = stoneTex(mc1, mc2);
    mesas.forEach((m, i) => {
      const r = m.r / U, h = 0.6 + KR() * 1.0, v = toV(m.x, m.y);
      const t2 = mtex.clone(); t2.needsUpdate = true; t2.repeat.set(Math.max(2, Math.round(r * 1.2)), Math.max(1, h / 1.2));
      const top = std(mgrass || '#57534e', { roughness: 0.9 });
      const c = mesh(new THREE.CylinderGeometry(r, r * 1.06, h, 40), [std('#fff', { map: t2, bumpMap: t2, bumpScale: 2, roughness: 0.9 }), top, top], true, true);
      c.position.set(v.x, h / 2, v.z); root.add(c);
      const lip = mesh(new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.25, 40), std(shade(mgrass || '#57534e', -0.05)), true, true); lip.position.set(v.x, h - 0.08, v.z); root.add(lip);
      const n = 1 + Math.floor(r / 1.2);
      for (let j = 0; j < n; j++) { const t = T[Math.floor(KR() * Math.min(3, T.length))]; const a = KR() * 6.28, rr = KR() * r * 0.6; kit(t[0] + '0', t[3]).list.push({ x: v.x + Math.cos(a) * rr, y: h, z: v.z + Math.sin(a) * rr, s: 1 + KR() * 0.6, ry: KR() * 6.28 }); }
    });
    flushKits(KIT, root);
  }
  // Nuages
  if (!env.cave && B.id !== 'heroes') for (let i = 0; i < 9; i++) { const c = cloud(R); const a = R() * Math.PI * 2, r = Math.max(W, H) * (0.55 + R() * 0.5); c.position.set(Math.cos(a) * r, 16 + R() * 10, Math.sin(a) * r - 10); c.scale.setScalar(1 + R()); c.userData.cloud = { a, r, sp: 0.004 + R() * 0.006 }; root.add(c); dyn.push(c); }
  if (B.id === 'pirate') for (let i = 0; i < 4; i++) { const b = boat(); const a = R() * Math.PI * 2; b.position.set(Math.cos(a) * (W * 0.62 + 4), -0.3, Math.sin(a) * (H * 0.62 + 4)); b.rotation.y = R() * 6; b.scale.setScalar(1.6); root.add(b); dyn.push(b); }

  if (B.id === 'pirate') for (let i = 0; i < 3; i++) { const fin = mesh(new THREE.ConeGeometry(0.35, 0.9, 4), std('#475569')); fin.scale.z = 0.3; fin.userData.shark = { r: Math.max(W, H) * 0.62 + 3 + i * 2, ph: R() * 6, sp: 0.2 + R() * 0.15 }; root.add(fin); dyn.push(fin); }
  // Créatures volantes
  const flyK = { jurassic: ['ptero', 'ptero', 'bird'], pirate: ['gull', 'gull', 'bird'], heroes: ['heli', 'gull'], mine: ['bat', 'bat', 'bat'] }[B.id];
  const flyers = flyK.map((k, i) => { const s = flyerModel(k); s.scale.setScalar(k === 'heli' ? 0.8 : 1.1); s.traverse((o) => { if (o.isMesh) o.castShadow = true; }); root.add(s); return { s, ph: R() * 100, sp: 0.12 + R() * 0.1, r: Math.max(W, H) * (0.3 + R() * 0.25), y: 10 + R() * 4, dir: i % 2 ? -1 : 1 }; });
  // Particules (fumée, poussière, lucioles)
  const smoke = [];
  dyn.filter((m) => m.userData.smoke).forEach((v) => { for (let i = 0; i < 5; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: shadowTex, color: '#9ca3af', transparent: true, depthWrite: false })); root.add(s); smoke.push({ s, base: v, ph: i / 5 }); } });
  const sparks = [];
  if (B.id === 'mine' || B.id === 'jurassic' || B.id === 'heroes') for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: B.id === 'jurassic' ? '#d9f99d' : '#fde68a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(0.35); root.add(s); sparks.push({ s, x: (R() - 0.5) * W, z: (R() - 0.5) * H, ph: R() * 6, sp: 0.3 + R() }); }
  // Lumières de la mine
  if (env.cave) dyn.filter((m) => m.userData.flicker).slice(0, 6).forEach((m) => { const l = new THREE.PointLight('#fbbf24', 18, 12, 2); l.position.copy(m.position); l.position.y += 1.6 * m.scale.x; root.add(l); m.userData.light = l; });

  // Lumière qui accompagne la caméra (régions sombres)
  const follow = new THREE.PointLight(env.cave ? '#ffe7b3' : '#e9d5ff', env.cave || env.city ? 70 : 0, 30, 1.4); follow.position.set(0, 7, 4); root.add(follow);
  world = { follow, key: B.key, B, root, W, H, cx, cz, toV, water, dyn, flyers, smoke, sparks, stars: [], starKey: '', traps: {}, arrows: [], rings: [], sun, labels: {} };
}

/* ---------------- Mise à jour à chaque image ---------------- */
function syncStars(stars) {
  const key = JSON.stringify(stars || []);
  if (world.starKey === key) return;
  world.starKey = key;
  world.stars.forEach((s) => world.root.remove(s));
  world.stars = (stars || []).map((st) => {
    const n = world.B.nodes[st.node]; if (!n) return null;
    const g = starModel(world.B.id);
    const v = world.toV(n.x, n.y, n.z || 0); g.position.set(v.x, v.y + 1.9, v.z);
    const lbl = textSprite(st.price + ' ' + world.B.coin.icon, '#fde047'); lbl.position.set(0, 1.25, 0); lbl.scale.set(2.2, 0.82, 1); g.add(lbl);
    world.root.add(g);
    return g;
  }).filter(Boolean);
}
function syncTraps(traps) {
  const ids = Object.keys(traps || {});
  Object.keys(world.traps).forEach((k) => { if (!ids.includes(k)) { world.root.remove(world.traps[k]); delete world.traps[k]; } });
  ids.forEach((k) => { if (world.traps[k]) return; const n = world.B.nodes[k]; const s = trapModel(); const v = world.toV(n.x, n.y, n.z || 0); s.position.set(v.x + 0.55, v.y + TILE_H + 0.1, v.z + 0.4); world.root.add(s); world.traps[k] = s; });
}
function blockModel(kind) {
  const g = new THREE.Group(), R = rng(5);
  if (kind === 'dino') { const d = dino(R); d.scale.setScalar(0.75); d.rotation.y = Math.PI / 2; g.add(d); const z = textSprite('Z z z', '#fff', 48); z.scale.set(1.6, 0.6, 1); z.position.set(0.6, 2.6, 0); g.add(z); g.userData.zzz = z; }
  else if (kind === 'tide') { const w = mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.35, 32), new THREE.MeshPhysicalMaterial({ color: '#38bdf8', transparent: true, opacity: 0.8, roughness: 0.1, clearcoat: 1 })); w.position.y = 0.2; g.add(w); for (let i = 0; i < 5; i++) { const f = sphere(0.22, toy('#ffffff')); f.scale.y = 0.5; const a = i * 1.26; f.position.set(Math.cos(a) * 1.1, 0.4, Math.sin(a) * 1.1); g.add(f); } g.userData.tide = w; }
  else if (kind === 'works') { const st = canvasTex(128, 32, (c, w, h) => { for (let i = -2; i < 10; i++) { c.fillStyle = i % 2 ? '#f97316' : '#fff'; c.beginPath(); c.moveTo(i * 16, h); c.lineTo(i * 16 + 16, h); c.lineTo(i * 16 + 32, 0); c.lineTo(i * 16 + 16, 0); c.fill(); } }); const bar = mesh(new THREE.BoxGeometry(2.2, 0.35, 0.12), std('#fff', { map: st })); bar.position.y = 0.8; g.add(bar); [-0.9, 0.9].forEach((x) => { const l = mesh(new THREE.BoxGeometry(0.1, 0.8, 0.5), std('#475569')); l.position.set(x, 0.4, 0); g.add(l); const c = mesh(new THREE.ConeGeometry(0.22, 0.6, 12), toy('#f97316')); c.position.set(x * 1.35, 0.3, 0.4); g.add(c); }); const lt = mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: '#fde047', emissive: new THREE.Color('#facc15'), emissiveIntensity: 2 })); lt.position.y = 1.05; g.add(lt); g.userData.blink = lt; }
  else { for (let i = 0; i < 6; i++) { const r = rock(R, '#78716c'); r.scale.setScalar(0.7 + R() * 0.6); r.position.set((R() - 0.5) * 1.6, i > 3 ? 0.5 : 0, (R() - 0.5) * 1); g.add(r); } }
  return g;
}
function syncBlocks(blocks) {
  const key = JSON.stringify((blocks || []).map((b) => [b.from, b.to, b.kind]));
  if (world.blockKey === key) return;
  world.blockKey = key;
  (world.blocks || []).forEach((m) => world.root.remove(m));
  world.blocks = (blocks || []).map((b) => {
    const A = world.B.nodes[b.from], C = world.B.nodes[b.to]; if (!A || !C) return null;
    const a = world.toV(A.x, A.y, A.z || 0), c = world.toV(C.x, C.y, C.z || 0);
    const m = blockModel(b.kind); m.position.lerpVectors(a, c, 0.5); m.position.y += 0.1;
    m.lookAt(c.x, m.position.y, c.z); m.rotateY(Math.PI / 2);
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const sign = emojiSprite('⛔', 0.9); sign.position.set(0, b.kind === 'dino' ? 3.4 : 2.2, 0); m.add(sign); m.userData.sign = sign;
    world.root.add(m); return m;
  }).filter(Boolean);
}
function syncArrows(opts, mePos) {
  const key = opts ? JSON.stringify(opts.map((o) => o.value)) + (mePos ? Math.round(mePos.x) + ',' + Math.round(mePos.y) : '') : '';
  if (world.arrowKey === key) return;
  world.arrowKey = key;
  world.arrows.forEach((a) => { world.root.remove(a); if (a.userData.holder) world.root.remove(a.userData.holder); });
  world.arrows = [];
  if (!opts || !mePos) return;
  const sh = new THREE.Shape(); sh.moveTo(-0.35, -0.5); sh.lineTo(0.35, -0.5); sh.lineTo(0.35, 0.15); sh.lineTo(0.75, 0.15); sh.lineTo(0, 1.0); sh.lineTo(-0.75, 0.15); sh.lineTo(-0.35, 0.15); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2); // à plat, la pointe vers -z
  const from = world.toV(mePos.x, mePos.y, mePos.z || 0);
  opts.forEach((o) => {
    const n = world.B.nodes[o.value]; if (!n) return;
    const to = world.toV(n.x, n.y, n.z || 0);
    const dir = to.clone().sub(from); dir.y = 0; dir.normalize();
    const g = new THREE.Group();
    const m = mesh(geo, new THREE.MeshPhysicalMaterial({ color: o.label === 'Continuer' ? '#facc15' : '#f472b6', emissive: new THREE.Color(o.label === 'Continuer' ? '#a16207' : '#9d174d'), emissiveIntensity: 0.45, clearcoat: 1, roughness: 0.25 }));
    g.add(m);
    g.position.copy(from).add(dir.clone().multiplyScalar(2.1)); g.position.y = from.y + 0.9;
    g.rotation.y = Math.atan2(-dir.x, -dir.z);
    const lbl = textSprite(o.icon + ' ' + o.label, '#ffffff'); lbl.position.set(0, 0.9, 0); lbl.scale.set(2.8, 1.05, 1);
    const holder = new THREE.Group(); holder.position.copy(g.position); holder.add(lbl); world.root.add(holder);
    g.userData = { value: o.value, holder, base: g.position.y };
    m.userData.value = o.value;
    world.root.add(g);
    world.arrows.push(g);
  });
}
function ring(pos, color) {
  const r = mesh(new THREE.TorusGeometry(0.6, 0.07, 8, 40), new THREE.MeshBasicMaterial({ color, transparent: true }), false);
  r.rotation.x = Math.PI / 2; r.position.copy(pos); r.position.y += 0.4; world.root.add(r);
  world.rings.push({ r, t0: performance.now() });
}

function monsterFor(p) {
  let m = monsters[p.id];
  if (m && m.userData.char === p.char) return m;
  if (m) scene.remove(m);
  const ch = P.CHARACTERS.find((c) => c.id === p.char);
  const model = buildMonster(ch);
  m = new THREE.Group(); m.add(model);
  m.userData = { char: p.char, model, yaw: 0, last: null };
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; m.add(sh); m.userData.shadow = sh;
  const base = mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 40), new THREE.MeshBasicMaterial({ color: p.color }), false); base.rotation.x = Math.PI / 2; base.position.y = 0.03; m.add(base); m.userData.base = base;
  const cur = mesh(new THREE.TorusGeometry(0.82, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true }), false); cur.rotation.x = Math.PI / 2; cur.position.y = 0.04; m.add(cur); m.userData.cur = cur;
  m.userData.comp = null; m.userData.compKind = null;
  const shield = mesh(new THREE.SphereGeometry(1.05, 32, 24), new THREE.MeshPhysicalMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.22, roughness: 0, clearcoat: 1, emissive: new THREE.Color('#38bdf8'), emissiveIntensity: 0.25, depthWrite: false }), false);
  shield.position.y = 0.95; m.add(shield); m.userData.shield = shield;
  scene.add(m);
  monsters[p.id] = m;
  return m;
}

/* ---------------- Portraits 3D pour l'interface ---------------- */
function makePortraits() {
  const out = {};
  try {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.setClearColor(0x000000, 0);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight('#ffffff', '#6b5b95', 1.3));
    const d = new THREE.DirectionalLight('#ffffff', 2.4); d.position.set(-3, 5, 6); sc.add(d);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0.9, 1.5, 4.4); cam.lookAt(0, 1.0, 0);
    P.CHARACTERS.forEach((ch) => {
      const m = buildMonster(ch); m.rotation.y = 0.25;
      const rig = m.userData.rig; if (rig.arms[1]) rig.arms[1].rotation.z = 2.4; // il fait coucou
      sc.add(m); r.render(sc, cam); out[ch.id] = c.toDataURL('image/png'); sc.remove(m);
    });
    r.dispose();
  } catch (e) { console.warn('portraits', e); }
  return out;
}

/* ---------------- API utilisée par le jeu ---------------- */
const API = {
  ready: false,
  init(cv, opts) {
    try {
      canvas = cv;
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(Math.min(window.innerWidth, window.innerHeight) < 700 ? 1.5 : 1.75, window.devicePixelRatio || 1));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      API.small = Math.min(window.innerWidth, window.innerHeight) < 700;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(42, 1.4, 0.1, 400);
      onArrow = opts && opts.onArrow;
      cv.addEventListener('pointerdown', (e) => {
        if (!world || !world.arrows.length) return;
        const r = cv.getBoundingClientRect();
        const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        const rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
        const hit = rc.intersectObjects(world.arrows, true)[0];
        let val = hit ? (hit.object.userData.value ?? hit.object.parent.userData.value) : null;
        if (val == null) { // tolérance : flèche la plus proche du doigt à l'écran
          let best = null, bd = 0.12;
          world.arrows.forEach((a) => { const p = a.position.clone().project(camera); const d = Math.hypot(p.x - v.x, p.y - v.y); if (d < bd) { bd = d; best = a; } });
          if (best) val = best.userData.value;
        }
        if (val != null && onArrow) onArrow(val);
      });
      this.ready = true;
      return true;
    } catch (e) { console.warn('3D indisponible', e); return false; }
  },
  resize(w, h) {
    if (!renderer) return;
    const s = renderer.getSize(new THREE.Vector2());
    if (s.x !== w || s.y !== h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  },
  setOverview(v) { overview = v; },
  portraits: makePortraits,
  reset() { camState.init = false; },
  /** Position à l'écran (pixels CSS dans le canvas) d'un point du plateau. */
  project(pos) {
    if (!world) return { x: 0, y: 0 };
    const v = world.toV(pos.x, pos.y, pos.z || 0); v.y += 1.6;
    v.project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height };
  },
  fx(kind, pos) { if (!world || !pos) return; const v = world.toV(pos.x, pos.y, pos.z || 0); ring(v, kind === 'burst' ? '#fde047' : '#ffffff'); },
  /** view : { board, players: [{ p, pos, hop, alpha, moving }], current, me, stars, traps, fork, focus } */
  frame(now, view) {
    const B = view.board;
    if (!world || world.key !== B.key) { buildWorld(B); Object.keys(monsters).forEach((k) => { scene.remove(monsters[k]); delete monsters[k]; }); camState.init = false; }
    const t = now / 1000, dt = Math.min(0.05, clock.last ? (now - clock.last) / 1000 : 0.016); clock.last = now;
    syncStars(view.stars); syncTraps(view.traps); syncBlocks(view.blocks);
    (world.blocks || []).forEach((m) => { if (m.userData.zzz) { m.userData.zzz.position.y = 2.6 + Math.sin(t * 2) * 0.15; } if (m.userData.tide) m.userData.tide.scale.y = 1 + Math.sin(t * 3) * 0.25; if (m.userData.blink) m.userData.blink.material.emissiveIntensity = Math.sin(t * 8) > 0 ? 2.5 : 0.2; if (m.userData.sign) m.userData.sign.position.y = (m.userData.zzz ? 3.4 : 2.2) + Math.sin(t * 3) * 0.12; });
    // Joueurs
    const alive = new Set();
    view.players.forEach((o) => {
      const p = o.p, m = monsterFor(p); alive.add(p.id);
      const v = world.toV(o.pos.x, o.pos.y, o.pos.z || 0);
      const baseY = v.y + TILE_H + 0.08;
      const cur = p.id === view.current;
      const last = m.userData.last;
      if (last) { const dx = v.x - last.x, dz = v.z - last.z; if (Math.hypot(dx, dz) > 0.01) m.userData.yaw = Math.atan2(dx, dz); else if (!o.moving) m.userData.yaw *= 0.92; }
      m.userData.last = v.clone();
      const model = m.userData.model;
      model.rotation.y += (m.userData.yaw - model.rotation.y) * Math.min(1, dt * 10);
      const hop = (o.hop || 0) / U;
      const idle = !o.moving;
      const bounce = cur && idle ? Math.abs(Math.sin(t * 4)) * 0.25 : 0;
      const breathe = 1 + Math.sin(t * 3 + p.id.charCodeAt(0)) * 0.03;
      m.position.set(v.x, baseY, v.z);
      model.position.y = hop + bounce;
      const squash = cur && idle ? 1 + Math.sin(t * 8) * 0.04 : 1;
      const sz = cur ? 1.45 : 1.3;
      model.scale.set((1 / squash) * sz, squash * breathe * sz, (1 / squash) * sz);
      m.visible = o.alpha > 0.15;
      m.userData.shadow.material.opacity = Math.max(0.25, 1 - hop / 6);
      m.userData.shadow.scale.setScalar(1 - Math.min(0.5, hop / 10));
      m.userData.cur.visible = cur; m.userData.cur.material.opacity = 0.5 + 0.4 * Math.sin(t * 5);
      if (m.userData.compKind !== (p.companion || null)) { if (m.userData.comp) m.remove(m.userData.comp); m.userData.comp = p.companion ? petModel(p.companion) : null; if (m.userData.comp) m.add(m.userData.comp); m.userData.compKind = p.companion || null; }
      const comp = m.userData.comp;
      if (comp) { comp.position.set(Math.cos(t * 1.4) * 0.95, 1.5 + hop + Math.sin(t * 3) * 0.12, Math.sin(t * 1.4) * 0.5); comp.rotation.y = -t * 1.4 + Math.PI / 2; comp.userData.wings.forEach((w, k) => { w.rotation.x = Math.sin(t * 18) * 0.7 * (k ? -1 : 1); }); }
      m.userData.shield.visible = !!p.shield; m.userData.shield.scale.setScalar(1 + Math.sin(t * 3) * 0.03);
      // Animation des membres : marche, saut, salut
      const rig = model.userData.rig, walk = o.moving ? Math.sin(t * 14) : 0;
      rig.legs.forEach((l, k) => { l.rotation.x = (k % 2 ? 1 : -1) * walk * 0.7; });
      rig.arms.forEach((a, k) => {
        const s = a.userData.side;
        if (hop > 0.6) { a.rotation.z = s * 2.6; a.rotation.x = 0; }
        else if (cur && idle && s > 0) { a.rotation.z = s * (2.3 + Math.sin(t * 7) * 0.35); a.rotation.x = 0; }
        else { a.rotation.z += (s * 0.25 - a.rotation.z) * 0.2; a.rotation.x = -(k % 2 ? 1 : -1) * walk * 0.6; }
      });
      if (rig.floating) model.position.y += 0.18 + Math.sin(t * 2.5 + p.id.charCodeAt(1)) * 0.08;
      const bl = (t + p.id.charCodeAt(2) * 0.37) % 4; const lidS = bl < 0.12 ? 0.15 : 1; rig.blink.forEach((e) => { e.scale.y = lidS; });
      model.userData.head.rotation.z = o.moving ? Math.sin(t * 7) * 0.06 : Math.sin(t * 1.3 + p.id.charCodeAt(0)) * 0.04;
    });
    Object.keys(monsters).forEach((k) => { if (!alive.has(k)) { scene.remove(monsters[k]); delete monsters[k]; } });
    // Flèches
    syncArrows(view.fork, view.mePos);
    world.arrows.forEach((a, i) => { a.position.y = a.userData.base + Math.sin(t * 5 + i) * 0.15; const s = 1 + Math.sin(t * 6) * 0.06; a.scale.setScalar(s); });
    // Étoiles
    world.stars.forEach((s, i) => { s.userData.spin.rotation.y = t * 1.6 + i; s.position.y += Math.sin(t * 2.4 + i) * 0.004; });
    // Décor animé
    world.dyn.forEach((m, i) => {
      if (m.userData.shark) { const sk = m.userData.shark, a = t * sk.sp + sk.ph; m.position.set(Math.cos(a) * sk.r, -0.05, Math.sin(a) * sk.r * 0.75); m.rotation.y = -a; }
      if (m.userData.cloud) { const c = m.userData.cloud; const a = c.a + t * c.sp; m.position.x = Math.cos(a) * c.r; m.position.z = Math.sin(a) * c.r - 10; }
      if (m.userData.hover) m.position.y = m.userData.baseY + Math.sin(t * 1.8 + i) * 0.25;
      if (m.userData.rotor) m.userData.rotor.rotation.y = t * 25;
      if (m.userData.wings) m.userData.wings.forEach((w, k) => { w.rotation.x = Math.sin(t * 11 + i) * 0.7 * (k ? -1 : 1); });
      if (m.userData.dinoHead) m.userData.dinoHead.position.y = 2.5 + Math.sin(t * 1.2 + i) * 0.12;
      if (m.userData.wingsOf) m.userData.wingsOf.rotation.z = 0.9 + Math.sin(t * 2 + i) * 0.08;
      if (m.userData.sway) m.rotation.z = Math.sin(t * 1.2 + i) * 0.035;
      if (m.userData.bob) m.position.y = (m.isSprite ? m.scale.y / 2 + 0.1 : -0.3) + Math.sin(t * 1.5 + i) * 0.12;
      if (m.userData.flicker) { const k = 1.8 + Math.sin(t * 13 + i) * 0.4 + Math.sin(t * 7.3 + i) * 0.3; m.userData.flicker.material.emissiveIntensity = k; if (m.userData.light) m.userData.light.intensity = 14 + k * 4; }
    });
    world.smoke.forEach((sm) => { const ph = (t * 0.25 + sm.ph) % 1; const b = sm.base; sm.s.position.set(b.position.x + Math.sin(ph * 6) * 0.3, b.position.y + 2.6 * b.scale.x + ph * 4, b.position.z); sm.s.scale.setScalar(0.8 + ph * 2.5); sm.s.material.opacity = 0.55 * (1 - ph); });
    world.sparks.forEach((sp) => { sp.s.position.set(sp.x + Math.sin(t * 0.6 + sp.ph) * 1.5, 0.8 + Math.sin(t * sp.sp + sp.ph) * 0.6 + 0.6, sp.z + Math.cos(t * 0.5 + sp.ph) * 1.5); sp.s.material.opacity = 0.4 + 0.4 * Math.sin(t * 3 + sp.ph); });
    world.flyers.forEach((f) => {
      const a = t * f.sp * f.dir + f.ph; f.s.position.set(Math.cos(a) * f.r, f.y + Math.sin(t * 2 + f.ph) * 0.5, Math.sin(a) * f.r * 0.7);
      f.s.rotation.y = -a - (f.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI;
      if (f.s.userData.wings) f.s.userData.wings.forEach((w, k) => { w.rotation.x = Math.sin(t * 10 + f.ph) * 0.7 * (k ? -1 : 1); });
      if (f.s.userData.rotor) f.s.userData.rotor.rotation.y = t * 25;
    });
    if (world.water) {
      const g = world.water.geometry, pa = g.attributes.position, base = world.water.userData.base;
      for (let i = 0; i < pa.count; i++) { const x = base[i * 3], z = base[i * 3 + 2]; pa.setY(i, Math.sin(x * 0.35 + t * 1.4) * 0.12 + Math.cos(z * 0.3 + t * 1.1) * 0.1); }
      pa.needsUpdate = true; g.computeVertexNormals();
    }
    world.rings = world.rings.filter((r) => { const k = (now - r.t0) / 900; if (k >= 1) { world.root.remove(r.r); return false; } r.r.scale.setScalar(1 + k * 4); r.r.material.opacity = 1 - k; return true; });
    // Caméra
    const W = world.W, H = world.H;
    const portrait = camera.aspect < 0.9;
    let target, offset;
    if (overview || !view.focus) { target = new THREE.Vector3(0, 0, 1); const d = Math.max(W, H * 1.25) * (portrait ? 1.45 : 0.82); offset = new THREE.Vector3(0, d * 0.82, d * 0.72); }
    else { const f = world.toV(view.focus.x, view.focus.y, view.focus.z || 0); target = new THREE.Vector3(f.x, f.y + 0.8, f.z + 1); const d = portrait ? 23 : 21; offset = new THREE.Vector3(0, d * 0.46, d * 0.9); }
    const want = target.clone().add(offset);
    if (!camState.init) { camState.pos.copy(want); camState.look.copy(target); camState.init = true; }
    camState.pos.lerp(want, Math.min(1, dt * 2.5)); camState.look.lerp(target, Math.min(1, dt * 3));
    camera.position.copy(camState.pos); camera.lookAt(camState.look);
    // L'ombre suit la caméra pour rester nette
    world.sun.target.position.set(camState.look.x, 0, camState.look.z);
    world.sun.position.set(camState.look.x - 12, 40, camState.look.z + 18);
    world.follow.position.set(camState.look.x, camState.look.y + 6, camState.look.z + 3);
    renderer.render(scene, camera);
  },
};
/* ---------------- Mini-jeu 3D : Patinoire Givrée ---------------- */
function makeRink(cv, info) {
  const R = info.R, IN = info.IN;
  const rr = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  rr.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  rr.shadowMap.enabled = true; rr.shadowMap.type = THREE.PCFSoftShadowMap;
  rr.toneMapping = THREE.ACESFilmicToneMapping; rr.toneMappingExposure = 1.05;
  const sc = new THREE.Scene();
  sc.background = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#93c5fd'); gr.addColorStop(1, '#f0f9ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  sc.fog = new THREE.Fog('#e0f2fe', 30, 70);
  const cam = new THREE.PerspectiveCamera(45, 1.4, 0.1, 200);
  sc.add(new THREE.HemisphereLight('#ffffff', '#93c5fd', 1.2));
  const sun = new THREE.DirectionalLight('#fffbeb', 2.4); sun.position.set(-8, 20, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 }); sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0005; sc.add(sun);
  // Neige autour
  const snow = mesh(new THREE.CircleGeometry(60, 48), std('#f8fafc', { roughness: 0.95 }), false, true); snow.rotation.x = -Math.PI / 2; snow.position.y = -0.02; sc.add(snow);
  // Glace
  const iceTex = canvasTex(1024, 1024, (g, w) => {
    const c = w / 2; const gr = g.createRadialGradient(c, c, 50, c, c, c); gr.addColorStop(0, '#e0f2fe'); gr.addColorStop(1, '#bae6fd'); g.fillStyle = gr; g.fillRect(0, 0, w, w);
    const Rr = rng(3); g.strokeStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 160; i++) { g.lineWidth = 1 + Rr() * 2; g.beginPath(); const x = Rr() * w, y = Rr() * w, a = Rr() * 6, L = 30 + Rr() * 120; g.arc(x, y, L, a, a + 0.6 + Rr()); g.stroke(); }
    g.strokeStyle = '#60a5fa'; g.lineWidth = 8; g.beginPath(); g.arc(c, c, c * (IN + 0.6) / R, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#f472b6'; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const r = c * 0.82; g.save(); g.translate(c + Math.cos(a) * r, c + Math.sin(a) * r); g.rotate(a + Math.PI / 2); g.beginPath(); g.moveTo(0, -18); g.lineTo(16, 12); g.lineTo(-16, 12); g.closePath(); g.fill(); g.restore(); }
  });
  const ice = mesh(new THREE.CircleGeometry(R, 72), new THREE.MeshPhysicalMaterial({ map: iceTex, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }), false, true);
  ice.rotation.x = -Math.PI / 2; ice.position.y = 0.01; sc.add(ice);
  // Bande colorée
  const stripe = canvasTex(1024, 64, (g, w, h) => { const cols = ['#ef4444', '#facc15', '#22c55e', '#3b82f6']; for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % 4]; g.fillRect(i * w / 16, 0, w / 16, h); } g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, 0, w, 8); });
  const wall = mesh(new THREE.CylinderGeometry(R + 0.2, R + 0.2, 0.9, 72, 1, true), std('#fff', { map: stripe, side: THREE.DoubleSide, roughness: 0.5 }), true, true); wall.position.y = 0.45; sc.add(wall);
  const cap = mesh(new THREE.TorusGeometry(R + 0.2, 0.22, 10, 96), std('#ffffff', { roughness: 0.9 })); cap.rotation.x = Math.PI / 2; cap.position.y = 0.92; sc.add(cap);
  // Îlot de neige et bonhomme
  const pile = sphere(IN - 0.2, std('#ffffff', { roughness: 0.95 }), 32, 16); pile.scale.y = 0.35; sc.add(pile);
  const sm = new THREE.Group(); [[0.55, 0.5], [0.4, 1.25], [0.3, 1.8]].forEach(([r, y]) => { const b = sphere(r, std('#ffffff', { roughness: 0.9 })); b.position.y = y; sm.add(b); });
  const nose = mesh(new THREE.ConeGeometry(0.06, 0.3, 8), toy('#f97316')); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.82, 0.32); sm.add(nose);
  [-0.1, 0.1].forEach((x) => { const e = sphere(0.04, std('#111')); e.position.set(x, 1.92, 0.26); sm.add(e); });
  const hat = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.35, 16), std('#1f2937')); hat.position.y = 2.22; sm.add(hat);
  const brim = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16), std('#1f2937')); brim.position.y = 2.06; sm.add(brim);
  const scarf = mesh(new THREE.TorusGeometry(0.33, 0.07, 8, 20), toy('#ef4444')); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.55; sm.add(scarf);
  sm.position.y = 0.45; sm.traverse((o) => { if (o.isMesh) o.castShadow = true; }); sc.add(sm);
  // Sapins enneigés et collines
  const Rr = rng(9);
  for (let i = 0; i < 46; i++) {
    const a = Rr() * Math.PI * 2, r = R + 2.5 + Rr() * 16;
    const t = pine('#1f6f4a'); t.scale.setScalar(1.2 + Rr() * 1.4); t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    const sn = mesh(new THREE.ConeGeometry(0.45, 0.45, 10), std('#ffffff')); sn.position.y = 2.05; t.add(sn);
    t.traverse((o) => { if (o.isMesh) o.castShadow = true; }); sc.add(t);
  }
  for (let i = 0; i < 18; i++) { const a = Rr() * Math.PI * 2, r = R + 3 + Rr() * 20; const h = sphere(2 + Rr() * 3, std('#f1f5f9', { roughness: 1 })); h.scale.y = 0.4; h.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); sc.add(h); }
  // Flocons
  const flakes = []; for (let i = 0; i < 120; i++) { const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, depthWrite: false })); f.scale.setScalar(0.15 + Rr() * 0.15); f.position.set((Rr() - 0.5) * 30, Rr() * 14, (Rr() - 0.5) * 30); sc.add(f); flakes.push(f); }
  const gemsM = {}, sk = {};
  const gemMat = { 1: new THREE.MeshPhysicalMaterial({ color: '#38bdf8', emissive: new THREE.Color('#0ea5e9'), emissiveIntensity: 0.5, roughness: 0.05, clearcoat: 1, flatShading: true }), 3: new THREE.MeshPhysicalMaterial({ color: '#fde047', emissive: new THREE.Color('#f59e0b'), emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.1, flatShading: true }) };
  const gemGeo = new THREE.OctahedronGeometry(0.32, 0);
  let lastW = 0, lastH = 0;
  return {
    frame(now, view) {
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w !== lastW || h !== lastH) { lastW = w; lastH = h; rr.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); const hh = Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect); const d = Math.max(20, (R + 1.6) / Math.tan(hh) * 1.02); cam.position.set(0, d * 0.8, d * 0.6); cam.lookAt(0, 0, 0.8); }
      const t = now / 1000;
      // Gemmes
      const ids = new Set((view.gems || []).map((g) => g.id));
      Object.keys(gemsM).forEach((k) => { if (!ids.has(+k)) { sc.remove(gemsM[k]); delete gemsM[k]; } });
      (view.gems || []).forEach((g) => {
        let m = gemsM[g.id];
        if (!m) { m = mesh(gemGeo, gemMat[g.g]); m.scale.set(g.g === 3 ? 1.3 : 1, 1.5, g.g === 3 ? 1.3 : 1); m.position.set(g.x, 0.6, g.z); m.userData.born = t; sc.add(m); gemsM[g.id] = m; }
        if (view.hidden && view.hidden.has(g.id)) m.visible = false;
        m.rotation.y = t * 2 + g.id; const k = Math.min(1, (t - m.userData.born) * 3); m.position.y = 0.55 + Math.sin(t * 3 + g.id) * 0.1; m.scale.x = m.scale.z = (g.g === 3 ? 1.3 : 1) * k;
      });
      // Patineurs
      (view.skaters || []).forEach((o) => {
        let m = sk[o.id];
        if (!m) {
          const ch = P.CHARACTERS.find((c) => c.id === o.char); m = new THREE.Group(); const md = buildMonster(ch); m.add(md); m.userData.model = md;
          const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; m.add(sh);
          const ring = mesh(new THREE.TorusGeometry(0.62, 0.06, 8, 36), new THREE.MeshBasicMaterial({ color: o.color }), false); ring.rotation.x = Math.PI / 2; ring.position.y = 0.04; m.add(ring);
          if (o.me) { const arr = mesh(new THREE.ConeGeometry(0.25, 0.4, 4), new THREE.MeshBasicMaterial({ color: '#fde047' }), false); arr.rotation.x = Math.PI; arr.position.y = 3.1; m.add(arr); m.userData.arr = arr; }
          md.traverse((x) => { if (x.isMesh) x.castShadow = true; });
          sc.add(m); sk[o.id] = m;
        }
        m.position.set(o.x, 0.02, o.z);
        const md = m.userData.model; md.rotation.y = o.a;
        const rig = md.userData.rig, glide = o.m ? Math.sin(t * 7) : 0;
        rig.legs.forEach((l, k) => { l.rotation.x = (k % 2 ? 1 : -1) * glide * 0.45; });
        rig.arms.forEach((a, k) => { a.rotation.z = (k ? -1 : 1) * (o.m ? 0.9 : 0.25); });
        md.rotation.z = o.m ? Math.sin(t * 3.5) * 0.08 : 0;
        if (m.userData.arr) m.userData.arr.position.y = 3.1 + Math.sin(t * 5) * 0.15;
      });
      flakes.forEach((f, i) => { f.position.y -= 0.02; f.position.x += Math.sin(t + i) * 0.005; if (f.position.y < 0) f.position.y = 14; });
      rr.render(sc, cam);
    },
    dispose() { try { rr.dispose(); rr.forceContextLoss(); } catch (e) {} },
  };
}
API.rink = makeRink;
window.Scene3D = API;
window.dispatchEvent(new Event('scene3d-ready'));
