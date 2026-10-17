import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HandRig } from './hand.js';
import { HandTracker, analyzeHand } from './mirror.js';
import { BONES, TISSUES, NEUTRAL, TASKS, CONDITIONS, EXERCISES, TOUCH_CARDS, FRACTURES, CHECKLIST, FACTS } from './data.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const clone = (p) => JSON.parse(JSON.stringify(p));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ───────────────────────── scene
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
const HOME_DIR = new THREE.Vector3(-0.8, 0.55, -0.12).normalize();
camera.position.copy(HOME_DIR).multiplyScalar(40);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 10;
controls.maxDistance = 120;

scene.add(new THREE.HemisphereLight(0xfff4ea, 0x3a2040, 1.35));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-14, 30, 18);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 100 });
key.shadow.bias = -0.0005;
scene.add(key);
const rim = new THREE.DirectionalLight(0xffb070, 1.1);
rim.position.set(20, 6, -24);
scene.add(rim);

const desk = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.ShadowMaterial({ opacity: 0.32 }));
desk.rotation.x = -Math.PI / 2;
desk.receiveShadow = true;
scene.add(desk);
const deskTop = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: 0x2a1a2c, roughness: 0.9, transparent: true, opacity: 0.55 }));
deskTop.rotation.x = -Math.PI / 2;
deskTop.receiveShadow = true;
scene.add(deskTop);

const rig = new HandRig();
scene.add(rig.root, rig.tissueGroup);

// ───────────────────────── props
const props = {};
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
const MOUSE_C = 0xd8d4dc;
function shadowAll(o) { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; }
{
  const g = new THREE.Group();
  const base = new THREE.Mesh(new RoundedBoxGeometry(34, 1.6, 12.5, 3, 0.5), M(0x2b2b33));
  base.position.y = -0.8; g.add(base);
  const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(1.65, 0.8, 1.65, 2, 0.25), M(0x41414c), 70);
  let k = 0; const m4 = new THREE.Matrix4();
  for (let r = 0; r < 5; r++) for (let c = 0; c < 14; c++) { m4.setPosition(-15.6 + c * 1.9 + (r % 2) * 0.4, 0.2, -3.8 + r * 1.9); keys.setMatrixAt(k++, m4); }
  g.add(keys);
  props.keyboard = shadowAll(g);
}
{
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), M(MOUSE_C, { roughness: 0.35 }));
  body.scale.set(3.1, 1.9, 5.4); g.add(body);
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 16), M(0x888899));
  wheel.rotation.z = Math.PI / 2; wheel.position.set(0, 1.75, -2.2); g.add(wheel);
  props.mouse = shadowAll(g);
  const vg = new THREE.Group();
  const vb = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), M(MOUSE_C, { roughness: 0.35 }));
  vb.scale.set(2.2, 3.4, 5.4); vg.add(vb);
  props.vmouse = shadowAll(vg);
}
{
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 13, 20), M(0x1d1d24, { roughness: 0.3 }));
  shaft.position.y = 4.5; g.add(shaft);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.46, 3.2, 20), M(0x55555f, { roughness: 0.9 }));
  grip.position.y = -0.4; g.add(grip);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.2, 20), M(0xdddddd));
  tip.rotation.x = Math.PI; tip.position.y = -2.6; g.add(tip);
  props.pen = shadowAll(g);
  const tab = new THREE.Group();
  const tb = new THREE.Mesh(new RoundedBoxGeometry(34, 0.9, 22, 3, 0.4), M(0x25252c));
  tb.position.y = -0.45; tab.add(tb);
  const area = new THREE.Mesh(new THREE.PlaneGeometry(26, 16), M(0x34343e, { roughness: 0.4 }));
  area.rotation.x = -Math.PI / 2; area.position.y = 0.02; tab.add(area);
  props.tablet = shadowAll(tab);
}
{
  const g = new THREE.Group();
  const b = new THREE.Mesh(new RoundedBoxGeometry(7.2, 15, 0.85, 4, 0.5), M(0x202028, { roughness: 0.3 }));
  g.add(b);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 14.2), new THREE.MeshStandardMaterial({ color: 0x6fb7ff, emissive: 0x2a5d9a, emissiveIntensity: 0.8, roughness: 0.2 }));
  scr.position.z = 0.44; g.add(scr);
  props.phone = shadowAll(g);
}
{
  const g = new THREE.Group();
  const base = new THREE.Mesh(new RoundedBoxGeometry(32, 1.5, 22, 3, 0.5), M(0xb9bcc6, { metalness: 0.5, roughness: 0.35 }));
  base.position.y = -0.75; g.add(base);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(11, 7), M(0xa4a7b2, { metalness: 0.4, roughness: 0.25 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.01, 6.5); g.add(pad);
  const kb = new THREE.Mesh(new THREE.PlaneGeometry(27, 9.5), M(0x2a2a30));
  kb.rotation.x = -Math.PI / 2; kb.position.set(0, 0.01, -4.5); g.add(kb);
  const scr = new THREE.Mesh(new RoundedBoxGeometry(32, 21, 0.8, 3, 0.4), M(0xb9bcc6, { metalness: 0.5, roughness: 0.35 }));
  scr.position.set(0, 9.5, -12); scr.rotation.x = -0.28; g.add(scr);
  props.laptop = shadowAll(g);
  props.laptop.userData.pad = pad;
}
Object.values(props).forEach((p) => { p.visible = false; scene.add(p); });

const V3 = () => new THREE.Vector3();
function handFrame() {
  const wp = (x, y, z) => rig.wrist2.localToWorld(new THREE.Vector3(x - 0.25, y - 1.55, z));
  const c = wp(-0.2, 5.6, 1.55), n = wp(-0.2, 5.6, 2.55).sub(c).normalize();
  const fwd = wp(-0.2, 9.0, 1.55).sub(c).normalize();
  return { c, n, fwd, heel: wp(-0.2, 2.6, 1.6) };
}
// 목표 자세 기준으로 소품 배치 (잠깐 목표 자세를 적용해 측정)
function placeProps(task, variant, pose) {
  Object.values(props).forEach((p) => (p.visible = false));
  props.pen.parent && props.pen.parent.remove(props.pen);
  props.phone.parent && props.phone.parent.remove(props.phone);
  let floorY = null;
  state.viewDir = null;
  const save = clone(state.cur);
  rig.applyPose(pose);
  const tipY = Math.min(...[1, 2, 3, 4].map((i) => rig.worldPos(`tip${i}`).y));
  const F = handFrame();
  const kind = task?.prop;
  if (kind === 'keyboard') {
    const t = rig.worldPos('tip2');
    const kb = props.keyboard;
    kb.position.set(t.x + 7, tipY - 0.15 - 0.6, t.z + 1.3);
    kb.rotation.set(0, 0, 0);
    kb.visible = true; floorY = kb.position.y - 1.6;
  } else if (kind === 'mouse') {
    if (variant === 'good') {
      const m = props.vmouse;
      const up = F.n.clone().negate();
      m.position.copy(F.c).addScaledVector(F.n, 2.3);
      const fwd = F.fwd.clone().setY(0).normalize();
      const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, new THREE.Vector3(0, 1, 0), fwd.clone().negate()));
      m.rotateZ(Math.atan2(up.x * side.x + up.z * side.z, up.y) * 0.6);
      m.position.y = Math.max(m.position.y, 0);
      m.visible = true; floorY = m.position.y - 3.2;
    } else {
      const m = props.mouse;
      m.position.copy(F.c).addScaledVector(F.n, 1.6);
      m.position.y = Math.min(F.c.y, F.heel.y) - 2.0;
      const fwd = F.fwd.clone().setY(0).normalize();
      m.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
      m.position.addScaledVector(fwd, 0.8);
      m.visible = true; floorY = Math.min(m.position.y - 1.6, F.heel.y - 0.7);
    }
  } else if (kind === 'pen') {
    // 목표 자세에서 검지·엄지 끝 사이를 잡는 점, 엄지-검지 물갈퀴 쪽으로 펜이 기댐
    const pen = props.pen;
    const grip = rig.worldPos('pad1').lerp(rig.worldPos('pad0'), 0.45);
    const web = rig.wrist2.localToWorld(new THREE.Vector3(2.3 - 0.25, 7.6 - 1.55, -1.2));
    const dir = web.clone().sub(grip).normalize();
    pen.position.copy(grip);
    pen.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    pen.visible = true;
    rig.wrist2.attach(pen);
    const tipW = grip.clone().addScaledVector(dir, -3.2);
    const tb = props.tablet;
    tb.position.set(tipW.x - 4, tipW.y, tipW.z + 2);
    tb.rotation.set(0, 0.3, 0);
    tb.visible = true; floorY = Math.min(tipW.y - 0.9, F.heel.y - 1.2);
  } else if (kind === 'phone') {
    const ph = props.phone;
    rig.wrist2.add(ph);
    ph.position.set(3.2 - 0.25, 6.6 - 1.55, 2.5);
    ph.rotation.set(0, 0, -Math.PI / 2);
    ph.visible = true;
    // 사용자의 눈 위치(화면 정면)에서 보기
    const n = rig.wrist2.localToWorld(new THREE.Vector3(0, 0, 1)).sub(rig.wrist2.localToWorld(new THREE.Vector3()));
    state.viewDir = n.normalize().multiplyScalar(0.8).add(new THREE.Vector3(-0.5, 0.3, 0.2)).normalize();
  } else if (kind === 'laptop') {
    const lp = props.laptop;
    const t = rig.worldPos('tip1');
    const fwd = F.fwd.clone().setY(0).normalize();
    lp.rotation.set(0, Math.atan2(-fwd.x, -fwd.z) * 0.3, 0);
    lp.position.set(t.x, Math.min(t.y - 0.3, F.heel.y - 0.6), t.z);
    lp.position.sub(new THREE.Vector3(0, 0, 6.5).applyEuler(lp.rotation));
    lp.visible = true; floorY = lp.position.y - 1.5;
  }
  rig.applyPose(save);
  if (floorY === null) {
    // 소품 없음: 손 아래 적당한 높이
    floorY = Math.min(F.heel.y, tipY) - 9;
  }
  state.floorTarget = floorY;
  state.camTarget = F.c.clone();
  if (!$('#tProps').checked) Object.values(props).forEach((p) => (p.visible = false));
}

// ───────────────────────── state & animation
const state = {
  cur: clone(NEUTRAL), from: null, to: null, t: 1, dur: 0.9,
  floorY: -8, floorTarget: -8, camTarget: new THREE.Vector3(),
  dirty: true, heat: true, condHL: null, selected: null, hover: null,
  focus: null,
};
function lerpPose(a, b, t) {
  const L = (x, y) => x + (y - x) * t;
  return {
    sup: L(a.sup, b.sup), wf: L(a.wf, b.wf), wd: L(a.wd, b.wd), pitch: L(a.pitch || 0, b.pitch || 0),
    f: a.f.map((r, i) => r.map((v, j) => L(v, b.f[i][j]))),
    t: a.t.map((v, i) => L(v, b.t[i])),
    load: Object.fromEntries(Object.keys(b.load).map((k) => [k, L(a.load[k] ?? 0, b.load[k])])),
  };
}
function goPose(pose, dur = 0.9) {
  state.from = clone(state.cur);
  state.to = clone(pose);
  state.t = 0;
  state.t0 = performance.now();
  state.dur = dur;
}

// ───────────────────────── risk model (단순 근사)
const RISKS = [
  { id: 'cts', name: '손목터널', color: '#ffcf4a', ids: ['median', 'tcl'] },
  { id: 'dq', name: '드퀘르뱅', color: '#ff8a5c', ids: ['dq'] },
  { id: 'ulnar', name: '척골신경', color: '#7ad7ff', ids: ['ulnar', 'pisiform'] },
  { id: 'trigger', name: '방아쇠수지', color: '#ff6fa5', ids: ['a1'] },
  { id: 'cmc', name: '엄지 CMC', color: '#c89bff', ids: ['trapezium', 'mc0'] },
  { id: 'rsi', name: 'RSI·폄근', color: '#5ef0b4', ids: ['extensor'] },
];
function assess(p) {
  const ext = Math.max(0, -p.wf), flex = Math.max(0, p.wf), uln = Math.max(0, p.wd), rad = Math.max(0, -p.wd);
  const L = p.load;
  const P = Math.min(95, 4 + 0.026 * ext * ext + 0.012 * flex * flex + 0.012 * uln * uln + 0.02 * rad * rad + 10 * L.grip + 8 * L.palm);
  const strain = clamp(Math.max(0, p.t[1] - 32) / 30 + Math.max(0, -p.t[3]) / 25 + Math.max(0, p.t[0] - 45) / 40);
  const avgFlex = p.f.reduce((s, r) => s + r[0] + r[1], 0) / 4;
  return {
    P,
    cts: clamp((P - 8) / 40),
    dq: clamp((0.5 * uln) / 30 + 0.35 * strain + 0.45 * L.thumb),
    ulnar: clamp(0.6 * L.palm + (0.25 * ext) / 40 + (0.2 * uln) / 30),
    trigger: clamp(0.6 * L.grip + (0.35 * avgFlex) / 150),
    cmc: clamp(0.55 * L.thumb + 0.4 * strain),
    rsi: clamp((0.45 * ext) / 40 + 0.35 * L.reps + 0.2 * L.grip),
  };
}
const riskEl = $('#risks');
riskEl.innerHTML = RISKS.map((r) => `<div class="risk"><span>${r.name}</span><div class="bar"><i id="rb-${r.id}" style="background:${r.color}"></i></div><em id="rv-${r.id}">0</em></div>`).join('');
let lastHud = 0;
function updateHud(a) {
  const p = state.cur;
  const wfTxt = p.wf < -1 ? `젖힘 <b>${Math.round(-p.wf)}°</b>` : p.wf > 1 ? `굽힘 <b>${Math.round(p.wf)}°</b>` : '<b>중립</b>';
  const wdTxt = p.wd > 1 ? `척측 <b>${Math.round(p.wd)}°</b>` : p.wd < -1 ? `요측 <b>${Math.round(-p.wd)}°</b>` : '<b>일직선</b>';
  const supTxt = p.sup < 30 ? '엎침(손바닥 아래)' : p.sup < 120 ? '악수 자세' : '뒤침(손바닥 위)';
  $('#hudAngles').innerHTML = `손목 ${wfTxt} · ${wdTxt}<br>전완 <b>${supTxt}</b>`;
  $('#pVal').textContent = Math.round(a.P);
  $('#pBar').style.width = `${clamp(a.P / 60) * 100}%`;
  for (const r of RISKS) {
    $(`#rb-${r.id}`).style.width = `${a[r.id] * 100}%`;
    $(`#rv-${r.id}`).textContent = Math.round(a[r.id] * 100);
  }
}

// ───────────────────────── highlight
const tmpC = new THREE.Color();
function updateMaterials(a, time) {
  const pulse = 0.65 + 0.35 * Math.sin(time * 4);
  for (const [id, m] of Object.entries(rig.mats)) {
    const e = m.emissive.setRGB(0, 0, 0);
    if (state.heat) {
      for (const r of RISKS) {
        if (r.ids.includes(id) && a[r.id] > 0.2) e.add(tmpC.set(0xff2a1a).multiplyScalar(Math.pow(a[r.id], 1.4) * 0.9 * pulse));
      }
    }
    if (state.condHL && state.condHL.ids.includes(id)) e.add(tmpC.set(state.condHL.color).multiplyScalar(1.3 * pulse));
    if (state.selected === id) e.add(tmpC.set(0xf2a541).multiplyScalar(0.55));
    if (state.hover === id) e.add(tmpC.set(0x6688ff).multiplyScalar(0.35));
  }
}

// ───────────────────────── picking & info
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tip = $('#tooltip');
function visibleDeep(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(rig.meshes, true).filter((h) => visibleDeep(h.object));
  return hits.length ? hits[0].object.userData.id || hits[0].object.parent.userData.id : null;
}
const info = (id) => BONES[id] || TISSUES[id];
canvas.addEventListener('pointermove', (ev) => {
  const id = pick(ev);
  state.hover = id;
  canvas.style.cursor = id ? 'pointer' : 'grab';
  if (id && !game.active) {
    const i = info(id);
    const r = canvas.getBoundingClientRect();
    tip.innerHTML = `${i.ko}<small>${i.en}</small>`;
    tip.style.left = `${ev.clientX - r.left}px`;
    tip.style.top = `${ev.clientY - r.top}px`;
    tip.style.opacity = 1;
  } else tip.style.opacity = 0;
});
canvas.addEventListener('pointerleave', () => { state.hover = null; tip.style.opacity = 0; });
let downAt = null;
canvas.addEventListener('pointerdown', (ev) => (downAt = [ev.clientX, ev.clientY]));
canvas.addEventListener('pointerup', (ev) => {
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 6) return;
  const id = pick(ev);
  if (game.active) return game.guess(id);
  if (id) showInfo(id); else hideInfo();
});
const infoCard = document.createElement('div');
infoCard.className = 'infocard hidden';
$('#stage').appendChild(infoCard);
function showInfo(id) {
  state.selected = id;
  const i = info(id);
  infoCard.innerHTML = `<button class="x">×</button><div class="ic-group">${i.group || '연부조직'}</div><h4>${i.ko} <small>${i.en}</small></h4><p>${i.desc}</p>`;
  infoCard.classList.remove('hidden');
  infoCard.querySelector('.x').onclick = hideInfo;
}
function hideInfo() { state.selected = null; infoCard.classList.add('hidden'); }

function focusOn(id) {
  const mesh = rig.boneMeshes[id] || rig.meshes.find((m) => m.userData.id === id);
  if (!mesh) return;
  const box = new THREE.Box3().setFromObject(mesh);
  const c = box.getCenter(new THREE.Vector3());
  state.focus = { target: c, dist: 22 };
}

// ───────────────────────── tabs
let currentTab = 'tasks';
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  setTab(b.dataset.tab);
});
function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
  document.querySelectorAll('.tab-page').forEach((x) => x.classList.toggle('on', x.dataset.page === tab));
  stopExercise();
  stopCompare();
  if (tab !== 'game') game.end();
  if (tab !== 'mirror') mirror.leave();
  if (tab !== 'conditions') state.condHL = null;
  if (tab === 'tasks') selectTask(currentTask.id, currentVariant);
  if (tab === 'conditions') selectCondition(currentCond || CONDITIONS[0].id);
  if (tab === 'exercise') selectExercise(currentEx || EXERCISES[0].id);
  if (tab === 'touch') { placeProps(null, null, TASKS.find((t) => t.id === 'rest').good.pose); goPose(TASKS.find((t) => t.id === 'rest').good.pose); }
  if (tab === 'game') game.intro();
  if (tab === 'mirror') mirror.enter();
  if (tab === 'desk') { goPose(TASKS[0].good.pose); placeProps(TASKS[0], 'good', TASKS[0].good.pose); }
  if (tab !== 'tasks' && tab !== 'mirror') state.focus = { target: state.camTarget.clone(), dist: 40, dir: HOME_DIR };
  history.replaceState(null, '', `#${tab}`);
}

// ───────────────────────── tasks
let currentTask = TASKS[0], currentVariant = 'bad', compareTimer = null;
$('#taskCards').innerHTML = TASKS.map((t) => `<button class="card" data-id="${t.id}"><span class="ic">${t.icon}</span><span class="nm">${t.name}</span><span class="who">${t.who}</span></button>`).join('');
$('#taskCards').addEventListener('click', (e) => {
  const b = e.target.closest('.card');
  if (b) selectTask(b.dataset.id, TASKS.find((t) => t.id === b.dataset.id).bad ? 'bad' : 'good');
});
function selectTask(id, variant = 'bad') {
  currentTask = TASKS.find((t) => t.id === id);
  if (!currentTask.bad) variant = 'good';
  document.querySelectorAll('#taskCards .card').forEach((c) => c.classList.toggle('on', c.dataset.id === id));
  renderTaskDetail();
  setVariant(variant);
  state.focus = { target: state.camTarget.clone(), dist: 40, dir: state.viewDir || HOME_DIR };
  history.replaceState(null, '', `#tasks/${id}`);
}
function setVariant(v) {
  currentVariant = v;
  const pose = currentTask[v].pose;
  placeProps(currentTask, v, pose);
  goPose(pose, 1.1);
  document.querySelectorAll('#taskDetail .seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  document.querySelectorAll('#taskDetail .box.bad, #taskDetail .box.good').forEach((b) => (b.style.opacity = b.classList.contains(v) ? 1 : 0.55));
}
function renderTaskDetail() {
  const t = currentTask;
  const riskTags = (pose) => {
    const a = assess(pose);
    return RISKS.filter((r) => a[r.id] > 0.45).map((r) => `<span class="tag" style="border-color:${r.color}">${r.name} ${Math.round(a[r.id] * 100)}</span>`).join('') || '<span class="tag">위험 낮음</span>';
  };
  $('#taskDetail').innerHTML = `
    <h3>${t.icon} ${t.name}</h3>
    <p class="small">${t.intro}</p>
    ${t.bad ? `<div class="seg"><button class="bad" data-v="bad">😣 흔한 자세</button><button class="good" data-v="good">😌 권장 자세</button></div>
    <label class="autoplay"><input type="checkbox" id="cmpAuto"> 3초마다 자동 비교</label>` : ''}
    ${t.bad ? `<div class="box bad"><b>무엇이 문제일까</b><ul>${t.bad.points.map((x) => `<li>${x}</li>`).join('')}</ul><div class="tags">${riskTags(t.bad.pose)}</div></div>` : ''}
    <div class="box good"><b>${t.bad ? '이렇게 바꿔 보세요' : '포인트'}</b><ul>${t.good.points.map((x) => `<li>${x}</li>`).join('')}</ul><div class="tags">${riskTags(t.good.pose)}</div></div>`;
  $('#taskDetail').querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { stopCompare(); setVariant(b.dataset.v); }));
  const auto = $('#cmpAuto');
  if (auto) auto.onchange = () => (auto.checked ? startCompare() : stopCompare());
}
function startCompare() {
  stopCompare();
  const a = $('#cmpAuto'); if (a) a.checked = true;
  compareTimer = setInterval(() => setVariant(currentVariant === 'bad' ? 'good' : 'bad'), 3000);
}
function stopCompare() {
  clearInterval(compareTimer); compareTimer = null;
  const a = $('#cmpAuto'); if (a) a.checked = false;
}

// ───────────────────────── conditions
let currentCond = null;
$('#condList').innerHTML = CONDITIONS.map((c) => `<button class="cond" data-id="${c.id}"><span class="dot" style="background:${c.color}"></span><b>${c.name}</b><small>${c.en}</small></button>`).join('');
$('#condList').addEventListener('click', (e) => { const b = e.target.closest('.cond'); if (b) selectCondition(b.dataset.id); });
function selectCondition(id) {
  currentCond = id;
  const c = CONDITIONS.find((x) => x.id === id);
  document.querySelectorAll('#condList .cond').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  state.condHL = { ids: c.highlight, color: c.color };
  const showPose = { ...clone(TASKS.find((t) => t.id === 'rest').good.pose), sup: 150, pitch: 25 };
  placeProps(null, null, showPose);
  goPose(showPose);
  const test = c.test && EXERCISES.find((e) => e.id === c.test);
  const tasks = TASKS.filter((t) => t.bad && assess(t.bad.pose)[c.id] > 0.45);
  $('#condDetail').innerHTML = `
    <div class="box" style="border-left:4px solid ${c.color}">
      <h3>${c.name}</h3><p class="small">${c.summary}</p>
      <div class="tags">${c.highlight.map((h) => `<span class="tag" data-focus="${h}">${info(h).ko}</span>`).join('')}</div>
    </div>
    <div class="box"><b>증상</b><ul>${c.symptoms.map((x) => `<li>${x}</li>`).join('')}</ul></div>
    <div class="box bad"><b>이런 작업 습관이 원인</b><ul>${c.work.map((x) => `<li>${x}</li>`).join('')}</ul>
      ${tasks.length ? `<div class="tags">${tasks.map((t) => `<span class="tag" data-task="${t.id}">${t.icon} ${t.name} 자세 보기</span>`).join('')}</div>` : ''}</div>
    <div class="box good"><b>예방</b><ul>${c.prevent.map((x) => `<li>${x}</li>`).join('')}</ul></div>
    ${test ? `<div class="box"><b>자가체크: ${test.name}</b><p class="small">${test.desc}</p><button class="btn" data-ex="${test.id}">3D로 따라하기</button></div>` : ''}
    <div class="box"><b>🏥 이럴 땐 병원으로</b><p class="small">${c.doctor}</p></div>`;
  $('#condDetail').querySelectorAll('[data-focus]').forEach((b) => (b.onclick = () => { focusOn(b.dataset.focus); showInfo(b.dataset.focus); }));
  $('#condDetail').querySelectorAll('[data-task]').forEach((b) => (b.onclick = () => { setTab('tasks'); selectTask(b.dataset.task, 'bad'); }));
  $('#condDetail').querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => { setTab('exercise'); selectExercise(b.dataset.ex); }));
}

// ───────────────────────── exercises
let currentEx = null, exRun = null;
$('#exCards').innerHTML = EXERCISES.map((e) => `<button class="card" data-id="${e.id}"><span class="ic">${e.kind === '자가체크' ? '🩺' : '🙌'}</span><span class="nm">${e.name}</span><span class="who">${e.kind}</span></button>`).join('');
$('#exCards').addEventListener('click', (e) => { const b = e.target.closest('.card'); if (b) selectExercise(b.dataset.id); });
function selectExercise(id) {
  stopExercise();
  currentEx = id;
  const ex = EXERCISES.find((e) => e.id === id);
  document.querySelectorAll('#exCards .card').forEach((c) => c.classList.toggle('on', c.dataset.id === id));
  $('#exDetail').innerHTML = `
    <div class="box"><h3>${ex.name} <small class="small">${ex.en}</small></h3><p class="small">${ex.desc}</p>
      <div class="steps">${ex.steps.map((s, i) => `<span data-i="${i}">${s.label}</span>`).join('')}</div>
      <div class="progress"><i id="exProg"></i></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="exPlay">■ 정지</button>
      ${ex.timer ? `<button class="btn alt" id="exTimer">⏱ ${ex.timer}초 타이머</button>` : ''}</div>
      <div class="timer-big hidden" id="timerBig"></div>
    </div>`;
  $('#exPlay').onclick = () => (exRun ? stopExercise() : playExercise(ex));
  if (ex.timer) $('#exTimer').onclick = () => runTimer(ex.timer);
  placeProps(null, null, ex.steps[0].pose);
  playExercise(ex);
}
function playExercise(ex) {
  stopExercise();
  let i = 0, t0 = performance.now();
  const total = ex.steps.reduce((s, x) => s + x.hold + 0.8, 0);
  const banner = $('#stepBanner');
  const go = () => {
    const s = ex.steps[i];
    goPose(s.pose, 0.8);
    banner.textContent = s.label; banner.classList.remove('hidden');
    document.querySelectorAll('#exDetail .steps span').forEach((x) => x.classList.toggle('on', +x.dataset.i === i));
    exRun.timeout = setTimeout(() => { i = (i + 1) % ex.steps.length; if (i === 0) t0 = performance.now(); go(); }, (s.hold + 0.8) * 1000);
  };
  exRun = { timeout: null, prog: setInterval(() => { const el = $('#exProg'); if (el) el.style.width = `${(((performance.now() - t0) / 1000) % total) / total * 100}%`; }, 100) };
  go();
  const b = $('#exPlay'); if (b) b.textContent = '■ 정지';
}
function stopExercise() {
  if (exRun) { clearTimeout(exRun.timeout); clearInterval(exRun.prog); exRun = null; }
  $('#stepBanner').classList.add('hidden');
  const b = $('#exPlay'); if (b) b.textContent = '▶ 재생';
}
let timerInt = null;
function runTimer(sec) {
  clearInterval(timerInt);
  const el = $('#timerBig'); el.classList.remove('hidden');
  const end = Date.now() + sec * 1000;
  const tick = () => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    el.textContent = left ? `${left}초` : '끝! 저림이 있었나요?';
    if (!left) clearInterval(timerInt);
  };
  tick(); timerInt = setInterval(tick, 250);
}

// break reminder
let breakEnd = null, breakInt = null;
$('#breakBtn').onclick = () => {
  if (breakInt) { clearInterval(breakInt); breakInt = null; $('#breakBtn').textContent = '시작'; $('#breakLeft').textContent = ''; return; }
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  const min = +$('#breakMin').value;
  breakEnd = Date.now() + min * 60000;
  $('#breakBtn').textContent = '중지';
  breakInt = setInterval(() => {
    const left = breakEnd - Date.now();
    if (left <= 0) {
      breakEnd = Date.now() + min * 60000;
      toast('🙌 손 쉬는 시간! 힘줄 활주 운동을 따라 해 보세요.');
      if ('Notification' in window && Notification.permission === 'granted') new Notification('MY HAND BONE', { body: '손 쉬는 시간! 1분만 스트레칭하세요.' });
      setTab('exercise'); selectExercise('glide');
    }
    const s = Math.max(0, Math.round(left / 1000));
    $('#breakLeft').textContent = `다음 휴식까지 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);
};
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

// ───────────────────────── touch
$('#touchCards').innerHTML = TOUCH_CARDS.map((c) => `<button class="touch" data-bone="${c.bone}"><b>✋ ${c.title}</b><p>${c.text}</p></button>`).join('');
$('#touchCards').addEventListener('click', (e) => {
  const b = e.target.closest('.touch'); if (!b) return;
  document.querySelectorAll('#touchCards .touch').forEach((x) => x.classList.toggle('on', x === b));
  focusOn(b.dataset.bone); showInfo(b.dataset.bone);
});
$('#facts').innerHTML = FACTS.map((f) => `<div class="fact"><b>${f.big}</b><span>${f.text}</span></div>`).join('');
$('#boneList').innerHTML = Object.entries(BONES).map(([id, b]) => `<span class="tag" data-bone="${id}">${b.ko}</span>`).join('');
$('#boneList').addEventListener('click', (e) => { const b = e.target.closest('[data-bone]'); if (b) { focusOn(b.dataset.bone); showInfo(b.dataset.bone); } });

// ───────────────────────── game
const game = {
  active: false, cur: null, tries: 0, score: 0, rounds: 0, last: null, saved: null,
  intro() {
    $('#gameMsg').innerHTML = '<p class="small">"새 문제"를 누르면 피부와 힘줄이 사라지고, 뼈 하나에 금이 갑니다.</p>';
    const pose = { ...clone(TASKS.find((t) => t.id === 'rest').good.pose), sup: 40, pitch: 15 };
    placeProps(null, null, pose); goPose(pose);
  },
  start() {
    if (!this.active) this.saved = { skin: $('#tSkin').checked, tendon: $('#tTendon').checked, nerve: $('#tNerve').checked, heat: $('#tHeat').checked };
    this.active = true;
    setToggle('tSkin', false); setToggle('tTendon', false); setToggle('tNerve', false); setToggle('tHeat', false);
    rig.mats.tcl && (rig.mats.tcl.visible = false); rig.mats.a1 && (rig.mats.a1.visible = false);
    const pool = FRACTURES.filter((f) => f !== this.last);
    this.cur = pool[Math.floor(Math.random() * pool.length)];
    this.last = this.cur;
    this.tries = 0;
    rig.showCrack(this.cur.bone, this.cur.at);
    hideInfo();
    $('#gameMsg').innerHTML = '<div class="box">🔎 손을 이리저리 돌려 금이 간 뼈를 찾아 클릭하세요.</div>';
  },
  guess(id) {
    if (!this.cur || !id || !BONES[id]) return;
    this.tries++;
    if (id === this.cur.bone) {
      this.rounds++; if (this.tries <= 2) this.score++;
      $('#gameMsg').innerHTML = `<div class="box good"><h3>정답! ${this.cur.name}</h3><p class="small">${this.cur.text}</p><p class="small">시도 ${this.tries}회</p></div>`;
      state.selected = id; focusOn(id);
      this.cur = null;
    } else {
      const hint = this.tries >= 3 ? `<br>힌트: <b>${BONES[this.cur.bone].group}</b> 쪽을 살펴보세요.` : '';
      $('#gameMsg').innerHTML = `<div class="box bad">그건 <b>${BONES[id].ko}</b>예요. 다시 찾아보세요!${hint}</div>`;
    }
    $('#gameScore').textContent = `점수 ${this.score} / ${this.rounds}`;
  },
  end() {
    if (!this.active) return;
    this.active = false; this.cur = null;
    rig.clearCrack();
    rig.mats.tcl && (rig.mats.tcl.visible = true); rig.mats.a1 && (rig.mats.a1.visible = true);
    const s = this.saved;
    setToggle('tSkin', s.skin); setToggle('tTendon', s.tendon); setToggle('tNerve', s.nerve); setToggle('tHeat', s.heat);
  },
};
$('#gameStart').onclick = () => game.start();


// ───────────────────────── mirror (웹캠 손 동기화)
const MIRROR_TARGET = new THREE.Vector3(0, 8, 0);
const GLIDE = EXERCISES.find((e) => e.id === 'glide').steps;
const GLIDE_DESC = ['손가락을 모두 쭉 펴세요', '손가락 뿌리는 편 채, 끝 두 마디만 굽혀 갈고리', '주먹을 꽉 쥐세요', '손가락은 곧게, 뿌리 관절만 90° (테이블 모양)', '끝마디는 편 채 주먹 (손끝이 손바닥에 닿게)'];
const FINGER_KO = ['검지', '중지', '약지', '소지'];
const mirror = {
  active: false, tracker: null, basis: null, sm: null, lastSeen: 0,
  target: 0, holdStart: 0, done: 0,
  defaultBasis() { return new THREE.Matrix3().set(-1, 0, 0, 0, 1, 0, 0, 0, 1); }, // 손바닥이 화면을 향함
  enter() {
    this.active = true;
    Object.values(props).forEach((p) => (p.visible = false));
    desk.visible = deskTop.visible = false;
    this.basis = this.basis || this.defaultBasis();
    state.postPose = () => rig.setHandWorld(this.basis, MIRROR_TARGET);
    if (!this.tracker?.running) {
      goPose({ ...clone(NEUTRAL), sup: 180, wf: 0, f: [[8, 10, 5, 4], [8, 10, 5, 0], [8, 10, 5, 4], [8, 10, 5, 8]], t: [10, 35, 5, 5] });
    }
    state.camTarget = MIRROR_TARGET.clone();
    state.focus = { target: MIRROR_TARGET.clone(), dist: 36, dir: new THREE.Vector3(0, 0.1, 1) };
    state.dirty = true;
    this.renderTargets();
  },
  leave() {
    if (!this.active) return;
    this.active = false;
    this.stopCam();
    state.postPose = null;
    rig.releaseRoot();
    desk.visible = deskTop.visible = true;
    state.dirty = true;
  },
  async startCam() {
    const box = $('#camBox');
    box.classList.remove('hidden');
    if (!this.tracker) {
      this.tracker = new HandTracker({
        video: $('#camVideo'), overlay: $('#camOverlay'),
        onResult: (r) => this.onResult(r),
        onStatus: (t) => ($('#camStatus').textContent = t),
      });
      this.tracker.useWrist = $('#camWrist').checked;
    }
    $('#camBtn').disabled = true;
    try {
      await this.tracker.start();
      $('#camBtn').textContent = '⏹ 카메라 끄기';
    } catch (e) {
      const msg = e.name === 'NotAllowedError' ? '카메라 권한이 거부되었습니다. 주소창의 카메라 아이콘에서 허용해 주세요.'
        : e.name === 'NotFoundError' ? '카메라를 찾을 수 없습니다.' : `시작 실패: ${e.message}`;
      $('#camStatus').textContent = msg; $('#camMsg').textContent = msg;
      this.tracker.stop();
    }
    $('#camBtn').disabled = false;
  },
  stopCam() {
    if (!this.tracker?.running) return;
    this.tracker.stop();
    $('#camBox').classList.add('hidden');
    $('#camBtn').textContent = '📷 카메라 켜기';
  },
  onResult(r) {
    if (!this.active) return;
    if (!r) {
      if (performance.now() - this.lastSeen > 600) $('#camStatus').textContent = '손을 찾는 중… ✋';
      return;
    }
    $('#camStatus').textContent = `${r.isRight ? '오른손' : '왼손'} 인식 중${r.wf != null ? ' · 손목 각도 측정' : ''}`;
    this.lastSeen = performance.now();
    this.apply(r);
  },
  // 측정값 → 부드럽게 → 리그 자세 + 손바닥 방향
  apply(r) {
    const a = 0.5;
    const L = (o, n) => (o == null ? n : o + (n - o) * a);
    const sm = this.sm || (this.sm = {});
    sm.f = r.f.map((row, i) => row.map((v, j) => L(sm.f?.[i][j], v)));
    sm.t = r.t.map((v, i) => L(sm.t?.[i], v));
    for (const k of ['X', 'Y', 'Z', 'thumbDir']) sm[k] = sm[k] ? sm[k].lerp(r[k], a).normalize() : r[k].clone();
    if (r.wf != null) { sm.wf = L(sm.wf, r.wf); sm.wd = L(sm.wd, r.wd); sm.wristSeen = performance.now(); }
    const wristOn = this.tracker?.useWrist && sm.wristSeen && performance.now() - sm.wristSeen < 800;
    // 손바닥 좌표 → 카메라 좌표(왼손이면 x 반사) → 거울 화면 좌표
    const m = (v) => (r.isRight ? new THREE.Vector3(-v.x, -v.y, -v.z) : new THREE.Vector3(v.x, -v.y, -v.z));
    // 손목 각도 모드가 아니면 Y/Z 를 다시 직교화
    const X = m(sm.X), Y = m(sm.Y), Z = m(sm.Z);
    this.basis = new THREE.Matrix3().set(X.x, Y.x, Z.x, X.y, Y.y, Z.y, X.z, Y.z, Z.z);
    const avgFlex = sm.f.reduce((s, x) => s + x[0] + x[1] + x[2], 0) / 4;
    state.cur = {
      sup: 180, pitch: 0, wf: wristOn ? sm.wf : 0, wd: wristOn ? sm.wd : 0,
      f: sm.f, t: sm.t, thumbDir: sm.thumbDir,
      load: { grip: clamp(avgFlex / 220), palm: 0, thumb: clamp((sm.t[0] + sm.t[2]) / 120), reps: 0.2 },
    };
    state.t = 1; state.dirty = true;
    this.readout(sm, wristOn);
    this.score(sm.f);
  },
  readout(sm, wristOn) {
    const rows = [['엄지', '', Math.round(sm.t[2]), Math.round(sm.t[3])], ...sm.f.map((r, i) => [FINGER_KO[i], Math.round(r[0]), Math.round(r[1]), Math.round(r[2])])];
    $('#angleTable').innerHTML = `<tr><th></th><th>MCP</th><th>PIP</th><th>DIP/IP</th></tr>` + rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1] === '' ? '–' : r[1] + '°'}</td><td>${r[2]}°</td><td>${r[3]}°</td></tr>`).join('');
    $('#wristRead').innerHTML = wristOn
      ? `손목 <b>${sm.wf < 0 ? `젖힘 ${Math.round(-sm.wf)}°` : `굽힘 ${Math.round(sm.wf)}°`}</b> · <b>${sm.wd >= 0 ? `척측 ${Math.round(sm.wd)}°` : `요측 ${Math.round(-sm.wd)}°`}</b>`
      : this.tracker?.useWrist ? '팔꿈치가 보이지 않아 손목 각도를 측정하지 못했습니다.' : '손목 각도는 측정하지 않는 중 (위 체크박스로 켜기)';
  },
  renderTargets() {
    $('#mTargets').innerHTML = GLIDE.map((s, i) => `<span data-i="${i}" class="${i === this.target ? 'on' : ''}">${s.label}</span>`).join('');
    $('#mTargetDesc').innerHTML = `목표: <b>${GLIDE[this.target].label}</b> — ${GLIDE_DESC[this.target]}`;
    $('#mDone').textContent = this.done ? `성공 ${this.done}회 🎉` : '';
  },
  score(f) {
    const tgt = GLIDE[this.target].pose.f;
    const per = f.map((r, i) => {
      const d = (Math.abs(r[0] - tgt[i][0]) + Math.abs(r[1] - tgt[i][1]) + 0.6 * Math.abs(r[2] - tgt[i][2])) / 2.6;
      return clamp(1 - d / 60);
    });
    const sc = Math.round((per.reduce((a, b) => a + b, 0) / 4) * 100);
    $('#mScore').textContent = sc;
    $('#mScore').parentElement.classList.toggle('ok', sc >= 75);
    $('#mFingers').innerHTML = per.map((p, i) => `<div>${FINGER_KO[i]}<i><b style="width:${p * 100}%"></b></i></div>`).join('');
    const now = performance.now();
    if (sc >= 75) {
      this.holdStart ||= now;
      const h = clamp((now - this.holdStart) / 1000);
      $('#mHold').style.width = `${h * 100}%`;
      if (h >= 1) {
        this.done++; this.holdStart = 0;
        toast(`✅ ${GLIDE[this.target].label} 성공!`);
        this.target = (this.target + 1) % GLIDE.length;
        this.renderTargets();
      }
    } else { this.holdStart = 0; $('#mHold').style.width = '0%'; }
  },
};
$('#camBtn').onclick = () => (mirror.tracker?.running ? mirror.stopCam() : mirror.startCam());
$('#camSwap').onclick = () => { if (mirror.tracker) mirror.tracker.swap = !mirror.tracker.swap; mirror.sm = null; toast('좌우 손 인식을 바꿨습니다'); };
$('#camWrist').onchange = async (e) => { if (mirror.tracker) await mirror.tracker.setWrist(e.target.checked); };
$('#mTargets').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { mirror.target = +b.dataset.i; mirror.holdStart = 0; mirror.renderTargets(); } });

// ───────────────────────── desk
const saved = JSON.parse(localStorage.getItem('mhb-check') || '{}');
$('#deskTotal').textContent = CHECKLIST.length;
$('#checklist').innerHTML = CHECKLIST.map((c) => `<label><input type="checkbox" data-id="${c.id}" ${saved[c.id] ? 'checked' : ''}> <span>${c.text}</span></label>`).join('');
function deskScore() {
  const n = CHECKLIST.filter((c) => saved[c.id]).length;
  $('#deskScore').textContent = n;
}
$('#checklist').addEventListener('change', (e) => {
  saved[e.target.dataset.id] = e.target.checked;
  localStorage.setItem('mhb-check', JSON.stringify(saved));
  deskScore();
});
deskScore();
function calc() {
  const spd = +$('#cSpeed').value || 0, hrs = +$('#cHours').value || 0, g = +$('#cForce').value || 0;
  const n = spd * 60 * hrs;
  const kg = (n * g) / 1000;
  const fmt = (x) => Math.round(x).toLocaleString('ko-KR');
  $('#calcOut').innerHTML = `
    <div>하루 타건 수 <b>${fmt(n)}</b>회 · 1년(230일) <b>${fmt(n * 230 / 10000)}</b>만 회</div>
    <div>손가락이 하루 동안 누르는 힘의 합 <b>${fmt(kg)}</b>kg — 쌀 20kg 포대 <b>${(kg / 20).toFixed(1)}</b>개를 손끝으로 들어 올리는 셈</div>
    <div>키 깊이(약 4mm)만 계산해도 손끝이 하루 <b>${fmt(n * 0.004)}</b>m를 오르내립니다.</div>
    <div>손가락 하나가 1초에 <b>${(spd / 60 / 8).toFixed(1)}</b>번 — 굽힘 힘줄이 손목터널 안에서 그만큼 미끄러집니다. 가볍게 치는 습관이 중요한 이유!</div>`;
}
['#cSpeed', '#cHours', '#cForce'].forEach((s) => $(s).addEventListener('input', calc));
calc();

// ───────────────────────── view toggles & manual
function setToggle(id, v) { $(`#${id}`).checked = v; $(`#${id}`).dispatchEvent(new Event('change')); }
$('#tSkin').onchange = (e) => rig.setSkin(e.target.checked);
$('#tTendon').onchange = (e) => { rig.setTissue('tendon', e.target.checked); rig.meshes.filter((m) => m.userData.id === 'a1').forEach((m) => (m.visible = e.target.checked)); };
$('#tNerve').onchange = (e) => { rig.setTissue('nerve', e.target.checked); rig.meshes.filter((m) => m.userData.id === 'tcl').forEach((m) => (m.visible = e.target.checked)); };
$('#tHeat').onchange = (e) => { state.heat = e.target.checked; $('#hud').style.opacity = e.target.checked ? 1 : 0.35; };
$('#tProps').onchange = () => { if (currentTab === 'tasks') placeProps(currentTask, currentVariant, currentTask[currentVariant].pose); else Object.values(props).forEach((p) => (p.visible = false)); };
$('#bReset').onclick = () => { state.focus = { target: state.camTarget.clone(), dist: 40, dir: HOME_DIR }; };
$('#bManual').onclick = () => { $('#manual').classList.toggle('hidden'); syncSliders(); };
$('#manualClose').onclick = () => $('#manual').classList.add('hidden');
const SL = ['Wf', 'Wd', 'Sup', 'Grip', 'Thumb', 'Load'];
function syncSliders() {
  const p = state.cur;
  const v = { Wf: Math.round(-p.wf), Wd: Math.round(p.wd), Sup: Math.round(p.sup), Grip: Math.round(p.f[1][1] / 1.0), Thumb: Math.round(p.t[0]), Load: Math.round(p.load.grip * 100) };
  for (const k of SL) { $(`#s${k}`).value = v[k]; }
  labelSliders();
}
function labelSliders() {
  const wf = +$('#sWf').value, wd = +$('#sWd').value;
  $('#oWf').textContent = wf > 0 ? `젖힘 ${wf}°` : wf < 0 ? `굽힘 ${-wf}°` : '0°';
  $('#oWd').textContent = wd > 0 ? `척측 ${wd}°` : wd < 0 ? `요측 ${-wd}°` : '0°';
  $('#oSup').textContent = `${$('#sSup').value}°`;
  $('#oGrip').textContent = `${$('#sGrip').value}%`;
  $('#oThumb').textContent = `${$('#sThumb').value}°`;
  $('#oLoad').textContent = `${$('#sLoad').value}%`;
}
$('#manual').addEventListener('input', () => {
  stopExercise(); stopCompare();
  const g = +$('#sGrip').value / 100;
  const p = clone(state.cur);
  p.wf = -$('#sWf').value; p.wd = +$('#sWd').value; p.sup = +$('#sSup').value;
  p.f = p.f.map((r, i) => [10 + g * (75 + i * 4), 10 + g * 90, 5 + g * 55, r[3]]);
  p.t = [+$('#sThumb').value, p.t[1], 10 + +$('#sThumb').value * 0.4, 8 + +$('#sThumb').value * 0.3];
  p.load = { ...p.load, grip: +$('#sLoad').value / 100 };
  state.cur = p; state.t = 1; state.dirty = true;
  labelSliders();
});

// ───────────────────────── loop
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.fov = camera.aspect < 1 ? 58 : camera.aspect < 1.3 ? 46 : 38;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let first = true;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  if (state.t < 1) {
    state.t = Math.min(1, (performance.now() - state.t0) / 1000 / state.dur);
    state.cur = lerpPose(state.from, state.to, ease(state.t));
    state.dirty = true;
  }
  if (state.dirty) { rig.applyPose(state.cur); state.postPose?.(); rig.updateStrands(); state.dirty = false; }
  state.floorY += (state.floorTarget - state.floorY) * Math.min(1, dt * 4);
  desk.position.y = state.floorY - 0.02; deskTop.position.y = state.floorY - 0.01;
  deskTop.position.x = state.camTarget.x; deskTop.position.z = state.camTarget.z;
  // 카메라 타깃 따라가기
  const tgt = state.focus ? state.focus.target : state.camTarget;
  if (first) { controls.target.copy(tgt); camera.position.copy(tgt).addScaledVector(HOME_DIR, 40); first = false; }
  const delta = tgt.clone().sub(controls.target).multiplyScalar(Math.min(1, dt * 3));
  controls.target.add(delta); camera.position.add(delta);
  if (state.focus) {
    const dir = (state.focus.dir || camera.position.clone().sub(controls.target)).clone().normalize();
    const want = controls.target.clone().addScaledVector(dir, state.focus.dist);
    camera.position.lerp(want, Math.min(1, dt * 3));
    if (camera.position.distanceTo(want) < 0.2 && delta.length() < 0.01) state.focus = state.focus.dir ? null : { ...state.focus, done: true };
  }
  key.position.set(state.camTarget.x - 14, state.floorY + 38, state.camTarget.z + 18);
  key.target.position.copy(state.camTarget); key.target.updateMatrixWorld();
  controls.update();
  const a = assess(state.cur);
  updateMaterials(a, time);
  if (time - lastHud > 0.08) { updateHud(a); lastHud = time; if (!$('#manual').classList.contains('hidden') && state.t < 1) syncSliders(); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
// focus 해제: 사용자가 직접 돌리면 원래 타깃 추적을 멈추지 않도록 focus 유지
controls.addEventListener('start', () => { if (state.focus?.done) state.camTarget = state.focus.target.clone(), (state.focus = null); });

// ───────────────────────── init
rig.applyPose(state.cur);
const [tab, sub] = (location.hash.slice(1) || 'tasks').split('/');
if (['tasks', 'mirror', 'conditions', 'exercise', 'touch', 'game', 'desk'].includes(tab)) setTab(tab); else setTab('tasks');
if (tab === 'tasks' && sub && TASKS.find((t) => t.id === sub)) selectTask(sub);
if (tab === 'tasks') startCompare();
window.__mhb = { mirror, analyzeHand, stopCompare, state, rig, camera, controls, goPose, setTab, selectTask, setVariant, assess };
frame();
