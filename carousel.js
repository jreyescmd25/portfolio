(() => {
  document.querySelectorAll("[data-carousel]").forEach((root) => {
    const items = [...root.children];
    if (!items.length) return;

    root.classList.add("carousel");
    const track = document.createElement("div");
    track.className = "carousel-track";
    items.forEach((el) => track.appendChild(el));
    const label = document.createElement("div");
    label.className = "carousel-label";
    const prev = document.createElement("button");
    const next = document.createElement("button");
    prev.className = "carousel-btn prev"; prev.type = "button"; prev.setAttribute("aria-label", "Previous"); prev.innerHTML = "&#8249;";
    next.className = "carousel-btn next"; next.type = "button"; next.setAttribute("aria-label", "Next"); next.innerHTML = "&#8250;";
    root.append(track, label, prev, next);

    let idx = 0;
    const nameOf = (el) => el.dataset.title || el.querySelector("img")?.alt || "";

    function render() {
      const S = items[0].offsetWidth || 300;
      items.forEach((el, i) => {
        const o = i - idx, a = Math.abs(o);
        const x = a === 0 ? 0 : Math.sign(o) * (S * 0.58 + (a - 1) * S * 0.32);
        const s = [1, 0.8, 0.66, 0.55][Math.min(a, 3)];
        el.style.transform = `translateX(${x}px) scale(${s})`;
        el.style.zIndex = 100 - a;
        el.style.opacity = a > 3 ? 0 : [1, 0.9, 0.65, 0.35][a];
        el.style.pointerEvents = a > 3 ? "none" : "";
        el.classList.toggle("is-center", a === 0);
        el.tabIndex = a === 0 ? 0 : -1;
      });
      label.textContent = nameOf(items[idx]);
      prev.disabled = idx === 0;
      next.disabled = idx === items.length - 1;
    }

    const canStep = (d) => (d > 0 ? idx < items.length - 1 : idx > 0);
    function step(d) {
      if (!canStep(d)) return false;
      idx += d;
      render();
      return true;
    }
    root.carousel = { canStep, step }; // used by scenes.js for the mouse wheel

    prev.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));

    // Clicking a side card brings it to the middle instead of opening it
    items.forEach((el, i) => el.addEventListener("click", (e) => {
      if (dragged || i !== idx) { e.preventDefault(); if (!dragged) { idx = i; render(); } }
    }));

    // Drag / swipe sideways
    let startX = null, dragged = false;
    track.addEventListener("pointerdown", (e) => { startX = e.clientX; dragged = false; });
    window.addEventListener("pointerup", (e) => {
      if (startX == null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) { dragged = true; step(dx < 0 ? 1 : -1); setTimeout(() => (dragged = false), 50); }
    });
    track.addEventListener("dragstart", (e) => e.preventDefault());

    // Left / right arrow keys when this carousel is on screen
    window.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const r = root.getBoundingClientRect();
      if (!r.width || getComputedStyle(root).visibility === "hidden" || r.bottom < 0 || r.top > innerHeight) return;
      e.preventDefault();
      step(e.key === "ArrowRight" ? 1 : -1);
    });

    window.addEventListener("resize", render);
    render();
  });
})();
