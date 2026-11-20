// Cube reveal: when a .cube-in panel scrolls into view, a glowing PS2-style cube
// flies in from deep in the void, spins into place, then unfolds into the panel.
(() => {
  // ---- Tweak these ----
  const CUBE_SIZE = 90;    // px
  const FLY_MS = 800;      // cube flying in
  const UNFOLD_MS = 650;   // cube opening into the panel
  const STAGGER_MS = 220;  // gap between panels that enter at the same time
  // ----------------------

  const targets = document.querySelectorAll(".cube-in");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!targets.length || reduceMotion || !("IntersectionObserver" in window)) return;

  targets.forEach((el) => el.classList.add("cube-waiting"));

  // Where the cube lands inside the panel: centered, but kept on screen for tall panels
  function landingY(el) {
    const r = el.getBoundingClientRect();
    const visibleMid = Math.min(Math.max(r.top + r.height / 2, 120), window.innerHeight - 120);
    return Math.min(Math.max(visibleMid - r.top, CUBE_SIZE / 2), r.height - CUBE_SIZE / 2);
  }

  function makeCube(el, cy) {
    const r = el.getBoundingClientRect();
    const wrap = document.createElement("div");
    wrap.className = "cube-fly";
    wrap.style.width = wrap.style.height = CUBE_SIZE + "px";
    wrap.style.left = r.left + window.scrollX + r.width / 2 - CUBE_SIZE / 2 + "px";
    wrap.style.top = r.top + window.scrollY + cy - CUBE_SIZE / 2 + "px";
    const cube = document.createElement("div");
    cube.className = "cube";
    const h = CUBE_SIZE / 2;
    ["rotateY(0deg)", "rotateY(90deg)", "rotateY(180deg)", "rotateY(-90deg)", "rotateX(90deg)", "rotateX(-90deg)"]
      .forEach((rot) => {
        const f = document.createElement("div");
        f.className = "cube-face";
        f.style.transform = `${rot} translateZ(${h}px)`;
        cube.appendChild(f);
      });
    wrap.appendChild(cube);
    document.body.appendChild(wrap);
    return { wrap, cube };
  }

  function reveal(el) {
    const cy = landingY(el);
    const { wrap, cube } = makeCube(el, cy);

    // 1) Fly in from the void, spinning
    // (opacity lives on the wrapper: fading the 3D cube itself would flatten it)
    wrap.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1 }], { duration: FLY_MS, fill: "forwards" });
    const fly = cube.animate(
      [
        { transform: "translateZ(-1600px) rotateX(-220deg) rotateY(340deg)" },
        { transform: "translateZ(0) rotateX(-25deg) rotateY(45deg)" },
      ],
      { duration: FLY_MS, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }
    );

    fly.onfinish = () => {
      // 2) Cube bursts open...
      cube.animate(
        [
          { transform: "rotateX(-25deg) rotateY(45deg) scale3d(1,1,1)" },
          { transform: "rotateX(0deg) rotateY(90deg) scale3d(1.8,1.8,1.8)" },
        ],
        { duration: UNFOLD_MS * 0.6, easing: "ease-in", fill: "forwards" }
      );
      wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: UNFOLD_MS * 0.6, easing: "ease-in", fill: "forwards" })
        .onfinish = () => wrap.remove();

      // ...and the panel unfolds out of it, from cube-sized to full size
      const w = el.offsetWidth, hgt = el.offsetHeight;
      const ix = Math.max(0, (w - CUBE_SIZE) / 2);
      const it = Math.max(0, cy - CUBE_SIZE / 2), ib = Math.max(0, hgt - cy - CUBE_SIZE / 2);
      el.classList.remove("cube-waiting");
      const open = el.animate(
        [
          { clipPath: `inset(${it}px ${ix}px ${ib}px ${ix}px round 10px)`, opacity: 0.4, filter: "brightness(2)" },
          { clipPath: `inset(${it * 0.15}px 0px ${ib * 0.15}px 0px round 20px)`, opacity: 1, offset: 0.6 },
          { clipPath: "inset(0px 0px round 20px)", opacity: 1, filter: "brightness(1)" },
        ],
        { duration: UNFOLD_MS, easing: "cubic-bezier(.3,.9,.3,1)" }
      );

      // 3) Content pops in one piece at a time
      [...el.children].forEach((child, i) => {
        child.animate(
          [
            { opacity: 0, transform: "translateY(18px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 450, delay: UNFOLD_MS * 0.5 + i * 90, easing: "ease-out", fill: "backwards" }
        );
      });
      open.onfinish = () => (el.style.clipPath = "");
    };
  }

  // Queue panels so they come in one by one
  let queueEnd = 0;
  const io = new IntersectionObserver(
    (entries) => {
      entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
        .forEach((e) => {
          io.unobserve(e.target);
          const now = performance.now();
          const wait = Math.max(0, queueEnd - now);
          queueEnd = now + wait + STAGGER_MS;
          setTimeout(() => reveal(e.target), wait);
        });
    },
    { threshold: 0.15 }
  );
  targets.forEach((el) => io.observe(el));
})();
