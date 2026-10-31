// Monstro Party — rendu 3D du plateau (Three.js). Si la 3D n'est pas disponible, le jeu garde l'affichage 2D.
import * as THREE from '/vendor/three.module.js';

const U = 20; // 20 pixels du plateau = 1 unité 3D
const TILE_H = 0.26; // hauteur du dessus des cases (plates, façon Mario Party)
const FLOOR_H = 3; // hauteur d'un étage (60 px)

const P = window.PARTY;
let renderer, scene, camera, canvas, onArrow = null, onTile = null;
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
function pillSprite(text, bg) {
  const t = canvasTex(512, 128, (g, w, h) => {
    g.font = 'bold 54px Fredoka, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = Math.min(w - 20, g.measureText(text).width + 56);
    g.fillStyle = bg; g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.beginPath(); if (g.roundRect) g.roundRect((w - tw) / 2, 14, tw, h - 28, 46); else g.rect((w - tw) / 2, 14, tw, h - 28); g.fill(); g.stroke();
    g.fillStyle = '#ffffff'; g.fillText(text, w / 2, h / 2 + 3, w - 60);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(3.6, 0.9, 1); s.renderOrder = 21; return s;
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
  if (kind === 'fish') return fishSchool();
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
/* ---------------- Outils de modélisation (formes naturelles, bords arrondis) ---------------- */
function hash3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function jitter(geo, amt, seed = 1) { // déforme un volume sans le déchirer (les sommets identiques bougent pareil)
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = (hash3(Math.round(v.x * 50) + seed, Math.round(v.y * 50), Math.round(v.z * 50)) - 0.5) * 2 * amt; const n = v.clone().normalize(); p.setXYZ(i, v.x + n.x * k, v.y + n.y * k, v.z + n.z * k); }
  geo.computeVertexNormals(); return geo;
}
function shadeTop(geo, low, high) { // couleur plus claire sur le dessus (lumière du ciel)
  const p = geo.attributes.position, c = [], a = new THREE.Color(low), b = new THREE.Color(high); let mn = 1e9, mx = -1e9;
  for (let i = 0; i < p.count; i++) { mn = Math.min(mn, p.getY(i)); mx = Math.max(mx, p.getY(i)); }
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) - mn) / ((mx - mn) || 1); const col = a.clone().lerp(b, t); c.push(col.r, col.g, col.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return geo;
}
function roundedBox(w, h, d, r) { const sh = new THREE.Shape(), x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r; sh.moveTo(x, y); sh.lineTo(x + W, y); sh.lineTo(x + W, y + H); sh.lineTo(x, y + H); sh.lineTo(x, y); const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * r, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 4, curveSegments: 4 }); g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals(); return g; }
const leafTex = canvasTex(128, 512, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#2f7d32'; g.lineWidth = 6; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 0); g.stroke(); for (let i = 0; i < 26; i++) { const y = h - 20 - i * 18, L = (w / 2 - 6) * Math.sin((i / 26) * Math.PI * 0.95 + 0.15); [-1, 1].forEach((k) => { g.fillStyle = i % 2 ? '#3fa047' : '#4cb653'; g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + k * L * 0.6, y - 4, w / 2 + k * L, y - 30); g.quadraticCurveTo(w / 2 + k * L * 0.5, y + 6, w / 2, y + 8); g.fill(); }); } });
leafTex.generateMipmaps = false; leafTex.minFilter = THREE.LinearFilter;
function palm(R) {
  const g = new THREE.Group(), trunk = std('#8b5a2b', { roughness: 0.95 }), ring = std('#6b4423', { roughness: 1 });
  let y = 0, x = 0; const lean = (R() - 0.5) * 0.6;
  for (let i = 0; i < 8; i++) { const r0 = 0.15 - i * 0.008; const s = mesh(new THREE.CylinderGeometry(r0 - 0.01, r0, 0.32, 10), trunk); s.position.set(x, y + 0.16, 0); s.rotation.z = -lean * 0.25; g.add(s); const rg = mesh(new THREE.TorusGeometry(r0, 0.025, 5, 12), ring); rg.rotation.x = Math.PI / 2; rg.position.set(x, y + 0.3, 0); g.add(rg); y += 0.3; x += lean * 0.07 * (i / 4); }
  const fm = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 });
  const frondGeo = (() => { // palme dentelée (forme pleine, visible de loin)
    const sh = new THREE.Shape(), Lf = 1.7, n = 11; sh.moveTo(0.03, 0);
    for (let k = 1; k <= n; k++) { const t = k / n, w = 0.32 * Math.sin(t * Math.PI * 0.92 + 0.12); sh.lineTo(w, t * Lf - 0.06); sh.lineTo(0.05 * (1 - t), t * Lf); }
    sh.lineTo(0, Lf + 0.05);
    for (let k = n; k >= 1; k--) { const t = k / n, w = 0.32 * Math.sin(t * Math.PI * 0.92 + 0.12); sh.lineTo(-0.05 * (1 - t), t * Lf); sh.lineTo(-w, t * Lf - 0.06); }
    sh.lineTo(-0.03, 0);
    const geo = new THREE.ShapeGeometry(sh, 2), pa = geo.attributes.position;
    for (let k = 0; k < pa.count; k++) { const yy = pa.getY(k), xx = pa.getX(k); pa.setZ(k, -Math.pow(yy / Lf, 2) * 0.9 - Math.abs(xx) * 0.35); }
    geo.computeVertexNormals();
    shadeTop(geo, '#2f7d32', '#6cc04a');
    return geo;
  })();
  for (let i = 0; i < 9; i++) {
    const f = mesh(frondGeo, fm, true); const a = (i / 9) * Math.PI * 2 + R() * 0.3;
    f.position.set(x, y + 0.05, 0); f.rotation.set(-1.0 - R() * 0.35, a, 0, 'YXZ'); g.add(f);
  }
  [0, 1, 2, 3].forEach((i) => { const c = mesh(new THREE.SphereGeometry(0.09, 10, 8), std('#6b4423')); c.position.set(x + Math.cos(i * 1.6) * 0.12, y - 0.08, Math.sin(i * 1.6) * 0.12); g.add(c); });
  g.userData.sway = true;
  return g;
}
function tree(R, col = '#3f9142') {
  const g = new THREE.Group();
  const tg = new THREE.CylinderGeometry(0.11, 0.2, 1.0, 9, 3); jitter(tg, 0.025, 3);
  const t = mesh(tg, std('#6b4423', { roughness: 1 })); t.position.y = 0.5; g.add(t);
  [0, 2.1, 4.2].forEach((a) => { const rt = mesh(new THREE.ConeGeometry(0.07, 0.35, 6), std('#6b4423')); rt.position.set(Math.cos(a) * 0.17, 0.08, Math.sin(a) * 0.17); rt.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); g.add(rt); });
  const base = new THREE.Color(col), leaf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const blobs = [[0, 1.35, 0, 0.62], [0.36, 1.12, 0.12, 0.44], [-0.34, 1.16, -0.12, 0.46], [0.08, 1.7, -0.05, 0.42], [-0.1, 1.2, 0.36, 0.38], [0.15, 1.18, -0.36, 0.38]];
  blobs.forEach(([x, y, z, r], i) => { const geo = jitter(new THREE.IcosahedronGeometry(r, 2), r * 0.16, i * 7 + 1); shadeTop(geo, base.clone().multiplyScalar(0.62).getStyle(), base.clone().lerp(new THREE.Color('#d9f99d'), 0.25).getStyle()); const s = mesh(geo, leaf); s.position.set(x, y, z); g.add(s); });
  g.userData.sway = true;
  return g;
}
function pine(col = '#166534') { const g = new THREE.Group(); const t = mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 8), std('#5b3a1a')); t.position.y = 0.25; g.add(t); [0, 1, 2].forEach((i) => { const c = mesh(new THREE.ConeGeometry(0.75 - i * 0.18, 0.9, 10), std(col)); c.position.y = 0.75 + i * 0.5; g.add(c); }); g.userData.sway = true; return g; }
function bush(col = '#4d9a2a') { const g = new THREE.Group(), base = new THREE.Color(col), m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }); [[0, 0.3, 0, 0.42], [0.35, 0.22, 0.1, 0.3], [-0.32, 0.24, -0.05, 0.32], [0.05, 0.2, 0.32, 0.26], [-0.05, 0.22, -0.32, 0.27]].forEach(([x, y, z, r], i) => { const geo = jitter(new THREE.IcosahedronGeometry(r, 2), r * 0.18, i * 5 + 2); shadeTop(geo, base.clone().multiplyScalar(0.6).getStyle(), base.clone().lerp(new THREE.Color('#ecfccb'), 0.2).getStyle()); const s = mesh(geo, m); s.position.set(x, y, z); g.add(s); }); return g; }
function rock(R, col = '#8b8178') { const geo = jitter(new THREE.IcosahedronGeometry(0.55 + R() * 0.35, 1), 0.12, Math.floor(R() * 100)); shadeTop(geo, new THREE.Color(col).multiplyScalar(0.7).getStyle(), new THREE.Color(col).lerp(new THREE.Color('#ffffff'), 0.15).getStyle()); const r = mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 })); r.position.y = 0.2; r.rotation.set(R() * 0.4, R() * 3, R() * 0.4); r.scale.set(1, 0.68, 1); const g = new THREE.Group(); g.add(r); if (R() < 0.5) { const s = mesh(jitter(new THREE.IcosahedronGeometry(0.22, 1), 0.05, 9), r.material); s.position.set(0.55, 0.08, 0.2); g.add(s); } return g; }
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
    case '🏺': return urn();
    case '⛄': return snowman(R);
    case '🧊': return iceSpikes(R);
    case '🐧': return penguin();
    case '🌵': return cactus(R);
    case '🔺': { const p = pyramid(R).g; p.scale.setScalar(0.45); const g = new THREE.Group(); g.add(p); return g; }
    case '🏜️': return rock(R, '#d6a96b');
    case '🐪': return camelModel();
    case '🍎': return apple();
    case '🪦': return tombstone(R);
    case '🎃': return pumpkin(R);
    case '🌳': return theme === 'hante' ? deadTree(R) : tree(R);
    case '🌲': return theme === 'polaire' ? snowPine(R) : pine();
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
  } else if (B.id === 'hante') {
    const man = new THREE.Group(), wall = std('#4b4453', { roughness: 0.9 }), roof = std('#1e1b2e'), win = new THREE.MeshStandardMaterial({ color: '#fde68a', emissive: new THREE.Color('#f59e0b'), emissiveIntensity: 1.6 });
    const body = mesh(new THREE.BoxGeometry(14, 7, 6), wall); body.position.y = 3.5; man.add(body);
    const rf = mesh(new THREE.ConeGeometry(9, 4, 4), roof); rf.rotation.y = Math.PI / 4; rf.scale.set(1.1, 1, 0.5); rf.position.y = 9; man.add(rf);
    const tw = mesh(new THREE.CylinderGeometry(1.8, 2, 12, 12), wall); tw.position.set(6, 6, 0); man.add(tw); const tr = mesh(new THREE.ConeGeometry(2.4, 4, 12), roof); tr.position.set(6, 14, 0); man.add(tr);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { const w = mesh(new THREE.BoxGeometry(1, 1.4, 0.1), win); w.position.set(-5.5 + i * 2.1, 2 + j * 3, 3.05); man.add(w); }
    const door = mesh(new THREE.BoxGeometry(1.6, 2.6, 0.1), std('#3b0764')); door.position.set(0, 1.3, 3.06); man.add(door);
    man.position.set(-W * 0.1, 0, back - 8); root.add(man);
    const lt = new THREE.PointLight('#f59e0b', 60, 30, 1.5); lt.position.set(-W * 0.1, 4, back - 2); root.add(lt);
    for (let i = 0; i < 8; i++) { const d = deadTree(R); d.scale.setScalar(3 + R() * 2); d.position.set(-W * 0.6 + i * (W * 1.2 / 7), 0, back - 16 - R() * 8); root.add(d); }
  } else if (B.id === 'atlantide') {
    const AR = rng(23);
    for (let i = 0; i < 6; i++) { const d = glassDome(AR).g; d.scale.setScalar(2 + AR() * 1.5); d.position.set(-W * 0.7 + i * (W * 1.4 / 5), 0, back - 12 - AR() * 10); root.add(d); }
    const ps = poseidonStatue(AR).g; ps.scale.setScalar(4); ps.position.set(W * 0.05, 0, back - 26); root.add(ps);
    const rayM = new THREE.MeshBasicMaterial({ color: '#cffafe', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < 10; i++) { const r = mesh(new THREE.ConeGeometry(3 + AR() * 3, 40, 16, 1, true), rayM, false); r.position.set((AR() - 0.5) * W, 18, (AR() - 0.5) * H); r.rotation.z = 0.25; root.add(r); }
    for (let i = 0; i < 90; i++) { const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#e0f2fe', transparent: true, opacity: 0.55, depthWrite: false })); const sc = 0.15 + AR() * 0.25; b.scale.set(sc, sc, 1); b.position.set((AR() - 0.5) * W, 0, (AR() - 0.5) * H); b.userData.rise = { sp: 0.6 + AR() * 0.8, ph: AR() * 14 }; root.add(b); dyn.push(b); }
  } else if (B.id === 'espace') {
    spaceBackdrop(root, W, H, rng(17));
    root.children.forEach((o) => { if (o.userData.spin) dyn.push(o); });
  } else if (B.id === 'chevaliers') {
    const PR = rng(13), cm = castleStone(), cs = new THREE.Group();
    const hill = mesh(new THREE.SphereGeometry(14, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#4d8b31')); hill.scale.y = 0.35; cs.add(hill);
    const keep = mesh(new THREE.BoxGeometry(8, 10, 7), cm); keep.position.y = 9; cs.add(keep);
    [[-6, -4], [6, -4], [-6, 4], [6, 4]].forEach(([x, z], i) => { const t = tower(1.8, 12, cm, i % 2 ? '#1d4ed8' : '#b91c1c'); t.position.set(x, 4, z); cs.add(t); });
    const big = tower(2.2, 16, cm, '#1d4ed8'); big.position.set(0, 4, -1); cs.add(big);
    cs.position.set(W * 0.05, -0.5, back - 22); root.add(cs);
    for (let i = 0; i < 8; i++) { const h = mesh(new THREE.SphereGeometry(8 + PR() * 5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#5b9a3a')); h.scale.y = 0.4; h.position.set(-W * 0.8 + i * (W * 1.6 / 7), -0.3, back - 12 - PR() * 6); root.add(h); }
  } else if (B.id === 'polaire') {
    const PR = rng(9);
    for (let i = 0; i < 7; i++) { const mtn = new THREE.Group(); const h = 14 + PR() * 12, r = 9 + PR() * 6; const c = mesh(new THREE.ConeGeometry(r, h, 7), std('#64748b', { flatShading: true, roughness: 0.9 })); c.position.y = h / 2; mtn.add(c); const cap = mesh(new THREE.ConeGeometry(r * 0.45, h * 0.45, 7), std('#f8fafc', { flatShading: true })); cap.position.y = h - h * 0.225 + 0.05; mtn.add(cap); mtn.position.set(-W * 0.8 + i * (W * 1.6 / 6), -0.5, back - 14 - PR() * 10); mtn.rotation.y = PR() * 3; root.add(mtn); }
    const au = auroraCurtain(W, back); root.add(au); dyn.push(au);
  } else if (B.id === 'egypte') {
    const PR = rng(5);
    [[-0.35, 1.3, -10], [0.05, 1.8, -18], [0.42, 1.1, -8]].forEach(([fx, k, dz]) => { const p = pyramid(PR, true).g; p.scale.setScalar(k); p.position.set(W * fx, 0, back + dz); root.add(p); });
    for (let i = 0; i < 9; i++) { const d = mesh(new THREE.SphereGeometry(6 + PR() * 5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#e2bd80', { roughness: 1 })); d.scale.y = 0.35; d.position.set(-W * 0.8 + i * (W * 1.6 / 8), -0.2, back - 26 - PR() * 8); root.add(d); }
  } else if (B.id === 'recif') {
    const lh = new THREE.Group(); [0, 1, 2, 3].forEach((k) => { const c = mesh(new THREE.CylinderGeometry(1.2 - k * 0.18, 1.3 - k * 0.18, 2.2, 20), std(k % 2 ? '#0ea5e9' : '#f8fafc')); c.position.y = 1.1 + k * 2.2; lh.add(c); }); const lamp = sphere(0.8, new THREE.MeshStandardMaterial({ color: '#fef9c3', emissive: new THREE.Color('#fde047'), emissiveIntensity: 2 })); lamp.position.y = 9.6; lh.add(lamp); lh.position.set(W * 0.42, -0.5, back + 4); root.add(lh);
    for (let i = 0; i < 5; i++) { const r = rock(R, '#94a3b8'); r.scale.setScalar(4 + R() * 4); r.position.set(-W * 0.6 + i * (W * 1.2 / 4), -1, back - 10 - R() * 8); root.add(r); }
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
  else if (id === 'atlantide') { m = new THREE.Group(); const gold = new THREE.MeshPhysicalMaterial({ color: '#fbbf24', metalness: 1, roughness: 0.15, emissive: new THREE.Color('#b45309'), emissiveIntensity: 0.4 }); const sh = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), gold); sh.position.y = -0.1; m.add(sh); const bar = mesh(new THREE.BoxGeometry(0.6, 0.08, 0.08), gold); bar.position.y = 0.45; m.add(bar); [-0.27, 0, 0.27].forEach((x) => { const p2 = mesh(new THREE.ConeGeometry(0.07, 0.35, 8), gold); p2.position.set(x, 0.66, 0); m.add(p2); }); }
  else if (id === 'espace') { m = new THREE.Group(); const gold = new THREE.MeshPhysicalMaterial({ color: '#fbbf24', metalness: 1, roughness: 0.15, emissive: new THREE.Color('#b45309'), emissiveIntensity: 0.4 }); m.add(sphere(0.42, gold, 32, 24)); const rg = mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 40), gold); rg.rotation.x = Math.PI / 2 - 0.4; m.add(rg); }
  else if (id === 'chevaliers') { m = new THREE.Group(); const gold = new THREE.MeshPhysicalMaterial({ color: '#fbbf24', metalness: 1, roughness: 0.15, emissive: new THREE.Color('#b45309'), emissiveIntensity: 0.4 }); const cup = lathe([[0, -0.5], [0.3, -0.5], [0.08, -0.4], [0.06, -0.05], [0.12, 0], [0.38, 0.2], [0.42, 0.5], [0.38, 0.5], [0.33, 0.25], [0, 0.12]], gold, 32); m.add(cup); [0, 2.1, 4.2].forEach((a) => { const j = sphere(0.06, toy('#dc2626')); j.position.set(Math.cos(a) * 0.4, 0.35, Math.sin(a) * 0.4); m.add(j); }); }
  else if (id === 'polaire') { m = new THREE.Group(); const cm = new THREE.MeshPhysicalMaterial({ color: '#a5f3fc', emissive: new THREE.Color('#22d3ee'), emissiveIntensity: 0.6, roughness: 0.05, transparent: true, opacity: 0.9, flatShading: true, clearcoat: 1 }); [[0, 0, 0, 1.3], [-0.3, -0.15, 0.4, 0.8], [0.3, -0.15, -0.4, 0.8]].forEach(([x, y, rz, k]) => { const c = mesh(new THREE.OctahedronGeometry(0.4, 0), cm); c.scale.set(0.55 * k, 1.3 * k, 0.55 * k); c.position.set(x, y, 0); c.rotation.z = rz; m.add(c); }); }
  else if (id === 'egypte') { m = new THREE.Group(); const gold = new THREE.MeshPhysicalMaterial({ color: '#fbbf24', metalness: 1, roughness: 0.15, emissive: new THREE.Color('#b45309'), emissiveIntensity: 0.4 }); const red = new THREE.MeshPhysicalMaterial({ color: '#dc2626', roughness: 0.3, clearcoat: 1 }); const c = mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.5, 24), red); c.position.y = -0.1; m.add(c); const t = mesh(new THREE.CylinderGeometry(0.12, 0.28, 0.55, 24), new THREE.MeshPhysicalMaterial({ color: '#f8fafc', roughness: 0.3, clearcoat: 1 })); t.position.y = 0.4; m.add(t); const k = sphere(0.1, gold); k.position.y = 0.72; m.add(k); const b = mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 28), gold); b.rotation.x = Math.PI / 2; b.position.y = -0.33; m.add(b); const cb = mesh(new THREE.ConeGeometry(0.07, 0.28, 8), gold); cb.position.set(0, 0.12, 0.33); m.add(cb); }
  else if (id === 'hante') { m = new THREE.Group(); const pk = pumpkin(rng(3)); pk.traverse((o) => { if (o.isMesh && o.material.color && o.material.color.getHexString() === 'f97316') o.material = new THREE.MeshPhysicalMaterial({ color: '#fbbf24', metalness: 1, roughness: 0.2, emissive: new THREE.Color('#b45309'), emissiveIntensity: 0.4 }); }); pk.scale.setScalar(1.4); pk.position.y = -0.45; m.add(pk); }
  else if (id === 'recif') { m = new THREE.Group(); const gold = new THREE.MeshPhysicalMaterial({ color: '#fbbf24', metalness: 1, roughness: 0.15, emissive: new THREE.Color('#b45309'), emissiveIntensity: 0.4 }); [[0, 0, 0.7], [-0.25, 0.5, 0.45], [0.28, 0.4, 0.5], [0, 0.75, 0.35]].forEach(([x, rz, l], i) => { const b = mesh(new THREE.CylinderGeometry(0.06, 0.1, l, 8), gold); b.position.set(x, l / 2 - 0.3 + (i ? 0.25 : 0), 0); b.rotation.z = rz * (x < 0 ? 1 : -1); m.add(b); const t = mesh(new THREE.SphereGeometry(0.1, 10, 8), gold); t.position.set(x * 1.6, l - 0.3 + (i ? 0.25 : 0), 0); m.add(t); }); }
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
const TILE_COL = { blue: '#2f7cf6', red: '#e5383b', event: '#9b4dff', item: '#06b6d4', shop: '#ec4899', nest: '#65a30d', chance: '#f5c518', chaos: '#1e293b', special: '#f59e0b', tunnel: '#111827', start: '#f8fafc', casino: '#15803d', trade: '#0d9488', boss: '#7f1d1d', shift: '#b45309', npc: '#a21caf' };
const TILE_ICON = { item: '🎁', shop: '🛒', nest: '🪺', chance: '🎲', chaos: '🌀', tunnel: '🕳️', casino: '🎰', trade: '🔁', boss: '😈', shift: '⚙️' };
const tileMats = {};
function tileMaterials(type, B, npc) {
  const key = type + B.id + (npc || '');
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
    if (type === 'tunnel' && B.warp) icon = B.warp.icon;
    if (type === 'npc' && npc && P.NPCS[npc]) icon = P.NPCS[npc].icon;
    API.icons();
    const ic = { item: 'item', shop: 'shop', nest: 'nest', chance: 'chance', chaos: 'chaos', casino: 'casino', trade: 'trade', boss: 'boss', shift: 'shift' }[type];
    if (ic && ICON_CANVAS[ic]) { g.drawImage(ICON_CANVAS[ic], w / 2 - 92, w / 2 - 92, 184, 184); }
    else if (icon) { g.font = '120px serif'; g.fillText(icon, w / 2, w / 2 + 6); }
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
  heroes: { sky: ['#3b82f6', '#c7d2fe'], fog: '#a5b4fc', ground: ['#2a2a3a', '#33334a', '#1f1f2e'], hemi: ['#e0e7ff', '#334155', 1.1], sun: ['#fff7ed', 2.2], hills: 0, city: true },
  atlantide: { sky: ['#0c4a6e', '#155e75'], fog: '#0e5a78', ground: ['#c8b88a', '#d9cba0', '#6b8f71'], hemi: ['#a5f3fc', '#083344', 1.2], sun: ['#e0f2fe', 1.8], hills: 4, underwater: true },
  espace: { sky: ['#020617', '#1e1b4b'], fog: '#0b0a24', ground: ['#4c3d5c', '#6b5b7b', '#3b3247'], hemi: ['#c4b5fd', '#312e81', 1.2], sun: ['#fff7ed', 2.4], hills: 0, space: true },
  chevaliers: { sky: ['#60a5fa', '#e0f2fe'], fog: '#cfe3d0', ground: ['#4d8b31', '#65a83a', '#7c6a46'], hemi: ['#fff7e6', '#3b5323', 1.05], sun: ['#fff1c9', 2.5], hills: 5 },
  polaire: { sky: ['#60a5fa', '#e0f2fe'], fog: '#c7d7ea', ground: ['#d5dfeb', '#e8eef5', '#b8c6d6'], hemi: ['#ffffff', '#6b8fbf', 0.85], sun: ['#fff1dc', 1.9], hills: 5 },
  egypte: { sky: ['#f59e0b', '#fde9b8'], fog: '#f1d9a8', ground: ['#d9b77a', '#e8cd96', '#b98f55'], hemi: ['#fff7e6', '#8a5a2b', 1.05], sun: ['#fff1c9', 3.0], hills: 3 },
  hante: { sky: ['#475569', '#c4b5fd'], fog: '#6d6a8f', ground: ['#3f5a2c', '#56703b', '#4b4036'], hemi: ['#e9d5ff', '#2e1065', 1.0], sun: ['#fde7c7', 1.8], hills: 4 },
  recif: { sky: ['#0ea5e9', '#bae6fd'], fog: '#9fdcf0', ground: ['#e9d8a6', '#f7e7c1', '#5fb84a'], hemi: ['#ffffff', '#2b8fa3', 1.1], sun: ['#fffbe8', 2.7], water: true, islands: true, hills: 0, waterCol: '#0b97b0' },
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
  jurassic: ['#b9c6cf', '#8fa1ad', '#6aa83b'], pirate: ['#d8d2c4', '#b5ab95', '#5fae3a'], recif: ['#e7dcc4', '#c9b893', '#5fb84a'], hante: ['#78716c', '#57534e', '#3f5a2c'], egypte: ['#e2c38f', '#c9a46b', null], polaire: ['#94a3b8', '#64748b', '#f1f5f9'], chevaliers: ['#a8a29e', '#78716c', '#5f9c35'], espace: ['#6b5b7b', '#4c3d5c', null], atlantide: ['#94a3b8', '#64748b', '#4d7c6f'],
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
  scene.fog = env.underwater ? new THREE.Fog(env.fog, 45, 190) : new THREE.Fog(env.fog, 70, 230);

  // Lumières
  const hemi = new THREE.HemisphereLight(env.hemi[0], env.hemi[1], env.hemi[2] * 0.55); root.add(hemi);
  scene.environment = env.cave ? ENVS.night : ENVS.day;
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
  const ZN = B.zones || [];
  const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; };
  const zoneLv = (x, y, skip) => { let pos = 0, neg = 0; ZN.forEach((z, i) => { if (i === skip || !inPoly(x, y, z.poly)) return; if (z.level > 0) pos = Math.max(pos, z.level); else neg = Math.min(neg, z.level); }); return pos || neg; };
  const zoneEdge = (x, y) => { let d = 1e9; ZN.forEach((z) => { const P = z.poly; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1; let t = ((x - a[0]) * dx + (y - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); d = Math.min(d, Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y)); } }); return d; };
  const isl = (B.islands || []).map((I) => ({ x: I.cx / U - cx, z: I.cy / U - cz, rx: I.rx / U + 2.2, rz: I.ry / U + 2.2, lv: I.level || 0 }));
  const islLv = (x, z) => { let best = 0; isl.forEach((I) => { if (Math.hypot((x - I.x) / I.rx, (z - I.z) / I.rz) < 1) best = Math.max(best, I.lv); }); return env.space ? best * FLOOR_H : 0; };
  const islD = (x, z) => { let d = 99; isl.forEach((I) => { d = Math.min(d, Math.hypot((x - I.x) / I.rx, (z - I.z) / I.rz)); }); return d; }; // < 1 : sur un îlot
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const ex = Math.max(0, Math.abs(x) - W / 2 + 1), ez = Math.max(0, Math.abs(z) - H / 2 + 1);
    const edge = Math.hypot(ex, ez);
    let h = (N(x * 0.25, z * 0.25) - 0.5) * 0.35;
    if (isl.length) { const d = islD(x, z); h = d < 0.92 ? 0.05 + (N(x * 0.3, z * 0.3) - 0.5) * 0.1 : d < 1.7 ? 0.05 - (d - 0.92) * 1.6 : -1.3 - (N(x * 0.2, z * 0.2)) * 0.6; }
    else if (env.water) { const d = Math.hypot(x / (W * 0.53), z / (H * 0.53)); h = d < 0.92 ? 0.04 + (N(x * 0.3, z * 0.3) - 0.5) * 0.1 : 0.04 - Math.pow((d - 0.92) * 9, 1.3); }
    else if (env.hills) h += Math.pow(edge / 8, 1.6) * env.hills * (0.6 + N(x * 0.15, z * 0.15) * 0.8);
    // aplatir sous les chemins
    let near = 99; for (let k = 0; k < nodePts.length; k += 1) { const d = Math.hypot(nodePts[k][0] - x, nodePts[k][1] - z); if (d < near) near = d; }
    if (near < 2.2 && !env.water) h = Math.min(h, 0.02);
    if (B.river && near > 1.8) { let rd = 99; const rv = B.river; for (let k = 1; k < rv.length; k++) { const ax = rv[k - 1][0] / U - cx, az = rv[k - 1][1] / U - cz, bx = rv[k][0] / U - cx, bz = rv[k][1] / U - cz; const dx = bx - ax, dz = bz - az, LL = dx * dx + dz * dz; let tt = ((x - ax) * dx + (z - az) * dz) / LL; tt = Math.max(0, Math.min(1, tt)); rd = Math.min(rd, Math.hypot(ax + dx * tt - x, az + dz * tt - z)); } if (rd < 3.2) h = Math.min(h, -0.55 + Math.pow(Math.max(0, rd - 1.6) / 1.6, 2) * 0.55); }
    if (ZN.length) { const zl = zoneLv((x + cx) * U, (z + cz) * U); if (zl < 0) h = zl * FLOOR_H; }
    pos.setY(i, h);
    const n2 = N(x * 0.6 + 50, z * 0.6);
    let c;
    if (isl.length) { const d = islD(x, z); c = d < 0.55 ? cC.clone().lerp(cB, Math.max(0, (d - 0.35) * 5)) : d < 1 ? cB.clone().lerp(cA, (d - 0.55) * 2.2) : d < 1.7 ? new THREE.Color('#f2e3b3').lerp(new THREE.Color('#8fd9c9'), (d - 1) / 0.7) : new THREE.Color('#3aa3a8').lerp(new THREE.Color('#1d6f86'), Math.min(1, N(x * 0.1, z * 0.1))); }
    else if (env.water) { const d = Math.hypot(x / (W * 0.53), z / (H * 0.53)); c = d > 0.8 ? cB.clone().lerp(cA, Math.min(1, (d - 0.8) * 4)) : cC.clone().lerp(cB, Math.min(1, Math.max(0, (d - 0.5) * 3.3))); }
    else c = cA.clone().lerp(cB, n2).lerp(cC, Math.min(1, Math.max(0, h / 4)));
    if (h < -1) c.multiplyScalar(0.72);
    cols.push(c.r, c.g, c.b);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  tg.computeVertexNormals();
  const detail = canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, w, w); const DR = rng(5);
    for (let i = 0; i < 2600; i++) { const v = Math.floor(170 + DR() * 85); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; if (env.water || env.cave || env.city) g.fillRect(DR() * w, DR() * w, 2 + DR() * 3, 2 + DR() * 3); else { const x = DR() * w, y = DR() * w; g.fillRect(x, y, 1.5, 4 + DR() * 5); } }
  });
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.repeat.set(TW / 5, TH / 5); detail.colorSpace = THREE.NoColorSpace;
  const terrain = mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95, flatShading: false }), false, true);
  root.add(terrain);
  if (env.space) { // l'espace : pas de sol, des astéroïdes qui flottent
    terrain.visible = false;
    const TOPS = ['#8b8fa3', '#8b6fd6', '#c97fd0', '#e0995a', '#5fbf86', '#6b9fdc', '#a9adb8', '#d97a7a'];
    isl.forEach((I, i) => { const a = asteroidRock(I.rx, I.rz, i * 7 + 3, I.lv === 2 ? '#a7b2c2' : TOPS[i % TOPS.length]); a.position.set(I.x, I.lv * FLOOR_H, I.z); a.userData.float = { y: I.lv * FLOOR_H, ph: i }; root.add(a); if (I.lv === 2) { const ring = mesh(new THREE.TorusGeometry(1, 0.02, 6, 80), neon('#22d3ee'), false); ring.rotation.x = Math.PI / 2; ring.scale.set(I.rx * 0.99, I.rz * 0.99, 1); ring.position.set(I.x, I.lv * FLOOR_H + 0.03, I.z); root.add(ring); } });
  }

  // Eau
  let water = null;
  if (env.water) {
    const wg = new THREE.PlaneGeometry(TW + 80, TH + 80, 80, 60); wg.rotateX(-Math.PI / 2);
    water = mesh(wg, new THREE.MeshPhysicalMaterial({ color: env.waterCol || '#1e90c8', roughness: 0.2, metalness: 0.0, transparent: true, opacity: isl.length ? 0.78 : 0.86, clearcoat: 0.3, envMapIntensity: 0.35 }), false, true);
    water.position.y = -0.35; root.add(water);
    water.userData.base = Float32Array.from(wg.attributes.position.array);
  }
  // Ville : sol en damier de rues
  if (env.city) {
    const streets = canvasTex(256, 256, (g, w) => { g.fillStyle = '#2b2b3d'; g.fillRect(0, 0, w, w); g.fillStyle = '#3a3a52'; g.fillRect(0, 0, w, 40); g.fillRect(0, 0, 40, w); g.fillStyle = '#facc15'; for (let i = 50; i < w; i += 40) { g.fillRect(i, 18, 20, 4); g.fillRect(18, i, 4, 20); } });
    streets.wrapS = streets.wrapT = THREE.RepeatWrapping; streets.repeat.set(TW / 8, TH / 8);
    let sg = new THREE.PlaneGeometry(TW, TH); sg.rotateX(-Math.PI / 2);
    if (ZN.some((z2) => z2.level < 0)) { const sh = new THREE.Shape([new THREE.Vector2(-TW / 2, -TH / 2), new THREE.Vector2(TW / 2, -TH / 2), new THREE.Vector2(TW / 2, TH / 2), new THREE.Vector2(-TW / 2, TH / 2)]); ZN.filter((z2) => z2.level < 0).forEach((z2) => sh.holes.push(new THREE.Path(z2.poly.map(([x2, y2]) => { const v = toV(x2, y2); return new THREE.Vector2(v.x, -v.z); })))); sg = new THREE.ShapeGeometry(sh); sg.rotateX(-Math.PI / 2); const uv = sg.attributes.uv, pp = sg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / TW + 0.5, pp.getZ(i) / TH + 0.5); }
    const street = mesh(sg, new THREE.MeshStandardMaterial({ map: streets, roughness: 0.9 }), false, true); street.position.y = 0.01; root.add(street);
  }

  // Chemins (selon la région)
  const tileY = (n) => (n.z || 0) / U;
  const planks = [], sleepers = [], rails = [], sandMeshes = [], whenMeshes = [];
  const sandMat = std('#ead7a4', { roughness: 1 });
  const dirt = canvasTex(128, 128, (g, w) => { g.fillStyle = '#e5e5e5'; g.fillRect(0, 0, w, w); const DR = rng(9); for (let i = 0; i < 500; i++) { const v = Math.floor(175 + DR() * 80); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.beginPath(); g.arc(DR() * w, DR() * w, 1 + DR() * 2.5, 0, 7); g.fill(); } });
  dirt.wrapS = dirt.wrapT = THREE.RepeatWrapping; dirt.repeat.set(1, 6); dirt.colorSpace = THREE.NoColorSpace;
  const pathMat = new THREE.MeshStandardMaterial({ color: B.id === 'jurassic' ? '#d9b77e' : B.id === 'heroes' ? '#9aa3b5' : B.path, map: dirt, roughness: 0.95 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: B.id === 'jurassic' ? '#b08850' : shade(B.path, -0.25), roughness: 0.95 });
  const LIFT = new Set((B.lifts || []).map((l) => l[0] + '>' + l[1]));
  const busArea = (B.areaNames || []).indexOf('Voie de bus');
  B.nodes.forEach((n) => n.next.forEach((id) => {
    const m = B.nodes[id];
    if (LIFT.has(n.id + '>' + id)) return; // ascenseur : dessiné à part
    const a = toV(n.x, n.y, n.z || 0), b = toV(m.x, m.y, m.z || 0);
    const L = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a).normalize();
    const yaw = Math.atan2(dir.x, dir.z), pitch = -Math.asin(Math.max(-1, Math.min(1, dir.y)));
    if ((n.sand || m.sand)) { // banc de sable (s'enfonce à marée haute)
      const sb = mesh(new THREE.BoxGeometry(1.9, 0.5, L + 0.9), sandMat, false, true); sb.position.copy(mid); sb.position.y -= 0.2; sb.lookAt(b.x, b.y - 0.2, b.z); root.add(sb); sandMeshes.push(sb); sb.userData.y0 = sb.position.y;
    } else if (B.id === 'pirate' || B.id === 'recif') { // ponton en planches
      const k = Math.max(2, Math.round(L / 0.36));
      for (let i = 0; i <= k; i++) { const p = a.clone().lerp(b, i / k); planks.push({ x: p.x, y: p.y + 0.1, z: p.z, ry: yaw, rx: pitch, sv: [1, 1, 1], r: i }); }
      [-0.62, 0.62].forEach((off) => { const bm = mesh(new THREE.BoxGeometry(0.1, 0.12, L), std('#8a6a45'), false, true); bm.position.copy(mid); bm.position.x += Math.cos(yaw) * off; bm.position.z -= Math.sin(yaw) * off; bm.position.y += 0.06; bm.lookAt(b.x + Math.cos(yaw) * off, b.y + 0.06, b.z - Math.sin(yaw) * off); root.add(bm); });
    } else if (B.id === 'mine' || (B.id === 'heroes' && (n.z || 0) < -30 && (m.z || 0) < -30)) { // rails de mine / de métro
      const k = Math.max(2, Math.round(L / 0.5));
      for (let i = 0; i <= k; i++) { const p = a.clone().lerp(b, i / k); sleepers.push({ x: p.x, y: p.y + 0.05, z: p.z, ry: yaw, rx: pitch }); }
      [-0.38, 0.38].forEach((off) => { const r = mesh(new THREE.BoxGeometry(0.07, 0.08, L), std('#a8a29e', { metalness: 0.8, roughness: 0.3 }), false, true); r.position.copy(mid); r.position.x += Math.cos(yaw) * off; r.position.z -= Math.sin(yaw) * off; r.position.y += 0.14; r.lookAt(b.x + Math.cos(yaw) * off, b.y + 0.14, b.z - Math.sin(yaw) * off); root.add(r); });
    } else { // chemin de terre (jungle) ou trottoir (ville)
      const wh = n.when || m.when;
      [[1.35, 0.04, edgeMat, 0], [1.05, 0.06, pathMat, 0]].forEach(([w, h, mat, dy]) => {
        const mt = busArea >= 0 && n.area === busArea && m.area === busArea && dy === 0 && mat === pathMat ? std('#facc15', { roughness: 0.8 }) : wh ? new THREE.MeshStandardMaterial({ color: wh === 'nuit' ? '#67e8f9' : '#86efac', emissive: new THREE.Color(wh === 'nuit' ? '#22d3ee' : '#16a34a'), emissiveIntensity: wh === 'nuit' ? 0.9 : 0.15, transparent: true, roughness: 0.6 }) : mat;
        const p = mesh(new THREE.BoxGeometry(w, h, L + 0.4), mt, false, true);
        p.position.copy(mid); p.position.y += h / 2 + dy; p.lookAt(b.x, b.y + h / 2 + dy, b.z); root.add(p);
        if (wh) { p.userData.when = wh; whenMeshes.push(p); }
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
  const pillarMat = std(B.id === 'pirate' || B.id === 'recif' || B.id === 'jurassic' ? '#7c5a3a' : '#78716c');
  B.nodes.forEach((n) => { const gy = ZN.length ? zoneLv(n.x, n.y) * FLOOR_H : 0; const v = toV(n.x, n.y, 0); const h = (n.z || 0) / U - gy + (env.water ? 1.5 : 0); if (h < 0.3 || env.space) return; if (!(n.stairs || n.bridge) && !(ZN.length && h > 1)) return; const p = mesh(new THREE.CylinderGeometry(0.22, 0.28, h, 10), pillarMat); p.position.set(v.x, (n.z || 0) / U - h / 2 + 0.1, v.z); root.add(p); });
  // Rambardes de corde le long des ponts
  const ropeMat = std('#d6b98a'), postMat = std('#6b4a2b');
  B.nodes.forEach((n) => n.next.forEach((id) => {
    const m = B.nodes[id]; if (!(n.bridge || m.bridge) || ((n.z || 0) < 8 && (m.z || 0) < 8)) return;
    const a = toV(n.x, n.y, n.z || 0), b = toV(m.x, m.y, m.z || 0), d = b.clone().sub(a); d.y = 0; d.normalize(); const side = new THREE.Vector3(-d.z, 0, d.x);
    [-0.78, 0.78].forEach((o) => {
      const pa = a.clone().addScaledVector(side, o), pb = b.clone().addScaledVector(side, o);
      [pa, pb].forEach((pp) => { const post = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), postMat); post.position.set(pp.x, pp.y + 0.5, pp.z); root.add(post); });
      const ra = pa.clone(), rb = pb.clone(); ra.y += 0.8; rb.y += 0.8;
      const rope = mesh(new THREE.CylinderGeometry(0.035, 0.035, ra.distanceTo(rb), 6), ropeMat); rope.position.copy(ra).add(rb).multiplyScalar(0.5); rope.lookAt(rb); rope.rotateX(Math.PI / 2); root.add(rope);
    });
  }));

  // Navires (Pirates) : les parcours de bateau en bateau sont posés sur de vrais ponts de navire
  (B.ships || []).forEach((S0, i) => {
    const c = toV(S0.cx, S0.cy), L0 = S0.rx / U * 2.5, W0 = S0.ry / U * 2.6, deck = S0.z / U;
    const ship = new THREE.Group(), wood = std('#7c4a21', { roughness: 0.8 }), dark = std('#5b3412');
    const hull = mesh(roundedBox(L0, deck + 1.2, W0, 0.3), wood, true, true); hull.position.y = (deck - 1.2) / 2 + 0.02; ship.add(hull);
    const prow = mesh(new THREE.ConeGeometry(W0 / 2, 2.2, 4), wood); prow.rotation.z = -Math.PI / 2; prow.rotation.x = Math.PI / 4; prow.scale.set(1, 1, 0.75); prow.position.set(L0 / 2 + 0.9, deck - 0.5, 0); ship.add(prow);
    const top = mesh(new THREE.BoxGeometry(L0 - 0.2, 0.12, W0 - 0.2), std('#d6b07a')); top.position.y = deck - 0.04; ship.add(top);
    const stripe = mesh(new THREE.BoxGeometry(L0 + 0.02, 0.18, W0 + 0.02), std(['#dc2626', '#1d4ed8', '#16a34a', '#facc15', '#7c3aed'][i % 5])); stripe.position.y = deck - 0.45; ship.add(stripe);
    const mast = mesh(new THREE.CylinderGeometry(0.12, 0.15, 6, 10), dark); mast.position.set(-L0 * 0.15, deck + 3, -W0 * 0.38); ship.add(mast);
    const sail = mesh(new THREE.PlaneGeometry(2.6, 2.8, 4, 4), std('#f5f0e6', { side: THREE.DoubleSide })); const sp = sail.geometry.attributes.position; for (let k = 0; k < sp.count; k++) sp.setZ(k, Math.sin((sp.getY(k) + 1.4) / 2.8 * Math.PI) * 0.35); sail.geometry.computeVertexNormals(); sail.position.set(-L0 * 0.15, deck + 3.4, -W0 * 0.38 + 0.2); ship.add(sail);
    const flag = mesh(new THREE.PlaneGeometry(0.9, 0.55), std('#111827', { side: THREE.DoubleSide })); flag.position.set(-L0 * 0.15 + 0.5, deck + 6.1, -W0 * 0.38); ship.add(flag);
    ship.position.set(c.x, 0, c.z); ship.rotation.y = Math.atan2(-(S0.cy - B.H / 2), S0.cx - B.W / 2) * 0 ; ship.traverse((o) => { if (o.isMesh) o.castShadow = true; }); root.add(ship);
  });
  // Rivière (Jurassique) : un cours d'eau qui serpente sous les ponts
  if (B.river) {
    const rp = B.river.map(([x, y]) => toV(x, y)); const wR = 1.9;
    const pos2 = [], idx = [];
    rp.forEach((p0, i) => { const a = rp[Math.max(0, i - 1)], b = rp[Math.min(rp.length - 1, i + 1)]; const d = b.clone().sub(a); d.y = 0; d.normalize(); const sd = new THREE.Vector3(-d.z, 0, d.x); [-1, 1].forEach((k) => { const q = p0.clone().addScaledVector(sd, k * wR); pos2.push(q.x, -0.18, q.z); }); if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); } });
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3)); rg.setIndex(idx); rg.computeVertexNormals();
    const river = new THREE.Mesh(rg, new THREE.MeshPhysicalMaterial({ color: '#2b9bd1', roughness: 0.15, transparent: true, opacity: 0.85, clearcoat: 0.6, side: THREE.DoubleSide, envMapIntensity: 0.5 })); root.add(river);
    // Petits ponts de pierre là où un chemin au sol traverse la rivière
    const segX = (p1, p2, p3, p4) => { const d = (p2.x - p1.x) * (p4.z - p3.z) - (p2.z - p1.z) * (p4.x - p3.x); if (Math.abs(d) < 1e-6) return null; const t = ((p3.x - p1.x) * (p4.z - p3.z) - (p3.z - p1.z) * (p4.x - p3.x)) / d, u = ((p3.x - p1.x) * (p2.z - p1.z) - (p3.z - p1.z) * (p2.x - p1.x)) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null; };
    const brM = std('#cbb38a', { roughness: 0.9 }), brS = std('#a8906a', { roughness: 0.95 });
    B.nodes.forEach((n) => n.next.forEach((id) => { const m = B.nodes[id]; if ((n.z || 0) > 4 || (m.z || 0) > 4) return; const A = toV(n.x, n.y, 0), C = toV(m.x, m.y, 0); for (let k = 1; k < rp.length; k++) { const t = segX(A, C, rp[k - 1], rp[k]); if (t === null) continue; const P = A.clone().lerp(C, t), dir = C.clone().sub(A); dir.y = 0; const ang = Math.atan2(dir.x, dir.z); const g = new THREE.Group(); const deck = mesh(new THREE.BoxGeometry(1.5, 0.22, 2 * wR + 1.4), brM, true, true); deck.position.y = 0.06; g.add(deck); [-0.8, 0.8].forEach((x) => { const pr = mesh(new THREE.BoxGeometry(0.16, 0.35, 2 * wR + 1.2), brS); pr.position.set(x, 0.3, 0); g.add(pr); }); [-1, 1].forEach((k2) => { const arch = mesh(new THREE.BoxGeometry(1.3, 0.5, 0.4), brS); arch.position.set(0, -0.2, k2 * (wR - 0.2)); g.add(arch); }); g.position.set(P.x, 0, P.z); g.rotation.y = ang; root.add(g); } }));
    for (let i = 0; i < 26; i++) { const t2 = R() * (rp.length - 1), k0 = Math.floor(t2), p1 = rp[k0].clone().lerp(rp[Math.min(rp.length - 1, k0 + 1)], t2 - k0); const rk = rock(R, '#7c8a8f'); rk.scale.setScalar(0.5 + R() * 0.5); rk.position.set(p1.x + (R() < 0.5 ? -1 : 1) * (wR + 0.2), -0.1, p1.z); root.add(rk); }
  }
  // ===== Zones à étages (bâtiments, terrasses, tranchées, fosses) : niveaux -2 à 3 =====
  if (ZN.length) {
    const FH = FLOOR_H;
    const wallTex = (z) => { if (B.id === 'egypte') { const t = sandBlockTex.clone(); t.needsUpdate = true; return t; } if (B.id === 'heroes' && z.level > 0) { const t = canvasTex(256, 128, (g2, w2, h2) => { g2.fillStyle = '#475569'; g2.fillRect(0, 0, w2, h2); for (let yy = 10; yy < h2; yy += 32) for (let xx = 8; xx < w2; xx += 26) { g2.fillStyle = Math.random() < 0.55 ? '#fde68a' : '#1e293b'; g2.fillRect(xx, yy, 15, 20); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; } const [s1, s2] = STONE[B.id] || ['#a8a29e', '#78716c']; const t = stoneTex(z.level < 0 ? shade(s1, -0.12).getStyle() : s1, z.level < 0 ? shade(s2, -0.15).getStyle() : s2); return t; };
    const topCol = (z) => B.id === 'heroes' ? '#64748b' : B.id === 'egypte' ? '#e2c79b' : (STONE[B.id] && STONE[B.id][2]) || B.floorColor;
    ZN.forEach((z, zi) => {
      const pts = z.poly.map(([x, y]) => toV(x, y));
      // murs : chaque bout de bord va du niveau de la zone jusqu'au niveau du sol juste à côté
      const pos2 = [], uv2 = [], idx2 = []; let run = 0;
      for (let i = 0; i < z.poly.length; i++) {
        const A = z.poly[i], Bq = z.poly[(i + 1) % z.poly.length];
        const len = Math.hypot(Bq[0] - A[0], Bq[1] - A[1]), k = Math.max(1, Math.ceil(len / 36));
        for (let j = 0; j < k; j++) {
          const p0 = [A[0] + (Bq[0] - A[0]) * j / k, A[1] + (Bq[1] - A[1]) * j / k], p1 = [A[0] + (Bq[0] - A[0]) * (j + 1) / k, A[1] + (Bq[1] - A[1]) * (j + 1) / k];
          const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0], nl = Math.hypot(nx, ny) || 1;
          const o1 = [mx + nx / nl * 8, my + ny / nl * 8], o2 = [mx - nx / nl * 8, my - ny / nl * 8];
          const out = inPoly(o1[0], o1[1], z.poly) ? o2 : o1;
          const lvOut = zoneLv(out[0], out[1], zi);
          const y0 = Math.min(lvOut, z.level) * FH, y1 = Math.max(lvOut, z.level) * FH;
          if (y1 - y0 < 0.05) { run += Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / U; continue; }
          const v0 = toV(p0[0], p0[1]), v1 = toV(p1[0], p1[1]), b = pos2.length / 3, seg = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / U;
          pos2.push(v0.x, y0, v0.z, v1.x, y0, v1.z, v1.x, y1, v1.z, v0.x, y1, v0.z);
          uv2.push(run / 3, y0 / 3, (run + seg) / 3, y0 / 3, (run + seg) / 3, y1 / 3, run / 3, y1 / 3); run += seg;
          idx2.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
      }
      if (pos2.length) { const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv2, 2)); g2.setIndex(idx2); g2.computeVertexNormals(); const t = wallTex(z); t.repeat.set(1, 1); const wm = mesh(g2, std('#fff', { map: t, bumpMap: B.id === 'heroes' ? null : t, bumpScale: 2, roughness: 0.9, side: THREE.DoubleSide, emissive: B.id === 'heroes' && z.level > 0 ? new THREE.Color('#fde68a') : new THREE.Color('#000'), emissiveMap: B.id === 'heroes' && z.level > 0 ? t : null, emissiveIntensity: 0.5 }), true, true); root.add(wm); }
      if (z.level > 0) { // dessus de la zone (toit, terrasse, plateau)
        const sh = new THREE.Shape(pts.map((v) => new THREE.Vector2(v.x, -v.z)));
        const cg = new THREE.ShapeGeometry(sh); cg.rotateX(-Math.PI / 2);
        const cap = mesh(cg, std(topCol(z), { roughness: 0.9 }), false, true); cap.position.y = z.level * FH + 0.005; root.add(cap);
        // rebord
        const rim = []; pts.forEach((v) => rim.push(new THREE.Vector3(v.x, z.level * FH + 0.12, v.z)));
        const rimG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true, 'catmullrom', 0.05), pts.length * 8, 0.14, 6, true);
        root.add(mesh(rimG, std(B.id === 'heroes' ? '#94a3b8' : shade(topCol(z), -0.12).getStyle(), { roughness: 0.8 })));
        if (B.id === 'heroes') { const cxz = pts.reduce((s2, v) => s2.add(v), new THREE.Vector3()).multiplyScalar(1 / pts.length); if (z.kind === 'tower' && !(B.props || []).some((pr) => pr.kind === 'helipad')) { const ant = mesh(new THREE.CylinderGeometry(0.06, 0.1, 4, 8), std('#cbd5e1', { metalness: 0.7 })); ant.position.set(cxz.x, z.level * FH + 2, cxz.z); root.add(ant); const tip = sphere(0.18, new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: new THREE.Color('#ef4444'), emissiveIntensity: 2 })); tip.position.set(cxz.x, z.level * FH + 4.1, cxz.z); root.add(tip); } }
      }
    });
    // Rambardes des passerelles et ponts qui passent au-dessus du vide
    const railM = std(B.id === 'heroes' ? '#cbd5e1' : '#a8916c', { metalness: B.id === 'heroes' ? 0.5 : 0 });
    B.nodes.forEach((n) => n.next.forEach((id) => { const m = B.nodes[id]; const mx = (n.x + m.x) / 2, my = (n.y + m.y) / 2, gy = zoneLv(mx, my) * FH, py2 = ((n.z || 0) + (m.z || 0)) / 2 / U; if (py2 - gy < 1.1) return;
      const a = toV(n.x, n.y, n.z || 0), b = toV(m.x, m.y, m.z || 0), d = b.clone().sub(a), L = d.length(); const mid = a.clone().add(b).multiplyScalar(0.5); const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
      [-0.72, 0.72].forEach((o) => { const r = mesh(new THREE.BoxGeometry(0.08, 0.35, L + 0.2), railM); r.position.copy(mid).addScaledVector(side, o); r.position.y += 0.3; r.lookAt(b.clone().addScaledVector(side, o).setY(b.y + 0.3)); root.add(r); });
      const beam = mesh(new THREE.BoxGeometry(1.2, 0.3, L + 0.2), railM); beam.position.copy(mid); beam.position.y -= 0.12; beam.lookAt(b.x, b.y - 0.12, b.z); root.add(beam);
    }));
  }
  // Étages : falaises en pierres empilées, herbe qui déborde, fleurs
  const flowerSpots = [];
  B.platforms.forEach((pf) => {
    const c = toV(pf.cx, pf.cy);
    const [c1, c2, grass] = STONE[B.id];
    const tex = stoneTex(c1, c2); tex.repeat.set(Math.round((pf.rx + pf.ry) / U / 1.6), 1.6);
    const wallMat = std('#fff', { map: tex, bumpMap: tex, bumpScale: 2.5, roughness: 0.9 });
    const topCol = grass || { heroes: '#5b6185', mine: '#6b5a47' }[B.id] || B.floorColor;
    const topMat = std(topCol, { roughness: 0.85 });
    if (B.id === 'heroes') { // toits d'immeubles
      const winT = canvasTex(256, 128, (g2, w2, h2) => { g2.fillStyle = '#334155'; g2.fillRect(0, 0, w2, h2); for (let yy = 8; yy < h2; yy += 30) for (let xx = 6; xx < w2; xx += 24) { g2.fillStyle = Math.random() < 0.55 ? '#fde68a' : '#1e293b'; g2.fillRect(xx, yy, 14, 18); } });
      winT.wrapS = THREE.RepeatWrapping; winT.repeat.set(Math.round(pf.rx / U / 2), 1);
      const bw = pf.rx / U * 2 * 0.86, bd = pf.ry / U * 2 * 0.86;
      const FH = FLOOR_H * (pf.level || 1); const bld = mesh(new THREE.BoxGeometry(bw, FH, bd), [std('#fff', { map: winT, emissive: new THREE.Color('#fde68a'), emissiveMap: winT, emissiveIntensity: 0.6 }), std('#fff', { map: winT, emissive: new THREE.Color('#fde68a'), emissiveMap: winT, emissiveIntensity: 0.6 }), std('#64748b'), std('#475569'), std('#fff', { map: winT, emissive: new THREE.Color('#fde68a'), emissiveMap: winT, emissiveIntensity: 0.6 }), std('#fff', { map: winT, emissive: new THREE.Color('#fde68a'), emissiveMap: winT, emissiveIntensity: 0.6 })], true, true);
      bld.position.set(c.x, FH / 2, c.z); root.add(bld);
      const parapet = mesh(new THREE.BoxGeometry(bw + 0.2, 0.3, bd + 0.2), std('#94a3b8')); parapet.position.set(c.x, FH + 0.05, c.z); root.add(parapet);
      [[0.35, 0.3], [-0.3, -0.25]].forEach(([fx, fz]) => { const ac = mesh(roundedBox(0.9, 0.6, 0.7, 0.08), std('#cbd5e1', { metalness: 0.5 })); ac.position.set(c.x + fx * bw * 0.8, FH + 0.35, c.z + fz * bd * 0.8); root.add(ac); });
      const hp = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 24), std('#facc15')); hp.position.set(c.x - bw * 0.3, FH + 0.06, c.z + bd * 0.28); root.add(hp);
      flowerSpots.push(pf);
      return;
    }
    const PH = FLOOR_H * (pf.level || 1);
    if (B.id === 'egypte') { // terrasses de pyramide : gradins de grosses pierres
      const bw = pf.rx / U * 2, bd = pf.ry / U * 2, nst = 3 * (pf.level || 1), sh = PH / nst;
      for (let k = 0; k < nst; k++) { const sc = 1 + (nst - 1 - k) * 0.035; const t = sandBlockTex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(2, bw / 2), 0.5); const st2 = mesh(new THREE.BoxGeometry(bw * sc, sh, bd * sc), [std('#fff', { map: t, bumpMap: t, bumpScale: 1.5, roughness: 0.95 }), std('#fff', { map: t, bumpMap: t, bumpScale: 1.5, roughness: 0.95 }), std('#d9bd8c', { roughness: 0.95 }), std('#d9bd8c'), std('#fff', { map: t, bumpMap: t, bumpScale: 1.5, roughness: 0.95 }), std('#fff', { map: t, bumpMap: t, bumpScale: 1.5, roughness: 0.95 })], true, true); st2.position.set(c.x, sh / 2 + k * sh - 0.02, c.z); root.add(st2); }
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([fx, fz]) => { const ob = mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), std('#e2c38f')); ob.position.set(c.x + fx * bw * 0.48, PH + 0.6, c.z + fz * bd * 0.48); root.add(ob); const tp = mesh(new THREE.ConeGeometry(0.4, 0.5, 4), new THREE.MeshPhysicalMaterial({ color: '#fbbf24', metalness: 1, roughness: 0.2 })); tp.rotation.y = Math.PI / 4; tp.position.set(ob.position.x, PH + 1.45, ob.position.z); root.add(tp); });
      return;
    }
    const cyl = mesh(new THREE.CylinderGeometry(1, 1.04, PH, 72, 1), [wallMat, topMat, topMat], true, true);
    cyl.scale.set(pf.rx / U, 1, pf.ry / U); cyl.position.set(c.x, PH / 2 - 0.02, c.z);
    root.add(cyl);
    // couche du dessus qui déborde
    const lip = mesh(new THREE.CylinderGeometry(1.025, 1.025, 0.3, 72), std(shade(topCol, -0.05), { roughness: 0.9 }), true, true);
    lip.scale.set(pf.rx / U, 1, pf.ry / U); lip.position.set(c.x, PH - 0.1, c.z); root.add(lip);
    if (grass) { // gouttes d'herbe sur le rebord
      const drips = []; const n = Math.round((pf.rx + pf.ry) / U * 3.2);
      for (let i = 0; i < n; i++) { const an = (i / n) * Math.PI * 2; const R2 = rng(i * 13 + pf.cx); drips.push({ x: c.x + Math.cos(an) * pf.rx / U * 1.02, y: PH - 0.3 - R2() * 0.15, z: c.z + Math.sin(an) * pf.ry / U * 1.02, s: 0.22 + R2() * 0.16, sv: null }); }
      drips.forEach((d) => (d.sv = [d.s * 1.2, d.s * 1.6, d.s * 1.2]));
      const im = instanced(new THREE.SphereGeometry(1, 10, 8), std(shade(grass, -0.04)), drips); if (im) { im.castShadow = true; root.add(im); }
    } else { // bandeau lumineux (ville) / pierres (mine)
      const pts = []; for (let i = 0; i < 96; i++) { const a = (i / 96) * Math.PI * 2; pts.push(new THREE.Vector3(c.x + Math.cos(a) * pf.rx / U * 1.03, PH - 0.05, c.z + Math.sin(a) * pf.ry / U * 1.03)); }
      const rim = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 192, 0.08, 6, true), new THREE.MeshStandardMaterial({ color: B.id === 'heroes' ? '#a78bfa' : '#fbbf24', emissive: new THREE.Color(B.id === 'heroes' ? '#8b5cf6' : '#f59e0b'), emissiveIntensity: 1.4 }), false); root.add(rim);
    }
    flowerSpots.push(pf);
  });

  // Cases : disque brillant posé dans un anneau blanc
  const tileMeshes = [], npcModels = [];
  const ringGeo = new THREE.CylinderGeometry(1.0, 1.04, 0.12, 48);
  const ringMat = toy('#ffffff', { roughness: 0.3 });
  const discGeo = new THREE.CylinderGeometry(0.82, 0.82, 0.16, 48);
  B.nodes.forEach((n) => {
    const v = toV(n.x, n.y, n.z || 0);
    const base = B.id === 'pirate' || B.id === 'mine' || B.id === 'recif' ? 0.16 : 0.08;
    const r = mesh(ringGeo, ringMat, true, true); r.position.set(v.x, v.y + base + 0.06, v.z); root.add(r);
    const t = mesh(discGeo, tileMaterials(n.t, B, n.npc), false, true); t.position.set(v.x, v.y + base + 0.09, v.z); root.add(t);
    t.userData.node = n.id; r.userData.node = n.id; tileMeshes.push(t, r);
    if (n.t === 'npc' && n.npc) { const nm = npcModel(n.npc); const nx = n.next[0] != null ? B.nodes[n.next[0]] : n; const dv = toV(nx.x, nx.y, nx.z || 0).sub(v); dv.y = 0; dv.normalize(); const side = new THREE.Vector3(-dv.z, 0, dv.x); nm.position.copy(v).addScaledVector(side, 1.7); nm.position.y = v.y + 0.05; nm.userData.npc = n.npc; nm.userData.baseY = nm.position.y; root.add(nm); npcModels.push(nm); }
    if (n.when) [t, r].forEach((o) => { o.material = Array.isArray(o.material) ? o.material.map((mm) => { const c2 = mm.clone(); c2.transparent = true; return c2; }) : Object.assign(o.material.clone(), { transparent: true }); o.userData.when = n.when; whenMeshes.push(o); });
    if (n.sand) { [t, r].forEach((o) => { o.userData.y0 = o.position.y; sandMeshes.push(o); }); }
  });
  // Flèches peintes au sol aux embranchements
  B.nodes.filter((n) => n.next.length > 1).forEach((n) => n.next.forEach((id) => {
    const m = B.nodes[id]; const a = toV(n.x, n.y, n.z || 0), b = toV(m.x, m.y, m.z || 0);
    const d = b.clone().sub(a); d.y = 0; d.normalize();
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ map: arrowTex, transparent: true, depthWrite: false, roughness: 0.8 }));
    pl.rotation.x = -Math.PI / 2; pl.rotation.z = Math.atan2(d.x, d.z) + Math.PI;
    pl.position.set(a.x + d.x * 1.75, a.y + (B.id === 'pirate' || B.id === 'recif' ? 0.2 : 0.11), a.z + d.z * 1.75); root.add(pl);
  }));

  // Décor
  const dyn = [];
  const insidePf = (x, y) => B.platforms.some((pf) => Math.pow((x - pf.cx) / pf.rx, 2) + Math.pow((y - pf.cy) / pf.ry, 2) < 1);
  const distPath = (x, y) => { let d = 1e9; B.nodes.forEach((n) => { d = Math.min(d, Math.hypot(n.x - x, n.y - y)); n.next.forEach((id) => { const m = B.nodes[id]; const dx = m.x - n.x, dy = m.y - n.y, L = dx * dx + dy * dy || 1; let t = ((x - n.x) * dx + (y - n.y) * dy) / L; t = Math.max(0, Math.min(1, t)); d = Math.min(d, Math.hypot(n.x + dx * t - x, n.y + dy * t - y)); }); }); return d; };
  const BIG = { '🌋': 110, '🏙️': 85, '🏢': 85, '🌃': 85, '🌴': 55, '🏝️': 55, '⛵': 70, '⛏️': 55, '🪵': 55, '💰': 55, '🦕': 95, '🛸': 50 };
  // Occupation du sol : chaque élément réserve sa place (pas de décor qui se chevauche)
  const occ = [];
  const freeAt = (x, y, r) => !occ.some((o) => Math.hypot(o.x - x, o.y - y) < (o.r + r) * 0.9);
  const takeAt = (x, y, r) => occ.push({ x, y, r });
  if (B.river) B.river.forEach(([x, y], i) => { if (i) { const [x0, y0] = B.river[i - 1]; for (let k = 0; k <= 4; k++) takeAt(x0 + (x - x0) * k / 4, y0 + (y - y0) * k / 4, 46); } }); // pas de décor dans la rivière
  (B.ships || []).forEach((S0) => takeAt(S0.cx, S0.cy, S0.rx * 1.4));
  (B.moats || []).forEach((mo) => { // château : douves, remparts, tours de garde aux portes
    for (let yy = mo.cy - mo.ry * 1.6; yy <= mo.cy + mo.ry * 1.6; yy += 28) for (let xx = mo.cx - mo.rx * 1.6; xx <= mo.cx + mo.rx * 1.6; xx += 28) if (Math.pow((xx - mo.cx) / (mo.rx * 1.6), 2) + Math.pow((yy - mo.cy) / (mo.ry * 1.6), 2) < 1) takeAt(xx, yy, 20);
    const v = toV(mo.cx, mo.cy), sx = mo.rx / U, sz = mo.ry / U;
    const up = B.nodes.some((n) => n.area === mo.area && (n.z || 0) > 20), baseY = up ? FLOOR_H : 0;
    const wat = mesh(new THREE.RingGeometry(1.3, 1.55, 96), new THREE.MeshPhysicalMaterial({ color: '#1e6f8f', roughness: 0.08, clearcoat: 1, polygonOffset: true, polygonOffsetFactor: -2 }), false, true);
    wat.rotation.x = -Math.PI / 2; wat.scale.set(sx, sz, 1); wat.position.set(v.x, 0.08, v.z); root.add(wat);
    if (!up) { const pav = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#a8a29e'; c.fillRect(0, 0, w, h); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const q = 150 + Math.floor(Math.random() * 40); c.fillStyle = 'rgb(' + q + ',' + (q - 4) + ',' + (q - 8) + ')'; c.fillRect(x * 16 + 1, y * 16 + 1, 14, 14); } }); pav.wrapS = pav.wrapT = THREE.RepeatWrapping; pav.repeat.set(sx, sz); const fl = mesh(new THREE.CircleGeometry(1.21, 72), std('#fff', { map: pav, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }), false, true); fl.rotation.x = -Math.PI / 2; fl.scale.set(sx, sz, 1); fl.position.set(v.x, 0.09, v.z); root.add(fl); }
    // portes : là où un chemin traverse les remparts
    const gaps = [];
    B.nodes.forEach((n) => n.next.forEach((id) => { const m = B.nodes[id]; if ((n.area === mo.area) === (m.area === mo.area)) return; const a = Math.atan2(((n.y + m.y) / 2 - mo.cy) / mo.ry, ((n.x + m.x) / 2 - mo.cx) / mo.rx); gaps.push(a); }));
    const cm = castleStone(), WR = up ? 0.96 : 1.2, WH = 1.6, NS = 64;
    const P = (a, k = WR) => new THREE.Vector3(v.x + Math.cos(a) * sx * k, 0, v.z + Math.sin(a) * sz * k);
    const angGap = (a) => gaps.some((g2) => Math.abs(Math.atan2(Math.sin(a - g2), Math.cos(a - g2))) < 0.2);
    for (let i = 0; i < NS; i++) { const a0 = i / NS * Math.PI * 2, a1 = (i + 1) / NS * Math.PI * 2, am = (a0 + a1) / 2; if (angGap(am)) continue; const p0 = P(a0), p1 = P(a1), len = p0.distanceTo(p1) + 0.05; const w = mesh(new THREE.BoxGeometry(len, WH, 0.45), cm, true, true); w.position.set((p0.x + p1.x) / 2, baseY + WH / 2, (p0.z + p1.z) / 2); w.rotation.y = -Math.atan2(p1.z - p0.z, p1.x - p0.x); root.add(w); if (i % 2 === 0) { const c = mesh(new THREE.BoxGeometry(len * 0.5, 0.35, 0.5), cm); c.position.set(w.position.x, baseY + WH + 0.17, w.position.z); c.rotation.y = w.rotation.y; root.add(c); } }
    gaps.forEach((g2, gi) => [-0.24, 0.24].forEach((d) => { const t = tower(0.55, WH + 1.4, cm, gi % 2 ? '#1d4ed8' : '#b91c1c'); const q = P(g2 + d); t.position.set(q.x, baseY, q.z); root.add(t); }));
    [0.25, 1.85, 3.4, 4.95].forEach((a) => { if (angGap(a)) return; const t = tower(0.8, WH + 2.2, cm, null); const q = P(a); t.position.set(q.x, baseY, q.z); root.add(t); });
  });
  (B.lakes || []).forEach((lk) => { // lac gelé : glace avec fissures, rien ne pousse dessus
    for (let yy = lk.cy - lk.ry * 1.2; yy <= lk.cy + lk.ry * 1.2; yy += 30) for (let xx = lk.cx - lk.rx * 1.2; xx <= lk.cx + lk.rx * 1.2; xx += 30) if (Math.pow((xx - lk.cx) / (lk.rx * 1.2), 2) + Math.pow((yy - lk.cy) / (lk.ry * 1.2), 2) < 1) takeAt(xx, yy, 22);
    const it = canvasTex(512, 512, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, '#0e7490'); gr.addColorStop(0.6, '#38bdf8'); gr.addColorStop(1, '#bae6fd'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 2; for (let i = 0; i < 18; i++) { let x = Math.random() * w, y = Math.random() * h; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90; c.lineTo(x, y); } c.stroke(); } });
    const v = toV(lk.cx, lk.cy);
    const ice = mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshPhysicalMaterial({ map: it, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, polygonOffset: true, polygonOffsetFactor: -2 }), false, true);
    ice.rotation.x = -Math.PI / 2; ice.scale.set(lk.rx / U * 1.22, lk.ry / U * 1.22, 1); ice.position.set(v.x, 0.035, v.z); root.add(ice);
    const bank = mesh(new THREE.TorusGeometry(1, 0.035, 8, 64), std('#f8fafc'), false, true); bank.rotation.x = Math.PI / 2; bank.scale.set(lk.rx / U * 1.24, lk.ry / U * 1.24, 3); bank.position.set(v.x, 0.03, v.z); root.add(bank);
  });
  const place = (e, x, y, s) => {
    R.tall = y < B.H * 0.75 && (x < 40 || x > B.W - 40 || y < 40); // grands immeubles seulement au fond et sur les côtés
    if (insidePf(x, y)) return;
    if (ZN.length && (zoneLv(x, y) !== 0 || zoneEdge(x, y) < 45)) return;
    if (['🌊', '🐠', '🦈'].includes(e)) return; // créatures marines : pas sur la terre ferme
    if (isl.length && islD(x / U - cx, y / U - cz) > 0.8) return; // îlots : rien dans l'eau
    if (distPath(x, y) < (BIG[e] || 32)) return;
    let m = decorModel(e, R, B.id);
    const v = toV(x, y);
    const groundY = 0;
    if (!m) return;
    let k = Math.min(2.1, s / 22) * (e === '🌋' ? 0.8 : 1) * (R.scaleMul || 1);
    if (m.userData.hover) k *= 0.6;
    const rad = (BIG[e] ? BIG[e] * 0.35 : 16) * k;
    if (!m.userData.hover && !freeAt(x, y, rad)) return;
    if (!m.userData.hover) takeAt(x, y, rad);
    m.scale.setScalar(k); m.position.set(v.x, groundY + (m.position.y || 0) * k, v.z); m.rotation.y = R() * Math.PI * 2; m.userData.baseY = m.position.y;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    root.add(m);
    if (m.userData.sway || m.userData.smoke || m.userData.bob || m.userData.flicker || m.userData.hover || m.userData.dinoHead || m.userData.wingsOf || m.userData.rotor || m.userData.wings) dyn.push(m);
  };
  R.scaleMul = 0.65; // sur le plateau : décor plus petit pour ne pas cacher le jeu
  B.decor.forEach((d) => place(d.e, d.x, d.y, d.s));
  R.scaleMul = 1;
  // Bordure de décor autour du plateau (comme un monde de Mario Party)
  const ring = { jurassic: ['🌴', '🌿', '🌴', '🪨', '🌋', '🦕', '🥚', '🍎', '🍊', '🫐', '🌿'], pirate: ['🌴', '🌴', '🪨', '🦜', '⚓', '🐚', '🍊', '🌿'], heroes: ['🏢', '🏢', '🏙️', '🚓', '🛸'], recif: ['🌴'], polaire: ['🌲', '🌲', '🌲', '🪨', '🧊'], chevaliers: ['🌳', '🌳', '🌲', '🪨', '🌳'], espace: ['🪨'], atlantide: ['🪸', '🪨', '🪸'], egypte: ['🌴', '🏜️', '🪨', '🌵', '🌴', '🔺'], hante: ['🌳', '🪦', '🎃'], mine: ['🪨', '💎', '🪨', '🕯️', '⛏️', '🦇'] }[B.id];
  for (let i = 0; i < 140; i++) {
    const a = R() * Math.PI * 2, r = 1.05 + R() * 0.9;
    R.scaleMul = 1 + (r - 1) * 1.2; // plus grand quand c'est loin
    const x = B.W / 2 + Math.cos(a) * B.W * 0.55 * r, y = B.H / 2 + Math.sin(a) * B.H * 0.58 * r;
    if (B.id === 'pirate' && Math.hypot((x - B.W / 2) / (B.W * 0.53), (y - B.H / 2) / (B.H * 0.53)) > 0.9) continue;
    if (isl.length) continue; // îlots : pas de décor dans l'eau autour
    if (B.id === 'heroes') R.tall = true;
    place(ring[Math.floor(R() * ring.length)], x, y, 30 + R() * 30);
  }
  R.scaleMul = 1;
  addLandmark(B, root, dyn, R, W, H);
  // ===== Méga City : ascenseurs, panneaux de quartiers, décors spéciaux =====
  if ((B.lifts || []).length) {
    const glass = new THREE.MeshPhysicalMaterial({ color: '#bae6fd', transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1 }), frame = std('#94a3b8', { metalness: 0.7, roughness: 0.3 });
    B.lifts.forEach(([ia, ib]) => {
      const a = B.nodes[ia], b = B.nodes[ib], top = (a.z || 0) > (b.z || 0) ? a : b, bot = top === a ? b : a;
      const v = toV(top.x, top.y), H2 = (top.z || 0) / U + 0.9;
      const shaft = mesh(new THREE.BoxGeometry(1.3, H2, 1.3), glass, false); shaft.position.set(v.x, H2 / 2, v.z); root.add(shaft);
      [[-0.65, -0.65], [0.65, -0.65], [-0.65, 0.65], [0.65, 0.65]].forEach(([dx, dz]) => { const c = mesh(new THREE.BoxGeometry(0.1, H2, 0.1), frame); c.position.set(v.x + dx, H2 / 2, v.z + dz); root.add(c); });
      const cab = mesh(new THREE.BoxGeometry(1.0, 1.1, 1.0), std('#facc15', { roughness: 0.4 })); cab.position.set(v.x, 0.6, v.z); cab.userData.lift = { y0: 0.6, y1: (top.z || 0) / U + 0.6, ph: ia * 0.7 }; root.add(cab); dyn.push(cab);
      const w = toV(bot.x, bot.y, bot.z || 0), d = new THREE.Vector3(v.x - w.x, 0, v.z - w.z), L = d.length();
      if (L > 0.5) { const walk = mesh(new THREE.BoxGeometry(1.0, 0.06, L), std('#cbd5e1'), false, true); walk.position.set((v.x + w.x) / 2, (bot.z || 0) / U + 0.05, (v.z + w.z) / 2); walk.lookAt(v.x, walk.position.y, v.z); root.add(walk); }
      const ic = emojiSprite('🛗', 0.9); ic.position.set(w.x, (bot.z || 0) / U + 1.8, w.z); root.add(ic);
    });
  }
  (B.labels || []).forEach((lb) => {
    const t = canvasTex(1024, 160, (g2, w2, h2) => { g2.font = 'bold 84px Fredoka, Arial, sans-serif'; const tw = g2.measureText(lb.text).width; g2.fillStyle = 'rgba(15,23,42,.72)'; const bw = tw + 90; g2.beginPath(); g2.roundRect((w2 - bw) / 2, 18, bw, 124, 62); g2.fill(); g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillStyle = lb.c || '#fff'; g2.fillText(lb.text, w2 / 2, 84); });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); const v = toV(lb.x, lb.y); sp.position.set(v.x, 9, v.z); sp.scale.set(19, 3, 1); root.add(sp);
  });
  (B.props || []).forEach((pr) => {
    const v = toV(pr.x, pr.y), y0 = (pr.z || 0) / U, g = new THREE.Group(); g.position.set(v.x, y0, v.z);
    if (pr.kind === 'wheel') { // grande roue
      const rim = new THREE.Group(); rim.position.y = 6.2; const steel = std('#e2e8f0', { metalness: 0.6, roughness: 0.3 });
      rim.add(mesh(new THREE.TorusGeometry(5, 0.14, 8, 48), steel)); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const sp2 = mesh(new THREE.CylinderGeometry(0.05, 0.05, 5, 5), steel); sp2.position.set(Math.cos(a) * 2.5, Math.sin(a) * 2.5, 0); sp2.rotation.z = a + Math.PI / 2; rim.add(sp2); const cab = mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), toy(['#ef4444', '#3b82f6', '#facc15', '#22c55e'][i % 4])); cab.position.set(Math.cos(a) * 5, Math.sin(a) * 5 - 0.4, 0); rim.add(cab); }
      [-1, 1].forEach((k) => { const leg = mesh(new THREE.CylinderGeometry(0.12, 0.18, 7, 8), steel); leg.position.set(k * 1.8, 3, 0); leg.rotation.z = k * 0.28; g.add(leg); });
      g.add(rim); g.userData.rotor = rim; g.userData.rotAxis = 'z';
    } else if (pr.kind === 'fountain') {
      const basin = mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.6, 32), std('#cbd5e1')); basin.position.y = 0.3; g.add(basin);
      const wat = mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.1, 32), new THREE.MeshPhysicalMaterial({ color: '#38bdf8', roughness: 0.05, clearcoat: 1 })); wat.position.y = 0.58; g.add(wat);
      const col = mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 12), std('#e2e8f0')); col.position.y = 1.2; g.add(col); const jet = mesh(new THREE.ConeGeometry(0.5, 1.4, 16, 1, true), new THREE.MeshPhysicalMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.6 })); jet.position.y = 2.6; jet.rotation.x = Math.PI; g.add(jet);
    } else if (pr.kind === 'neon') {
      const t = canvasTex(512, 160, (g2, w2, h2) => { g2.fillStyle = '#1e1b4b'; g2.fillRect(0, 0, w2, h2); g2.font = 'bold 110px Fredoka, Arial'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.shadowColor = '#f0abfc'; g2.shadowBlur = 30; g2.fillStyle = '#f9a8d4'; g2.fillText('CASINO', w2 / 2, h2 / 2 + 6); });
      const sign = mesh(new THREE.BoxGeometry(6, 1.9, 0.3), [std('#1e1b4b'), std('#1e1b4b'), std('#1e1b4b'), std('#1e1b4b'), new THREE.MeshStandardMaterial({ map: t, emissive: new THREE.Color('#ffffff'), emissiveMap: t, emissiveIntensity: 1.3 }), std('#1e1b4b')]); sign.position.y = 3 + 1.2; g.add(sign);
      const l = new THREE.PointLight('#f0abfc', 30, 14, 1.6); l.position.y = 4; g.add(l);
    } else if (pr.kind === 'helipad') {
      const t = canvasTex(256, 256, (g2, w2) => { g2.fillStyle = '#334155'; g2.beginPath(); g2.arc(w2 / 2, w2 / 2, w2 / 2 - 4, 0, Math.PI * 2); g2.fill(); g2.strokeStyle = '#facc15'; g2.lineWidth = 12; g2.stroke(); g2.fillStyle = '#fff'; g2.font = 'bold 150px Arial'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('H', w2 / 2, w2 / 2 + 8); });
      const pad = mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.08, 32), [std('#334155'), new THREE.MeshStandardMaterial({ map: t }), std('#334155')], false, true); pad.position.y = 0.06; g.add(pad);
    }
    root.add(g); if (g.userData.rotor) dyn.push(g);
  });
  // Jurassique : un grand volcan actif au cœur du plateau (dans le plus grand espace libre)
  let bigVolcano = null;
  if (B.id === 'jurassic') {
    let best = null, bd = 0;
    for (let py = B.H * 0.15; py < B.H * 0.85; py += 20) for (let px = B.W * 0.12; px < B.W * 0.88; px += 20) { if (insidePf(px, py)) continue; const d = distPath(px, py); if (d > bd) { bd = d; best = [px, py]; } }
    if (best && bd > 90) {
      const v = volcano(), k = Math.min(3.4, ((bd - 45) / U) / 2.2), p0 = toV(best[0], best[1]);
      v.scale.setScalar(k); v.position.set(p0.x, -0.05, p0.z); v.traverse((o) => { if (o.isMesh) o.castShadow = true; }); root.add(v); dyn.push(v);
      const glow = new THREE.PointLight('#ff6a00', 40, 18, 1.6); glow.position.set(p0.x, 2.6 * k, p0.z); root.add(glow);
      takeAt(best[0], best[1], bd - 30);
      bigVolcano = { v, k, glow, top: new THREE.Vector3(p0.x, 2.45 * k, p0.z), parts: [] };
    }
  }
  // Manoir Hanté : de vrais lieux dans les grands espaces libres
  const hauntFx = [];
  const PLACES = { hante: [swamp, cemetery, hauntedShack, witchHut, cemetery, well, hauntedShack, well], atlantide: [glassDome, poseidonStatue, shipwreck, giantClam, sunkenColumns, glassDome, sunkenColumns, giantClam], espace: [spaceDome, launchPad, radarDish, crashedUfo, moonBase, radarDish, launchPad], chevaliers: [joustArena, windmill, forge, tents, windmill, tents], polaire: [iglooVillage, iceCastle, fishingSpot, (r) => igloo(r), (r) => igloo(r), fishingSpot], egypte: [(r) => pyramid(r), sphinx, oasis, temple, (r) => pyramid(r), obelisk, oasis, obelisk, obelisk] }[B.id];
  if (PLACES) {
    const want = PLACES;
    const HR = rng(77);
    want.forEach((fn) => {
      const proto = fn(HR); let best = null, bs = 0;
      for (let py = 40; py < B.H - 40; py += 22) for (let px = 40; px < B.W - 40; px += 22) { if (insidePf(px, py)) continue; if (ZN.length && (zoneLv(px, py) !== 0 || zoneEdge(px, py) < proto.r * U * 0.9)) continue; if (isl.length && islD(px / U - cx, py / U - cz) > 0.62) continue; const d = distPath(px, py) - 28; if (d < proto.r * U * 0.6) continue; let free = d; occ.forEach((o) => { free = Math.min(free, Math.hypot(o.x - px, o.y - py) - o.r); }); const sc = Math.min(1.25, (free / U) / proto.r); if (sc > bs) { bs = sc; best = [px, py]; } }
      if (!best || bs < 0.6) return;
      const v0 = toV(best[0], best[1]); proto.g.scale.setScalar(bs); proto.g.position.set(v0.x, islLv(v0.x, v0.z), v0.z);
      proto.g.rotation.y = Math.atan2(-(v0.x), -(v0.z)) + Math.PI; // tourné vers le centre
      proto.g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      root.add(proto.g); takeAt(best[0], best[1], proto.r * U * bs);
      if (proto.g.userData.smoke || proto.g.userData.rotor) dyn.push(proto.g);
      if (proto.g.userData.bubbles) hauntFx.push(proto.g);
      if (B.id === 'hante') for (let i = 0; i < 4; i++) { const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#c7d2fe', transparent: true, opacity: 0.18, depthWrite: false })); mist.scale.set(4 * bs, 1.4 * bs, 1); mist.position.set(v0.x + (HR() - 0.5) * proto.r * bs * 1.6, 0.5, v0.z + (HR() - 0.5) * proto.r * bs * 1.6); mist.userData.mist = { x: mist.position.x, ph: HR() * 6 }; root.add(mist); hauntFx.push(mist); }
    });
  }
  // Remplissage du décor : tout l'espace libre du plateau est occupé
  {
    const KIT = {};
    const kit = (key, make) => (KIT[key] || (KIT[key] = kitFrom(make())));
    const KR = rng(B.W * 3 + 11);
    const T = {
      jurassic: [['tree', 30, 72, () => tree(KR, ['#3f9142', '#4caf50', '#2f855a'][Math.floor(KR() * 3)]), 3], ['bush', 30, 30, () => bush('#3f8f2a'), 3], ['bush2', 20, 30, () => bush('#5cb83a'), 3], ['pine', 10, 85, () => pine('#2f6f3a'), 2], ['rock', 10, 30, () => rock(KR, '#9a8f84'), 3], ['mush', 10, 26, () => mushroom(['#ef4444', '#f97316'][Math.floor(KR() * 2)]), 2], ['apple', 4, 70, () => apple(), 1], ['orange', 3, 70, () => orange(), 1], ['berry', 3, 70, () => berries(), 1], ['egg', 4, 26, () => egg(), 1], ['bone', 4, 26, () => bone(), 1]],
      pirate: [['palm', 22, 90, () => palm(KR), 4], ['bush', 25, 30, () => bush('#4d9a2a'), 3], ['rock', 12, 30, () => rock(KR, '#b8ad9a'), 3], ['crate', 10, 28, () => crate(), 1], ['barrel', 10, 28, () => barrel(), 1], ['shell', 8, 24, () => shell(), 2], ['orange', 3, 70, () => orange(), 1], ['mush', 4, 26, () => mushroom('#ef4444'), 1]],
      heroes: [['planter', 14, 60, () => planter(KR), 3], ['bench', 5, 30, () => bench(), 1], ['hydrant', 4, 26, () => hydrant(), 1], ['car', 7, 50, () => car(KR), 4], ['bush', 8, 30, () => bush('#22c55e'), 2], ['house', 34, 75, () => building(KR, false), 4]],
      atlantide: [['coral', 34, 30, () => coral(KR, Math.floor(KR() * 6)), 6], ['kelp', 20, 40, () => kelp(KR), 3], ['anem', 10, 22, () => anemone(KR), 3], ['shell', 8, 20, () => shell(), 1], ['rock', 12, 26, () => rock(KR, '#7c8a8f'), 3]],
      espace: [['rock', 20, 26, () => rock(KR, '#7c6f8f'), 3], ['crystal', 16, 28, () => crystal(KR), 3], ['aplant', 18, 26, () => alienPlant(KR), 3], ['gshroom', 10, 24, () => glowShroom(KR), 2]],
      chevaliers: [['tree', 30, 72, () => tree(KR, ['#3f9142', '#4caf50', '#2f855a'][Math.floor(KR() * 3)]), 3], ['pine', 10, 80, () => pine('#2f6f3a'), 2], ['bush', 25, 30, () => bush('#3f8f2a'), 3], ['rock', 8, 28, () => rock(KR, '#9a8f84'), 2], ['hay', 8, 24, () => haybale(), 1], ['barrel', 4, 26, () => barrel(), 1], ['apple', 3, 70, () => apple(), 1]],
      polaire: [['spine', 44, 70, () => snowPine(KR), 3], ['rock', 14, 28, () => rock(KR, '#94a3b8'), 3], ['ice', 12, 26, () => iceSpikes(KR), 3], ['sman', 1, 30, () => snowman(KR), 1], ['peng', 2, 24, () => penguin(), 1], ['bush', 8, 26, () => bush('#3f6212'), 2]],
      egypte: [['palm', 18, 60, () => palm(KR), 4], ['rock', 14, 28, () => rock(KR, '#d6a96b'), 3], ['cactus', 12, 30, () => cactus(KR), 3], ['urn', 3, 22, () => urn(), 1], ['papy', 8, 22, () => papyrus(KR), 2], ['bush', 8, 26, () => bush('#7c8f3a'), 2]],
      hante: [['dead', 28, 60, () => deadTree(KR), 3], ['tomb', 8, 22, () => tombstone(KR), 3], ['pump', 8, 20, () => pumpkin(KR), 2], ['fence', 8, 30, () => ironFence(), 1], ['rock', 10, 24, () => rock(KR, '#57534e'), 2], ['bush', 10, 26, () => bush('#365314'), 2]],
      recif: [['palm', 22, 50, () => palm(KR), 4], ['bush', 25, 26, () => bush('#4caf3a'), 3], ['rock', 10, 24, () => rock(KR, '#c9b893'), 3], ['shell', 14, 20, () => shell(), 2], ['orange', 3, 50, () => orange(), 1], ['crate', 4, 24, () => crate(), 1]],
      mine: [['stalag', 30, 58, () => stalag(KR), 3], ['rock', 25, 30, () => rock(KR, '#6b625a'), 3], ['crystal', 18, 30, () => crystal(KR), 3], ['gshroom', 16, 26, () => glowShroom(KR), 2], ['cart', 6, 50, () => minecart(), 1], ['barrel', 6, 28, () => barrel(), 1]],
    }[B.id];
    const tot = T.reduce((a, t) => a + t[1], 0);
    const pick = (d) => { for (let tries = 0; tries < 6; tries++) { let r = KR() * tot; for (const t of T) { r -= t[1]; if (r <= 0) { if (d >= t[2]) return t; break; } } } return null; };
    const step = 34, mesas = [];
    const pfq = (px, py) => { let best = null; B.platforms.forEach((pf) => { const q = Math.pow((px - pf.cx) / pf.rx, 2) + Math.pow((py - pf.cy) / pf.ry, 2); if (q > 0.82 && q < 1.25) best = 1; else if (best !== 1 && q <= 0.82 && (best === null || best < 1)) best = 0; }); return best === null ? 9 : best === 1 ? 1 : 0.5; };
    const pfLv = (px, py) => B.platforms.reduce((m, pf) => Math.pow((px - pf.cx) / pf.rx, 2) + Math.pow((py - pf.cy) / pf.ry, 2) <= 0.82 ? Math.max(m, pf.level || 1) : m, 0);
    for (let py = -140; py < B.H + 140; py += step) for (let px = -140; px < B.W + 140; px += step) {
      const x0 = px + (KR() - 0.5) * step * 0.9, y0 = py + (KR() - 0.5) * step * 0.9;
      const x = x0 / U - cx, z = y0 / U - cz;
      if (B.id === 'pirate' && Math.hypot(x / (W * 0.53), z / (H * 0.53)) > 0.84) continue;
      if (isl.length && islD(x, z) > 0.8) continue;
      const q = pfq(x0, y0); if (q > 0.82 && q < 1.25) continue;
      const zl = ZN.length ? zoneLv(x0, y0) : 0; if (ZN.length && zoneEdge(x0, y0) < 26) continue;
      const onPf = q <= 0.82;
      const d = distPath(x0, y0); if (d < 26) continue;
      // Petits plateaux en falaise (relief) dans les grands espaces vides
      if (!onPf && !zl && d > 130 && B.id !== 'heroes' && KR() < 0.3 && !mesas.some((m) => Math.hypot(m.x - x0, m.y - y0) < m.r + 70)) {
        const r = Math.min(d - 75, 45 + KR() * 45); if (freeAt(x0, y0, r + 8)) { mesas.push({ x: x0, y: y0, r }); takeAt(x0, y0, r + 8); continue; }
      }
      if (KR() < 0.12) continue;
      const t = pick(d); if (!t) continue;
      if ((onPf || zl) && ['car', 'house', 'cart'].includes(t[0])) continue; // pas de voitures ni de maisons sur les toits
      const RK = { dead: 18, tomb: 12, pump: 9, fence: 16, tree: 18, pine: 16, palm: 22, bush: 13, bush2: 13, rock: 12, mush: 8, apple: 14, orange: 14, berry: 13, egg: 8, bone: 10, cactus: 10, urn: 8, spine: 18, hay: 10, aplant: 9, coral: 14, kelp: 12, anem: 9, ice: 11, sman: 10, peng: 7, papy: 7, crate: 11, barrel: 9, shell: 8, planter: 22, bench: 16, hydrant: 7, car: 20, house: 34, stalag: 14, crystal: 10, gshroom: 9, cart: 15 }; // rayon réel des modèles (px)
      const sc0 = t[0] === 'house' ? 0.5 + KR() * 0.25 : t[0] === 'palm' ? 0.75 + KR() * 0.4 : t[0] === 'stalag' ? 0.7 + KR() * 0.5 : t[0] === 'tree' || t[0] === 'pine' ? 1.0 + KR() * 0.8 : 0.8 + KR() * 0.6;
      const sz = sc0 * (d > 110 ? 1.25 : d < 45 ? 0.8 : 1), rad = (RK[t[0]] || 18) * sz;
      if (!freeAt(x0, y0, rad) || d < rad + 10) continue; // pas de chevauchement, ni sur le chemin
      takeAt(x0, y0, rad);
      const k = kit(t[0] + (t[4] > 1 ? Math.floor(KR() * t[4]) : ''), t[3]);
      k.list.push({ x, y: onPf ? FLOOR_H * pfLv(x0, y0) : zl ? zl * FLOOR_H : islLv(x, z), z, s: sz, ry: KR() * Math.PI * 2 });
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
      const onM = [];
      for (let j = 0; j < n; j++) { const t = T[Math.floor(KR() * Math.min(3, T.length))]; const a = KR() * 6.28, rr = KR() * r * 0.6; if (onM.some((q) => Math.hypot(q[0] - Math.cos(a) * rr, q[1] - Math.sin(a) * rr) < 1.4)) continue; onM.push([Math.cos(a) * rr, Math.sin(a) * rr]); kit(t[0] + '0', t[3]).list.push({ x: v.x + Math.cos(a) * rr, y: h, z: v.z + Math.sin(a) * rr, s: 1 + KR() * 0.6, ry: KR() * 6.28 }); }
    });
    flushKits(KIT, root);
  }
  // Fleurs et touffes d'herbe (régions en plein air)
  if (B.id === 'jurassic' || B.id === 'pirate' || B.id === 'recif' || B.id === 'chevaliers') {
    const flowers = [], tufts = [], FC = ['#ef4444', '#fde047', '#ffffff', '#f472b6', '#fb923c', '#a78bfa'];
    const landOK = (x, z) => isl.length ? islD(x, z) < 0.85 : B.id !== 'pirate' || Math.hypot(x / (W * 0.53), z / (H * 0.53)) < 0.86;
    for (let i = 0; i < 1400; i++) {
      const x = (R() - 0.5) * (W + 30), z = (R() - 0.5) * (H + 30);
      if (!landOK(x, z)) continue;
      const px = (x + cx) * U, py = (z + cz) * U;
      const onPf = B.platforms.filter((pf) => Math.pow((px - pf.cx) / pf.rx, 2) + Math.pow((py - pf.cy) / pf.ry, 2) < 0.9).reduce((m, pf) => Math.max(m, pf.level || 1), 0);
      const inPfEdge = B.platforms.some((pf) => { const q = Math.pow((px - pf.cx) / pf.rx, 2) + Math.pow((py - pf.cy) / pf.ry, 2); return q >= 0.9 && q < 1.15; });
      if (inPfEdge || distPath(px, py) < 26 || !freeAt(px, py, 4)) continue;
      if (ZN.length && zoneEdge(px, py) < 20) continue;
      const y = onPf ? FLOOR_H * onPf + 0.05 : ZN.length && zoneLv(px, py) ? zoneLv(px, py) * FLOOR_H + 0.03 : 0.02;
      if (R() < 0.45) flowers.push({ x, y, z, s: 0.7 + R() * 0.6, ry: R() * 6, c: FC[Math.floor(R() * FC.length)] });
      else tufts.push({ x, y, z, s: 0.6 + R() * 0.7, ry: R() * 6 });
    }
    const petal = new THREE.CylinderGeometry(0.17, 0.17, 0.04, 5); petal.translate(0, 0.2, 0);
    const fl = instanced(petal, toy('#fff', { roughness: 0.5 }), flowers, (d) => d.c); if (fl) root.add(fl);
    const ctr = new THREE.SphereGeometry(0.06, 8, 6); ctr.translate(0, 0.23, 0);
    const fc = instanced(ctr, toy('#facc15'), flowers); if (fc) root.add(fc);
    const tg2 = new THREE.ConeGeometry(0.12, 0.45, 4); tg2.translate(0, 0.22, 0);
    const tm = new THREE.Group(); [[0, 0], [0.1, 0.4], [-0.1, -0.4]].forEach(([dx, rz]) => { const im = instanced(tg2, std(B.id === 'jurassic' ? '#3f9a2c' : '#4caf3a'), tufts.map((d) => ({ ...d, x: d.x + dx, rz }))); if (im) tm.add(im); }); root.add(tm);
  }
  // Récif : coraux sous l'eau, poissons et dauphins
  if (env.islands) {
    const CK = {}, ck = (i) => (CK[i] || (CK[i] = kitFrom(coral(rng(500 + i), i))));
    const CR = rng(321);
    for (let i = 0; i < 260; i++) {
      const x = (CR() - 0.5) * (W + 20), z = (CR() - 0.5) * (H + 20), d = islD(x, z);
      if (d < 1.05 || d > 2.6) continue;
      const px = (x + cx) * U, py = (z + cz) * U; if (distPath(px, py) < 24) continue;
      ck(i % 6).list.push({ x, y: Math.min(-0.5, Math.max(-1.6, 0.05 - (d - 0.92) * 1.6) - 0.1), z, s: 0.7 + CR() * 1.0, ry: CR() * 6.28 });
    }
    flushKits(CK, root);
    for (let i = 0; i < 4; i++) { const fin = mesh(new THREE.ConeGeometry(0.3, 0.8, 4), std('#64748b')); fin.scale.z = 0.3; fin.userData.shark = { r: Math.min(W, H) * (0.12 + i * 0.05), ph: CR() * 6, sp: 0.35 + CR() * 0.2 }; root.add(fin); dyn.push(fin); }
  }
  // Nuages
  if (!env.cave && !env.space && !env.underwater && B.id !== 'heroes') for (let i = 0; i < 9; i++) { const c = cloud(R); const a = R() * Math.PI * 2, r = Math.max(W, H) * (0.55 + R() * 0.5); c.position.set(Math.cos(a) * r, 16 + R() * 10, Math.sin(a) * r - 10); c.scale.setScalar(1 + R()); c.userData.cloud = { a, r, sp: 0.004 + R() * 0.006 }; root.add(c); dyn.push(c); }
  if (B.id === 'pirate') for (let i = 0; i < 4; i++) { const b = boat(); const a = R() * Math.PI * 2; b.position.set(Math.cos(a) * (W * 0.62 + 4), -0.3, Math.sin(a) * (H * 0.62 + 4)); b.rotation.y = R() * 6; b.scale.setScalar(1.6); root.add(b); dyn.push(b); }

  if (B.id === 'pirate') for (let i = 0; i < 3; i++) { const fin = mesh(new THREE.ConeGeometry(0.35, 0.9, 4), std('#475569')); fin.scale.z = 0.3; fin.userData.shark = { r: Math.max(W, H) * 0.62 + 3 + i * 2, ph: R() * 6, sp: 0.2 + R() * 0.15 }; root.add(fin); dyn.push(fin); }
  // Créatures volantes
  const flyK = { hante: ['bat', 'bat', 'bat', 'bat'], jurassic: ['ptero', 'ptero', 'bird'], pirate: ['gull', 'gull', 'bird'], recif: ['gull', 'gull', 'gull'], egypte: ['bird', 'bird'], polaire: ['bird', 'gull'], chevaliers: ['bird', 'bird', 'bird'], espace: [], atlantide: ['fish', 'fish', 'fish', 'fish', 'fish'], heroes: ['heli', 'gull'], mine: ['bat', 'bat', 'bat'] }[B.id];
  const flyers = flyK.map((k, i) => { const s = flyerModel(k); s.scale.setScalar(k === 'heli' ? 0.8 : 1.1); s.traverse((o) => { if (o.isMesh) o.castShadow = true; }); root.add(s); return { s, ph: R() * 100, sp: 0.12 + R() * 0.1, r: Math.max(W, H) * (0.3 + R() * 0.25), y: k === 'fish' ? 3 + R() * 4 : 10 + R() * 4, dir: i % 2 ? -1 : 1 }; });
  // Particules (fumée, poussière, lucioles)
  const smoke = [];
  dyn.filter((m) => m.userData.smoke).forEach((v) => { for (let i = 0; i < 5; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: shadowTex, color: '#9ca3af', transparent: true, depthWrite: false })); root.add(s); smoke.push({ s, base: v, ph: i / 5 }); } });
  const sparks = [];
  if (B.id === 'mine' || B.id === 'jurassic' || B.id === 'heroes') for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: B.id === 'jurassic' ? '#d9f99d' : '#fde68a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(0.35); root.add(s); sparks.push({ s, x: (R() - 0.5) * W, z: (R() - 0.5) * H, ph: R() * 6, sp: 0.3 + R() }); }
  // Lumières de la mine
  if (env.cave) dyn.filter((m) => m.userData.flicker).slice(0, 6).forEach((m) => { const l = new THREE.PointLight('#fbbf24', 18, 12, 2); l.position.copy(m.position); l.position.y += 1.6 * m.scale.x; root.add(l); m.userData.light = l; });

  // Lumière qui accompagne la caméra (régions sombres)
  const follow = new THREE.PointLight(env.cave ? '#ffe7b3' : '#e9d5ff', env.cave || env.city ? 70 : 0, 30, 1.4); follow.position.set(0, 7, 4); root.add(follow);
  // Ciel de nuit : étoiles et lune
  const starG = new THREE.BufferGeometry(), sp = [];
  const SR = rng(77); for (let i = 0; i < 700; i++) { const a = SR() * Math.PI * 2, e = 0.12 + SR() * 1.3, r = 190; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
  starG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const skyStars = new THREE.Points(starG, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  root.add(skyStars);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), new THREE.MeshBasicMaterial({ color: '#fef9c3', transparent: true, opacity: 0, fog: false }));
  moon.position.set(60, 95, -150); root.add(moon);
  world = { hauntFx, npcModels, whenMeshes, sandMeshes, sandK: 0, bigVolcano, hemi, env, skyStars, moon, day: { n: 0, d: 0, key: '' }, tileMeshes, follow, key: B.key, B, root, W, H, cx, cz, toV, water, dyn, flyers, smoke, sparks, stars: [], starKey: '', traps: {}, arrows: [], rings: [], sun, labels: {} };
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
    const m = blockModel(b.kind); m.position.lerpVectors(a, c, 0.5); m.position.y += 0.1; m.userData.born = performance.now(); m.userData.baseY = m.position.y; m.scale.setScalar(0.01);
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
  // Direction de chaque chemin : on regarde 2 cases plus loin pour bien distinguer les branches
  const dirs = opts.map((o) => {
    let n = world.B.nodes[o.value]; if (!n) return null;
    const n2 = n.next && n.next.length ? world.B.nodes[n.next[0]] : null;
    const t1 = world.toV(n.x, n.y, n.z || 0), t2 = n2 ? world.toV(n2.x, n2.y, n2.z || 0) : t1;
    const d = t1.clone().sub(from).multiplyScalar(2).add(t2.clone().sub(from)); d.y = 0; d.normalize();
    return { o, a: Math.atan2(d.x, d.z) };
  }).filter(Boolean);
  // Écarte les flèches trop proches (au moins 75°)
  if (dirs.length === 2) {
    let diff = dirs[1].a - dirs[0].a; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    const MIN = THREE.MathUtils.degToRad(75);
    if (Math.abs(diff) < MIN) { const mid = dirs[0].a + diff / 2, sgn = diff >= 0 ? 1 : -1; dirs[0].a = mid - sgn * MIN / 2; dirs[1].a = mid + sgn * MIN / 2; }
  }
  dirs.forEach(({ o, a }) => {
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const g = new THREE.Group();
    const cont = o.label === 'Continuer';
    const mat = new THREE.MeshPhysicalMaterial({ color: cont ? '#facc15' : '#f472b6', emissive: new THREE.Color(cont ? '#a16207' : '#9d174d'), emissiveIntensity: 0.55, clearcoat: 1, roughness: 0.25, depthTest: false, transparent: true });
    const m = mesh(geo, mat, false); m.renderOrder = 20;
    const rim = mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true }), false); rim.scale.set(1.18, 1, 1.18); rim.position.y = -0.05; rim.renderOrder = 19;
    g.add(rim, m);
    g.position.copy(from).add(dir.clone().multiplyScalar(2.7)); g.position.y = from.y + 1.1;
    g.rotation.y = Math.atan2(-dir.x, -dir.z);
    const lbl = pillSprite(o.label, cont ? '#ca8a04' : '#db2777');
    lbl.position.copy(from).add(dir.clone().multiplyScalar(4.1)); lbl.position.y = from.y + 1.9;
    const holder = new THREE.Group(); holder.add(lbl); world.root.add(holder);
    g.userData = { value: o.value, holder, base: g.position.y };
    m.userData.value = o.value; rim.userData.value = o.value;
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

const ENVS = { day: null, night: null };
/* ---------------- Environnement de reflets (rend le métal, le vernis et l'eau plus réalistes) ---------------- */
function makeEnv(renderer, dark) {
  try {
    const es = new THREE.Scene();
    const g = new THREE.SphereGeometry(50, 32, 16), cols = [], pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) { const y = pa.getY(i) / 50; const c = new THREE.Color(dark ? '#1e2240' : '#7d8898').lerp(new THREE.Color(dark ? (y > 0 ? '#2a3366' : '#140f0a') : (y > 0 ? '#b8c8dc' : '#3d3328')), Math.abs(y)); cols.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    es.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    if (!dark) [[0, 40, 0, 26, '#ffffff', 1.6], [-35, 15, 20, 10, '#fff3d6', 1.3], [30, 10, -25, 8, '#dbeafe', 1.0]].forEach(([x, y, z, r, c, k]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) })); m.position.set(x, y, z); es.add(m); });
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(es, 0.04).texture; pm.dispose();
    return tex;
  } catch (e) { return null; }
}

/* ---------------- Illustrations 3D (icônes des cases, objets, dés et cartes) ---------------- */
function dieMesh(col = '#ffffff', pip = '#4c1d95', n = 5) {
  const g = new THREE.Group();
  const b = mesh(roundedBox(1, 1, 1, 0.16), toy(col, { roughness: 0.22, clearcoat: 1 })); g.add(b);
  const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  const pm = toy(pip, { roughness: 0.5 }), pg = new THREE.CylinderGeometry(0.095, 0.08, 0.04, 20);
  const face = (k, place) => P[k].forEach(([u, v]) => { const d = mesh(pg, pm); place(d, u * 0.27, v * 0.27); g.add(d); });
  face(n, (d, u, v) => { d.position.set(u, v, 0.495); d.rotation.x = Math.PI / 2; });
  face(3, (d, u, v) => { d.position.set(0.495, v, u); d.rotation.z = Math.PI / 2; });
  face(2, (d, u, v) => { d.position.set(u, 0.495, v); });
  g.rotation.set(-0.45, 0.6, 0);
  return g;
}
function coinMesh(col = '#facc15') { const g = new THREE.Group(), m = toy(col, { metalness: 0.85, roughness: 0.22 }); const c = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 40), m); c.rotation.x = Math.PI / 2; g.add(c); [-1, 1].forEach((k) => { const rim = mesh(new THREE.TorusGeometry(0.45, 0.045, 8, 40), m); rim.position.z = k * 0.05; g.add(rim); const st = starShapeMesh(col, 0.24); st.scale.set(1, -1, 0.35); st.position.z = k * 0.045; if (k < 0) st.rotation.y = Math.PI; g.add(st); }); return g; }
function starShapeMesh(col = '#facc15', r = 0.6) { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; i ? sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } const m = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.18, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }), toy(col, { metalness: 0.6, roughness: 0.25, emissive: new THREE.Color(col), emissiveIntensity: 0.15 })); m.scale.y = -1; m.rotation.z = Math.PI; return m; }
function giftMesh(box = '#ec4899', rib = '#fde047') { const g = new THREE.Group(), bm = toy(box, { clearcoat: 1, roughness: 0.3 }), rm = toy(rib, { metalness: 0.3, roughness: 0.3, clearcoat: 1 }); const b = mesh(roundedBox(1, 0.8, 1, 0.05), bm); g.add(b); const l = mesh(roundedBox(1.1, 0.2, 1.1, 0.05), bm); l.position.y = 0.45; g.add(l); [[0.18, 1.0, 1.12], [1.12, 1.0, 0.18]].forEach(([x, y, z]) => { const r = mesh(new THREE.BoxGeometry(x, y, z), rm); r.position.y = 0.06; g.add(r); }); [-1, 1].forEach((k) => { const bow = mesh(new THREE.TorusGeometry(0.2, 0.065, 10, 20), rm); bow.scale.set(1, 0.7, 1); bow.position.set(k * 0.19, 0.68, 0); bow.rotation.set(0, k * 0.4, k * 0.5); g.add(bow); const tail = mesh(new THREE.BoxGeometry(0.1, 0.35, 0.03), rm); tail.position.set(k * 0.12, 0.45, 0.58); tail.rotation.z = k * 0.4; g.add(tail); }); const knot = sphere(0.1, rm); knot.position.y = 0.62; g.add(knot); g.rotation.set(0.35, 0.6, 0); return g; }
function arrowMesh(col) { const g = new THREE.Group(); const sh = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 10), toy(col)); sh.rotation.z = Math.PI / 2; g.add(sh); const hd = mesh(new THREE.ConeGeometry(0.24, 0.4, 12), toy(col)); hd.rotation.z = -Math.PI / 2; hd.position.x = 0.55; g.add(hd); return g; }
function iconModel(key, theme) {
  const g = new THREE.Group();
  const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); g.add(m); return m; };
  switch (key) {
    case 'dice': case 'chance': case 'classique': add(dieMesh()); break;
    case 'double': case 'deux': add(dieMesh(), -0.55, 0, 0); add(dieMesh('#fde047', '#7c2d12', 3), 0.55, 0.15, -0.2); break;
    case 'triple': add(dieMesh(), -0.75, 0, 0); add(dieMesh('#fde047', '#7c2d12', 3), 0.1, 0.35, -0.3); add(dieMesh('#a7f3d0', '#065f46', 6), 0.85, 0, 0); break;
    case 'petit': add(dieMesh('#38bdf8', '#ffffff', 3)); break;
    case 'mini': add(dieMesh('#fb923c', '#ffffff', 2)); break;
    case 'pipe': { add(dieMesh('#ffffff', '#dc2626', 6)); const r = add(mesh(new THREE.TorusGeometry(0.85, 0.06, 8, 40), toy('#dc2626')), 0, 0, 0.3); break; }
    case 'item': case 'mystere': add(giftMesh()); break;
    case 'shop': { const b = add(mesh(new THREE.BoxGeometry(1, 1.05, 0.55), toy('#ec4899'))); const h = add(mesh(new THREE.TorusGeometry(0.28, 0.06, 8, 20, Math.PI), toy('#831843')), 0, 0.52, 0); const st = add(starShapeMesh('#fde047', 0.25), 0, 0, 0.3); g.rotation.y = 0.4; break; }
    case 'nest': { const n = add(mesh(new THREE.TorusGeometry(0.6, 0.25, 10, 24), toy('#a16207', { roughness: 0.9 }))); n.rotation.x = Math.PI / 2; ['#e0f2fe', '#fde68a', '#fecaca'].forEach((c, i) => { const e = add(sphere(0.25, toy(c)), (i - 1) * 0.3, 0.2, (i % 2) * 0.15); e.scale.y = 1.3; }); g.rotation.x = 0.4; break; }
    case 'chaos': { const k = add(mesh(new THREE.TorusKnotGeometry(0.45, 0.14, 80, 10, 2, 3), toy('#7c3aed', { emissive: new THREE.Color('#4c1d95'), emissiveIntensity: 0.3 }))); break; }
    case 'casino': { const b = add(mesh(new THREE.BoxGeometry(1.1, 1.3, 0.7), toy('#15803d'))); for (let i = 0; i < 3; i++) { const w = add(mesh(new THREE.BoxGeometry(0.26, 0.36, 0.05), toy('#fff')), (i - 1) * 0.32, 0.15, 0.36); const seven = add(textSprite('7', '#dc2626', 64), (i - 1) * 0.32, 0.15, 0.4); seven.scale.set(0.5, 0.2, 1); } const lever = add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), toy('#94a3b8')), 0.7, 0.3, 0); add(sphere(0.12, toy('#ef4444')), 0.7, 0.72, 0); g.rotation.y = -0.35; break; }
    case 'trade': { const c1 = add(mesh(new THREE.BoxGeometry(0.7, 1, 0.05), toy('#38bdf8')), -0.25, 0, 0); c1.rotation.z = 0.25; const c2 = add(mesh(new THREE.BoxGeometry(0.7, 1, 0.05), toy('#f472b6')), 0.25, 0, 0.1); c2.rotation.z = -0.25; const a1 = add(arrowMesh('#fde047'), 0, 0.65, 0.2); a1.scale.setScalar(0.7); const a2 = add(arrowMesh('#fde047'), 0, -0.65, 0.2); a2.scale.setScalar(0.7); a2.rotation.z = Math.PI; break; }
    case 'boss': { const h = add(sphere(0.65, toy('#b91c1c'))); [-1, 1].forEach((k) => { const horn = add(mesh(new THREE.ConeGeometry(0.15, 0.5, 10), toy('#fde68a')), k * 0.4, 0.62, 0); horn.rotation.z = -k * 0.4; const e = add(sphere(0.12, toy('#fde047', { emissive: new THREE.Color('#facc15'), emissiveIntensity: 1 })), k * 0.22, 0.12, 0.55); const brow = add(mesh(new THREE.BoxGeometry(0.3, 0.07, 0.05), toy('#111')), k * 0.22, 0.3, 0.58); brow.rotation.z = k * 0.4; }); const m = add(mesh(new THREE.BoxGeometry(0.5, 0.1, 0.05), toy('#111')), 0, -0.22, 0.6); break; }
    case 'shift': { const gr = new THREE.Group(); const c = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 24), toy('#f59e0b', { metalness: 0.6 })); c.rotation.x = Math.PI / 2; gr.add(c); for (let i = 0; i < 8; i++) { const t = mesh(new THREE.BoxGeometry(0.25, 0.25, 0.3), toy('#f59e0b', { metalness: 0.6 })); const a = i / 8 * Math.PI * 2; t.position.set(Math.cos(a) * 0.65, Math.sin(a) * 0.65, 0); t.rotation.z = a; gr.add(t); } const hole = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 16), toy('#7c2d12')); hole.rotation.x = Math.PI / 2; gr.add(hole); add(gr); g.rotation.set(0.3, 0.4, 0); break; }
    case 'grappin': { const hk = add(mesh(new THREE.TorusGeometry(0.4, 0.08, 10, 24, Math.PI * 1.3), toy('#94a3b8', { metalness: 0.8 })), 0, -0.2, 0); hk.rotation.z = Math.PI * 0.85; add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), toy('#a16207')), 0.38, 0.45, 0); break; }
    case 'echange': { const a1 = add(arrowMesh('#22c55e'), 0, 0.3, 0); const a2 = add(arrowMesh('#f97316'), 0, -0.3, 0); a2.rotation.z = Math.PI; break; }
    case 'bouclier': case 'shield': { const sh = new THREE.Shape(); sh.moveTo(0, 0.7); sh.quadraticCurveTo(0.6, 0.6, 0.6, 0.2); sh.quadraticCurveTo(0.55, -0.4, 0, -0.75); sh.quadraticCurveTo(-0.55, -0.4, -0.6, 0.2); sh.quadraticCurveTo(-0.6, 0.6, 0, 0.7); const m = add(mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.15, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06 }), toy('#38bdf8', { metalness: 0.5 }))); add(starShapeMesh('#fde047', 0.25), 0, 0.05, 0.25); break; }
    case 'piege': add(trapModel()); g.rotation.x = 0.5; break;
    case 'sablier': { [1, -1].forEach((k) => { const c = add(mesh(new THREE.ConeGeometry(0.4, 0.6, 24, 1, true), new THREE.MeshPhysicalMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.6, side: THREE.DoubleSide })), 0, k * 0.3, 0); c.rotation.x = k > 0 ? Math.PI : 0; const sd = add(mesh(new THREE.ConeGeometry(0.28, 0.35, 20), toy('#fbbf24')), 0, k > 0 ? 0.18 : -0.45, 0); if (k > 0) sd.rotation.x = Math.PI; const cap = add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 20), toy('#92400e')), 0, k * 0.65, 0); }); break; }
    case 'tuyau': add(pipeModel()); break;
    case 'boussole': { const c = add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.15, 32), toy('#fbbf24', { metalness: 0.7 }))); c.rotation.x = Math.PI / 2; const f = add(mesh(new THREE.CircleGeometry(0.5, 32), toy('#fff7ed')), 0, 0, 0.08); const n = add(mesh(new THREE.ConeGeometry(0.1, 0.45, 4), toy('#dc2626')), 0, 0.2, 0.1); const s2 = add(mesh(new THREE.ConeGeometry(0.1, 0.45, 4), toy('#1e3a8a')), 0, -0.2, 0.1); s2.rotation.z = Math.PI; break; }
    case 'fantome': { const b = add(lathe([[0, 0], [0.3, -0.05], [0.45, 0.2], [0.5, 0.6], [0.4, 0.95], [0, 1.05]], new THREE.MeshPhysicalMaterial({ color: '#f8fafc', transparent: true, opacity: 0.92, emissive: new THREE.Color('#c7d2fe'), emissiveIntensity: 0.4 })), 0, -0.5, 0); [-1, 1].forEach((k) => add(sphere(0.08, toy('#111')), k * 0.15, 0.2, 0.42)); add(sphere(0.07, toy('#111')), 0, 0.02, 0.45); break; }
    case 'ticket': { const t = add(mesh(new THREE.BoxGeometry(1.2, 0.7, 0.04), toy('#fde047'))); add(mesh(new THREE.BoxGeometry(0.9, 0.35, 0.05), toy('#cbd5e1', { metalness: 0.7 })), 0, 0, 0.03); add(starShapeMesh('#ef4444', 0.12), -0.48, 0.2, 0.05); g.rotation.set(0.2, 0.3, 0.1); break; }
    case 'coins': case 'coins5': case 'coins12': case 'coins25': case 'lose5': case 'tax5': { [0, 1, 2].forEach((i) => add(coinMesh(), (i - 1) * 0.25, -0.25 + i * 0.15, i * 0.1)); if (key === 'lose5') { const r = add(mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 24), toy('#111')), 0.3, -0.4, 0.4); } if (key === 'tax5') add(arrowMesh('#ef4444'), 0.4, 0.4, 0.3).rotation.z = -0.6; if (key === 'coins25') add(giftMesh('#a16207', '#facc15'), 0.5, 0.35, -0.4).scale.setScalar(0.6); break; }
    case 'star': add(starShapeMesh('#facc15', 0.7)); break;
    case 'dice2': { add(dieMesh()); const t = add(textSprite('+2', '#22c55e', 90)); t.scale.set(1.6, 0.6, 1); t.position.set(0.55, 0.55, 0.6); break; }
    case 'dice5': { add(dieMesh('#fde047', '#7c2d12', 5), -0.3, -0.1, 0); const rk = new THREE.Group(); const bd = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 16), toy('#ef4444')); rk.add(bd); const nz = mesh(new THREE.ConeGeometry(0.2, 0.35, 16), toy('#f8fafc')); nz.position.y = 0.62; rk.add(nz); const fl = mesh(new THREE.ConeGeometry(0.16, 0.5, 12), new THREE.MeshStandardMaterial({ color: '#fb923c', emissive: new THREE.Color('#f97316'), emissiveIntensity: 1.5 })); fl.rotation.x = Math.PI; fl.position.y = -0.7; rk.add(fl); rk.rotation.z = -0.6; add(rk, 0.6, 0.2, 0.3); break; }
    case 'slow2': { const sh = add(mesh(new THREE.TorusGeometry(0.32, 0.2, 12, 24), toy('#b45309')), 0, 0.3, 0); const bd = add(capsule(0.16, 0.9, toy('#a3e635')), 0, -0.05, 0.1); bd.rotation.z = Math.PI / 2; [-1, 1].forEach((k) => { const an = add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), toy('#a3e635')), 0.55 + k * 0.05, 0.25, 0.1 + k * 0.08); add(sphere(0.05, toy('#111')), 0.55 + k * 0.05, 0.42, 0.1 + k * 0.08); }); break; }
    case 'dice2x': case 'dice5x': case 'slow2x': { const sh = add(mesh(new THREE.BoxGeometry(0.9, 0.35, 0.4), toy(key === 'slow2' ? '#16a34a' : '#ef4444'))); const top = add(sphere(0.3, toy(key === 'slow2' ? '#a16207' : '#fff')), key === 'slow2' ? 0.05 : -0.25, 0.3, 0); if (key === 'slow2') top.scale.set(1, 1, 0.6); if (key === 'dice5') add(mesh(new THREE.ConeGeometry(0.15, 0.6, 10), toy('#f97316', { emissive: new THREE.Color('#ea580c'), emissiveIntensity: 1 })), -0.65, 0, 0).rotation.z = Math.PI / 2; g.rotation.y = 0.5; break; }
    case 'companion': add(petModel('piou')); break;
    case 'steal': { const h = add(sphere(0.5, toy('#6b7280'))); add(mesh(new THREE.BoxGeometry(0.9, 0.22, 0.1), toy('#111')), 0, 0.08, 0.45); [-1, 1].forEach((k) => { add(mesh(new THREE.ConeGeometry(0.15, 0.3, 8), toy('#6b7280')), k * 0.32, 0.5, 0); add(sphere(0.07, toy('#fff')), k * 0.18, 0.1, 0.52); }); break; }
    case 'palm': add(palm(rng(4))); break;
    case 'tree': add(tree(rng(4))); break;
    case 'rock': add(rock(rng(4))); break;
    case 'bushx': add(bush()); break;
    case 'event': { const q = add(textSprite('?', '#ffffff', 90)); q.scale.set(2.2, 0.85, 1); add(sphere(0.55, toy('#9b4dff')), 0, 0, -0.4); break; }
    default: return null;
  }
  return g;
}
const ICON_CANVAS = {};
function makeIcons() {
  const out = {};
  try {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.setClearColor(0x000000, 0);
    const sc = new THREE.Scene(); sc.environment = makeEnv(r); sc.add(new THREE.HemisphereLight('#ffffff', '#6b5b95', 1.0));
    const d = new THREE.DirectionalLight('#ffffff', 2.2); d.position.set(-3, 5, 6); sc.add(d);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const keys = ['dice', 'classique', 'double', 'deux', 'triple', 'petit', 'mini', 'pipe', 'item', 'mystere', 'shop', 'nest', 'chance', 'chaos', 'casino', 'trade', 'boss', 'shift', 'grappin', 'echange', 'bouclier', 'shield', 'piege', 'sablier', 'tuyau', 'boussole', 'fantome', 'ticket', 'coins5', 'coins12', 'coins25', 'lose5', 'tax5', 'star', 'dice2', 'dice5', 'slow2', 'companion', 'steal', 'event', 'palm', 'tree', 'rock', 'bushx'];
    keys.forEach((k) => {
      const m = iconModel(k); if (!m) return;
      sc.add(m);
      const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      const rad = Math.max(size.x, size.y, size.z) * 0.62;
      cam.position.set(ctr.x, ctr.y + rad * 0.15, ctr.z + rad / Math.tan(THREE.MathUtils.degToRad(15)));
      cam.lookAt(ctr);
      r.render(sc, cam); out[k] = c.toDataURL('image/png');
      const cc = document.createElement('canvas'); cc.width = cc.height = 128; cc.getContext('2d').drawImage(c, 0, 0); ICON_CANVAS[k] = cc;
      sc.remove(m);
    });
    r.dispose();
  } catch (e) { console.warn('icônes', e); }
  return out;
}

/* ---------------- API utilisée par le jeu ---------------- */
const API = {
  ready: false,
  icons() { if (!this._icons) this._icons = makeIcons(); return this._icons; },
  init(cv, opts) {
    try {
      canvas = cv;
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(Math.min(window.innerWidth, window.innerHeight) < 700 ? 1.5 : 1.75, window.devicePixelRatio || 1));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      API.small = Math.min(window.innerWidth, window.innerHeight) < 700;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
      scene = new THREE.Scene();
      ENVS.day = makeEnv(renderer); ENVS.night = makeEnv(renderer, true);
      camera = new THREE.PerspectiveCamera(42, 1.4, 0.1, 400);
      onArrow = opts && opts.onArrow; onTile = opts && opts.onTile;
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
        else if (onTile) { const th = rc.intersectObjects(world.tileMeshes, false)[0]; onTile(th ? th.object.userData.node : null, e.clientX, e.clientY, true); }
      });
      let lastHover = 0;
      cv.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || !world || !onTile) return;
        const now = performance.now(); if (now - lastHover < 60) return; lastHover = now;
        const r = cv.getBoundingClientRect();
        const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        const rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
        const th = rc.intersectObjects(world.tileMeshes, false)[0];
        onTile(th ? th.object.userData.node : null, e.clientX, e.clientY, false);
      });
      cv.addEventListener('pointerleave', () => onTile && onTile(null));
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
  erupt() {
    const V = world && world.bigVolcano; if (!V) return;
    camState.shake = performance.now() - 300;
    for (let i = 0; i < 60; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: i % 3 ? '#ff7a1a' : '#fde047', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.setScalar(0.6 + Math.random() * 0.8); sp.position.copy(V.top); world.root.add(sp); const a = Math.random() * Math.PI * 2, f = 2 + Math.random() * 5; V.parts.push({ sp, v: new THREE.Vector3(Math.cos(a) * f * 0.4, 9 + Math.random() * 7, Math.sin(a) * f * 0.4), t0: performance.now() }); }
  },
  quake() { camState.shake = performance.now() - 500; },
  boss(pos, theme) { spawnTransient(bossModel(theme), pos, 4600, 'boss'); camState.shake = performance.now(); },
  pipe(pos) { spawnTransient(pipeModel(), pos, 2400, 'pipe'); },
  fx(kind, pos) { if (!world || !pos) return; const v = world.toV(pos.x, pos.y, pos.z || 0); ring(v, kind === 'burst' ? '#fde047' : '#ffffff'); },
  /** view : { board, players: [{ p, pos, hop, alpha, moving }], current, me, stars, traps, fork, focus } */
  frame(now, view) {
    const B = view.board;
    if (!world || world.key !== B.key) { buildWorld(B); Object.keys(monsters).forEach((k) => { scene.remove(monsters[k]); delete monsters[k]; }); camState.init = false; }
    const t = now / 1000, dt = Math.min(0.05, clock.last ? (now - clock.last) / 1000 : 0.016); clock.last = now;
    syncStars(view.stars); syncTraps(view.traps); syncBlocks(view.blocks); tickTransient(now);
    (world.hauntFx || []).forEach((o) => {
      if (o.userData.mist) { o.position.x = o.userData.mist.x + Math.sin(t * 0.3 + o.userData.mist.ph) * 0.8; o.material.opacity = 0.12 + 0.08 * Math.sin(t * 0.7 + o.userData.mist.ph) + (view.day === 'nuit' ? 0.12 : 0); }
      if (o.userData.bubbles) o.userData.bubbles.forEach((b) => { const k = ((t * 0.5 + b.userData.ph) % 1.5) / 1.5; b.position.set(b.userData.x, 0.06 + k * 0.5, b.userData.z); b.scale.setScalar(k < 0.9 ? 1 : 0.01); });
    });
    if (world.npcModels.length || world.whenMeshes.length) {
      const ph = view.day === 'nuit' ? 'nuit' : 'jour', NW = (P.NPC_WHEN || {})[world.B.id] || {};
      world.npcModels.forEach((nm, i) => { const asleep = NW[nm.userData.npc] && NW[nm.userData.npc] !== ph; nm.userData.zzz.visible = asleep; nm.rotation.z = asleep ? 0.25 : 0; nm.position.y = nm.userData.baseY + (nm.children[0] && !asleep ? Math.abs(Math.sin(t * 2 + i)) * 0.08 : 0) + (asleep ? 0 : 0); if (asleep) nm.userData.zzz.position.y = 2.6 + Math.sin(t * 2) * 0.1; nm.traverse((o) => { if (o.isMesh && o.material && 'opacity' in o.material && nm.userData.npc === 'esprit') { o.material.transparent = true; o.material.opacity = asleep ? 0.25 : 0.85; } }); });
      world.whenMeshes.forEach((o) => { const on = o.userData.when === 'levis' ? !!view.levis : o.userData.when === ph; const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach((mm) => { mm.opacity += ((on ? 1 : 0.18) - mm.opacity) * Math.min(1, dt * 2); }); });
    }
    if (world.sandMeshes.length) { world.sandK += ((view.tide ? 1 : 0) - world.sandK) * Math.min(1, dt * 1.2); world.sandMeshes.forEach((o) => { o.position.y = o.userData.y0 - world.sandK * 0.75; }); }
    if (world.bigVolcano) { const V = world.bigVolcano; V.glow.intensity = 30 + Math.sin(t * 3) * 8 + (V.parts.length ? 60 : 0); V.parts = V.parts.filter((p) => { const age = (now - p.t0) / 1000; if (age > 3.2) { world.root.remove(p.sp); return false; } p.v.y -= 14 * dt; p.sp.position.addScaledVector(p.v, dt); if (p.sp.position.y < 0) { p.sp.position.y = 0; p.v.set(0, 0, 0); } p.sp.material.opacity = 1 - age / 3.2; return true; }); }
    (world.blocks || []).forEach((m) => { const e = Math.min(1, (now - m.userData.born) / 900), ez = 1 - Math.pow(1 - e, 3); m.scale.setScalar(Math.max(0.01, ez)); m.position.y = m.userData.baseY - (1 - ez) * 2; if (e < 1 && !m.userData.shook) { m.userData.shook = true; camState.shake = now - 500; } if (m.userData.zzz) { m.userData.zzz.position.y = 2.6 + Math.sin(t * 2) * 0.15; } if (m.userData.tide) m.userData.tide.scale.y = 1 + Math.sin(t * 3) * 0.25; if (m.userData.blink) m.userData.blink.material.emissiveIntensity = Math.sin(t * 8) > 0 ? 2.5 : 0.2; if (m.userData.sign) m.userData.sign.position.y = (m.userData.zzz ? 3.4 : 2.2) + Math.sin(t * 3) * 0.12; });
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
      if (o.ride) { // véhicule de transport (ptérodactyle, barque, métro, wagon)
        let vh = m.userData.veh;
        if (!vh || m.userData.vehK !== o.ride) { if (vh) m.remove(vh); vh = vehicleModel(o.ride); m.add(vh); m.userData.veh = vh; m.userData.vehK = o.ride; }
        vh.visible = true; vh.position.y = model.position.y; vh.rotation.y = model.rotation.y;
        if (vh.userData.wings) vh.userData.wings.forEach((w, k) => { w.rotation.x = Math.sin(t * 12) * 0.8 * (k ? -1 : 1); });
        if (o.ride === 'boat') vh.rotation.z = Math.sin(t * 5) * 0.06;
        if (vh.userData.rotor) vh.userData.rotor.rotation.y = t * 30;
        if (vh.userData.flippers) vh.userData.flippers.forEach((f, k) => { f.rotation.y = Math.sin(t * 6 + k) * 0.5; });
        if (vh.userData.legs) vh.userData.legs.forEach((l, k) => { l.rotation.x = Math.sin(t * 9 + (k % 3 ? Math.PI : 0)) * 0.45; });
      } else if (m.userData.veh) m.userData.veh.visible = false;
      m.visible = o.alpha > 0.15;
      m.userData.shadow.material.opacity = Math.max(0.25, 1 - hop / 6);
      m.userData.shadow.scale.setScalar(1 - Math.min(0.5, hop / 10));
      m.userData.cur.visible = cur; m.userData.cur.material.opacity = 0.5 + 0.4 * Math.sin(t * 5);
      const ck = (p.comps || (p.companion ? [p.companion] : [])).join(',');
      if (m.userData.compKind !== ck) { (m.userData.comps || []).forEach((c) => m.remove(c)); m.userData.comps = ck ? ck.split(',').map((k) => { const pm = petModel(k); m.add(pm); return pm; }) : []; m.userData.compKind = ck; }
      (m.userData.comps || []).forEach((comp, ci) => { const a = t * 1.4 + ci * Math.PI; comp.position.set(Math.cos(a) * 0.95, 1.5 + hop + Math.sin(t * 3 + ci) * 0.12, Math.sin(a) * 0.5); comp.rotation.y = -a + Math.PI / 2; comp.userData.wings.forEach((w, k) => { w.rotation.x = Math.sin(t * 18) * 0.7 * (k ? -1 : 1); }); });
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
      if (m.userData.lift) m.position.y = m.userData.lift.y0 + (m.userData.lift.y1 - m.userData.lift.y0) * (0.5 - 0.5 * Math.cos(t * 0.6 + m.userData.lift.ph));
      if (m.userData.rise) m.position.y = (t * m.userData.rise.sp + m.userData.rise.ph) % 14;
      if (m.userData.spin) { m.rotation.y = t * m.userData.spin; m.rotation.x = t * m.userData.spin * 0.6; }
      if (m.userData.rotor) { if (m.userData.rotAxis === 'z') m.userData.rotor.rotation.z = t * 0.9; else if (m.userData.rotAxis === 'ys') m.userData.rotor.rotation.y = t * 0.6; else m.userData.rotor.rotation.y = t * 25; }
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
    // Jour / nuit
    if (!world.env.cave) {
      const PH = { aube: { n: 0.35, d: 0.7 }, jour: { n: 0, d: 0 }, 'crépuscule': { n: 0.3, d: 1 }, nuit: { n: 1, d: 0 } }[view.day || 'jour'] || { n: 0, d: 0 };
      const D = world.day, rdt = D.t ? Math.min(1, (now - D.t) / 1000) : 1, k = Math.min(1, rdt * 0.8); D.t = now;
      D.n += (PH.n - D.n) * k; D.d += (PH.d - D.d) * k;
      const E = world.env, col = (a, b, c) => new THREE.Color(a).lerp(new THREE.Color(b), D.d * (1 - D.n)).lerp(new THREE.Color(c), D.n);
      world.sun.color.copy(col(E.sun[0], '#ff8a4c', '#9db8ff')); world.sun.intensity = E.sun[1] * 0.85 * (1 - 0.35 * D.d) * (1 - 0.86 * D.n);
      world.hemi.color.copy(col(E.hemi[0], '#fdba74', '#818cf8')); world.hemi.intensity = E.hemi[2] * 0.55 * (1 - 0.3 * D.d) * (1 - 0.72 * D.n); scene.environment = D.n > 0.55 ? ENVS.night : ENVS.day;
      scene.fog.color.copy(col(E.fog, '#f0a46b', '#141b33'));
      world.skyStars.material.opacity = world.env.space ? 1 : Math.max(0, D.n * 1.1 - 0.1); world.moon.material.opacity = world.env.space ? 0 : D.n;
      world.follow.intensity = (E.cave || E.city ? 70 : 0) * (1 - D.n) + 75 * D.n; world.follow.color.set(D.n > 0.5 ? '#ffd9a0' : (E.city ? '#e9d5ff' : '#ffe7b3'));
      if (world.water) world.water.material.color.copy(new THREE.Color(world.env.waterCol || '#1e90c8').lerp(new THREE.Color('#0c2a4a'), D.n));
      renderer.toneMappingExposure = 1.05 - 0.15 * D.n;
      const key = Math.round(D.n * 16) + ':' + Math.round(D.d * 16);
      if (key !== D.key) {
        D.key = key;
        const top = col(E.sky[0], '#5b21b6', '#020617').getStyle(), bot = col(E.sky[1], '#fb923c', '#1e293b').getStyle();
        if (scene.background && scene.background.dispose) scene.background.dispose();
        scene.background = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      }
    }
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
    if (overview || !view.focus) { target = new THREE.Vector3(0, 0, 1); const d = Math.max(W, H * 1.25) * (portrait ? 1.45 : 0.95); offset = new THREE.Vector3(0, d * 0.82, d * 0.72); }
    else { const f = world.toV(view.focus.x, view.focus.y, view.focus.z || 0); target = new THREE.Vector3(f.x, f.y + 0.8, f.z + 1); const d = portrait ? 23 : 21; offset = new THREE.Vector3(0, d * 0.46, d * 0.9); }
    const want = target.clone().add(offset);
    if (!camState.init) { camState.pos.copy(want); camState.look.copy(target); camState.init = true; }
    camState.pos.lerp(want, Math.min(1, dt * 2.5)); camState.look.lerp(target, Math.min(1, dt * 3));
    camera.position.copy(camState.pos); camera.lookAt(camState.look);
    if (camState.shake && now - camState.shake > 500 && now - camState.shake < 1300) { const k = 0.25 * (1 - (now - camState.shake - 500) / 800); camera.position.x += (Math.random() - 0.5) * k; camera.position.y += (Math.random() - 0.5) * k; } // la terre tremble quand le boss arrive
    // L'ombre suit la caméra pour rester nette
    world.sun.target.position.set(camState.look.x, 0, camState.look.z);
    world.sun.position.set(camState.look.x - 12, 40, camState.look.z + 18);
    world.follow.position.set(camState.look.x, camState.look.y + 6, camState.look.z + 3);
    renderer.render(scene, camera);
  },
};
function deadTree(R) { const g = new THREE.Group(), m = std('#3b2f2a', { roughness: 1 }); const tr = mesh(jitter(new THREE.CylinderGeometry(0.1, 0.22, 1.8, 7, 4), 0.04, 5), m); tr.position.y = 0.9; tr.rotation.z = (R() - 0.5) * 0.2; g.add(tr); for (let i = 0; i < 4; i++) { const b = mesh(new THREE.CylinderGeometry(0.03, 0.07, 0.9, 5), m); const a = i * 1.7 + R(); b.position.set(Math.cos(a) * 0.25, 1.4 + i * 0.12, Math.sin(a) * 0.25); b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); g.add(b); } return g; }
function tombstone(R) { const g = new THREE.Group(), m = std('#9ca3af', { roughness: 0.95 }); const t = mesh(roundedBox(0.6, 0.85, 0.16, 0.06), m); t.position.y = 0.42; t.rotation.z = (R() - 0.5) * 0.2; g.add(t); const top = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 16, 1, false, 0, Math.PI), m); top.rotation.x = Math.PI / 2; top.rotation.z = Math.PI / 2; top.position.y = 0.84; g.add(top); const mound = sphere(0.45, std('#4b3a2a')); mound.scale.set(1, 0.25, 1.6); mound.position.set(0, 0.02, 0.5); g.add(mound); return g; }
function pumpkin(R) { const g = new THREE.Group(), m = toy('#f97316', { roughness: 0.5 }); for (let i = 0; i < 6; i++) { const lobe = sphere(0.32, m, 14, 10); lobe.scale.set(0.6, 0.85, 1); lobe.rotation.y = i / 6 * Math.PI; lobe.position.y = 0.28; g.add(lobe); } const st = mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.18, 6), std('#4d7c0f')); st.position.y = 0.6; g.add(st); const glow = new THREE.MeshStandardMaterial({ color: '#fde047', emissive: new THREE.Color('#facc15'), emissiveIntensity: 2 }); [-0.11, 0.11].forEach((x) => { const e = mesh(new THREE.ConeGeometry(0.06, 0.1, 3), glow); e.rotation.x = Math.PI / 2; e.position.set(x, 0.36, 0.3); g.add(e); }); const mo = mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), glow); mo.position.set(0, 0.2, 0.31); g.add(mo); g.userData.glow = true; return g; }
function ironFence() { const g = new THREE.Group(), m = std('#1f2937', { metalness: 0.6, roughness: 0.4 }); for (let i = 0; i < 6; i++) { const b = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), m); b.position.set(-0.75 + i * 0.3, 0.55, 0); g.add(b); const tip = mesh(new THREE.ConeGeometry(0.06, 0.15, 6), m); tip.position.set(-0.75 + i * 0.3, 1.15, 0); g.add(tip); } [0.3, 0.9].forEach((y) => { const r = mesh(new THREE.BoxGeometry(1.7, 0.05, 0.05), m); r.position.y = y; g.add(r); }); return g; }
/* ---------------- Lieux du Manoir Hanté ---------------- */
const plankTex = canvasTex(256, 256, (g, w) => { for (let i = 0; i < 8; i++) { g.fillStyle = shade('#5b4636', (i % 3 - 1) * 0.05).getStyle(); g.fillRect(i * 32, 0, 32, w); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * 32, 0, 3, w); for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(i * 32 + 16, 40 + k * 90, 2, 0, 7); g.fill(); } } });
/* ---------------- Cité d'Atlantide ---------------- */
function fishSchool() { const g = new THREE.Group(); const cols = ['#fbbf24', '#38bdf8', '#f472b6', '#fb923c']; const c = cols[Math.floor(Math.random() * cols.length)]; for (let i = 0; i < 9; i++) { const f = new THREE.Group(); const b = sphere(0.22, toy(c)); b.scale.set(1.6, 0.8, 0.5); f.add(b); const tl = mesh(new THREE.ConeGeometry(0.16, 0.3, 4), toy(c)); tl.rotation.z = Math.PI / 2; tl.position.x = -0.42; f.add(tl); f.position.set((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2.4); f.rotation.y = Math.PI / 2; g.add(f); } return g; }
function kelp(R) { const g = new THREE.Group(), m = std('#3f6212', { side: THREE.DoubleSide, roughness: 0.8 }); for (let i = 0; i < 3; i++) { const h = 2.5 + R() * 3; const geo = new THREE.PlaneGeometry(0.35, h, 1, 10); const pa = geo.attributes.position; for (let j = 0; j < pa.count; j++) { const y = pa.getY(j) + h / 2; pa.setX(j, pa.getX(j) + Math.sin(y * 1.3 + i) * 0.25); } geo.computeVertexNormals(); const k = mesh(geo, m, false); k.position.set((R() - 0.5) * 0.6, h / 2, (R() - 0.5) * 0.6); k.rotation.y = R() * 3; g.add(k); } g.userData.sway = true; return g; }
function anemone(R) { const g = new THREE.Group(); const col = ['#f472b6', '#a855f7', '#fb923c'][Math.floor(R() * 3)]; const base = sphere(0.3, toy(col)); base.scale.y = 0.6; base.position.y = 0.15; g.add(base); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; const t = mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.45, 5), toy(shade(col, 0.15))); t.position.set(Math.cos(a) * 0.2, 0.42, Math.sin(a) * 0.2); t.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(t); } return g; }
function glassDome(R) { const g = new THREE.Group(); const base = mesh(new THREE.CylinderGeometry(2.8, 3, 0.5, 32), std('#cbd5e1', { roughness: 0.6 })); base.position.y = 0.25; g.add(base); for (let i = 0; i < 3; i++) { const b = mesh(new THREE.BoxGeometry(0.9, 1.4 + i * 0.5, 0.9), std(['#e2e8f0', '#bae6fd', '#fde68a'][i])); b.position.set(-1 + i, 0.5 + (1.4 + i * 0.5) / 2, (i - 1) * 0.4); g.add(b); const r2 = mesh(new THREE.ConeGeometry(0.6, 0.6, 4), std('#0e7490')); r2.position.set(b.position.x, b.position.y + (1.4 + i * 0.5) / 2 + 0.3, b.position.z); r2.rotation.y = Math.PI / 4; g.add(r2); } const dome = mesh(new THREE.SphereGeometry(2.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#a5f3fc', transparent: true, opacity: 0.28, roughness: 0.05, clearcoat: 1 })); dome.position.y = 0.5; g.add(dome); const ring = mesh(new THREE.TorusGeometry(2.62, 0.1, 6, 48), std('#fbbf24', { metalness: 0.7, roughness: 0.3 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.52; g.add(ring); return { g, r: 3.1 }; }
function poseidonStatue(R) { const g = new THREE.Group(), st = std('#cbd5e1', { roughness: 0.85 }); const ped = mesh(new THREE.BoxGeometry(1.6, 1.0, 1.6), st); ped.position.y = 0.5; g.add(ped); const body = capsule(0.45, 1.5, st); body.position.y = 2.3; g.add(body); const head = sphere(0.38, st); head.position.y = 3.6; g.add(head); const beard = mesh(new THREE.ConeGeometry(0.3, 0.6, 10), st); beard.rotation.x = Math.PI; beard.position.set(0, 3.3, 0.2); g.add(beard); const crown = mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.25, 8, 1, true), std('#fbbf24', { metalness: 0.8, side: THREE.DoubleSide })); crown.position.y = 3.95; g.add(crown); const arm = capsule(0.13, 1.0, st); arm.position.set(0.6, 2.9, 0); arm.rotation.z = -0.4; g.add(arm); const shaft = mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 6), std('#fbbf24', { metalness: 0.8, roughness: 0.25 })); shaft.position.set(0.95, 2.6, 0); g.add(shaft); [-0.25, 0, 0.25].forEach((x) => { const p = mesh(new THREE.ConeGeometry(0.06, 0.4, 6), std('#fbbf24', { metalness: 0.8 })); p.position.set(0.95 + x, 4.45, 0); g.add(p); }); const bar = mesh(new THREE.BoxGeometry(0.55, 0.06, 0.06), std('#fbbf24', { metalness: 0.8 })); bar.position.set(0.95, 4.25, 0); g.add(bar); for (let i = 0; i < 4; i++) { const k = kelp(R); k.scale.setScalar(0.4); k.position.set(Math.cos(i * 1.6) * 1.3, 0, Math.sin(i * 1.6) * 1.3); g.add(k); } return { g, r: 1.8 }; }
function shipwreck(R) { const g = new THREE.Group(); const b = boat(); b.userData.bob = false; b.scale.setScalar(3.2); b.rotation.set(0.25, 0.4, 0.35); b.position.y = 0.2; g.add(b); for (let i = 0; i < 5; i++) { const c = coral(R, i % 6); c.scale.setScalar(0.7); c.position.set((R() - 0.5) * 4, 0, (R() - 0.5) * 3); g.add(c); } const chest = crate(); chest.position.set(2.2, 0, 1.2); chest.scale.setScalar(1.2); g.add(chest); return { g, r: 3.4 }; }
function giantClam(R) { const g = new THREE.Group(); const m = toy('#c4b5fd', { roughness: 0.4 }); const lo = mesh(new THREE.SphereGeometry(1.4, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m); lo.scale.y = 0.5; lo.position.y = 0.6; g.add(lo); const up = mesh(new THREE.SphereGeometry(1.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m); up.scale.y = 0.5; up.position.set(0, 0.6, -0.5); up.rotation.x = -0.7; g.add(up); const pearl = sphere(0.4, new THREE.MeshPhysicalMaterial({ color: '#fdf4ff', roughness: 0.05, clearcoat: 1, iridescence: 1, emissive: new THREE.Color('#f5d0fe'), emissiveIntensity: 0.3 })); pearl.position.y = 0.75; g.add(pearl); return { g, r: 1.8 }; }
function sunkenColumns(R) { const g = new THREE.Group(), st = std('#cbd5e1', { roughness: 0.9 }); for (let i = 0; i < 6; i++) { const broken = R() < 0.4, h = broken ? 1 + R() * 1.5 : 3.4; const c = mesh(new THREE.CylinderGeometry(0.32, 0.36, h, 14), st); const a = i / 6 * Math.PI * 2; c.position.set(Math.cos(a) * 2.2, h / 2, Math.sin(a) * 2.2); g.add(c); if (!broken) { const cap = mesh(new THREE.BoxGeometry(0.85, 0.25, 0.85), st); cap.position.set(c.position.x, h + 0.12, c.position.z); g.add(cap); } const k = kelp(R); k.scale.setScalar(0.35); k.position.set(c.position.x + 0.4, 0, c.position.z); g.add(k); } const floor = mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.2, 6), std('#94a3b8')); floor.position.y = 0.1; g.add(floor); return { g, r: 3 }; }
function krakenBoss(g) { const sk = toy('#be185d', { roughness: 0.45 }), su = toy('#fbcfe8');
  const head = sphere(1.5, sk); head.scale.set(1, 1.3, 1); head.position.y = 3.2; g.add(head);
  [-0.55, 0.55].forEach((x) => { const e = sphere(0.32, toy('#fef08a')); e.position.set(x, 3.0, 1.25); g.add(e); const pu = mesh(new THREE.BoxGeometry(0.08, 0.35, 0.05), toy('#111')); pu.position.set(x, 3.0, 1.55); g.add(pu); const br = mesh(new THREE.BoxGeometry(0.5, 0.1, 0.08), toy('#831843')); br.position.set(x, 3.42, 1.3); br.rotation.z = x > 0 ? 0.35 : -0.35; g.add(br); });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector3(Math.cos(a) * (0.9 + t * 1.8), 1.8 - t * 1.7 + Math.sin(t * 6 + i) * 0.25, Math.sin(a) * (0.9 + t * 1.8))); } const tub = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.22, 8), sk); g.add(tub); for (let k = 2; k < 8; k += 2) { const s = sphere(0.07, su); s.position.copy(pts[k]); s.position.y -= 0.18; g.add(s); } }
  const crown = mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 8, 1, true), toy('#facc15', { metalness: 0.8, side: THREE.DoubleSide })); crown.position.y = 5.05; g.add(crown);
}
/* ---------------- Station Spatiale ---------------- */
const metal = (c = '#e2e8f0') => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.7, roughness: 0.3, clearcoat: 0.5 });
const neon = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 1.6 });
function asteroidRock(rx, rz, seed, top) { // astéroïde : dessus plat (sol), dessous rocheux
  const g = new THREE.Group();
  const geo = jitter(new THREE.IcosahedronGeometry(1, 4), 0.12, seed); const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { let y = pa.getY(i); y = y > 0 ? y * 0.08 : y * (1.4 + hash3(i, seed, 1) * 0.5); pa.setY(i, y); }
  geo.computeVertexNormals(); shadeTop(geo, '#3b3247', '#8b7fa3');
  const r = mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }), true, true); r.scale.set(rx, 3, rz); r.position.y = -0.25; g.add(r);
  const cap = mesh(new THREE.CircleGeometry(1, 64), std(top, { roughness: 0.9 }), false, true); cap.rotation.x = -Math.PI / 2; cap.scale.set(rx * 0.98, rz * 0.98, 1); cap.position.y = 0.0; g.add(cap);
  for (let i = 0; i < 5; i++) { const a = hash3(i, seed, 2) * 6.28, d = 0.3 + hash3(i, seed, 3) * 0.5; const cr = mesh(new THREE.TorusGeometry(0.5 + hash3(i, seed, 4) * 0.5, 0.12, 6, 18), std(shade(top, -0.12))); cr.rotation.x = Math.PI / 2; cr.position.set(Math.cos(a) * rx * d, 0.02, Math.sin(a) * rz * d); cr.scale.z = 0.4; g.add(cr); }
  return g;
}
function spaceDome(R) { const g = new THREE.Group(); const base = mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.6, 32), metal('#cbd5e1')); base.position.y = 0.3; g.add(base); const dome = mesh(new THREE.SphereGeometry(2.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#a5f3fc', transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1, metalness: 0.1 })); dome.position.y = 0.6; g.add(dome); for (let i = 0; i < 3; i++) { const p = new THREE.Group(); const st = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 5), std('#166534')); st.position.y = 0.3; p.add(st); const b = sphere(0.35, std('#22c55e')); b.position.y = 0.75; p.add(b); p.position.set(Math.cos(i * 2.1) * 1.2, 0.6, Math.sin(i * 2.1) * 1.2); g.add(p); } const ring = mesh(new THREE.TorusGeometry(2.62, 0.08, 6, 48), neon('#22d3ee')); ring.rotation.x = Math.PI / 2; ring.position.y = 0.62; g.add(ring); return { g, r: 3 }; }
function rocketModel() { const g = new THREE.Group(); const body = lathe([[0, 0], [0.55, 0.05], [0.6, 1.2], [0.55, 2.4], [0.35, 3.1], [0, 3.6]], toy('#f8fafc', { metalness: 0.2 }), 32); body.position.y = 0.4; g.add(body); const tip = mesh(new THREE.ConeGeometry(0.36, 0.6, 24), toy('#dc2626')); tip.position.y = 3.7; g.add(tip); const win = mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshPhysicalMaterial({ color: '#38bdf8', clearcoat: 1, roughness: 0.05, emissive: new THREE.Color('#0ea5e9'), emissiveIntensity: 0.4 })); win.position.set(0, 2.6, 0.59); win.rotation.x = -0.12; g.add(win); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const f = mesh(new THREE.BoxGeometry(0.06, 0.9, 0.6), toy('#dc2626')); f.position.set(Math.cos(a) * 0.6, 0.75, Math.sin(a) * 0.6); f.rotation.y = -a; g.add(f); } const fl = mesh(new THREE.ConeGeometry(0.35, 1.0, 16), new THREE.MeshStandardMaterial({ color: '#fb923c', emissive: new THREE.Color('#f97316'), emissiveIntensity: 2.5, transparent: true, opacity: 0.85 })); fl.rotation.x = Math.PI; fl.position.y = -0.1; g.add(fl); g.userData.flame = fl; return g; }
function launchPad(R) { const g = new THREE.Group(); const pad = mesh(new THREE.CylinderGeometry(1.8, 2, 0.4, 24), metal('#94a3b8')); pad.position.y = 0.2; g.add(pad); const r = rocketModel(); r.position.y = 0.6; r.userData.flame.visible = false; g.add(r); const tw = mesh(new THREE.BoxGeometry(0.4, 4.2, 0.4), metal('#f59e0b')); tw.position.set(1.4, 2.1, 0); g.add(tw); for (let i = 0; i < 4; i++) { const arm = mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), metal('#f59e0b')); arm.position.set(0.95, 0.9 + i * 0.9, 0); g.add(arm); } return { g, r: 2.2 }; }
function radarDish(R) { const g = new THREE.Group(); const base = mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.6, 12), metal('#94a3b8')); base.position.y = 0.3; g.add(base); const mast = mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 8), metal()); mast.position.y = 1.2; g.add(mast); const head = new THREE.Group(); head.position.y = 1.9; const dish = mesh(new THREE.SphereGeometry(1.2, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.3), metal('#f8fafc')); dish.material.side = THREE.DoubleSide; dish.rotation.x = -Math.PI / 2 - 0.6; head.add(dish); const ant = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), metal()); ant.rotation.x = -0.6 + Math.PI / 2; ant.position.set(0, 0.3, 0.3); head.add(ant); const tip = sphere(0.1, neon('#ef4444')); tip.position.set(0, 0.6, 0.7); head.add(tip); g.add(head); g.userData.rotor = head; g.userData.rotAxis = 'ys'; return { g, r: 1.5 }; }
function crashedUfo(R) { const g = new THREE.Group(); const u = ufo(); u.userData.hover = false; u.rotation.z = 0.35; u.position.y = 0.3; u.scale.setScalar(1.6); g.add(u); for (let i = 0; i < 6; i++) { const rk = rock(R, '#6b5b7b'); rk.scale.setScalar(0.6 + R() * 0.5); rk.position.set((R() - 0.5) * 3.2, 0, (R() - 0.5) * 3.2); g.add(rk); } g.userData.smoke = true; return { g, r: 2.4 }; }
function moonBase(R) { const g = new THREE.Group(); [[-1.6, 0], [1.6, 0]].forEach(([x, z]) => { const m = mesh(new THREE.CapsuleGeometry(0.8, 1.6, 8, 16), metal('#e2e8f0')); m.rotation.z = Math.PI / 2; m.position.set(x, 0.8, z); g.add(m); for (let i = 0; i < 3; i++) { const w = sphere(0.14, neon('#fde047')); w.position.set(x - 0.6 + i * 0.6, 1.0, 0.78); g.add(w); } }); const hub = mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 20), metal('#cbd5e1')); hub.position.y = 0.7; g.add(hub); const top = mesh(new THREE.SphereGeometry(0.9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), metal('#94a3b8')); top.position.y = 1.4; g.add(top); const sp = mesh(new THREE.BoxGeometry(2.6, 0.05, 1.0), new THREE.MeshPhysicalMaterial({ color: '#1e3a8a', metalness: 0.6, roughness: 0.2, clearcoat: 1 })); sp.position.set(0, 2.4, -1); sp.rotation.x = -0.5; g.add(sp); const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5), metal()); pole.position.set(0, 1.9, -0.8); g.add(pole); return { g, r: 3.2 }; }
function alienPlant(R) { const g = new THREE.Group(); const col = ['#a855f7', '#22d3ee', '#f472b6', '#84cc16'][Math.floor(R() * 4)]; for (let i = 0; i < 3; i++) { const h = 0.6 + R() * 0.8; const st = mesh(new THREE.CylinderGeometry(0.04, 0.06, h, 6), std('#4c1d95')); st.position.set((R() - 0.5) * 0.4, h / 2, (R() - 0.5) * 0.4); st.rotation.z = (R() - 0.5) * 0.4; g.add(st); const b = sphere(0.14 + R() * 0.08, new THREE.MeshStandardMaterial({ color: col, emissive: new THREE.Color(col), emissiveIntensity: 1.2 })); b.position.set(st.position.x, h, st.position.z); g.add(b); } return g; }
function alienBoss(g) { const skin = toy('#84cc16'), suit = toy('#7c3aed', { metalness: 0.3 });
  const saucer = mesh(new THREE.CylinderGeometry(2.2, 1.2, 0.6, 32), metal('#cbd5e1')); saucer.position.y = 1.0; g.add(saucer); const rim = mesh(new THREE.TorusGeometry(2.2, 0.12, 8, 40), neon('#22d3ee')); rim.rotation.x = Math.PI / 2; rim.position.y = 1.0; g.add(rim);
  const body = sphere(0.9, suit); body.scale.set(1, 1.1, 0.9); body.position.y = 2.1; g.add(body);
  const head = sphere(0.95, skin); head.scale.set(1.1, 1, 1); head.position.y = 3.5; g.add(head);
  [-0.4, 0, 0.4].forEach((x, i) => { const e = sphere(0.2, toy('#fff')); e.position.set(x, 3.65 + (i === 1 ? 0.2 : 0), 0.85); g.add(e); const pu = sphere(0.1, toy('#111')); pu.position.set(x, 3.65 + (i === 1 ? 0.2 : 0), 1.02); g.add(pu); });
  [-1, 1].forEach((k) => { const an = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 5), skin); an.position.set(k * 0.4, 4.6, 0); an.rotation.z = -k * 0.3; g.add(an); const t = sphere(0.12, neon('#fde047')); t.position.set(k * 0.53, 5.0, 0); g.add(t); const arm = capsule(0.15, 0.7, skin); arm.position.set(k * 1.0, 2.2, 0.3); arm.rotation.z = k * 0.6; g.add(arm); });
  const cape = mesh(new THREE.ConeGeometry(1.2, 2.0, 20, 1, true), toy('#b91c1c', { side: THREE.DoubleSide })); cape.position.set(0, 2.0, -0.2); g.add(cape);
  const crown = mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.35, 8, 1, true), toy('#facc15', { metalness: 0.8, side: THREE.DoubleSide })); crown.position.y = 4.4; g.add(crown);
  const dome = mesh(new THREE.SphereGeometry(1.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#a5f3fc', transparent: true, opacity: 0.25, roughness: 0.05, clearcoat: 1 })); dome.position.y = 1.3; dome.scale.y = 2.4; g.add(dome);
}
function spaceBackdrop(root, W, H, R) {
  const P = (r, col, x, y, z, ring) => { const p = sphere(r, std(col, { roughness: 0.8, fog: false }), 40, 30); p.position.set(x, y, z); root.add(p); if (ring) { const rg = mesh(new THREE.RingGeometry(r * 1.3, r * 2.0, 64), new THREE.MeshBasicMaterial({ color: ring, side: THREE.DoubleSide, transparent: true, opacity: 0.7, fog: false }), false); rg.rotation.x = -Math.PI / 2 + 0.35; rg.position.copy(p.position); root.add(rg); } return p; };
  P(14, '#f59e0b', -W * 0.6, 12, -H / 2 - 70, '#fde68a'); P(6, '#38bdf8', W * 0.55, 22, -H / 2 - 55); P(3, '#a78bfa', W * 0.2, 30, -H / 2 - 45);
  const neb = canvasTex(256, 256, (c, w, h) => { for (let i = 0; i < 14; i++) { const x = Math.random() * w, y = Math.random() * h, r = 40 + Math.random() * 80; const gr = c.createRadialGradient(x, y, 0, x, y, r); const col = ['168,85,247', '236,72,153', '56,189,248'][i % 3]; gr.addColorStop(0, 'rgba(' + col + ',.35)'); gr.addColorStop(1, 'rgba(' + col + ',0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); } });
  const nb = new THREE.Sprite(new THREE.SpriteMaterial({ map: neb, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); nb.scale.set(260, 160, 1); nb.position.set(0, 40, -H / 2 - 110); root.add(nb);
  for (let i = 0; i < 30; i++) { const a = jitter(new THREE.IcosahedronGeometry(1, 1), 0.3, i); const m = mesh(a, new THREE.MeshStandardMaterial({ color: '#57534e', flatShading: true, roughness: 1 }), false); const an = R() * 6.28, rr = Math.max(W, H) * (0.62 + R() * 0.4); m.position.set(Math.cos(an) * rr, -4 + R() * 10, Math.sin(an) * rr); m.scale.setScalar(0.6 + R() * 1.8); m.userData.spin = 0.2 + R() * 0.5; root.add(m); }
}
/* ---------------- Royaume des Chevaliers ---------------- */
const castleStone = () => { const t = stoneTex('#a8a29e', '#78716c'); return std('#fff', { map: t, bumpMap: t, bumpScale: 2, roughness: 0.9 }); };
function crenels(len, h, mat, g, y, z, rotY, x0 = 0) { const n = Math.max(2, Math.round(len / 0.7)); for (let i = 0; i < n; i++) { if (i % 2) continue; const c = mesh(new THREE.BoxGeometry(len / n, h, 0.5), mat); const off = -len / 2 + (i + 0.5) * len / n; c.position.set(x0 + Math.cos(rotY) * off, y, z - Math.sin(rotY) * off); c.rotation.y = rotY; g.add(c); } }
function tower(r, h, mat, roofCol) { const g = new THREE.Group(); const c = mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 16), mat, true, true); c.position.y = h / 2; g.add(c); if (roofCol) { const rf = mesh(new THREE.ConeGeometry(r * 1.3, r * 2.2, 16), toy(roofCol)); rf.position.y = h + r * 1.1; g.add(rf); const fl = mesh(new THREE.PlaneGeometry(0.6, 0.35), std(roofCol === '#1d4ed8' ? '#facc15' : '#1d4ed8', { side: THREE.DoubleSide })); fl.position.set(0.32, h + r * 2.4, 0); g.add(fl); const pole = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), std('#57534e')); pole.position.y = h + r * 2.3; g.add(pole); } else { for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const m2 = mesh(new THREE.BoxGeometry(0.35, 0.4, 0.35), mat); m2.position.set(Math.cos(a) * r, h + 0.2, Math.sin(a) * r); g.add(m2); } } return g; }
function windmill(R) { const g = new THREE.Group(); const body = mesh(new THREE.CylinderGeometry(0.9, 1.3, 4, 14), std('#f5f5f4', { roughness: 0.9 })); body.position.y = 2; g.add(body); const rf = mesh(new THREE.ConeGeometry(1.2, 1.4, 14), toy('#b91c1c')); rf.position.y = 4.7; g.add(rf); const hub = new THREE.Group(); hub.position.set(0, 3.8, 1.1); for (let i = 0; i < 4; i++) { const arm = new THREE.Group(); const sp = mesh(new THREE.BoxGeometry(0.08, 2.6, 0.06), std('#78350f')); sp.position.y = 1.3; arm.add(sp); const sail = mesh(new THREE.BoxGeometry(0.6, 2.0, 0.03), std('#fef3c7', { side: THREE.DoubleSide })); sail.position.set(0.32, 1.5, 0); arm.add(sail); arm.rotation.z = i * Math.PI / 2; hub.add(arm); } g.add(hub); g.userData.rotor = hub; g.userData.rotAxis = 'z'; const door = mesh(new THREE.BoxGeometry(0.6, 1.0, 0.05), std('#78350f')); door.position.set(0, 0.5, 1.22); door.rotation.x = -0.1; g.add(door); return { g, r: 2.2 }; }
function joustArena(R) { const g = new THREE.Group(); const sand = mesh(new THREE.BoxGeometry(8, 0.08, 4.5), std('#d6c08a'), false, true); sand.position.y = 0.04; g.add(sand); const bar = mesh(new THREE.BoxGeometry(6.5, 0.12, 0.12), std('#f8fafc')); bar.position.y = 0.9; g.add(bar); for (let i = 0; i < 7; i++) { const p = mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), std(i % 2 ? '#dc2626' : '#f8fafc')); p.position.set(-3.25 + i * 1.08, 0.45, 0); g.add(p); } [-1, 1].forEach((k) => { const st = new THREE.Group(); const fl = mesh(new THREE.BoxGeometry(3, 0.15, 1.2), std('#78350f')); fl.position.y = 1.0; st.add(fl); [-1.4, 1.4].forEach((x) => { const lg = mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), std('#78350f')); lg.position.set(x, 0.5, 0); st.add(lg); }); const can = mesh(new THREE.BoxGeometry(3.2, 0.06, 1.4), std(k > 0 ? '#1d4ed8' : '#dc2626')); can.position.y = 2.3; st.add(can); [-1.5, 1.5].forEach((x) => { const pl = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 5), std('#78350f')); pl.position.set(x, 1.65, 0.6); st.add(pl); }); st.position.set(0, 0, k * 2.9); g.add(st); }); [-1, 1].forEach((k) => { const tent = new THREE.Group(); const t = mesh(new THREE.ConeGeometry(0.9, 1.8, 10), toy(k > 0 ? '#facc15' : '#7c3aed')); t.position.y = 0.9; tent.add(t); tent.position.set(k * 4.6, 0, 0); g.add(tent); }); return { g, r: 4.8 }; }
function forge(R) { const g = new THREE.Group(); const wall = std('#fff', { map: plankTex, roughness: 1 }); const b = mesh(new THREE.BoxGeometry(3, 2, 2.4), wall); b.position.y = 1; g.add(b); [-1, 1].forEach((k) => { const r = mesh(new THREE.BoxGeometry(3.4, 0.1, 1.6), std('#7f1d1d')); r.position.set(0, 2.45, k * 0.6); r.rotation.x = k * 0.6; g.add(r); }); const ch = mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), castleStone()); ch.position.set(1.1, 2.6, -0.4); g.add(ch); const anvil = mesh(new THREE.BoxGeometry(0.6, 0.35, 0.3), std('#374151', { metalness: 0.7, roughness: 0.4 })); anvil.position.set(-0.6, 0.45, 1.7); g.add(anvil); const ab = mesh(new THREE.BoxGeometry(0.3, 0.3, 0.25), std('#374151')); ab.position.set(-0.6, 0.15, 1.7); g.add(ab); const fire = mesh(new THREE.BoxGeometry(0.7, 0.4, 0.05), new THREE.MeshStandardMaterial({ color: '#fb923c', emissive: new THREE.Color('#f97316'), emissiveIntensity: 2 })); fire.position.set(0.6, 0.6, 1.22); g.add(fire); g.userData.smoke = true; return { g, r: 2.5 }; }
function tents(R) { const g = new THREE.Group(); [['#dc2626', -1.5, 0], ['#1d4ed8', 1.4, -0.6], ['#f8fafc', 0, 1.6]].forEach(([c, x, z]) => { const t = mesh(new THREE.CylinderGeometry(0.1, 1.1, 1.6, 12), toy(c)); t.position.set(x, 0.8, z); g.add(t); const s = mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.5, 12, 1, true), toy(c, { side: THREE.DoubleSide })); s.position.set(x, 0.25, z); g.add(s); const f = mesh(new THREE.PlaneGeometry(0.4, 0.25), std('#facc15', { side: THREE.DoubleSide })); f.position.set(x + 0.2, 1.9, z); g.add(f); }); return { g, r: 2.8 }; }
function haybale() { const g = new THREE.Group(); const h = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.6, 16), std('#eab308', { roughness: 1 })); h.rotation.z = Math.PI / 2; h.position.y = 0.4; g.add(h); return g; }
function horseModel() { const g = new THREE.Group(), coat = toy('#7c2d12', { roughness: 0.6 }), mane = toy('#1c1917'); const body = capsule(0.45, 1.3, coat); body.rotation.x = Math.PI / 2; body.position.y = 1.5; g.add(body); const neck = mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.9, 10), coat); neck.position.set(0, 2.0, 0.85); neck.rotation.x = 0.6; g.add(neck); const head = capsule(0.2, 0.45, coat); head.rotation.x = 1.2; head.position.set(0, 2.35, 1.25); g.add(head); const mn = mesh(new THREE.BoxGeometry(0.08, 0.5, 0.9), mane); mn.position.set(0, 2.2, 0.75); mn.rotation.x = 0.6; g.add(mn); const tail = mesh(new THREE.ConeGeometry(0.12, 0.8, 8), mane); tail.position.set(0, 1.3, -1.15); tail.rotation.x = -2.6; g.add(tail); const legs = []; [[-0.25, 0.6], [0.25, 0.6], [-0.25, -0.6], [0.25, -0.6]].forEach(([x, z]) => { const l = mesh(new THREE.CylinderGeometry(0.08, 0.07, 1.1, 8), coat); l.position.set(x, 0.55, z); g.add(l); legs.push(l); }); const blanket = mesh(new THREE.BoxGeometry(1.0, 0.05, 1.0), toy('#1d4ed8')); blanket.position.set(0, 1.97, 0); g.add(blanket); const trim = mesh(new THREE.BoxGeometry(1.02, 0.3, 1.02), toy('#facc15')); trim.position.set(0, 1.8, 0); trim.scale.y = 0.3; g.add(trim); g.userData.legs = legs; return g; }
function dragonBoss(g) { const sc = toy('#b91c1c', { roughness: 0.4 }), belly = toy('#fbbf24'), wingM = toy('#7f1d1d', { side: THREE.DoubleSide });
  const body = sphere(1.3, sc); body.scale.set(1, 1.15, 1.2); body.position.y = 1.9; g.add(body); const bl = sphere(1.0, belly); bl.scale.set(0.9, 1.1, 0.6); bl.position.set(0, 1.8, 0.65); g.add(bl);
  const neck = mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.3, 12), sc); neck.position.set(0, 3.2, 0.5); neck.rotation.x = 0.4; g.add(neck);
  const head = sphere(0.75, sc); head.scale.set(1, 0.85, 1.2); head.position.set(0, 4.0, 0.9); g.add(head); const sn = sphere(0.45, sc); sn.scale.set(1, 0.7, 1.1); sn.position.set(0, 3.8, 1.6); g.add(sn);
  [-1, 1].forEach((k) => { const e = sphere(0.14, new THREE.MeshStandardMaterial({ color: '#fde047', emissive: new THREE.Color('#facc15'), emissiveIntensity: 1.5 })); e.position.set(k * 0.35, 4.25, 1.4); g.add(e); const pu = mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), toy('#111')); pu.position.set(k * 0.35, 4.25, 1.53); g.add(pu); const hn = mesh(new THREE.ConeGeometry(0.12, 0.6, 8), toy('#fef3c7')); hn.position.set(k * 0.4, 4.6, 0.6); hn.rotation.x = -0.6; g.add(hn); const nos = sphere(0.05, toy('#111')); nos.position.set(k * 0.15, 3.95, 2.0); g.add(nos);
    const w = new THREE.Group(); const wm = new THREE.Shape(); wm.moveTo(0, 0); wm.lineTo(2.4, 1.4); wm.lineTo(2.2, 0.2); wm.lineTo(1.6, 0.5); wm.lineTo(1.4, -0.3); wm.lineTo(0.8, 0); wm.lineTo(0, -0.6); const wing = mesh(new THREE.ShapeGeometry(wm), wingM); wing.scale.x = k; w.add(wing); w.position.set(k * 0.8, 2.6, -0.4); w.rotation.y = -k * 0.4; g.add(w);
    const leg = capsule(0.35, 0.5, sc); leg.position.set(k * 0.7, 0.55, 0.2); g.add(leg); const arm = capsule(0.2, 0.5, sc); arm.position.set(k * 0.9, 2.0, 0.9); arm.rotation.x = -0.9; g.add(arm); });
  for (let i = 0; i < 5; i++) { const sp = mesh(new THREE.ConeGeometry(0.15, 0.4, 6), belly); sp.position.set(0, 3.1 - i * 0.5, -1.1 + i * 0.05); sp.rotation.x = -0.6; g.add(sp); }
  const tail = mesh(new THREE.ConeGeometry(0.35, 2.2, 10), sc); tail.position.set(0, 0.7, -1.9); tail.rotation.x = -1.9; g.add(tail);
  const fl = sphere(0.3, new THREE.MeshStandardMaterial({ color: '#fb923c', emissive: new THREE.Color('#f97316'), emissiveIntensity: 2.5, transparent: true, opacity: 0.85 })); fl.scale.set(1, 1, 2); fl.position.set(0, 3.7, 2.4); g.add(fl);
}
/* ---------------- Pôle Nord ---------------- */
const snowM = () => std('#f8fafc', { roughness: 0.7 });
function snowPine(R) { const g = new THREE.Group(); const t = mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 8), std('#5b3a1a')); t.position.y = 0.25; g.add(t); const sm = snowM(); [0, 1, 2, 3].forEach((i) => { const c = mesh(new THREE.ConeGeometry(0.8 - i * 0.17, 0.85, 10), std('#14532d')); c.position.y = 0.7 + i * 0.45; g.add(c); const s = mesh(new THREE.ConeGeometry(0.62 - i * 0.15, 0.32, 10), sm); s.position.y = 0.98 + i * 0.45; g.add(s); }); return g; }
function snowman(R) { const g = new THREE.Group(), sm = snowM(); [[0.5, 0.45], [0.36, 1.15], [0.26, 1.65]].forEach(([r, y]) => { const b = sphere(r, sm); b.position.y = y; g.add(b); }); const nose = mesh(new THREE.ConeGeometry(0.06, 0.3, 8), toy('#f97316')); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.65, 0.36); g.add(nose); [-0.09, 0.09].forEach((x) => { const e = sphere(0.035, std('#111')); e.position.set(x, 1.74, 0.22); g.add(e); }); const hat = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 14), std('#1f2937')); hat.position.y = 2.0; g.add(hat); const brim = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), std('#1f2937')); brim.position.y = 1.86; g.add(brim); const sc = mesh(new THREE.TorusGeometry(0.27, 0.07, 8, 18), toy('#dc2626')); sc.rotation.x = Math.PI / 2; sc.position.y = 1.42; g.add(sc); [-1, 1].forEach((k) => { const a = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.7, 5), std('#5b3a1a')); a.position.set(k * 0.5, 1.25, 0); a.rotation.z = k * -1.0; g.add(a); }); return g; }
function iceSpikes(R) { const g = new THREE.Group(), m = new THREE.MeshPhysicalMaterial({ color: '#bae6fd', roughness: 0.05, transmission: 0.3, transparent: true, opacity: 0.9, clearcoat: 1, flatShading: true }); for (let i = 0; i < 4; i++) { const h = 0.8 + R() * 1.4; const c = mesh(new THREE.ConeGeometry(0.22 + R() * 0.15, h, 5), m); c.position.set((R() - 0.5) * 0.9, h / 2, (R() - 0.5) * 0.9); c.rotation.z = (R() - 0.5) * 0.4; g.add(c); } return g; }
function penguin() { const g = new THREE.Group(); const body = sphere(0.32, toy('#111827')); body.scale.set(1, 1.45, 0.95); body.position.y = 0.48; g.add(body); const belly = sphere(0.26, toy('#f8fafc')); belly.scale.set(0.9, 1.3, 0.6); belly.position.set(0, 0.45, 0.14); g.add(belly); const beak = mesh(new THREE.ConeGeometry(0.06, 0.16, 8), toy('#f59e0b')); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.78, 0.3); g.add(beak); [-0.1, 0.1].forEach((x) => { const e = sphere(0.04, toy('#fff')); e.position.set(x, 0.86, 0.24); g.add(e); const f = sphere(0.09, toy('#f59e0b')); f.scale.set(1, 0.35, 1.4); f.position.set(x * 1.3, 0.03, 0.08); g.add(f); }); [-1, 1].forEach((k) => { const w = sphere(0.14, toy('#111827')); w.scale.set(0.3, 1.2, 0.7); w.position.set(k * 0.32, 0.5, 0); w.rotation.z = k * 0.3; g.add(w); }); return g; }
function igloo(R) { // igloo en blocs de neige (rayon ~2)
  const g = new THREE.Group(), t = canvasTex(256, 128, (c, w, h) => { c.fillStyle = '#f8fafc'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(148,163,184,.7)'; c.lineWidth = 2; for (let y = 0; y < 8; y++) { c.beginPath(); c.moveTo(0, y * 16); c.lineTo(w, y * 16); c.stroke(); for (let x = 0; x < 9; x++) { const xx = x * 32 + (y % 2) * 16; c.beginPath(); c.moveTo(xx, y * 16); c.lineTo(xx, y * 16 + 16); c.stroke(); } } });
  const dome = mesh(new THREE.SphereGeometry(1.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), std('#fff', { map: t, roughness: 0.6 }), true, true); g.add(dome);
  const tg = new THREE.CylinderGeometry(0.65, 0.65, 1.2, 20, 1, true, -Math.PI / 2, Math.PI); tg.rotateX(-Math.PI / 2); const tun = mesh(tg, std('#fff', { map: t, roughness: 0.6, side: THREE.DoubleSide })); tun.position.set(0, 0, 1.6); g.add(tun);
  const hole = mesh(new THREE.CircleGeometry(0.5, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#1e293b' })); hole.position.set(0, 0.01, 2.21); g.add(hole);
  const glow = sphere(0.2, new THREE.MeshStandardMaterial({ color: '#fde68a', emissive: new THREE.Color('#f59e0b'), emissiveIntensity: 2 })); glow.position.set(0, 0.25, 2.0); g.add(glow);
  return { g, r: 2.3 };
}
function iglooVillage(R) { const g = new THREE.Group(); [[-2.2, -1, 0.3], [2.1, -1.3, -0.4], [0, 1.6, 0]].forEach(([x, z, ry]) => { const i = igloo(R).g; i.position.set(x, 0, z); i.rotation.y = ry; i.scale.setScalar(0.85); g.add(i); }); const fire = new THREE.Group(); for (let i = 0; i < 4; i++) { const l = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), std('#5b3a1a')); l.rotation.set(Math.PI / 2, i * 0.8, 0); l.position.y = 0.08; fire.add(l); } const fl = mesh(new THREE.ConeGeometry(0.22, 0.6, 10), new THREE.MeshStandardMaterial({ color: '#fb923c', emissive: new THREE.Color('#f97316'), emissiveIntensity: 2.2 })); fl.position.y = 0.4; fire.add(fl); fire.position.set(0, 0, -0.2); g.add(fire); g.userData.smoke = true; const p = penguin(); p.position.set(0.9, 0, 0.3); g.add(p); return { g, r: 4 }; }
function iceCastle(R) { const g = new THREE.Group(), m = new THREE.MeshPhysicalMaterial({ color: '#bfdbfe', roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.92, emissive: new THREE.Color('#38bdf8'), emissiveIntensity: 0.15 }); const base = mesh(new THREE.BoxGeometry(4, 2, 3), m); base.position.y = 1; g.add(base); [[-2, -1.5], [2, -1.5], [-2, 1.5], [2, 1.5]].forEach(([x, z]) => { const t = mesh(new THREE.CylinderGeometry(0.55, 0.65, 3.2, 8), m); t.position.set(x, 1.6, z); g.add(t); const c = mesh(new THREE.ConeGeometry(0.75, 1.3, 8), m); c.position.set(x, 3.85, z); g.add(c); }); const keep = mesh(new THREE.CylinderGeometry(0.9, 1.0, 4.2, 8), m); keep.position.y = 2.1; g.add(keep); const kc = mesh(new THREE.ConeGeometry(1.2, 1.8, 8), m); kc.position.y = 5.1; g.add(kc); const door = mesh(new THREE.BoxGeometry(1, 1.4, 0.1), std('#1e3a8a')); door.position.set(0, 0.7, 1.52); g.add(door); return { g, r: 3.3 }; }
function fishingSpot(R) { const g = new THREE.Group(); const hole = mesh(new THREE.CircleGeometry(0.7, 20), new THREE.MeshPhysicalMaterial({ color: '#0c4a6e', roughness: 0.05, clearcoat: 1 }), false, true); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.03; g.add(hole); const rim = mesh(new THREE.TorusGeometry(0.72, 0.12, 6, 20), snowM()); rim.rotation.x = Math.PI / 2; rim.position.y = 0.05; g.add(rim); const hut = mesh(new THREE.BoxGeometry(1.6, 1.4, 1.4), std('#b45309')); hut.position.set(1.8, 0.7, 0); g.add(hut); const rf = mesh(new THREE.ConeGeometry(1.3, 0.7, 4), std('#f8fafc')); rf.rotation.y = Math.PI / 4; rf.position.set(1.8, 1.75, 0); g.add(rf); const rod = mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.6, 5), std('#78350f')); rod.position.set(0.5, 0.7, 0.4); rod.rotation.z = 0.8; g.add(rod); const p = penguin(); p.position.set(0.9, 0, 0.7); p.rotation.y = -1.6; g.add(p); return { g, r: 2.8 }; }
function huskySled() { const g = new THREE.Group(); const wood = std('#92400e'); [-0.45, 0.45].forEach((x) => { const run = mesh(new THREE.BoxGeometry(0.08, 0.08, 2.4), std('#475569', { metalness: 0.6 })); run.position.set(x, 0.05, 0); g.add(run); const tip = mesh(new THREE.TorusGeometry(0.25, 0.04, 6, 12, Math.PI / 2), std('#475569', { metalness: 0.6 })); tip.rotation.y = Math.PI / 2; tip.position.set(x, 0.3, 1.2); g.add(tip); }); const deck = mesh(new THREE.BoxGeometry(1.0, 0.1, 1.8), wood); deck.position.y = 0.35; g.add(deck); const back = mesh(new THREE.BoxGeometry(1.0, 0.8, 0.08), wood); back.position.set(0, 0.75, -0.85); g.add(back); const legs = []; [[-0.35, 2.2], [0.35, 2.2], [-0.35, 3.2], [0.35, 3.2]].forEach(([x, z]) => { const d = new THREE.Group(); const b = sphere(0.22, toy('#9ca3af')); b.scale.set(0.8, 0.8, 1.6); b.position.y = 0.5; d.add(b); const h = sphere(0.17, toy('#e5e7eb')); h.position.set(0, 0.65, 0.4); d.add(h); [-0.08, 0.08].forEach((ex) => { const e = mesh(new THREE.ConeGeometry(0.06, 0.14, 4), toy('#6b7280')); e.position.set(ex, 0.82, 0.38); d.add(e); }); const l1 = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 5), toy('#9ca3af')); l1.position.set(0, 0.2, 0.2); d.add(l1); legs.push(l1); const l2 = l1.clone(); l2.position.z = -0.2; d.add(l2); legs.push(l2); d.position.set(x, 0, z - 0.6); g.add(d); }); const rope = mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 4), std('#e5e7eb')); rope.rotation.x = Math.PI / 2; rope.position.set(0, 0.45, 2.0); g.add(rope); g.userData.legs = legs; return g; }
function yetiBoss(g) {
  const fur = toy('#f1f5f9', { roughness: 0.9, clearcoat: 0 }), face = toy('#7dd3fc', { roughness: 0.6 });
  const body = sphere(1.5, fur); body.scale.set(1, 1.2, 0.9); body.position.y = 2.0; g.add(body);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const tuft = mesh(new THREE.ConeGeometry(0.25, 0.6, 6), fur); tuft.position.set(Math.cos(a) * 1.4, 1.0 + (i % 3) * 0.6, Math.sin(a) * 1.25); tuft.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); g.add(tuft); }
  const head = sphere(0.85, fur); head.position.y = 3.85; g.add(head);
  const f = sphere(0.6, face); f.scale.set(1, 0.85, 0.5); f.position.set(0, 3.75, 0.55); g.add(f);
  [-0.22, 0.22].forEach((x) => { const e = sphere(0.1, toy('#111')); e.position.set(x, 3.95, 0.82); g.add(e); const br = mesh(new THREE.BoxGeometry(0.28, 0.07, 0.06), toy('#475569')); br.position.set(x, 4.12, 0.82); br.rotation.z = x > 0 ? 0.35 : -0.35; g.add(br); });
  const mouth = mesh(new THREE.BoxGeometry(0.45, 0.15, 0.06), toy('#1e293b')); mouth.position.set(0, 3.5, 0.85); g.add(mouth);
  [-0.12, 0.12].forEach((x) => { const t = mesh(new THREE.ConeGeometry(0.05, 0.14, 4), toy('#fff')); t.rotation.x = Math.PI; t.position.set(x, 3.45, 0.88); g.add(t); });
  [-1, 1].forEach((k) => { const arm = capsule(0.35, 1.4, fur); arm.position.set(k * 1.6, 2.1, 0.2); arm.rotation.z = k * 0.4; g.add(arm); const h = sphere(0.35, face); h.position.set(k * 1.95, 1.3, 0.25); g.add(h); const l = capsule(0.4, 0.5, fur); l.position.set(k * 0.6, 0.55, 0); g.add(l); const ft = sphere(0.45, face); ft.scale.set(1, 0.35, 1.4); ft.position.set(k * 0.6, 0.12, 0.25); g.add(ft); });
}
function auroraCurtain(W, back) { const g = new THREE.Group(); const t = canvasTex(256, 128, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(167,139,250,0)'); gr.addColorStop(0.35, 'rgba(167,139,250,.55)'); gr.addColorStop(0.7, 'rgba(52,211,153,.75)'); gr.addColorStop(1, 'rgba(52,211,153,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 6) { c.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.15) + ')'; c.fillRect(x, 0, 2, h); } });
  [0, 1, 2].forEach((i) => { const geo = new THREE.PlaneGeometry(W * 0.9, 14, 40, 1); const pa = geo.attributes.position; for (let j = 0; j < pa.count; j++) pa.setZ(j, Math.sin(pa.getX(j) * 0.08 + i * 2) * 4); const m = mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }), false); m.position.set((i - 1) * W * 0.3, 22 + i * 3, back - 40 - i * 6); g.add(m); }); g.userData.aurora = true; return g; }
/* ---------------- Égypte ---------------- */
const sandBlockTex = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#d9b77a'; c.fillRect(0, 0, w, h); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const off = y % 2 ? 16 : 0; const v = 200 + Math.floor(Math.random() * 30); c.fillStyle = 'rgb(' + v + ',' + (v - 30) + ',' + (v - 85) + ')'; c.fillRect(x * 32 + off + 1, y * 32 + 1, 30, 30); } c.strokeStyle = 'rgba(90,60,30,.35)'; c.lineWidth = 2; for (let y = 0; y <= 8; y++) { c.beginPath(); c.moveTo(0, y * 32); c.lineTo(w, y * 32); c.stroke(); } });
sandBlockTex.wrapS = sandBlockTex.wrapT = THREE.RepeatWrapping;
function pyramid(R, big) { // pyramide à degrés avec pointe dorée (rayon ~4.5)
  const g = new THREE.Group(), S = big ? 2.2 : 1, steps = 9;
  for (let i = 0; i < steps; i++) { const w = (8 - i * 0.82) * S, hh = 0.62 * S; const t = sandBlockTex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, w / 2), 0.5); const b = mesh(new THREE.BoxGeometry(w, hh, w), std('#fff', { map: t, bumpMap: t, bumpScale: 1.5, roughness: 0.95 }), true, true); b.position.y = hh / 2 + i * hh; g.add(b); }
  const cap = mesh(new THREE.ConeGeometry(0.95 * S, 1.1 * S, 4), new THREE.MeshPhysicalMaterial({ color: '#fbbf24', metalness: 1, roughness: 0.2, emissive: new THREE.Color('#b45309'), emissiveIntensity: 0.3 })); cap.rotation.y = Math.PI / 4; cap.position.y = steps * 0.62 * S + 0.55 * S; g.add(cap);
  const door = mesh(new THREE.BoxGeometry(1.0 * S, 1.3 * S, 0.1), std('#3b2a18')); door.position.set(0, 0.65 * S, 4 * S + 0.02); g.add(door);
  return { g, r: 4.6 * S };
}
function sphinx() { // le Sphinx couché (rayon ~4)
  const g = new THREE.Group(), st = std('#d6b27a', { roughness: 0.95 }), stripe = std('#2563eb', { roughness: 0.6 }), gold = std('#facc15', { metalness: 0.6, roughness: 0.35 });
  const base = mesh(roundedBox(3.4, 0.5, 6.6, 0.1), std('#c9a46b')); base.position.y = 0.25; g.add(base);
  const body = mesh(new THREE.CapsuleGeometry(1.0, 2.6, 8, 16), st); body.rotation.x = Math.PI / 2; body.position.set(0, 1.4, -0.9); body.scale.set(1.1, 1, 0.9); g.add(body);
  [-0.7, 0.7].forEach((x) => { const leg = mesh(roundedBox(0.6, 0.5, 2.4, 0.2), st); leg.position.set(x, 0.75, 1.6); g.add(leg); const paw = mesh(new THREE.SphereGeometry(0.35, 12, 8), st); paw.scale.set(1, 0.6, 1.2); paw.position.set(x, 0.65, 2.8); g.add(paw); });
  const chest = sphere(0.95, st); chest.scale.set(1.1, 1.2, 0.9); chest.position.set(0, 1.8, 0.7); g.add(chest);
  const head = sphere(0.65, st); head.scale.set(0.9, 1.05, 0.95); head.position.set(0, 3.0, 1.0); g.add(head);
  [-1, 1].forEach((k) => { for (let i = 0; i < 4; i++) { const s2 = mesh(new THREE.BoxGeometry(0.18, 1.3, 0.12), i % 2 ? stripe : gold); s2.position.set(k * 0.62, 2.55, 0.75 + i * 0.12); g.add(s2); } });
  const nemes = mesh(new THREE.SphereGeometry(0.72, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), stripe); nemes.position.set(0, 3.05, 0.95); g.add(nemes);
  const band = mesh(new THREE.TorusGeometry(0.68, 0.06, 6, 24), gold); band.rotation.x = Math.PI / 2; band.position.set(0, 3.2, 0.95); g.add(band);
  const nose = mesh(new THREE.BoxGeometry(0.14, 0.25, 0.18), st); nose.position.set(0, 2.95, 1.62); g.add(nose);
  [-0.22, 0.22].forEach((x) => { const e = mesh(new THREE.BoxGeometry(0.2, 0.06, 0.05), std('#1f2937')); e.position.set(x, 3.12, 1.58); g.add(e); });
  const beard = mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.5, 8), gold); beard.position.set(0, 2.45, 1.45); g.add(beard);
  const tail = mesh(new THREE.TorusGeometry(0.5, 0.08, 6, 16, Math.PI), st); tail.position.set(0.9, 0.6, -2.6); tail.rotation.y = Math.PI / 2; g.add(tail);
  return { g, r: 4 };
}
function obelisk(R) { const g = new THREE.Group(), st = std('#c9a46b', { roughness: 0.9 }); const b = mesh(new THREE.BoxGeometry(1.1, 0.4, 1.1), std('#b8925c')); b.position.y = 0.2; g.add(b); const sh = mesh(new THREE.CylinderGeometry(0.3, 0.42, 4.2, 4), st); sh.rotation.y = Math.PI / 4; sh.position.y = 2.5; g.add(sh); const tip = mesh(new THREE.ConeGeometry(0.3, 0.5, 4), new THREE.MeshPhysicalMaterial({ color: '#fbbf24', metalness: 1, roughness: 0.2 })); tip.rotation.y = Math.PI / 4; tip.position.y = 4.85; g.add(tip); for (let i = 0; i < 5; i++) { const gl = mesh(new THREE.BoxGeometry(0.18, 0.12, 0.02), std('#7c4a1e')); gl.position.set((i % 2 ? 0.06 : -0.06), 1.2 + i * 0.6, 0.38 - i * 0.025); g.add(gl); } return { g, r: 1.2 }; }
function temple(R) { // ruines de temple à colonnes (rayon ~4)
  const g = new THREE.Group(), st = std('#d9bd8c', { roughness: 0.95 }), paint = std('#0e7490');
  const floor = mesh(new THREE.BoxGeometry(6.5, 0.4, 5), std('#c9a46b'), true, true); floor.position.y = 0.2; g.add(floor);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const broken = R() < 0.3; const hh = broken ? 1.2 + R() * 1.3 : 3.2; const c = mesh(new THREE.CylinderGeometry(0.34, 0.4, hh, 14), st); c.position.set(-2.4 + i * 1.6, 0.4 + hh / 2, -1.6 + j * 3.2); g.add(c); if (!broken) { const cap = mesh(new THREE.CylinderGeometry(0.55, 0.36, 0.4, 14), paint); cap.position.set(c.position.x, 0.4 + hh + 0.2, c.position.z); g.add(cap); } }
  const lint = mesh(new THREE.BoxGeometry(5.2, 0.5, 0.9), st); lint.position.set(-0.8 + 0.8, 4.25, 1.6); g.add(lint);
  const fallen = mesh(new THREE.CylinderGeometry(0.34, 0.34, 2.2, 14), st); fallen.rotation.z = Math.PI / 2; fallen.position.set(1.2, 0.75, -0.2); fallen.rotation.y = 0.5; g.add(fallen);
  return { g, r: 4 };
}
function oasis(R) { // oasis : mare bleue + palmiers + roseaux (rayon ~3.5)
  const g = new THREE.Group();
  const sand = mesh(new THREE.CircleGeometry(3.4, 32), std('#d9c08a'), false, true); sand.rotation.x = -Math.PI / 2; sand.position.y = 0.02; g.add(sand);
  const wat = mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshPhysicalMaterial({ color: '#0ea5b7', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.9 }), false, true); wat.rotation.x = -Math.PI / 2; wat.position.y = 0.05; wat.scale.set(1, 0.75, 1); g.add(wat);
  for (let i = 0; i < 3; i++) { const p = palm(R); const a = i * 2.1 + 0.4; p.position.set(Math.cos(a) * 2.9, 0, Math.sin(a) * 2.3); p.scale.setScalar(1.1 + R() * 0.3); g.add(p); }
  for (let i = 0; i < 14; i++) { const a = R() * 6.28; const pp = papyrus(R); pp.position.set(Math.cos(a) * 2.3, 0, Math.sin(a) * 1.75); g.add(pp); }
  return { g, r: 3.4 };
}
function papyrus(R) { const g = new THREE.Group(), m = std('#4d7c0f'); for (let i = 0; i < 3; i++) { const hh = 0.8 + R() * 0.6; const s = mesh(new THREE.CylinderGeometry(0.02, 0.03, hh, 5), m, false); s.position.set((R() - 0.5) * 0.3, hh / 2, (R() - 0.5) * 0.3); s.rotation.z = (R() - 0.5) * 0.3; g.add(s); const tuft = mesh(new THREE.ConeGeometry(0.16, 0.22, 8, 1, true), std('#65a30d', { side: THREE.DoubleSide }), false); tuft.rotation.x = Math.PI; tuft.position.set(s.position.x, hh + 0.05, s.position.z); g.add(tuft); } return g; }
function urn() { const g = new THREE.Group(); const u = lathe([[0, 0], [0.22, 0.02], [0.36, 0.25], [0.38, 0.5], [0.24, 0.78], [0.16, 0.85], [0.2, 0.95], [0, 0.95]], toy('#c2410c', { roughness: 0.6, clearcoat: 0.2 }), 24); g.add(u); const band = mesh(new THREE.TorusGeometry(0.37, 0.025, 6, 24), std('#1f2937')); band.rotation.x = Math.PI / 2; band.position.y = 0.45; g.add(band); return g; }
function cactus(R) { const g = new THREE.Group(), m = std('#4d7c0f', { roughness: 0.7 }); const t = capsule(0.22, 1.2, m); t.position.y = 0.8; g.add(t); [-1, 1].forEach((k) => { if (R() < 0.3) return; const a = capsule(0.13, 0.4, m); a.position.set(k * 0.38, 0.9 + R() * 0.3, 0); g.add(a); const c = capsule(0.13, 0.2, m); c.rotation.z = Math.PI / 2; c.position.set(k * 0.24, a.position.y - 0.25, 0); g.add(c); }); return g; }
function camelModel() { // chameau-taxi avec selle
  const g = new THREE.Group(), fur = toy('#c08a4a', { roughness: 0.8, clearcoat: 0.1 }), dark = std('#5b3a1a');
  const body = sphere(0.75, fur); body.scale.set(0.9, 0.75, 1.5); body.position.y = 1.75; g.add(body);
  const hump = sphere(0.5, fur); hump.scale.set(1, 0.9, 1.2); hump.position.set(0, 2.35, -0.1); g.add(hump);
  const neck = mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.2, 10), fur); neck.position.set(0, 2.3, 1.15); neck.rotation.x = 0.6; g.add(neck);
  const head = sphere(0.28, fur); head.scale.set(0.9, 0.85, 1.5); head.position.set(0, 2.9, 1.55); g.add(head);
  [-0.12, 0.12].forEach((x) => { const e = sphere(0.05, std('#111')); e.position.set(x * 1.5, 3.0, 1.7); g.add(e); const ear = sphere(0.07, fur); ear.position.set(x * 1.6, 3.15, 1.4); g.add(ear); });
  const legs = []; [[-0.35, 0.8], [0.35, 0.8], [-0.35, -0.8], [0.35, -0.8]].forEach(([x, z]) => { const l = mesh(new THREE.CylinderGeometry(0.11, 0.08, 1.4, 8), fur); l.position.set(x, 0.7, z); g.add(l); legs.push(l); const h = mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.12, 8), dark); h.position.set(x, 0.05, z); g.add(h); });
  const blanket = mesh(new THREE.BoxGeometry(1.3, 0.06, 1.1), toy('#dc2626')); blanket.position.set(0, 2.25, -0.75); g.add(blanket);
  const fr = mesh(new THREE.BoxGeometry(1.32, 0.12, 0.12), toy('#facc15')); fr.position.set(0, 2.2, -0.2); g.add(fr);
  g.userData.legs = legs; return g;
}
function mummyBoss(g) {
  const wrap = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#e7dfc8'; c.fillRect(0, 0, w, h); for (let i = 0; i < 10; i++) { c.strokeStyle = 'rgba(120,100,70,.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, i * 7 + Math.random() * 3); c.lineTo(w, i * 7 + 3 + Math.random() * 3); c.stroke(); } });
  wrap.wrapS = wrap.wrapT = THREE.RepeatWrapping; wrap.repeat.set(2, 3);
  const m = toy('#fff', { map: wrap, roughness: 0.9, clearcoat: 0 }), gold = std('#facc15', { metalness: 0.8, roughness: 0.3 }), blue = std('#1d4ed8');
  const body = capsule(1.0, 1.6, m); body.position.y = 1.9; g.add(body);
  const head = sphere(0.75, m); head.position.y = 3.9; g.add(head);
  const nemes = mesh(new THREE.SphereGeometry(0.8, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), blue); nemes.position.y = 3.95; g.add(nemes);
  [-1, 1].forEach((k) => { const lap = mesh(new THREE.BoxGeometry(0.35, 1.1, 0.25), blue); lap.position.set(k * 0.7, 3.4, 0.2); g.add(lap); const e = sphere(0.13, new THREE.MeshStandardMaterial({ color: '#4ade80', emissive: new THREE.Color('#22c55e'), emissiveIntensity: 2.2 })); e.position.set(k * 0.27, 3.95, 0.68); g.add(e); const arm = capsule(0.25, 1.1, m); arm.position.set(k * 1.2, 2.9, 0.6); arm.rotation.x = -1.3; g.add(arm); });
  const collar = mesh(new THREE.TorusGeometry(0.9, 0.15, 8, 24), gold); collar.rotation.x = Math.PI / 2; collar.position.y = 3.2; g.add(collar);
  const cobra = mesh(new THREE.ConeGeometry(0.12, 0.4, 8), gold); cobra.position.set(0, 4.55, 0.55); g.add(cobra);
  const loose = mesh(new THREE.PlaneGeometry(0.25, 1.2), std('#e7dfc8', { side: THREE.DoubleSide })); loose.position.set(0.8, 1.2, 0.6); loose.rotation.z = 0.3; g.add(loose);
}
function hauntedShack(R) { // maison cassée (rayon ~3)
  const g = new THREE.Group(), wall = std('#fff', { map: plankTex, roughness: 1 }), dark = std('#2b211b'), roofM = std('#3f3a44', { roughness: 0.9, side: THREE.DoubleSide });
  const body = mesh(new THREE.BoxGeometry(3.6, 2.4, 2.8), wall); body.position.y = 1.2; body.rotation.z = 0.03; g.add(body);
  [-1, 1].forEach((k, i) => { const r = mesh(new THREE.PlaneGeometry(4.2, 2.2, 4, 2), roofM); const pa = r.geometry.attributes.position; for (let j = 0; j < pa.count; j++) pa.setZ(j, (hash3(j, i, 3) - 0.5) * 0.15); r.geometry.computeVertexNormals(); r.position.set(0, 3.0, k * 0.72); r.rotation.x = k * 1.0 + (i ? 0.25 : 0); if (i) { r.scale.x = 0.7; r.position.x = 0.6; } g.add(r); });
  const ch = mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), std('#57534e')); ch.position.set(-1.1, 3.6, 0.3); ch.rotation.z = 0.25; g.add(ch);
  [-0.9, 0.9].forEach((x) => { const wnd = mesh(new THREE.BoxGeometry(0.7, 0.7, 0.05), new THREE.MeshStandardMaterial({ color: '#111', emissive: new THREE.Color('#facc15'), emissiveIntensity: R() < 0.5 ? 0.6 : 0 })); wnd.position.set(x, 1.5, 1.41); g.add(wnd); [0.5, -0.5].forEach((a) => { const b = mesh(new THREE.BoxGeometry(0.95, 0.12, 0.05), std('#7c5a3a')); b.position.set(x, 1.5, 1.45); b.rotation.z = a; g.add(b); }); });
  const door = mesh(new THREE.BoxGeometry(0.8, 1.5, 0.08), dark); door.position.set(0.15, 0.75, 1.5); door.rotation.y = 0.6; g.add(door);
  const porch = mesh(new THREE.BoxGeometry(3.8, 0.15, 1.0), std('#4a3a2c')); porch.position.set(0, 0.08, 1.9); porch.rotation.z = -0.04; g.add(porch);
  [-1.7, 1.7].forEach((x) => { const post = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), std('#4a3a2c')); post.position.set(x, 0.8, 2.3); post.rotation.z = x > 0 ? 0.12 : 0; g.add(post); });
  return { g, r: 3.2 };
}
function cemetery(R) { // cimetière clôturé avec mausolée (rayon ~4.5)
  const g = new THREE.Group(), S = 3.6;
  for (let k = 0; k < 4; k++) for (let i = -2; i <= 1; i++) { if (k === 2 && (i === -1 || i === 0)) continue; const f = ironFence(); const a = k * Math.PI / 2; f.position.set(Math.cos(a) * S + Math.sin(a) * (i * 1.8 + 0.9), 0, Math.sin(a) * S - Math.cos(a) * (i * 1.8 + 0.9)); f.rotation.y = -a + Math.PI / 2; g.add(f); }
  const gp = std('#1f2937', { metalness: 0.6 }); [-1, 1].forEach((k) => { const p = mesh(new THREE.BoxGeometry(0.3, 1.6, 0.3), std('#57534e')); p.position.set(k * 1.0, 0.8, S); g.add(p); });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { if (r === 0 && (c === 1 || c === 2)) continue; const t = tombstone(R); t.position.set(-2.4 + c * 1.6, 0, -2.2 + r * 1.6); t.rotation.y = (R() - 0.5) * 0.3; g.add(t); }
  const mau = new THREE.Group(), stone = std('#a8a29e', { roughness: 0.95 });
  const mb = mesh(new THREE.BoxGeometry(2.0, 1.8, 1.6), stone); mb.position.y = 0.9; mau.add(mb);
  const mr = mesh(new THREE.ConeGeometry(1.5, 1.1, 4), std('#57534e')); mr.rotation.y = Math.PI / 4; mr.position.y = 2.35; mau.add(mr);
  [-0.75, 0.75].forEach((x) => { const col = mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.8, 10), stone); col.position.set(x, 0.9, 0.85); mau.add(col); });
  const dr = mesh(new THREE.BoxGeometry(0.8, 1.2, 0.05), std('#1c1917')); dr.position.set(0, 0.6, 0.81); mau.add(dr);
  const cr1 = mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), stone); cr1.position.y = 3.2; mau.add(cr1); const cr2 = mesh(new THREE.BoxGeometry(0.45, 0.12, 0.12), stone); cr2.position.y = 3.3; mau.add(cr2);
  mau.position.set(0, 0, -2.6); mau.scale.setScalar(0.9); g.add(mau);
  const dt = deadTree(R); dt.scale.setScalar(1.6); dt.position.set(2.4, 0, -2.4); g.add(dt);
  const lan = lantern(); lan.position.set(-1.0, 0, S + 0.4); g.add(lan);
  return { g, r: 4.6, glow: lan };
}
function swamp(R) { // marais (rayon ~4)
  const g = new THREE.Group();
  const pg = new THREE.CircleGeometry(3.6, 40); const pa = pg.attributes.position; for (let i = 1; i < pa.count; i++) { const a = Math.atan2(pa.getY(i), pa.getX(i)), k = 0.8 + 0.25 * Math.sin(a * 3 + 1) + 0.1 * Math.sin(a * 7); pa.setXY(i, Math.cos(a) * 3.6 * k, Math.sin(a) * 3.6 * k * 0.8); }
  const mud = mesh(pg.clone(), std('#3b3222', { roughness: 1 }), false, true); mud.rotation.x = -Math.PI / 2; mud.scale.setScalar(1.12); mud.position.y = 0.02; g.add(mud);
  const water = mesh(pg, new THREE.MeshPhysicalMaterial({ color: '#4d5a1f', roughness: 0.2, clearcoat: 0.8, transparent: true, opacity: 0.92, envMapIntensity: 0.4 }), false, true); water.rotation.x = -Math.PI / 2; water.position.y = 0.05; g.add(water);
  const reedM = std('#6b7a2a'), catM = std('#5b3a1a');
  for (let i = 0; i < 26; i++) { const a = R() * 6.28, rr = 2.6 + R() * 1.2; const rd = mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.9 + R() * 0.6, 5), reedM); rd.position.set(Math.cos(a) * rr, 0.5, Math.sin(a) * rr * 0.8); rd.rotation.z = (R() - 0.5) * 0.3; g.add(rd); if (R() < 0.5) { const ct = mesh(new THREE.CapsuleGeometry(0.05, 0.18, 4, 8), catM); ct.position.set(rd.position.x, 1.05, rd.position.z); g.add(ct); } }
  for (let i = 0; i < 8; i++) { const lp = mesh(new THREE.CircleGeometry(0.28, 14, 0.3, 5.7), std('#4d7c0f', { side: THREE.DoubleSide })); lp.rotation.x = -Math.PI / 2; const a = R() * 6.28, rr = R() * 2.2; lp.position.set(Math.cos(a) * rr, 0.07, Math.sin(a) * rr * 0.8); g.add(lp); }
  const stump = mesh(jitter(new THREE.CylinderGeometry(0.3, 0.4, 0.6, 8), 0.04, 4), std('#3b2f2a')); stump.position.set(1.2, 0.3, -0.6); g.add(stump);
  const bubbles = []; for (let i = 0; i < 6; i++) { const b = sphere(0.07, new THREE.MeshPhysicalMaterial({ color: '#a3b18a', transparent: true, opacity: 0.8, roughness: 0.1 }), 8, 6); b.userData.ph = R() * 3; b.userData.x = (R() - 0.5) * 3; b.userData.z = (R() - 0.5) * 2.2; g.add(b); bubbles.push(b); }
  g.userData.bubbles = bubbles;
  return { g, r: 4.0 };
}
function witchHut(R) { // cabane de sorcière sur pilotis + chaudron (rayon ~2.8)
  const g = new THREE.Group(), w = std('#fff', { map: plankTex });
  [[-0.9, -0.8], [0.9, -0.8], [-0.9, 0.8], [0.9, 0.8]].forEach(([x, z]) => { const st = mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 6), std('#3b2f2a')); st.position.set(x, 0.7, z); g.add(st); });
  const b = mesh(new THREE.CylinderGeometry(1.2, 1.3, 1.6, 8), w); b.position.y = 2.2; g.add(b);
  const rf = mesh(new THREE.ConeGeometry(1.7, 2.4, 8), std('#3f3a44')); rf.position.y = 4.1; rf.rotation.z = 0.15; g.add(rf);
  const wn = mesh(new THREE.CircleGeometry(0.25, 12), new THREE.MeshStandardMaterial({ color: '#111', emissive: new THREE.Color('#a3e635'), emissiveIntensity: 1.4 })); wn.position.set(0, 2.3, 1.29); g.add(wn);
  const cau = mesh(new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), std('#1f2937', { metalness: 0.5, side: THREE.DoubleSide })); cau.position.set(1.9, 0.5, 0.6); g.add(cau);
  const brew = mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshStandardMaterial({ color: '#84cc16', emissive: new THREE.Color('#65a30d'), emissiveIntensity: 1.5 })); brew.rotation.x = -Math.PI / 2; brew.position.set(1.9, 0.72, 0.6); g.add(brew);
  g.userData.smoke = true;
  return { g, r: 2.8 };
}
function well(R) { const g = new THREE.Group(), st = std('#78716c', { roughness: 1 }); const ring = mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.8, 16, 1, true), st); ring.position.y = 0.4; ring.material.side = THREE.DoubleSide; g.add(ring); const rim = mesh(new THREE.TorusGeometry(0.77, 0.1, 6, 20), st); rim.rotation.x = Math.PI / 2; rim.position.y = 0.82; g.add(rim); [-0.7, 0.7].forEach((x) => { const p = mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), std('#4a3a2c')); p.position.set(x, 1.4, 0); g.add(p); }); const rf = mesh(new THREE.ConeGeometry(1.1, 0.7, 4), std('#3f3a44')); rf.rotation.y = Math.PI / 4; rf.position.y = 2.4; g.add(rf); const dark = mesh(new THREE.CircleGeometry(0.72, 16), new THREE.MeshBasicMaterial({ color: '#0c0a09' })); dark.rotation.x = -Math.PI / 2; dark.position.y = 0.5; g.add(dark); return { g, r: 1.4 }; }
function npcModel(kind) {
  const g = new THREE.Group();
  if (kind === 'banque') { const skin = toy('#65a30d'); const body = capsule(0.42, 0.5, toy('#7c2d12')); body.position.y = 0.75; g.add(body); const head = sphere(0.45, skin); head.position.y = 1.55; g.add(head); [-1, 1].forEach((k) => { const ear = mesh(new THREE.ConeGeometry(0.14, 0.5, 8), skin); ear.rotation.z = k * 1.2; ear.position.set(k * 0.5, 1.65, 0); g.add(ear); const e = sphere(0.08, toy('#fde047')); e.position.set(k * 0.15, 1.62, 0.4); g.add(e); }); const hat = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 20), toy('#111827')); hat.position.y = 2.1; g.add(hat); const brim = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 20), toy('#111827')); brim.position.y = 1.9; g.add(brim); const chest = mesh(roundedBox(0.8, 0.55, 0.55, 0.05), toy('#a16207')); chest.position.set(0.8, 0.28, 0.2); g.add(chest); const cn = coinMesh(); cn.scale.setScalar(0.5); cn.position.set(0.8, 0.7, 0.2); g.add(cn); }
  else if (kind === 'esprit') { const b = lathe([[0, 0], [0.4, -0.05], [0.55, 0.3], [0.6, 0.8], [0.45, 1.25], [0, 1.35]], new THREE.MeshPhysicalMaterial({ color: '#e0e7ff', transparent: true, opacity: 0.85, emissive: new THREE.Color('#a5b4fc'), emissiveIntensity: 0.6 })); b.position.y = 0.6; g.add(b); [-1, 1].forEach((k) => { const e = sphere(0.09, toy('#111')); e.position.set(k * 0.18, 1.45, 0.48); g.add(e); }); const mo = sphere(0.1, toy('#111')); mo.scale.set(1.3, 0.6, 0.5); mo.position.set(0, 1.22, 0.52); g.add(mo); g.userData.float = true; }
  else { const robe = mesh(new THREE.ConeGeometry(0.6, 1.5, 20), toy('#6b21a8')); robe.position.y = 0.75; g.add(robe); const head = sphere(0.33, toy('#fcd34d')); head.position.y = 1.7; g.add(head); const hood = mesh(new THREE.SphereGeometry(0.4, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), toy('#581c87')); hood.position.y = 1.75; g.add(hood); const ball = sphere(0.28, new THREE.MeshPhysicalMaterial({ color: '#a5f3fc', transparent: true, opacity: 0.8, emissive: new THREE.Color('#22d3ee'), emissiveIntensity: 1.2, roughness: 0.05 })); ball.position.set(0, 1.15, 0.55); g.add(ball); const tb = mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.9, 12), std('#7c2d12')); tb.position.set(0, 0.45, 0.6); g.add(tb); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const z = textSprite('Z z z', '#c7d2fe', 48); z.scale.set(1.4, 0.55, 1); z.position.y = 2.6; z.visible = false; g.add(z); g.userData.zzz = z;
  return g;
}
function coral(R, ci) {
  const g = new THREE.Group(), col = ['#fb7185', '#f97316', '#c084fc', '#facc15', '#2dd4bf', '#f472b6'][ci != null ? ci % 6 : Math.floor(R() * 5)], m = toy(col, { roughness: 0.6 });
  const grow = (x, y, z, len, rz, rx, d) => { const b = mesh(new THREE.CylinderGeometry(0.06 * (3 - d), 0.09 * (3 - d), len, 7), m); b.position.set(x, y + len / 2, z); b.rotation.set(rx, 0, rz); g.add(b); if (d < 2) for (let i = 0; i < 2; i++) { const top = new THREE.Vector3(0, len, 0).applyEuler(new THREE.Euler(rx, 0, rz)); grow(x + top.x, y + top.y, z + top.z, len * 0.7, rz + (i ? 0.5 : -0.5), rx + (R() - 0.5) * 0.6, d + 1); } else { const t = sphere(0.09, m, 8, 6); const top = new THREE.Vector3(0, len, 0).applyEuler(new THREE.Euler(rx, 0, rz)); t.position.set(x + top.x, y + top.y, z + top.z); g.add(t); } };
  grow(0, 0, 0, 0.6, (R() - 0.5) * 0.3, (R() - 0.5) * 0.3, 0);
  if (R() < 0.5) { const brain = sphere(0.35, toy(['#a3e635', '#f472b6'][Math.floor(R() * 2)], { roughness: 0.9 }), 14, 10); brain.scale.y = 0.6; brain.position.set(0.5, 0.15, 0.2); g.add(brain); }
  return g;
}
function turtleModel() {
  const g = new THREE.Group(), sh = toy('#65a30d', { roughness: 0.5 }), sk = toy('#a3e635');
  const shell = sphere(1.3, sh, 24, 14); shell.scale.set(1.15, 0.45, 1.35); shell.position.y = 0.15; g.add(shell);
  for (let i = 0; i < 6; i++) { const p = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 6), toy('#3f6212')); const a = i / 6 * Math.PI * 2; p.position.set(Math.cos(a) * 0.7, 0.62, Math.sin(a) * 0.8); p.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(p); }
  const head = sphere(0.42, sk); head.position.set(0, 0.2, 1.75); g.add(head);
  [-0.17, 0.17].forEach((x) => { const e = sphere(0.07, toy('#111')); e.position.set(x, 0.35, 2.1); g.add(e); });
  const fl = []; [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => { const f = sphere(0.4, sk); f.scale.set(1.3, 0.2, 0.6); f.position.set(sx * 1.25, 0, sz * 0.85); g.add(f); fl.push(f); });
  g.userData.flippers = fl;
  return g;
}
/* ---------------- Véhicules des transports ---------------- */
function vehicleModel(kind) {
  const g = new THREE.Group();
  if (kind === 'ptero') { const f = flyerModel('ptero'); f.scale.setScalar(2.4); f.position.y = 3.3; g.add(f); g.userData.wings = f.userData.wings; }
  else if (kind === 'boat') { const b = boat(); b.userData.bob = false; b.scale.setScalar(1.7); b.rotation.y = Math.PI / 2; b.position.y = -0.25; g.add(b); for (let i = 0; i < 6; i++) { const f = sphere(0.18, toy('#ffffff')); f.scale.y = 0.4; f.position.set((i % 2 ? 1 : -1) * 0.7, 0.05, -1.4 - i * 0.25); g.add(f); } }
  else if (kind === 'cart') { const c = minecart(); c.scale.setScalar(1.6); c.position.y = -0.15; g.add(c); }
  else if (kind === 'bat') { const b = flyerModel('bat'); b.scale.setScalar(3); b.position.y = 3.4; g.add(b); g.userData.wings = b.userData.wings; }
  else if (kind === 'heli') { const h = flyerModel('heli'); h.scale.setScalar(2.2); h.position.y = 3.4; g.add(h); g.userData.rotor = h.userData.rotor; }
  else if (kind === 'rocket') { const r = rocketModel(); r.rotation.x = 0.35; r.scale.setScalar(0.9); r.position.y = 0.6; g.add(r); }
  else if (kind === 'horse') { const h = horseModel(); h.position.y = -0.3; g.add(h); g.userData.legs = h.userData.legs; }
  else if (kind === 'sled') { const sl = huskySled(); g.add(sl); g.userData.legs = sl.userData.legs; }
  else if (kind === 'camel') { const c = camelModel(); c.position.y = -0.4; g.add(c); g.userData.legs = c.userData.legs; }
  else if (kind === 'turtle') { const t = turtleModel(); t.position.y = -0.55; g.add(t); g.userData.flippers = t.userData.flippers; }
  else if (kind === 'wave') { const w = mesh(new THREE.TorusGeometry(1.3, 0.55, 12, 28, Math.PI), new THREE.MeshPhysicalMaterial({ color: '#38bdf8', transparent: true, opacity: 0.85, roughness: 0.05, clearcoat: 1 })); w.rotation.y = Math.PI / 2; w.position.set(0, 0.1, -0.6); g.add(w); for (let i = 0; i < 8; i++) { const f = sphere(0.22, toy('#ffffff')); f.position.set((Math.random() - 0.5) * 2, 1.2 + Math.random() * 0.6, -0.6 + (Math.random() - 0.5)); g.add(f); } }
  else { // métro
    const body = toy('#2563eb'), win = new THREE.MeshStandardMaterial({ color: '#bae6fd', emissive: new THREE.Color('#7dd3fc'), emissiveIntensity: 0.9 });
    const car = mesh(new THREE.BoxGeometry(1.7, 1.0, 3.4), body); car.position.y = 0.5; g.add(car);
    [-0.86, 0.86].forEach((x) => { const w = mesh(new THREE.BoxGeometry(0.03, 0.35, 2.6), win); w.position.set(x, 0.75, 0); g.add(w); });
    const nose = mesh(new THREE.BoxGeometry(1.7, 0.8, 0.3), toy('#facc15')); nose.position.set(0, 0.45, 1.8); g.add(nose);
    [-0.5, 0.5].forEach((x) => { const l = mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff', emissive: new THREE.Color('#fef08a'), emissiveIntensity: 2 })); l.position.set(x, 0.4, 1.96); g.add(l); });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/* ---------------- Boss et tuyau d'or ---------------- */
function bossModel(theme) {
  const g = new THREE.Group();
  if (theme === 'jurassic') { // Magmator : T-rex de lave
    const m = toy('#7f1d1d'), lava = new THREE.MeshStandardMaterial({ color: '#f97316', emissive: new THREE.Color('#ea580c'), emissiveIntensity: 1.4 });
    const body = sphere(1.3, m); body.scale.set(1, 1.2, 1.3); body.position.y = 2; g.add(body);
    const belly = sphere(0.9, lava); belly.scale.set(0.9, 1.1, 0.7); belly.position.set(0, 1.9, 0.75); g.add(belly);
    const head = sphere(0.9, m); head.scale.set(1, 0.85, 1.3); head.position.set(0, 3.6, 0.7); g.add(head);
    const jaw = mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), m); jaw.position.set(0, 3.05, 1.2); g.add(jaw);
    for (let i = 0; i < 6; i++) { const t = mesh(new THREE.ConeGeometry(0.08, 0.25, 6), toy('#fff')); t.rotation.x = Math.PI; t.position.set(-0.45 + i * 0.18, 3.3, 1.75); g.add(t); }
    [-0.4, 0.4].forEach((x) => { const e = sphere(0.16, new THREE.MeshStandardMaterial({ color: '#fde047', emissive: new THREE.Color('#facc15'), emissiveIntensity: 2 })); e.position.set(x, 3.9, 1.45); g.add(e); });
    for (let i = 0; i < 5; i++) { const sp = mesh(new THREE.ConeGeometry(0.22, 0.6, 6), lava); sp.position.set(0, 2.4 + i * 0.35, -1.1 + i * 0.1); sp.rotation.x = -0.6; g.add(sp); }
    [-0.7, 0.7].forEach((x) => { const l = capsule(0.35, 0.8, m); l.position.set(x, 0.6, 0); g.add(l); });
  } else if (theme === 'pirate') { // Capitaine Calamarde : pieuvre géante
    const m = toy('#9333ea');
    const head = sphere(1.4, m); head.scale.set(1, 1.25, 1); head.position.y = 3; g.add(head);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const t = capsule(0.22, 1.6, m); t.position.set(Math.cos(a) * 0.9, 1.0, Math.sin(a) * 0.9); t.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); g.add(t); }
    [-0.5, 0.5].forEach((x) => { const e = sphere(0.32, toy('#fff')); e.position.set(x, 3.3, 1.2); g.add(e); const pu = sphere(0.15, toy('#111')); pu.position.set(x, 3.3, 1.5); g.add(pu); });
    const hat = mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.5, 3), toy('#111827')); hat.position.y = 4.6; hat.rotation.y = Math.PI / 6; g.add(hat);
    const sk = mesh(new THREE.CircleGeometry(0.25, 16), toy('#fff')); sk.position.set(0, 4.65, 0.75); g.add(sk);
  } else if (theme === 'heroes') { // Docteur Chaos : robot géant
    const m = toy('#94a3b8', { metalness: 0.15 }), red = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: new THREE.Color('#dc2626'), emissiveIntensity: 1.6 });
    const body = mesh(new THREE.BoxGeometry(2.2, 2.2, 1.6), m); body.position.y = 2.2; g.add(body);
    const head = mesh(new THREE.BoxGeometry(1.4, 1.1, 1.2), m); head.position.y = 3.9; g.add(head);
    const visor = mesh(new THREE.BoxGeometry(1.1, 0.3, 0.1), red); visor.position.set(0, 4, 0.62); g.add(visor);
    const core = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 20), red); core.rotation.x = Math.PI / 2; core.position.set(0, 2.4, 0.82); g.add(core);
    [-1.5, 1.5].forEach((x) => { const a = mesh(new THREE.BoxGeometry(0.5, 1.8, 0.5), m); a.position.set(x, 2.2, 0); g.add(a); });
    [-0.6, 0.6].forEach((x) => { const l = mesh(new THREE.BoxGeometry(0.6, 1.1, 0.6), m); l.position.set(x, 0.55, 0); g.add(l); });
    const ant = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), m); ant.position.y = 4.75; g.add(ant); const tip = sphere(0.12, red); tip.position.y = 5.1; g.add(tip);
  } else if (theme === 'atlantide') { // Kraken Abyssal
    krakenBoss(g);
  } else if (theme === 'espace') { // Empereur Zorg
    alienBoss(g);
  } else if (theme === 'chevaliers') { // Dragon Braise
    dragonBoss(g);
  } else if (theme === 'polaire') { // Yéti Grognon
    yetiBoss(g);
  } else if (theme === 'egypte') { // Pharaon Momie
    mummyBoss(g);
  } else if (theme === 'hante') { // Comte Vampirus
    const cape = mesh(new THREE.ConeGeometry(1.6, 3.6, 20, 1, true), toy('#111827', { side: THREE.DoubleSide })); cape.position.y = 1.8; g.add(cape);
    const inner = mesh(new THREE.ConeGeometry(1.5, 3.4, 20, 1, true), toy('#991b1b', { side: THREE.BackSide })); inner.position.y = 1.8; g.add(inner);
    const head = sphere(0.75, toy('#e5e7eb')); head.position.y = 4.0; g.add(head);
    const hair = mesh(new THREE.SphereGeometry(0.78, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), toy('#111')); hair.position.y = 4.05; g.add(hair);
    [-1, 1].forEach((k) => { const e = sphere(0.12, new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: new THREE.Color('#dc2626'), emissiveIntensity: 2 })); e.position.set(k * 0.28, 4.1, 0.65); g.add(e); const f = mesh(new THREE.ConeGeometry(0.06, 0.2, 6), toy('#fff')); f.rotation.x = Math.PI; f.position.set(k * 0.12, 3.62, 0.66); g.add(f); const col = mesh(new THREE.BoxGeometry(0.6, 1.4, 0.08), toy('#991b1b')); col.position.set(k * 0.7, 3.6, -0.3); col.rotation.z = -k * 0.4; g.add(col); });
  } else if (theme === 'recif') { // Reine Méduse
    const bell = new THREE.MeshPhysicalMaterial({ color: '#f0abfc', transparent: true, opacity: 0.75, roughness: 0.1, clearcoat: 1, emissive: new THREE.Color('#c026d3'), emissiveIntensity: 0.5 });
    const dome = mesh(new THREE.SphereGeometry(1.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), bell); dome.position.y = 3.2; dome.scale.y = 0.8; g.add(dome);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const t = mesh(new THREE.CylinderGeometry(0.06, 0.03, 2.8, 6), bell); t.position.set(Math.cos(a) * 1.1, 1.8, Math.sin(a) * 1.1); t.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); g.add(t); }
    [-0.5, 0.5].forEach((x) => { const e = sphere(0.22, toy('#fff')); e.position.set(x, 3.6, 1.35); g.add(e); const pu = sphere(0.11, toy('#111')); pu.position.set(x, 3.6, 1.55); g.add(pu); });
    const crown = mesh(new THREE.ConeGeometry(0.5, 0.7, 5), toy('#fde047', { metalness: 0.7 })); crown.position.y = 4.65; g.add(crown);
  } else { // La Reine Taupe
    const m = toy('#78350f');
    const body = sphere(1.4, m); body.scale.set(1, 1.3, 1); body.position.y = 1.8; g.add(body);
    const snout = sphere(0.45, toy('#f9a8d4')); snout.position.set(0, 2.4, 1.3); g.add(snout);
    [-0.45, 0.45].forEach((x) => { const e = sphere(0.12, toy('#111')); e.position.set(x, 2.9, 1.15); g.add(e); });
    const crown = mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.5, 8, 1, true), toy('#facc15', { metalness: 0.8, side: THREE.DoubleSide })); crown.position.y = 3.65; g.add(crown);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const c = mesh(new THREE.ConeGeometry(0.1, 0.3, 6), toy('#facc15', { metalness: 0.8 })); c.position.set(Math.cos(a) * 0.62, 4.0, Math.sin(a) * 0.62); g.add(c); }
    [-1.2, 1.2].forEach((x) => { const h = sphere(0.45, toy('#f9a8d4')); h.scale.set(1, 0.4, 1); h.position.set(x, 1.6, 0.6); g.add(h); });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function pipeModel() {
  const g = new THREE.Group(), gold = toy('#facc15', { metalness: 0.85, roughness: 0.2 });
  const tube = mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.6, 32), gold); tube.position.y = 0.8; g.add(tube);
  const lip = mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.4, 32), gold); lip.position.y = 1.7; g.add(lip);
  const hole = mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshBasicMaterial({ color: '#111' })); hole.rotation.x = -Math.PI / 2; hole.position.y = 1.91; g.add(hole);
  return g;
}
const transient = [];
function spawnTransient(model, pos, life, kind) {
  if (!world) return;
  const v = world.toV(pos.x, pos.y, pos.z || 0);
  model.position.copy(v); model.position.y += 0.1;
  const toCam = camera.position.clone().sub(v); model.rotation.y = Math.atan2(toCam.x, toCam.z);
  model.scale.setScalar(0.01); world.root.add(model);
  transient.push({ m: model, t0: performance.now(), life, kind, base: model.position.y });
}
function tickTransient(now) {
  for (let i = transient.length - 1; i >= 0; i--) {
    const o = transient[i], e = (now - o.t0) / o.life;
    if (e >= 1) { if (o.m.parent) o.m.parent.remove(o.m); transient.splice(i, 1); continue; }
    const k = e < 0.15 ? e / 0.15 : e > 0.85 ? (1 - e) / 0.15 : 1;
    const ease = 1 - Math.pow(1 - k, 3);
    if (o.kind === 'boss') { o.m.scale.setScalar(ease * 1.15); o.m.position.y = o.base - (1 - ease) * 3; o.m.rotation.z = Math.sin(now / 90) * 0.04 * (e > 0.2 && e < 0.5 ? 1 : 0); }
    else { o.m.scale.setScalar(ease); o.m.position.y = o.base - (1 - ease) * 1.5; }
  }
}

/* ---------------- Mini-jeu 3D : Patinoire Givrée ---------------- */
function makeRink(cv, info) {
  const R = info.R, IN = info.IN;
  const rr = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  rr.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  rr.shadowMap.enabled = true; rr.shadowMap.type = THREE.PCFSoftShadowMap;
  rr.toneMapping = THREE.ACESFilmicToneMapping; rr.toneMappingExposure = 1.05;
  const sc = new THREE.Scene(); sc.environment = makeEnv(rr);
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
/* ---------------- Mini-jeux 3D d'adresse : stand de tir et tape-taupes ---------------- */
function makePop(cv, kind) {
  const rr = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  rr.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  rr.shadowMap.enabled = true; rr.shadowMap.type = THREE.PCFSoftShadowMap;
  rr.toneMapping = THREE.ACESFilmicToneMapping; rr.toneMappingExposure = 1.05;
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, 1.5, 0.1, 200); sc.environment = makeEnv(rr);
  sc.add(new THREE.HemisphereLight('#ffffff', '#6b4423', 0.7));
  const sun = new THREE.DirectionalLight('#fff7e6', 2.4); sun.position.set(-6, 14, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 }); sun.shadow.camera.updateProjectionMatrix(); sc.add(sun);
  const targets = {}, pops = [];
  const ROWS = [1.15, 2.35, 3.55];
  const HOLES = []; for (let i = 0; i < 9; i++) HOLES.push(new THREE.Vector3((i % 3 - 1) * 3.6, 0, (Math.floor(i / 3) - 1) * 2.7));
  if (kind === 'tir') {
    sc.background = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1e1b4b'); gr.addColorStop(1, '#7c3aed'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const planks = canvasTex(512, 256, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = shade('#8b5a2b', (i % 3 - 1) * 0.05).getStyle(); g.fillRect(i * 64, 0, 64, h); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(i * 64, 0, 3, h); } });
    const back = mesh(new THREE.BoxGeometry(17, 5.4, 0.3), std('#fff', { map: planks }), false, true); back.position.set(0, 2.5, -0.8); sc.add(back);
    const stripes = canvasTex(512, 64, (g, w, h) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#ef4444' : '#fff7ed'; g.fillRect(i * 32, 0, 32, h); } });
    stripes.wrapS = THREE.RepeatWrapping;
    const awn = mesh(new THREE.BoxGeometry(18, 0.25, 3), std('#fff', { map: stripes })); awn.position.set(0, 5.5, 0.6); awn.rotation.x = 0.25; sc.add(awn);
    for (let i = 0; i < 18; i++) { const sc2 = mesh(new THREE.ConeGeometry(0.5, 0.6, 3), toy(i % 2 ? '#ef4444' : '#fff7ed')); sc2.rotation.x = Math.PI; sc2.position.set(-8.5 + i, 5.15, 2.05); sc.add(sc2); }
    [-8.6, 8.6].forEach((x) => { const post = mesh(new THREE.CylinderGeometry(0.18, 0.2, 6, 10), toy('#facc15')); post.position.set(x, 2.8, 1.6); sc.add(post); });
    ROWS.forEach((y) => { const rail = mesh(new THREE.BoxGeometry(17, 0.12, 0.2), std('#475569', { metalness: 0.6 })); rail.position.set(0, y - 0.62, -0.4); sc.add(rail); });
    const counter = mesh(new THREE.BoxGeometry(18, 1.0, 1.2), std('#7c2d12')); counter.position.set(0, -0.2, 2.6); sc.add(counter);
    const floorT = canvasTex(256, 256, (g, w) => { for (let i = 0; i < 8; i++) { g.fillStyle = shade('#a16207', (i % 2) * 0.06 - 0.03).getStyle(); g.fillRect(0, i * 32, w, 32); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, i * 32, w, 2); } }); floorT.wrapS = floorT.wrapT = THREE.RepeatWrapping; floorT.repeat.set(6, 3);
    const fl = mesh(new THREE.PlaneGeometry(40, 20), std('#fff', { map: floorT }), false, true); fl.rotation.x = -Math.PI / 2; fl.position.set(0, -0.7, 4); sc.add(fl);
    const ctop = mesh(new THREE.BoxGeometry(18.2, 0.12, 1.4), toy('#fde68a')); ctop.position.set(0, 0.36, 2.6); sc.add(ctop);
    for (let i = 0; i < 24; i++) { const b = sphere(0.12, new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: new THREE.Color('#facc15'), emissiveIntensity: 1.5 })); b.position.set(-8.6 + i * 0.75, 5.75, 2.15); sc.add(b); }
  } else {
    sc.background = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7dd3fc'); gr.addColorStop(1, '#ecfeff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const grass = canvasTex(256, 256, (g, w) => { g.fillStyle = '#65a30d'; g.fillRect(0, 0, w, w); for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? '#4d7c0f' : '#84cc16'; g.fillRect(Math.random() * w, Math.random() * w, 2, 5); } });
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(6, 6);
    const ground = mesh(new THREE.PlaneGeometry(40, 40), std('#fff', { map: grass }), false, true); ground.rotation.x = -Math.PI / 2; sc.add(ground);
    HOLES.forEach((h) => { const rim = mesh(new THREE.TorusGeometry(0.85, 0.22, 10, 28), std('#78350f', { roughness: 1 })); rim.rotation.x = Math.PI / 2; rim.position.copy(h).setY(0.05); sc.add(rim); const hole = mesh(new THREE.CircleGeometry(0.8, 28), new THREE.MeshBasicMaterial({ color: '#1c1917' })); hole.rotation.x = -Math.PI / 2; hole.position.copy(h).setY(0.03); sc.add(hole); });
    const fence = new THREE.Group(); for (let i = 0; i < 14; i++) { const p = mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), std('#a16207')); p.position.set(-7.8 + i * 1.2, 0.55, -5.2); fence.add(p); } const bar = mesh(new THREE.BoxGeometry(16, 0.15, 0.12), std('#a16207')); bar.position.set(0, 0.8, -5.2); fence.add(bar); sc.add(fence);
    for (let i = 0; i < 10; i++) { const t = tree(rng(i), '#3f9142'); t.scale.setScalar(1.6); t.position.set(-10 + i * 2.2, 0, -8 - (i % 2) * 2); sc.add(t); }
  }
  const tex = (k) => canvasTex(128, 128, (g, w) => { const c = w / 2; if (k === 'gold') { g.fillStyle = '#facc15'; g.beginPath(); g.arc(c, c, c - 2, 0, 7); g.fill(); g.fillStyle = '#fff7ed'; g.font = 'bold 70px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', c, c + 4); } else { ['#ef4444', '#fff', '#ef4444', '#fff', '#ef4444'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(c, c, (c - 2) * (1 - i * 0.2), 0, 7); g.fill(); }); } });
  const discTex = { normal: tex('normal'), gold: tex('gold') };
  const makeT = (x) => {
    const g = new THREE.Group();
    if (kind === 'tir') {
      if (x.k === 'bomb') { const b = sphere(0.45, toy('#111827', { metalness: 0.3 })); const f = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6), std('#a16207')); f.position.set(0.15, 0.5, 0); f.rotation.z = -0.4; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#fb923c', transparent: true, blending: THREE.AdditiveBlending })); sp.scale.setScalar(0.6); sp.position.set(0.25, 0.7, 0); g.add(b, f, sp); }
      else { const d = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 32), [std('#7c2d12'), new THREE.MeshStandardMaterial({ map: discTex[x.k], metalness: x.k === 'gold' ? 0.6 : 0, roughness: 0.4 }), std('#7c2d12')]); d.rotation.x = Math.PI / 2; g.add(d); const stick = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), std('#a16207')); stick.position.y = -0.55; g.add(stick); }
    } else {
      const body = toy(x.k === 'gold' ? '#facc15' : x.k === 'bomb' ? '#7e22ce' : '#92400e', { metalness: x.k === 'gold' ? 0.5 : 0 });
      const b = capsule(0.55, 0.7, body); b.position.y = 0.7; g.add(b);
      const nose = sphere(0.16, toy('#f9a8d4')); nose.position.set(0, 1.0, 0.55); g.add(nose);
      [-0.2, 0.2].forEach((ex) => { const e = sphere(0.09, toy('#111')); e.position.set(ex, 1.25, 0.46); g.add(e); });
      if (x.k === 'bomb') { const cr = mesh(new THREE.ConeGeometry(0.35, 0.4, 5), toy('#fde047', { metalness: 0.7 })); cr.position.y = 1.65; g.add(cr); }
      else { const hat = mesh(new THREE.SphereGeometry(0.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toy('#fbbf24')); hat.position.y = 1.35; g.add(hat); }
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.tid = x.id; } });
    return g;
  };
  let lastW = 0, lastH = 0;
  return {
    pick(cx, cy) {
      const r = cv.getBoundingClientRect(), v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(v, cam);
      const hit = rc.intersectObjects(Object.values(targets).filter((g) => g.visible && !g.userData.dead), true)[0];
      return hit ? hit.object.userData.tid : null;
    },
    frame(now, view) {
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w !== lastW || h !== lastH) { lastW = w; lastH = h; rr.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
        const hh = Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect);
        if (kind === 'tir') { const d = Math.max(10, 9 / Math.tan(hh)); cam.position.set(0, 2.6, d); cam.lookAt(0, 2.4, 0); }
        else { const d = Math.max(9, 7 / Math.tan(hh)); cam.position.set(0, d * 0.85, d * 0.6); cam.lookAt(0, 0, 0.3); } }
      const el = view.el;
      (view.targets || []).forEach((x) => {
        const live = el >= x.t0 && el <= x.t0 + x.life + 500;
        let g = targets[x.id];
        if (!live) { if (g) { sc.remove(g); delete targets[x.id]; } return; }
        if (!g) { g = makeT(x); sc.add(g); targets[x.id] = g; }
        const hitBy = view.hits[x.id] || (view.mine && view.mine.has(x.id) ? 'me' : null);
        if (hitBy && !g.userData.dead) { g.userData.dead = now; const col = view.colorOf(hitBy); const lbl = textSprite((x.k === 'bomb' ? '−2' : x.k === 'gold' ? '+3' : '+1'), col, 64); lbl.position.copy(g.position).add(new THREE.Vector3(0, 1.2, 0)); sc.add(lbl); pops.push({ s: lbl, t0: now }); }
        const u = (el - x.t0) / x.life;
        if (kind === 'tir') { g.position.set(-x.dir * 8 + x.dir * x.sp * (el - x.t0) / 1000, ROWS[x.row], -0.4); g.rotation.z = Math.sin(now / 200 + x.id) * 0.05; }
        else { const H = HOLES[x.hole]; const up = u < 0.18 ? u / 0.18 : u > 0.82 ? Math.max(0, (1 - u) / 0.18) : 1; g.position.set(H.x, -1.7 + up * 1.7, H.z); }
        if (g.userData.dead) { const k = Math.min(1, (now - g.userData.dead) / 400); if (kind === 'tir') { g.rotation.x = -k * 1.5; } else { g.scale.set(1 + k * 0.4, 1 - k * 0.7, 1 + k * 0.4); g.position.y -= k * 1.2; } if (k >= 1) g.visible = false; }
      });
      for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i], k = (now - p.t0) / 900; if (k >= 1) { sc.remove(p.s); pops.splice(i, 1); continue; } p.s.position.y += 0.02; p.s.material.opacity = 1 - k; }
      rr.render(sc, cam);
    },
    dispose() { try { rr.dispose(); rr.forceContextLoss(); } catch (e) {} },
  };
}
API.pop = makePop;

window.Scene3D = API;
window.dispatchEvent(new Event('scene3d-ready'));
