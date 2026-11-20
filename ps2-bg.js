// PS2-inspired background: a wall of glassy cubes that face the viewer.
// Each spot on the wall is a stack of cubes poking out toward you, the camera sways slowly,
// random cubes light up, and soft light orbs drift past.
(() => {
  const canvas = document.getElementById("ps2Canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // ---- Tweak these ----
  // Phones / weak devices get bigger (so fewer) cubes, lower resolution, 30 FPS and no glow blur.
  // If a desktop turns out to be slow, it drops to the same "lite" mode on its own.
  const SMALL = Math.min(window.innerWidth, window.innerHeight) < 700 || matchMedia("(pointer: coarse)").matches;
  const WEAK = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  let LITE = SMALL || WEAK;

  const CELL = LITE ? 2.7 : 2.4;   // spacing between stacks (bigger = fewer cubes)
  const SIZE = LITE ? 2.25 : 2.0;  // cube size (smaller than CELL = gaps between stacks)
  const MAX_DEPTH = LITE ? 3 : 4;  // most cubes in a stack (how far it pokes out)
  const DIST = 17;           // camera distance from the wall
  const SWAY = 0.05;         // how much the camera sways (kept low = calmer)
  const ORB_COUNT = LITE ? 12 : 20; // floating light orbs
  const FLASH_EVERY = 450;   // ms between cube flashes (slower = calmer)
  const FLASH_TIME = 2400;   // how long a lit cube glows (ms) — long, soft fades instead of pops
  const BG = [0, 0, 0];    // void color
  const FOG = [34, 30, 52];  // fog color
  const GLOW = (canvas.dataset.glow || "#6a5acd,#8a6cff,#b18cff,#4fd1ff").split(",").map((c) => c.trim()); // per-page colors via data-glow
  // ----------------------

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W, H, DPR, F, cubes = [], orbs = [];

  // Smooth-ish random field so the stacks form "hills" instead of pure noise
  const seeds = Array.from({ length: 6 }, () => ({ fx: 0.15 + Math.random() * 0.35, fy: 0.15 + Math.random() * 0.35, p: Math.random() * 6.28 }));
  const field = (x, y) => seeds.reduce((a, s) => a + Math.sin(x * s.fx + s.p) * Math.cos(y * s.fy - s.p), 0) / seeds.length;

  function build() {
    // enough stacks to cover the screen, plus room for the camera to sway and pan
    const halfW = (W / 2 / F) * DIST * 1.45 + 6, halfH = (H / 2 / F) * DIST * 1.35 + 4;
    const nx = Math.ceil(halfW / CELL), ny = Math.ceil(halfH / CELL);
    cubes = [];
    for (let i = -nx; i <= nx; i++) {
      for (let j = -ny; j <= ny; j++) {
        if (Math.random() < 0.06) continue; // a few holes into the void
        const n = (field(i, j) + 1) / 2; // 0..1
        const depth = Math.max(1, Math.min(MAX_DEPTH, Math.round(n * MAX_DEPTH * 1.2 + (Math.random() - 0.5))));
        for (let k = 0; k < depth; k++) cubes.push({ x: i * CELL, y: j * CELL, z: k * SIZE, lit: 0, color: GLOW[0], top: k === depth - 1 });
      }
    }
    orbs = Array.from({ length: ORB_COUNT }, () => ({
      x: (Math.random() - 0.5) * halfW * 1.6,
      y: (Math.random() - 0.5) * halfH * 2,
      z: MAX_DEPTH * SIZE + 0.5 + Math.random() * 5,
      r: 0.05 + Math.random() * 0.1,
      s: 0.2 + Math.random() * 0.4,
      p: Math.random() * Math.PI * 2,
    }));
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, LITE ? 1 : 1.5); // lower resolution = much less work
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    F = Math.max(W, H) * 0.75; // keeps the number of cubes on screen about the same on phones and desktops
    build();
  }
  resize();
  window.addEventListener("resize", resize);

  // Mouse tilt + scene/scroll progress pans the camera across the wall
  let mouseX = 0, mouseY = 0, prog = 0, progTarget = 0;
  window.addEventListener("mousemove", (e) => {
    mouseX = (e.clientX / W - 0.5) * 2;
    mouseY = (e.clientY / H - 0.5) * 2;
  });
  window.addEventListener("scenechange", (e) => { progTarget = e.detail.progress; });
  window.addEventListener("scroll", () => {
    const max = document.body.scrollHeight - H;
    progTarget = max > 0 ? window.scrollY / max : 0;
  });

  function camera(t) {
    prog += (progTarget - prog) * 0.03;
    return {
      x: (prog - 0.5) * 6 + Math.sin(t * 0.035) * 0.8,
      y: Math.cos(t * 0.025) * 0.5 - (prog - 0.5) * 3,
      z: DIST + MAX_DEPTH * SIZE,
      yaw: Math.sin(t * 0.03) * SWAY + mouseX * 0.03,
      pitch: Math.cos(t * 0.022) * SWAY * 0.6 + mouseY * 0.025,
    };
  }

  function project(px, py, pz, c) {
    let x = px - c.x, y = py - c.y, z = pz - c.z;
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const depth = -z2;
    if (depth < 0.5) return null;
    return { x: W / 2 + (x1 / depth) * F, y: H / 2 - (y1 / depth) * F, d: depth };
  }

  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  // Unit cube corners and the faces that can face the camera (never the back)
  const V = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
  const FACES = [
    { v: [4, 5, 6, 7], n: [0, 0, 1], shade: 1.0 },   // front (faces you)
    { v: [3, 7, 6, 2], n: [0, 1, 0], shade: 0.7 },   // top
    { v: [0, 1, 5, 4], n: [0, -1, 0], shade: 0.45 }, // bottom
    { v: [0, 4, 7, 3], n: [-1, 0, 0], shade: 0.55 }, // left
    { v: [1, 2, 6, 5], n: [1, 0, 0], shade: 0.55 },  // right
  ];

  let lastFlash = 0;
  function flash(now) {
    if (now - lastFlash < FLASH_EVERY || !cubes.length) return;
    lastFlash = now;
    for (let n = 0; n < 1; n++) {
      const c = cubes[Math.floor(Math.random() * cubes.length)];
      c.lit = now; c.color = GLOW[Math.floor(Math.random() * GLOW.length)];
    }
  }

  function draw(now) {
    const t = now / 1000;
    const cam = camera(t);

    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, rgba(mix(BG, FOG, 0.5), 1));
    g.addColorStop(1, rgba(BG, 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const polys = [];
    const pad = 80;
    for (const c of cubes) {
      // skip stacks that are way off-screen
      const ctr = project(c.x, c.y, c.z + SIZE / 2, cam);
      if (!ctr || ctr.x < -pad * 3 || ctr.x > W + pad * 3 || ctr.y < -pad * 3 || ctr.y > H + pad * 3) continue;
      const ox = c.x - SIZE / 2, oy = c.y - SIZE / 2, oz = c.z;
      const toCam = [cam.x - c.x, cam.y - c.y, cam.z - (c.z + SIZE / 2)];
      const age = c.lit ? (now - c.lit) / FLASH_TIME : 1;
      const glow = age < 1 ? Math.sin(age * Math.PI) : 0;
      for (const f of FACES) {
        if (f.n[2] === 1 && !c.top) continue; // front face only on the cube at the tip of the stack
        if (f.n[0] * toCam[0] + f.n[1] * toCam[1] + f.n[2] * toCam[2] <= 0) continue;
        const pts = [];
        let dsum = 0, ok = true;
        for (const vi of f.v) {
          const p = project(ox + V[vi][0] * SIZE, oy + V[vi][1] * SIZE, oz + V[vi][2] * SIZE, cam);
          if (!p) { ok = false; break; }
          pts.push(p); dsum += p.d;
        }
        if (ok) polys.push({ pts, d: dsum / 4, shade: f.shade, glow, color: c.color, z: c.z });
      }
    }
    polys.sort((a, b) => b.d - a.d);

    const base = [64, 56, 108];
    const near = DIST, far = DIST + MAX_DEPTH * SIZE + 8;
    for (const p of polys) {
      const fogT = Math.min(1, Math.max(0, (p.d - near) / (far - near))); // deeper in the wall = foggier
      let col = base.map((v) => v * p.shade);
      if (p.glow > 0) col = mix(col, hexToRgb(p.color), p.glow);
      col = mix(col, FOG, fogT * 0.8);
      const alpha = (0.17 + p.glow * 0.6) * (1 - fogT * 0.6); // keep it dim so text stays readable
      ctx.beginPath();
      ctx.moveTo(p.pts[0].x, p.pts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(p.pts[i].x, p.pts[i].y);
      ctx.closePath();
      ctx.fillStyle = rgba(col, alpha);
      ctx.fill();
      ctx.strokeStyle = rgba(mix([165, 155, 235], FOG, fogT), 0.13 + p.glow * 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
      if (p.glow > 0.05 && !LITE) {
        ctx.shadowColor = p.color; ctx.shadowBlur = 18 * p.glow;
        ctx.fill(); ctx.shadowBlur = 0;
      }
    }

    // Floating orbs drifting upward in front of the wall
    ctx.globalCompositeOperation = "lighter";
    const span = (H / F) * DIST * 1.6 + 6;
    for (const o of orbs) {
      const y = ((o.y + t * o.s * 0.5 + span / 2) % span + span) % span - span / 2;
      const p = project(o.x + Math.sin(t * 0.2 + o.p) * 0.6, y, o.z + Math.cos(t * 0.15 + o.p) * 0.4, cam);
      if (!p) continue;
      const r = Math.max(1, (o.r / p.d) * F);
      const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 6);
      rg.addColorStop(0, "rgba(190,170,255,0.45)");
      rg.addColorStop(1, "rgba(120,90,255,0)");
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    // Vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  let running = false, lastDraw = 0, winStart = 0, winFrames = 0;
  function loop(now) {
    const fps = LITE ? 30 : 60;
    if (now - lastDraw >= 1000 / fps - 2) {
      lastDraw = now;
      flash(now);
      draw(now);
      // Every 3 seconds in full mode: if it averaged under 24 FPS, switch to lite mode for good
      if (!LITE) {
        if (!winStart) winStart = now;
        winFrames++;
        if (now - winStart > 3000) {
          if (winFrames / ((now - winStart) / 1000) < 24) { LITE = true; resize(); }
          winStart = now; winFrames = 0;
        }
      }
    }
    if (!reduceMotion && !document.hidden) requestAnimationFrame(loop);
    else running = false;
  }
  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });
  window.addEventListener("resize", () => { if (reduceMotion) requestAnimationFrame(draw); });
  start();
})();