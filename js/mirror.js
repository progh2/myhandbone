// 웹캠 손 인식 (MediaPipe Tasks Vision) → 손 관절 각도 · 손바닥 방향 · (옵션) 손목 각도
// 모든 처리는 브라우저 안에서만 이루어지며 영상은 어디에도 전송되지 않습니다.
import * as THREE from 'three';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const R2D = 180 / Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const HAND_EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

const v3 = (p) => new THREE.Vector3(p.x, p.y, p.z);
const angleBetween = (a, b) => a.angleTo(b) * R2D;

// 손 랜드마크(카메라 좌표: x 오른쪽, y 아래, z 카메라에서 멀어짐) → 리그용 측정값
export function analyzeHand(world, isRight) {
  // 왼손은 x축 반사로 오른손 형태로 바꿔서 계산 (각도는 반사에 불변)
  const P = world.map((p) => { const v = v3(p); if (!isRight) v.x = -v.x; return v; });
  const sub = (i, j) => P[j].clone().sub(P[i]);
  const mcpCenter = P[5].clone().add(P[9]).add(P[13]).add(P[17]).multiplyScalar(0.25);
  const Y = mcpCenter.clone().sub(P[0]).normalize();
  const xr = P[5].clone().sub(P[17]);
  const X = xr.sub(Y.clone().multiplyScalar(xr.dot(Y))).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize(); // 손바닥 쪽
  const toPalm = (v) => new THREE.Vector3(v.dot(X), v.dot(Y), v.dot(Z));

  // 손가락 굽힘: 인접한 뼈 벡터 사이 각도. 손바닥 쪽으로 굽으면 +, 손등 쪽이면 -
  // (리그 규약: +X 축 회전 = 굽힘 → cross(u, w)·X > 0 이면 굽힘)
  const flex = (a, b, c, d, signed = true) => {
    const u = sub(a, b), w = sub(c, d);
    const ang = angleBetween(u, w);
    return signed && new THREE.Vector3().crossVectors(u, w).dot(X) < 0 ? -ang : ang;
  };
  const chains = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
  const mids = sub(9, 10).clone();
  const f = chains.map(([m, p, d, t], i) => {
    const mcp = flex(0, m, m, p);
    const pip = flex(m, p, p, d);
    const dip = flex(p, d, d, t);
    // 벌림: 손바닥 평면에 투영한 근위지골 방향과 중지 방향 사이
    const a = toPalm(sub(m, p)); a.z = 0;
    const b = toPalm(mids); b.z = 0;
    const spread = i === 1 ? 0 : clamp(angleBetween(a, b) - (i === 3 ? 8 : 4), 0, 30);
    return [clamp(mcp - 8, -25, 100), clamp(pip, -10, 115), clamp(dip, -15, 90), spread];
  });
  // 엄지: 중수골 방향을 손바닥 좌표로
  const thumbDir = toPalm(sub(1, 2).normalize()).normalize();
  const tMcp = clamp(flex(1, 2, 2, 3, false), 0, 80);
  const tIp = clamp(flex(2, 3, 3, 4, false), 0, 90);
  const idx = toPalm(sub(0, 5).normalize());
  const across = clamp(Math.asin(clamp(-thumbDir.x * 0.6 + thumbDir.z * 0.8, -1, 1)) * R2D, -20, 80);
  const abd = clamp(angleBetween(thumbDir, idx), 0, 80);
  return { X, Y, Z, f, thumbDir, t: [across, abd, tMcp, tIp], palmFrame: { X, Y, Z } };
}

// 전완 방향(팔꿈치→손목, 카메라 좌표)을 손바닥 좌표계로 → 손목 굽힘/편위
export function wristFromForearm(fore, frame, isRight) {
  const f = fore.clone(); if (!isRight) f.x = -f.x;
  f.normalize();
  const fx = f.dot(frame.X), fy = f.dot(frame.Y), fz = f.dot(frame.Z);
  return { wf: clamp(Math.atan2(-fz, fy) * R2D, -85, 85), wd: clamp(Math.atan2(fx, fy) * R2D, -30, 45) };
}

export class HandTracker {
  constructor({ video, overlay, onResult, onStatus }) {
    Object.assign(this, { video, overlay, onResult, onStatus });
    this.ctx = overlay.getContext('2d');
    this.running = false;
    this.useWrist = false;
    this.swap = false;
    this.lastVideoTime = -1;
    this.pose = null;
  }

  async init() {
    if (this.hand) return;
    this.onStatus('손 인식 준비 중… (처음 한 번만 약 8MB 내려받아요)');
    const vision = await import(`${MP}/vision_bundle.mjs`);
    this.vision = vision;
    this.fileset = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const make = (delegate) => vision.HandLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { this.hand = await make('GPU'); } catch { this.hand = await make('CPU'); }
  }

  async recreateCPU() {
    const opts = (model, extra) => ({ baseOptions: { modelAssetPath: model, delegate: 'CPU' }, runningMode: 'VIDEO', ...extra });
    this.hand = await this.vision.HandLandmarker.createFromOptions(this.fileset, opts(HAND_MODEL, { numHands: 1 }));
    if (this.pose) this.pose = await this.vision.PoseLandmarker.createFromOptions(this.fileset, opts(POSE_MODEL, { numPoses: 1 }));
  }

  async initPose() {
    if (this.pose) return;
    this.onStatus('팔 인식 준비 중…');
    const make = (delegate) => this.vision.PoseLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate }, runningMode: 'VIDEO', numPoses: 1,
    });
    try { this.pose = await make('GPU'); } catch { this.pose = await make('CPU'); }
  }

  async start() {
    if (!window.isSecureContext) throw new Error('카메라는 https 주소에서만 쓸 수 있어요.');
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no-gum'), { name: 'NoGetUserMedia' });
    // 1) 버튼을 누른 직후 바로 카메라부터 요청 (모바일 사파리는 사용자 동작과 가까울수록 안정적)
    this.onStatus('카메라 권한을 허용해 주세요…');
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play().catch(() => {});
    // 2) 그다음 인식 모델 불러오기
    await this.init();
    if (this.useWrist) await this.initPose();
    if (!this.stream) return; // 로딩 중에 꺼진 경우
    this.overlay.width = this.video.videoWidth || 640;
    this.overlay.height = this.video.videoHeight || 480;
    this.running = true;
    this.onStatus('손을 카메라에 보여 주세요 ✋');
    this.loop();
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  async setWrist(on) {
    this.useWrist = on;
    if (on && this.running) { await this.initPose(); this.onStatus('팔꿈치까지 화면에 나오게 해 주세요'); }
  }

  loop = () => {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const now = performance.now();
      try {
        const res = this.hand.detectForVideo(v, now);
        let poseRes = null;
        if (this.useWrist && this.pose) poseRes = this.pose.detectForVideo(v, now);
        this.handle(res, poseRes);
      } catch (e) {
        // 일부 휴대폰은 GPU 모드에서 실패 → CPU 모드로 다시 시도
        console.warn(e);
        if (!this.cpuFallback) {
          this.cpuFallback = true;
          this.running = false;
          this.onStatus('호환 모드로 다시 준비하는 중…');
          this.recreateCPU().then(() => { this.running = true; this.loop(); }).catch((err) => this.onStatus(`인식 오류: ${err.message}`));
          return;
        }
      }
    }
    requestAnimationFrame(this.loop);
  };

  handle(res, poseRes) {
    const ctx = this.ctx, W = this.overlay.width, H = this.overlay.height;
    ctx.clearRect(0, 0, W, H);
    if (!res.landmarks?.length) { this.onResult(null); return; }
    const lm = res.landmarks[0];
    // 손 그리기
    ctx.lineWidth = 3; ctx.strokeStyle = '#f2a541';
    for (const [a, b] of HAND_EDGES) { ctx.beginPath(); ctx.moveTo(lm[a].x * W, lm[a].y * H); ctx.lineTo(lm[b].x * W, lm[b].y * H); ctx.stroke(); }
    ctx.fillStyle = '#fff';
    for (const p of lm) { ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 3.5, 0, 7); ctx.fill(); }
    // MediaPipe 는 좌우 반전된(셀피) 입력을 가정 → 원본 영상에서는 라벨이 반대
    const label = res.handednesses?.[0]?.[0]?.categoryName || res.handedness?.[0]?.[0]?.categoryName;
    let isRight = label === 'Left';
    if (this.swap) isRight = !isRight;
    const out = analyzeHand(res.worldLandmarks[0], isRight);
    out.isRight = isRight;
    if (poseRes?.worldLandmarks?.length) {
      const pl = poseRes.landmarks[0], pw = poseRes.worldLandmarks[0];
      // 손 랜드마크 손목과 가까운 쪽 팔 선택
      const d = (i) => Math.hypot(pl[i].x - lm[0].x, pl[i].y - lm[0].y);
      const [e, w] = d(15) < d(16) ? [13, 15] : [14, 16];
      if (pl[e].visibility > 0.5 && d(w) < 0.15) {
        const fore = v3(pw[w]).sub(v3(pw[e]));
        Object.assign(out, wristFromForearm(fore, out.palmFrame, isRight));
        ctx.strokeStyle = '#7ad7ff'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(pl[e].x * W, pl[e].y * H); ctx.lineTo(lm[0].x * W, lm[0].y * H); ctx.stroke();
      }
    }
    this.onResult(out);
  }
}
