// PS2-style scenes: the page never really scrolls. Each scroll (wheel, swipe, arrow keys)
// collapses the current panel back into a glowing cube that flies off into the void,
// then the next cube flies in and unfolds into the next panel.
// Icons marked with data-orbit float around their panel like the lights around the PS2 towers.
//
// Markup it understands:
//   data-scene          a full-screen scene
//   data-panel          the box inside a scene that morphs to/from a cube
//   data-orbit          a container of icons that orbit that scene's panel
//   data-autoscene      a box that should become its own scene (wrapped automatically)
//   data-split-scenes   a section whose cards (children of its grid) each become a scene
//   data-scene-footer   footer that gets moved into the last scene
(() => {
  // ---- Tweak these ----
  const CUBE = 90;            // cube size in px
  const FLY_MS = 700;         // cube flying in / out
  const UNFOLD_MS = 600;      // cube opening into a panel
  const COLLAPSE_MS = 380;    // panel folding back into a cube
  const ORBIT_SPEED = 0.28;   // radians per second
  const ICON = 72, ICON_MOBILE = 46;
  // ----------------------

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !Element.prototype.animate) return; // plain scrolling page instead

  // ---------- Build the scene list ----------
  document.querySelectorAll("[data-autoscene]").forEach((box) => {
    const s = document.createElement("section");
    s.setAttribute("data-scene", "");
    s.className = "auto-scene";
    const label = box.querySelector("h1");
    if (label) s.dataset.label = label.textContent.trim();
    box.parentNode.insertBefore(s, box);
    s.appendChild(box);
    box.setAttribute("data-panel", "");
  });

  // Cards in a split section each get their own scene; the section title stays pinned
  // on screen while you move between them (one shared title, not a copy per card)
  const groupTitles = {};
  document.querySelectorAll("[data-split-scenes]").forEach((sec) => {
    const group = sec.dataset.label || "group";
    const title = sec.querySelector("h1, h2");
    const cards = [...sec.querySelectorAll(".project-card")];
    if (title) {
      title.classList.remove("reveal");
      title.classList.add("group-title");
      title.insertAdjacentHTML("beforeend", ' <span class="scene-count"></span>');
      document.body.appendChild(title);
      groupTitles[group] = title;
    }
    cards.forEach((card, i) => {
      const s = document.createElement("section");
      s.setAttribute("data-scene", "");
      s.className = "split-scene";
      if (i === 0 && sec.id) s.id = sec.id;
      s.dataset.label = group + " " + (i + 1);
      s.dataset.group = group;
      s.dataset.count = `${i + 1}/${cards.length}`;
      card.setAttribute("data-panel", "");
      s.appendChild(card);
      sec.parentNode.insertBefore(s, sec);
    });
    sec.remove();
  });

  function showGroupTitle(group) {
    const t = groupTitles[group];
    if (!t) return;
    t.getAnimations().forEach((a) => a.cancel());
    t.classList.add("on");
    t.animate([{ opacity: 0, transform: "translateY(-20px)" }, { opacity: 1, transform: "none" }],
      { duration: 500, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  function hideGroupTitle(group) {
    const t = groupTitles[group];
    if (!t || !t.classList.contains("on")) return;
    t.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-20px)" }], { duration: 300, easing: "ease-in", fill: "forwards" })
      .finished.then(() => { t.classList.remove("on"); t.getAnimations().forEach((a) => a.cancel()); }, () => {});
  }
  function setGroupCount(scene) {
    const t = groupTitles[scene.dataset.group];
    const c = t && t.querySelector(".scene-count");
    if (c) c.textContent = scene.dataset.count || "";
  }

  const scenes = [...document.querySelectorAll("[data-scene]")];
  if (scenes.length < 2) return;

  const footer = document.querySelector("[data-scene-footer]");
  if (footer) scenes[scenes.length - 1].appendChild(footer);

  document.documentElement.classList.add("scene-mode");
  window.scrollTo(0, 0);

  const panelOf = (s) => s.querySelector("[data-panel]");
  const orbitOf = (s) => s.querySelector("[data-orbit]");
  const extrasOf = (s) => [...s.children].filter((c) => !c.matches("[data-panel], [data-orbit]"));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const done = (a) => a.finished.catch(() => {});
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  };

  // ---------- Cubes ----------
  function makeCube(x, y) {
    const wrap = document.createElement("div");
    wrap.className = "cube-fly";
    wrap.style.cssText = `left:${x - CUBE / 2}px;top:${y - CUBE / 2}px;width:${CUBE}px;height:${CUBE}px`;
    const cube = document.createElement("div");
    cube.className = "cube";
    ["rotateY(0deg)", "rotateY(90deg)", "rotateY(180deg)", "rotateY(-90deg)", "rotateX(90deg)", "rotateX(-90deg)"].forEach((rot) => {
      const f = document.createElement("div");
      f.className = "cube-face";
      f.style.transform = `${rot} translateZ(${CUBE / 2}px)`;
      cube.appendChild(f);
    });
    wrap.appendChild(cube);
    document.body.appendChild(wrap);
    return { wrap, cube }; // (fade the wrapper, never the cube: fading a 3D element flattens it)
  }

  // ---------- Orbiting icons ----------
  const orbits = new Map();
  let rafOn = false;
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  function startOrbit(s, delay) {
    const o = orbitOf(s);
    if (!o) return;
    const now = performance.now();
    o.style.visibility = "visible";
    orbits.set(s, { s, icons: [...o.querySelectorAll("img")], base: Math.random() * Math.PI * 2, t0: now,
      from: 0, to: 1, tStart: now + delay, dur: 750 });
    if (!rafOn) { rafOn = true; requestAnimationFrame(tick); }
  }
  function stopOrbit(s) {
    const st = orbits.get(s);
    if (!st) return Promise.resolve();
    const now = performance.now();
    st.from = spreadOf(st, now); st.to = 0; st.tStart = now; st.dur = 300;
    return wait(300).then(() => {
      orbits.delete(s);
      const o = orbitOf(s);
      if (o) o.style.visibility = "hidden";
    });
  }
  const spreadOf = (st, now) => st.from + (st.to - st.from) * ease(Math.min(1, Math.max(0, (now - st.tStart) / st.dur)));

  function tick(now) {
    for (const st of orbits.values()) placeIcons(st, now);
    if (orbits.size) requestAnimationFrame(tick); else rafOn = false;
  }
  function placeIcons(st, now) {
    const panel = panelOf(st.s);
    const r = panel.getBoundingClientRect();
    const size = innerWidth < 640 ? ICON_MOBILE : ICON;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const rx = Math.min(r.width / 2 + size * 0.55, innerWidth / 2 - size / 2 - 4);
    const ry = Math.min(r.height / 2 + size * 0.55, (innerHeight - 70) / 2 - size / 2);
    const k = spreadOf(st, now), t = (now - st.t0) / 1000, n = st.icons.length;
    st.icons.forEach((img, i) => {
      const th = st.base + t * ORBIT_SPEED + (i * 2 * Math.PI) / n;
      const depth = Math.sin(th); // +1 = front (bottom of the ring), -1 = behind the panel
      const x = cx + Math.cos(th) * rx * k;
      const y = cy + Math.sin(th) * ry * k + Math.sin(t * 1.6 + i) * 6; // gentle bob, like the PS2 lights
      const sc = (0.75 + 0.25 * (depth + 1) / 2) * (0.2 + 0.8 * k);
      img.style.width = img.style.height = size + "px";
      img.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px) scale(${sc})`;
      img.style.zIndex = depth > 0 ? 3 : 1;
      img.style.opacity = ((0.5 + 0.5 * (depth + 1) / 2) * Math.min(1, k * 1.5)).toFixed(3);
    });
  }

  // ---------- Enter / leave ----------
  async function enter(s, dir) {
    const panel = panelOf(s), orbit = orbitOf(s), extras = extrasOf(s);
    s.classList.add("is-active");

    if (!panel) { // title scenes just glide in
      await done(s.animate(
        [{ opacity: 0, transform: `translateY(${50 * dir}px) scale(.96)` }, { opacity: 1, transform: "none" }],
        { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" }));
      return;
    }

    if (orbit) orbit.style.visibility = "hidden";
    panel.style.visibility = "hidden";
    extras.forEach((e) => (e.style.opacity = "0"));
    // coming back up? start at the bottom of a long panel
    panel.scrollTop = dir < 0 ? panel.scrollHeight : 0;

    const c = box(panel);
    const { wrap, cube } = makeCube(c.x, c.y);
    wrap.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1 }], { duration: FLY_MS, fill: "forwards" });
    await done(cube.animate(
      [{ transform: `translate3d(0, ${260 * dir}px, -1600px) rotateX(-220deg) rotateY(340deg)` },
       { transform: "translate3d(0,0,0) rotateX(-25deg) rotateY(45deg)" }],
      { duration: FLY_MS, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }));

    // the cube bursts...
    cube.animate(
      [{ transform: "rotateX(-25deg) rotateY(45deg) scale3d(1,1,1)" }, { transform: "rotateX(0deg) rotateY(90deg) scale3d(1.8,1.8,1.8)" }],
      { duration: UNFOLD_MS * 0.6, easing: "ease-in", fill: "forwards" });
    wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: UNFOLD_MS * 0.6, easing: "ease-in", fill: "forwards" })
      .finished.then(() => wrap.remove(), () => wrap.remove());

    // ...and the panel unfolds out of it
    panel.style.visibility = "";
    const ix = Math.max(0, (c.w - CUBE) / 2), iy = Math.max(0, (c.h - CUBE) / 2);
    const open = panel.animate(
      [{ clipPath: `inset(${iy}px ${ix}px round 10px)`, filter: "brightness(2)", opacity: 0.4 },
       { clipPath: `inset(${iy * 0.15}px 0px round 20px)`, opacity: 1, offset: 0.6 },
       { clipPath: "inset(0px 0px round 20px)", filter: "brightness(1)", opacity: 1 }],
      { duration: UNFOLD_MS, easing: "cubic-bezier(.3,.9,.3,1)" });
    [...panel.children].forEach((ch, i) => ch.animate(
      [{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 420, delay: UNFOLD_MS * 0.45 + Math.min(i, 8) * 80, easing: "ease-out", fill: "backwards" }));
    extras.forEach((e) => {
      e.style.opacity = "";
      e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: UNFOLD_MS * 0.4, fill: "backwards" });
    });
    startOrbit(s, UNFOLD_MS * 0.5);
    await done(open);
  }

  async function leave(s, dir) {
    const panel = panelOf(s), extras = extrasOf(s);

    if (!panel) {
      await done(s.animate(
        [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateY(${-50 * dir}px) scale(.96)` }],
        { duration: 420, easing: "ease-in", fill: "forwards" }));
      s.classList.remove("is-active");
      s.getAnimations().forEach((a) => a.cancel());
      return;
    }

    // icons get pulled back in, content fades, then the panel folds into a cube
    const orbitGone = stopOrbit(s);
    extras.forEach((e) => e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" }));
    [...panel.children].forEach((ch) => ch.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }));
    await wait(170);
    const c = box(panel);
    const ix = Math.max(0, (c.w - CUBE) / 2), iy = Math.max(0, (c.h - CUBE) / 2);
    await done(panel.animate(
      [{ clipPath: "inset(0px 0px round 20px)", filter: "brightness(1)" },
       { clipPath: `inset(${iy}px ${ix}px round 10px)`, filter: "brightness(2.2)" }],
      { duration: COLLAPSE_MS, easing: "cubic-bezier(.7,0,.8,.4)", fill: "forwards" }));
    await orbitGone;

    // swap the folded panel for a real cube and send it back into the void
    const { wrap, cube } = makeCube(c.x, c.y);
    s.classList.remove("is-active");
    s.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    wrap.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: FLY_MS, fill: "forwards" });
    cube.animate(
      [{ transform: "rotateX(-25deg) rotateY(45deg) scale3d(1.5,1.5,1.5)" },
       { transform: "rotateX(-25deg) rotateY(45deg) scale3d(1,1,1)", offset: 0.2 },
       { transform: `translate3d(0, ${-260 * dir}px, -1600px) rotateX(200deg) rotateY(-300deg)` }],
      { duration: FLY_MS, easing: "cubic-bezier(.6,0,.8,.6)", fill: "forwards" })
      .finished.then(() => wrap.remove(), () => wrap.remove());
  }

  // ---------- Navigation ----------
  let current = -1, busy = false, lastNavEnd = 0;

  const dots = document.createElement("nav");
  dots.className = "scene-dots";
  dots.setAttribute("aria-label", "Sections");
  scenes.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", s.dataset.label || s.id || `Section ${i + 1}`);
    b.title = b.getAttribute("aria-label");
    b.addEventListener("click", () => goTo(i));
    dots.appendChild(b);
  });
  document.body.appendChild(dots);

  const hint = document.createElement("div");
  hint.className = "scroll-hint";
  hint.innerHTML = "SCROLL<span>&#8964;</span>";
  document.body.appendChild(hint);

  function sync() {
    [...dots.children].forEach((b, i) => b.classList.toggle("on", i === current));
    hint.classList.toggle("gone", current !== 0);
    const id = scenes[current].id;
    history.replaceState(null, "", id && current > 0 ? "#" + id : location.pathname + location.search);
    window.dispatchEvent(new CustomEvent("scenechange", { detail: { index: current, progress: current / (scenes.length - 1) } }));
  }

  async function goTo(i) {
    i = Math.max(0, Math.min(scenes.length - 1, i));
    if (busy || i === current) return;
    busy = true;
    const dir = i > current ? 1 : -1, prev = current;
    current = i;
    sync();
    const prevGroup = prev >= 0 ? scenes[prev].dataset.group : undefined;
    const nextGroup = scenes[i].dataset.group;
    if (prevGroup && prevGroup !== nextGroup) hideGroupTitle(prevGroup);
    try {
      if (prev >= 0) await leave(scenes[prev], dir);
      if (nextGroup) {
        setGroupCount(scenes[i]);
        if (prevGroup !== nextGroup) showGroupTitle(nextGroup);
      }
      await enter(scenes[i], dir);
    } finally {
      busy = false;
      lastNavEnd = performance.now();
    }
  }

  const canScroll = (p, d) => p && p.scrollHeight > p.clientHeight + 2 &&
    (d > 0 ? p.scrollTop + p.clientHeight < p.scrollHeight - 2 : p.scrollTop > 1);

  // Mouse wheel / trackpad
  let lastWheel = 0, lastInner = 0, lastStep = 0;
  window.addEventListener("wheel", (e) => {
    if (e.ctrlKey) return; // pinch zoom
    const now = performance.now(), gap = now - lastWheel;
    lastWheel = now;
    const d = Math.sign(e.deltaY);
    if (!d) return;
    const panel = scenes[current] && panelOf(scenes[current]);
    const car = panel && panel.carousel;
    if (!busy && car && car.canStep(d)) { // carousels: each wheel flick moves one card
      e.preventDefault();
      if (now - lastStep > 260 && Math.abs(e.deltaY) > 3) { car.step(d); lastStep = now; }
      lastInner = now;
      return;
    }
    if (!busy && canScroll(panel, d)) { // long panels scroll inside first
      lastInner = now;
      if (!panel.contains(e.target)) { e.preventDefault(); panel.scrollTop += e.deltaY; }
      return;
    }
    e.preventDefault();
    if (busy || now - lastInner < 400) return;          // leftover momentum from scrolling inside a panel
    if (now - lastNavEnd < 900 && gap < 200) return;    // trackpad inertia tail
    goTo(current + d);
  }, { passive: false });

  // Touch swipes
  let ty = null, edgeAtStart = { down: true, up: true };
  window.addEventListener("touchstart", (e) => {
    ty = e.touches[0].clientY;
    const p = panelOf(scenes[current]);
    edgeAtStart = { down: !canScroll(p, 1), up: !canScroll(p, -1) };
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    const p = panelOf(scenes[current]);
    if (!p || !p.contains(e.target)) e.preventDefault(); // no rubber-banding the page
  }, { passive: false });
  window.addEventListener("touchend", (e) => {
    if (ty == null) return;
    const dy = ty - e.changedTouches[0].clientY;
    ty = null;
    if (Math.abs(dy) < 50) return;
    const d = Math.sign(dy);
    if ((d > 0 && !edgeAtStart.down) || (d < 0 && !edgeAtStart.up)) return; // they were scrolling the panel
    goTo(current + d);
  }, { passive: true });

  // Keyboard
  window.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    const p = panelOf(scenes[current]);
    let d = 0;
    if (["ArrowDown", "PageDown", " "].includes(e.key)) d = 1;
    else if (["ArrowUp", "PageUp"].includes(e.key)) d = -1;
    else if (e.key === "Home") { e.preventDefault(); return goTo(0); }
    else if (e.key === "End") { e.preventDefault(); return goTo(scenes.length - 1); }
    if (!d) return;
    e.preventDefault();
    if (canScroll(p, d)) p.scrollBy({ top: d * p.clientHeight * 0.8, behavior: "smooth" });
    else goTo(current + d);
  });

  // In-page links (#about, #contact, ...)
  const sceneFor = (id) => {
    const el = id && document.getElementById(id);
    return el ? scenes.findIndex((s) => s === el || s.contains(el)) : -1;
  };
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const i = sceneFor(a.getAttribute("href").slice(1));
    if (i >= 0) { e.preventDefault(); goTo(i); }
  }));

  // Start on the linked scene, or the first one (shown instantly so the intro animations play)
  const start = sceneFor(decodeURIComponent(location.hash.slice(1)));
  if (start > 0) goTo(start);
  else { current = 0; scenes[0].classList.add("is-active"); if (panelOf(scenes[0])) { current = -1; goTo(0); } else sync(); }
  window.addEventListener("resize", () => window.scrollTo(0, 0));
})();
