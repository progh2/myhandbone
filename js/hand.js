// 절차적으로 생성한 오른손 골격 + 연부조직 리그
// 좌표계(hand space, cm): 손가락 방향 +Y, 손바닥 +Z, 엄지 +X, y=0 은 요골 원위 관절면
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const D = THREE.MathUtils.degToRad;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const W1 = V(0.25, 0.3, 0);   // 요수근 관절 중심
const W2 = V(0.25, 1.55, 0);  // 수근중앙 관절 중심

function smooth(g) {
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  return g;
}

function lathe(pts, len, flat = 0.82, bow = 0.025, seg = 22) {
  const curve = new THREE.SplineCurve(pts.map(([r, t]) => new THREE.Vector2(r, t * len)));
  const prof = curve.getPoints(48).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  prof[0].set(0, 0);
  prof[prof.length - 1].set(0, len);
  let g = new THREE.LatheGeometry(prof, seg);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / len;
    pos.setZ(i, pos.getZ(i) * flat - Math.sin(t * Math.PI) * len * bow);
  }
  return smooth(g);
}

function longBone(len, b, s, h) {
  return lathe([[0, 0], [b * 0.8, 0.02], [b, 0.08], [b * 0.9, 0.18], [s * 1.08, 0.32], [s, 0.5], [s * 1.06, 0.68], [h * 0.92, 0.84], [h, 0.92], [h * 0.8, 0.975], [0, 1]], len);
}
function distalBone(len, b, s, t) {
  return lathe([[0, 0], [b * 0.8, 0.03], [b, 0.12], [s * 1.1, 0.35], [s, 0.55], [t, 0.8], [t * 0.85, 0.93], [0, 1]], len, 0.7, 0.01);
}
function lump(seed, detail = 4) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.09 * Math.sin(v.x * 3.1 + seed) + 0.07 * Math.sin(v.y * 4.3 + seed * 2.3) * Math.cos(v.z * 2.7 + seed) - 0.05 * Math.abs(v.z) ** 3;
    p.setXYZ(i, v.x * n, v.y * n, v.z * n);
  }
  return smooth(g);
}

export class HandRig {
  constructor() {
    this.root = new THREE.Group();
    this.base = new THREE.Group();
    this.base.rotation.x = -Math.PI / 2; // 손가락이 화면 안쪽(-Z)을 향하도록
    this.root.add(this.base);
    this.forearm = new THREE.Group();
    this.base.add(this.forearm);
    this.wrist1 = new THREE.Group();
    this.wrist1.position.copy(W1);
    this.forearm.add(this.wrist1);
    this.wrist2 = new THREE.Group();
    this.wrist2.position.copy(W2).sub(W1);
    this.wrist1.add(this.wrist2);

    this.mats = {};       // id -> material (뼈·조직)
    this.meshes = [];     // 클릭 가능한 메쉬
    this.boneMeshes = {}; // id -> mesh
    this.skin = [];
    this.strands = [];
    this.anchors = {};
    this.tissueGroup = new THREE.Group(); // 월드 공간 튜브
    this.cracks = new THREE.Group();

    this.buildForearm();
    this.buildCarpals();
    this.buildFingers();
    this.buildThumb();
    this.buildSkin();
    this.buildTissues();
  }

  mat(id, color = 0xeee3cc, opts = {}) {
    if (!this.mats[id]) {
      this.mats[id] = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.02, ...opts });
      this.mats[id].userData.base = new THREE.Color(color);
    }
    return this.mats[id];
  }

  addBone(id, geo, parent, pos, rot) {
    const m = new THREE.Mesh(geo, this.mat(id));
    m.userData.id = id;
    m.castShadow = true;
    if (pos) m.position.copy(pos);
    if (rot) m.rotation.set(...rot);
    parent.add(m);
    this.meshes.push(m);
    this.boneMeshes[id] = this.boneMeshes[id] || m;
    return m;
  }

  anchor(name, parent, x, y, z) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    if (name) this.anchors[name] = o;
    return o;
  }
  // hand space 좌표를 그룹 로컬로
  hs(group, x, y, z) {
    const o = group === this.wrist1 ? W1 : group === this.wrist2 ? W2 : V(0, 0, 0);
    return V(x - o.x, y - o.y, z - o.z);
  }

  buildForearm() {
    const L = 12;
    const rg = lathe([[0, 0], [0.75, 0.01], [0.62, 0.15], [0.55, 0.45], [0.65, 0.72], [0.95, 0.86], [1.4, 0.95], [1.55, 0.985], [1.3, 1]], L, 0.6, 0.005, 26);
    this.addBone('radius', rg, this.forearm, V(1.0, -L, 0));
    // 요골 경상돌기 · 리스터 결절
    const sty = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.7, 6, 14), this.mat('radius'));
    sty.position.set(2.2, -0.35, 0.05); sty.rotation.z = -0.35; sty.scale.z = 0.8; sty.userData.id = 'radius';
    this.forearm.add(sty); this.meshes.push(sty);
    const lis = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), this.mat('radius'));
    lis.position.set(0.95, -1.1, -0.82); lis.scale.set(0.7, 1.6, 0.6); lis.userData.id = 'radius';
    this.forearm.add(lis); this.meshes.push(lis);

    const ug = lathe([[0, 0], [0.7, 0.01], [0.6, 0.2], [0.5, 0.6], [0.55, 0.85], [0.78, 0.95], [0.74, 0.99], [0, 1]], L - 0.4, 0.85, 0.005);
    this.addBone('ulna', ug, this.forearm, V(-1.45, -L, -0.1));
    const us = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 6, 10), this.mat('ulna'));
    us.position.set(-1.9, -0.6, -0.3); us.userData.id = 'ulna';
    this.forearm.add(us); this.meshes.push(us);
  }

  buildCarpals() {
    const c = (id, g, x, y, z, s, r = [0, 0, 0], seed = 1) => {
      const m = this.addBone(id, lump(seed), g, this.hs(g, x, y, z), r);
      m.scale.set(...s);
      return m;
    };
    const w1 = this.wrist1, w2 = this.wrist2;
    c('scaphoid', w1, 1.5, 1.0, 0.25, [0.62, 1.05, 0.55], [0.35, 0, -0.75], 1.3);
    c('lunate', w1, 0.25, 0.85, 0.05, [0.68, 0.6, 0.78], [0, 0, 0], 2.1);
    c('triquetrum', w1, -0.95, 1.05, -0.08, [0.58, 0.55, 0.6], [0, 0, 0.3], 3.7);
    c('pisiform', w1, -1.2, 1.2, 0.75, [0.36, 0.42, 0.36], [0, 0, 0], 4.2);
    c('trapezium', w2, 2.1, 2.15, 0.45, [0.6, 0.55, 0.55], [0.3, 0, -0.4], 5.5);
    c('trapezoid', w2, 1.3, 2.35, 0.08, [0.45, 0.5, 0.55], [0, 0, 0], 6.1);
    c('capitate', w2, 0.3, 2.1, 0.0, [0.56, 0.95, 0.66], [0, 0, 0], 7.3);
    c('hamate', w2, -0.9, 2.05, 0.0, [0.62, 0.8, 0.62], [0, 0, 0.15], 8.8);
    const hook = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.35, 4, 10), this.mat('hamate'));
    hook.position.copy(this.hs(w2, -0.8, 2.3, 0.7)); hook.rotation.x = Math.PI / 2.4;
    hook.userData.id = 'hamate'; hook.castShadow = true;
    w2.add(hook); this.meshes.push(hook);
    this.hookMesh = hook;
  }

  buildFingers() {
    const base = [V(1.35, 2.85, 0.1), V(0.3, 3.0, -0.05), V(-0.72, 2.85, 0.08), V(-1.6, 2.65, 0.3)];
    const fan = [-0.1, -0.01, 0.12, 0.24];
    this.fan = fan;
    const conv = [0.0, 0.05, 0.12, 0.22];
    const mcL = [6.6, 6.3, 5.7, 5.2], ppL = [4.0, 4.5, 4.2, 3.3], mpL = [2.4, 2.8, 2.7, 1.9], dpL = [1.8, 1.9, 1.9, 1.7];
    const sc = [1, 1.02, 0.95, 0.85];
    const gap = 0.14;
    this.fingers = [];
    for (let i = 0; i < 4; i++) {
      const k = sc[i], n = i + 1;
      const mc = new THREE.Group();
      mc.position.copy(base[i]).sub(W2);
      mc.rotation.set(0.04, conv[i], fan[i]);
      this.wrist2.add(mc);
      this.addBone(`mc${n}`, longBone(mcL[i], 0.48 * k, 0.3 * k, 0.46 * k), mc);
      const mcp = new THREE.Group(); mcp.position.set(0, mcL[i] + gap, 0); mc.add(mcp);
      this.addBone(`pp${n}`, longBone(ppL[i], 0.43 * k, 0.28 * k, 0.33 * k), mcp);
      const pip = new THREE.Group(); pip.position.set(0, ppL[i] + gap, 0); mcp.add(pip);
      this.addBone(`mp${n}`, longBone(mpL[i], 0.34 * k, 0.22 * k, 0.27 * k), pip);
      const dip = new THREE.Group(); dip.position.set(0, mpL[i] + gap * 0.8, 0); pip.add(dip);
      this.addBone(`dp${n}`, distalBone(dpL[i], 0.28 * k, 0.16 * k, 0.23 * k), dip);
      this.anchor(`tip${n}`, dip, 0, dpL[i] - 0.1, 0.35);
      this.anchor(`pad${n}`, dip, 0, dpL[i] * 0.6, 0.55);
      this.fingers.push({ mc, mcp, pip, dip, L: [mcL[i], ppL[i], mpL[i], dpL[i]], k });
    }
  }

  buildThumb() {
    const d = V(0.42, 0.85, 0.42).normalize();
    const p0 = V(-0.7, 0.1, 0.7);
    const z = p0.sub(d.clone().multiplyScalar(p0.dot(d))).normalize();
    const x = new THREE.Vector3().crossVectors(d, z).normalize();
    const cmc = new THREE.Group();
    cmc.position.copy(this.hs(this.wrist2, 2.45, 2.55, 0.75));
    cmc.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, d, z));
    this.wrist2.add(cmc);
    const move = new THREE.Group(); cmc.add(move);
    const L = [4.6, 3.2, 2.4];
    this.addBone('mc0', longBone(L[0], 0.52, 0.34, 0.46), move);
    const mcp = new THREE.Group(); mcp.position.set(0, L[0] + 0.15, 0); move.add(mcp);
    this.addBone('pp0', longBone(L[1], 0.45, 0.31, 0.37), mcp);
    const ip = new THREE.Group(); ip.position.set(0, L[1] + 0.13, 0); mcp.add(ip);
    this.addBone('dp0', distalBone(L[2], 0.35, 0.2, 0.28), ip);
    this.anchor('tip0', ip, 0, L[2] - 0.1, 0.35);
    this.anchor('pad0', ip, 0, L[2] * 0.6, 0.55);
    this.thumb = { cmc, move, mcp, ip, L };
  }

  buildSkin() {
    this.skinMat = new THREE.MeshPhysicalMaterial({ color: 0xf2b8a0, roughness: 0.6, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    const cap = (parent, r, len, y0 = 0, x = 0, z = 0, flat = 0.82) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len), 6, 18), this.skinMat);
      m.position.set(x, y0 + len / 2, z); m.scale.z = flat; m.renderOrder = 10;
      parent.add(m); this.skin.push(m);
      return m;
    };
    this.fingers.forEach((f, i) => {
      const k = f.k;
      cap(f.mcp, 0.88 * k, f.L[1] - 0.2, 0.1, 0, 0.05);
      cap(f.pip, 0.78 * k, f.L[2] - 0.3, 0.15, 0, 0.05);
      cap(f.dip, 0.72 * k, f.L[3] - 1.0, 0.25, 0, 0.12, 0.75);
    });
    const t = this.thumb;
    const th = cap(t.move, 1.65, 2.2, 0.6, -0.3, 0.55, 0.75); // 엄지두덩
    th.scale.set(1, 1, 0.65);
    cap(t.mcp, 0.95, t.L[1] - 0.2, 0.1, 0, 0.05);
    cap(t.ip, 0.85, t.L[2] - 1.2, 0.3, 0, 0.12, 0.75);
    const palm = new THREE.Mesh(new RoundedBoxGeometry(7.6, 7.6, 2.7, 4, 1.15), this.skinMat);
    palm.position.copy(this.hs(this.wrist2, -0.2, 5.5, 0.25)); palm.renderOrder = 10;
    this.wrist2.add(palm); this.skin.push(palm);
    const wristSkin = new THREE.Mesh(new RoundedBoxGeometry(6.4, 4, 3.3, 4, 1.4), this.skinMat);
    wristSkin.position.copy(this.hs(this.wrist1, 0.2, 1.2, 0.1)); wristSkin.renderOrder = 10;
    this.wrist1.add(wristSkin); this.skin.push(wristSkin);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 2.75, 12, 28, 1, true), this.skinMat);
    arm.scale.z = 0.62; arm.position.set(0.0, -5.7, 0); arm.renderOrder = 10;
    this.forearm.add(arm); this.skin.push(arm);
  }

  strand(id, anchorsSpec, radius, color, opts = {}) {
    const anchors = anchorsSpec.map(([g, x, y, z]) => this.anchor(null, g, ...this.hs(g, x, y, z).toArray()));
    const mat = this.mat(id, color, { roughness: opts.rough ?? 0.4, emissive: 0x000000, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.userData.id = id;
    this.tissueGroup.add(mesh);
    this.meshes.push(mesh);
    const s = { id, anchors, radius, mesh, kind: opts.kind || 'tendon' };
    this.strands.push(s);
    return s;
  }
  // 로컬 좌표로 바로 지정하는 strand (finger chain 용)
  strandL(id, list, radius, color, opts) {
    const s = this.strand(id, [], radius, color, opts);
    s.anchors = list.map(([g, x, y, z]) => {
      const v = g === this.wrist1 || g === this.wrist2 ? this.hs(g, x, y, z) : V(x, y, z);
      return this.anchor(null, g, v.x, v.y, v.z);
    });
    return s;
  }

  buildTissues() {
    const fa = this.forearm, w1 = this.wrist1, w2 = this.wrist2;
    const NERVE = 0xf4c542, TENDON = 0xe8eef2, EXT = 0xcfdbe3;
    // 굽힘 힘줄 (각 손가락)
    const flexX = [0.95, 0.35, -0.25, -0.75];
    this.fingers.forEach((f, i) => {
      const x = flexX[i];
      this.strandL('flexor', [
        [fa, x * 0.6 + 0.2, -11, 0.55], [fa, x * 0.6 + 0.2, -4, 0.75], [fa, x * 0.55 + 0.25, -0.4, 0.85],
        [w1, x * 0.5 + 0.0, 0.7, 0.95], [w2, x * 0.6 - 0.05, 2.3, 0.95],
        [f.mc, 0, 1.8, 0.62], [f.mc, 0, f.L[0] - 0.2, 0.62], [f.mcp, 0, 0.6, 0.45], [f.mcp, 0, f.L[1] - 0.3, 0.38],
        [f.pip, 0, 0.4, 0.33], [f.pip, 0, f.L[2] - 0.2, 0.28], [f.dip, 0, 0.4, 0.24],
      ], 0.12, TENDON, { kind: 'tendon' });
      this.strandL('extensor', [
        [fa, x * 0.5 + 0.3, -11, -0.75], [fa, x * 0.45 + 0.4, -1.2, -1.05], [w1, x * 0.6 + 0.05, 0.8, -0.95],
        [w2, x * 0.7, 2.4, -0.8], [f.mc, 0, 1.5, -0.48], [f.mc, 0, f.L[0], -0.55], [f.mcp, 0, 0.5, -0.4],
        [f.mcp, 0, f.L[1], -0.36], [f.pip, 0, 0.5, -0.28], [f.pip, 0, f.L[2], -0.26], [f.dip, 0, 0.25, -0.2],
      ], 0.1, EXT, { kind: 'tendon' });
    });
    const t = this.thumb;
    // 장무지굽힘근 (FPL) - 손목터널 통과
    this.strandL('flexor', [
      [fa, 1.4, -11, 0.5], [fa, 1.3, -3, 0.7], [fa, 1.2, -0.4, 0.85], [w1, 1.1, 0.7, 1.0], [w2, 1.15, 2.2, 0.95],
      [t.move, 0, 1.2, 0.55], [t.move, 0, t.L[0] - 0.2, 0.5], [t.mcp, 0, 0.5, 0.42], [t.mcp, 0, t.L[1] - 0.2, 0.38], [t.ip, 0, 0.35, 0.28],
    ], 0.12, TENDON);
    // 드퀘르뱅 1구획: APL / EPB
    this.strandL('dq', [
      [fa, 1.8, -9, -0.6], [fa, 2.5, -3.5, -0.25], [fa, 2.85, -0.4, 0.05], [w1, 2.45, 1.0, 0.25],
      [t.move, -0.2, -0.3, -0.1], [t.move, -0.05, 0.45, -0.2],
    ], 0.14, 0xe8d6c8);
    this.strandL('dq', [
      [fa, 1.6, -9, -0.75], [fa, 2.4, -3.5, -0.42], [fa, 2.8, -0.4, -0.15], [w1, 2.35, 1.0, 0.0],
      [t.move, 0.0, 0.6, -0.42], [t.move, 0, t.L[0] - 0.2, -0.48], [t.mcp, 0, 0.5, -0.35],
    ], 0.11, 0xe8d6c8);
    // 정중신경 (본관 + 손가락 가지)
    const medTrunk = [[fa, 0.55, -11, 0.9], [fa, 0.5, -4, 1.05], [fa, 0.5, -0.4, 1.15], [w1, 0.35, 0.8, 1.2], [w2, 0.35, 2.2, 1.2], [w2, 0.4, 3.4, 1.05]];
    this.strandL('median', medTrunk, 0.24, NERVE, { kind: 'nerve' });
    const branchStart = [w2, 0.4, 3.4, 1.05];
    [0, 1, 2].forEach((i) => {
      const f = this.fingers[i];
      this.strandL('median', [branchStart, [f.mc, 0.15, 2.5, 0.85], [f.mc, 0.3, f.L[0] - 0.4, 0.75], [f.mcp, 0.35, 1.0, 0.55], [f.mcp, 0.4, f.L[1], 0.45], [f.pip, 0.35, f.L[2] - 0.2, 0.35], [f.dip, 0.25, f.L[3] * 0.6, 0.35]], 0.08, NERVE, { kind: 'nerve' });
    });
    this.strandL('median', [branchStart, [w2, 1.4, 3.6, 1.2], [t.move, -0.3, 1.8, 0.75], [t.move, -0.35, t.L[0] - 0.3, 0.6], [t.mcp, -0.35, t.L[1] * 0.6, 0.45], [t.ip, -0.25, t.L[2] * 0.6, 0.35]], 0.08, NERVE, { kind: 'nerve' });
    // 척골신경 (기용관 통과)
    const ulnTrunk = [[fa, -1.55, -11, 0.75], [fa, -1.6, -4, 0.95], [fa, -1.5, -0.4, 1.1], [w1, -1.0, 1.1, 1.25], [w2, -0.65, 2.5, 1.25], [w2, -0.8, 3.5, 1.0]];
    this.strandL('ulnar', ulnTrunk, 0.2, NERVE, { kind: 'nerve' });
    [2, 3].forEach((i) => {
      const f = this.fingers[i];
      this.strandL('ulnar', [ulnTrunk[5], [f.mc, -0.2, 2.5, 0.85], [f.mc, -0.3, f.L[0] - 0.4, 0.75], [f.mcp, -0.35, 1.0, 0.55], [f.mcp, -0.4, f.L[1], 0.45], [f.pip, -0.35, f.L[2] - 0.2, 0.35], [f.dip, -0.25, f.L[3] * 0.6, 0.35]], 0.075, NERVE, { kind: 'nerve' });
    });

    // 가로손목인대 (손목터널 지붕)
    const tcl = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75, 1.75, 2.4, 28, 1, true, -1.25, 2.5),
      this.mat('tcl', 0xb48ee0, { transparent: true, opacity: 0.6, side: THREE.DoubleSide, roughness: 0.5 }),
    );
    tcl.scale.set(1, 1, 0.75);
    tcl.position.copy(this.hs(w2, 0.35, 1.9, 0.15));
    tcl.userData.id = 'tcl';
    w2.add(tcl); this.meshes.push(tcl);
    // A1 도르래
    this.fingers.forEach((f) => {
      const a1 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.075, 8, 20), this.mat('a1', 0xff9f7a));
      a1.rotation.x = Math.PI / 2; a1.position.set(0, f.L[0] - 0.15, 0.62);
      a1.userData.id = 'a1';
      f.mc.add(a1); this.meshes.push(a1);
    });
  }

  updateStrands() {
    const p = new THREE.Vector3();
    for (const s of this.strands) {
      const pts = s.anchors.map((a) => a.getWorldPosition(p.clone()));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const g = new THREE.TubeGeometry(curve, Math.max(24, pts.length * 8), s.radius, 8, false);
      s.mesh.geometry.dispose();
      s.mesh.geometry = g;
    }
  }

  applyPose(p) {
    this.root.rotation.x = D(p.pitch || 0);
    this.forearm.rotation.y = D(p.sup - 180);
    const wf = D(p.wf), wd = D(p.wd);
    this.wrist1.rotation.set(wf * 0.5, 0, wd * 0.55);
    this.wrist2.rotation.set(wf * 0.5, 0, wd * 0.45);
    const spreadSign = [-1, -0.2, 1, 1];
    this.fingers.forEach((f, i) => {
      const a = p.f[i];
      f.mcp.rotation.set(D(a[0]), 0, D(a[3]) * spreadSign[i] - this.fan[i] * 0.6);
      f.pip.rotation.x = D(a[1]);
      f.dip.rotation.x = D(a[2]);
    });
    const t = p.t;
    if (p.thumbDir) {
      // 웹캠 측정값: 손바닥 좌표계의 엄지 중수골 방향을 그대로 적용
      const local = p.thumbDir.clone().applyQuaternion(this.thumb.cmc.quaternion.clone().invert()).normalize();
      this.thumb.move.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), local);
    } else this.thumb.move.rotation.set(D(t[0]), 0, -D(t[1] - 25));
    this.thumb.mcp.rotation.x = D(t[2]);
    this.thumb.ip.rotation.x = D(t[3]);
    this.root.updateMatrixWorld(true);
  }

  // 손(wrist2) 좌표축이 world 에서 basis(3x3, 반사 허용)가 되도록 root 행렬을 직접 지정
  setHandWorld(basis, target) {
    const root = this.root;
    root.matrixAutoUpdate = false;
    root.matrix.identity();
    root.updateMatrixWorld(true);
    const A = this.wrist2.matrixWorld.clone(); // root 기준 wrist2
    const D4 = new THREE.Matrix4().setFromMatrix3(basis);
    const palm = new THREE.Vector3(-0.45, 4.05, 0.5).applyMatrix3(basis);
    D4.setPosition(target.clone().sub(palm));
    root.matrix.copy(D4.multiply(A.invert()));
    root.updateMatrixWorld(true);
  }
  releaseRoot() {
    this.root.matrixAutoUpdate = true;
    this.root.updateMatrixWorld(true);
  }

  setSkin(v) { this.skin.forEach((m) => (m.visible = v)); }
  setTissue(kind, v) {
    this.strands.filter((s) => s.kind === kind).forEach((s) => (s.mesh.visible = v));
  }
  worldPos(name) { return this.anchors[name].getWorldPosition(new THREE.Vector3()); }

  // 골절 표시 (금 간 고리)
  showCrack(boneId, at) {
    this.clearCrack();
    const mesh = boneId === 'hamate' ? this.hookMesh : this.boneMeshes[boneId];
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    const size = bb.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z) * 0.5 + 0.03;
    const g = new THREE.TorusGeometry(r, Math.max(0.035, r * 0.08), 6, 40);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getY(i), pos.getX(i));
      pos.setZ(i, pos.getZ(i) + Math.sin(a * 7) * r * 0.18 + Math.sin(a * 13) * r * 0.08);
    }
    const crack = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x3a1010, roughness: 0.9 }));
    crack.rotation.x = Math.PI / 2;
    crack.position.set((bb.min.x + bb.max.x) / 2, bb.min.y + size.y * at, (bb.min.z + bb.max.z) / 2);
    crack.scale.set(1, (size.z / Math.max(size.x, 1e-3)) || 1, 1);
    crack.userData.id = boneId;
    mesh.add(crack);
    this.crack = crack;
  }
  clearCrack() { if (this.crack) { this.crack.parent.remove(this.crack); this.crack = null; } }
}
