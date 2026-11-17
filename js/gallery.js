/* Featured Work deck.
 *
 * A fanned card deck: the focused card sits forward, its neighbours angle away behind it.
 * Cards are DOM buttons so links, focus and screen readers all behave; only the transform
 * changes on navigation, so moving through the deck costs one style recalc per card.
 *
 * Card art is drawn procedurally per project rather than using screenshots we do not have.
 * Opening a card clones the matching panel the page already builds, so every figure and
 * chart in the detail view is the real one, not a second copy that could drift.
 */
import { C, tick, clamp, reduced } from "./tokens.js";

/* panel = index into the existing #panels list; null means there is no panel yet */
export const DECK = [
  { panel: 0, tag: "Predictive", name: "Customer Lifetime Value", art: "bars" },
  { panel: 1, tag: "Classification", name: "Customer Churn + Dashboard", art: "roc" },
  { panel: 2, tag: "Psychology × DS", name: "Big Five Personality", art: "clusters" },
  { panel: null, tag: "Product", name: "Yves OS", art: "product", placeholder: true,
    blurb: "AI-powered productivity and intelligence system. Behavioural analytics workflows, "
         + "LLM-generated recommendations and summaries evaluated against defined quality "
         + "criteria, and engagement metrics reported through dashboards.",
    note: "Case study in progress — screenshots and a full write-up are being added." },
  { panel: 3, tag: "Generative AI", name: "Enterprise RAG Assistant", art: "network" },
  { panel: 4, tag: "NLP", name: "Aviation Sentiment", art: "tokens" },
  { panel: 5, tag: "Recommender", name: "E-Commerce Recommender", art: "heat" },
];

/* ---- procedural card art ------------------------------------------------------- */
function drawArt(cv, kind, seed) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = cv.clientWidth || 200, h = cv.clientHeight || 230;
  cv.width = w * dpr; cv.height = h * dpr;
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = "#0b0b11"; c.fillRect(0, 0, w, h);
  const rnd = (n => () => (n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)(seed * 977 + 7);
  const cell = 5, cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
  const put = (gx, gy, col, a = 1) => {
    c.globalAlpha = a; c.fillStyle = col;
    c.fillRect(gx * cell, gy * cell, cell * .86, cell * .86);
  };
  // a faint pixel field under everything, so each card reads as part of the same world
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
    if (rnd() > .93) put(x, y, C.char, .5);

  const padX = 3, usable = cols - padX * 2;
  if (kind === "bars" || kind === "tokens") {
    const n = kind === "bars" ? 10 : 12;
    const bw = Math.max(1, Math.floor(usable / n) - 1);
    for (let i = 0; i < n; i++) {
      const hh = kind === "bars"
        ? Math.round((.16 + Math.pow(i / (n - 1), 1.9) * .74) * rows)
        : Math.round((.25 + rnd() * .6) * rows);
      const hot = kind === "bars" ? i >= n - 2 : i % 4 === 0;
      for (let b = 0; b < bw; b++) for (let yy = 0; yy < hh; yy++)
        put(padX + i * (bw + 1) + b, rows - 3 - yy, hot ? C.pink : C.pinkLo, hot ? 1 : .8);
    }
  } else if (kind === "roc") {
    for (let i = 0; i < usable; i++) {
      const u = i / (usable - 1);
      const yy = rows - 3 - Math.round(Math.pow(u, .36) * (rows - 7));
      put(padX + i, yy, C.pink); put(padX + i, yy + 1, C.pinkDim, .7);
      put(padX + i, rows - 3 - Math.round(u * (rows - 7)), C.char, .85);   // the diagonal
    }
  } else if (kind === "clusters") {
    const hubs = [[.3, .34], [.68, .3], [.38, .7], [.72, .66]];
    hubs.forEach((hb, k) => {
      for (let i = 0; i < 26; i++) {
        const gx = Math.round((hb[0] + (rnd() - .5) * .22) * cols);
        const gy = Math.round((hb[1] + (rnd() - .5) * .22) * rows);
        put(gx, gy, k === 0 ? C.pink : k === 1 ? C.pinkDim : C.pinkLo, .9);
      }
    });
  } else if (kind === "network") {
    const nodes = Array.from({ length: 11 }, () => [rnd() * .8 + .1, rnd() * .8 + .1]);
    c.globalAlpha = .5; c.strokeStyle = C.pinkLo; c.lineWidth = 1;
    for (let i = 1; i < nodes.length; i++) {
      c.beginPath();
      c.moveTo(nodes[0][0] * w, nodes[0][1] * h);
      c.lineTo(nodes[i][0] * w, nodes[i][1] * h);
      c.stroke();
    }
    c.globalAlpha = 1;
    nodes.forEach((n, i) => {
      const gx = Math.round(n[0] * cols), gy = Math.round(n[1] * rows);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++)
        put(gx + a, gy + b, i === 0 ? C.pink : i < 4 ? C.pinkDim : C.pinkLo);
    });
  } else if (kind === "heat") {
    for (let y = 4; y < rows - 4; y += 2) for (let x = padX; x < cols - padX; x += 2) {
      const v = rnd();
      put(x, y, v > .88 ? C.pink : v > .66 ? C.pinkDim : v > .4 ? C.pinkLo : C.char, .95);
    }
  } else { // product: a stacked interface
    const bx = padX + 1, bw2 = cols - (padX + 1) * 2;
    for (let k = 0; k < 3; k++) {
      const top = 4 + k * Math.round((rows - 10) / 3), hh = Math.round((rows - 12) / 3.4);
      for (let y = 0; y < hh; y++) for (let x = 0; x < bw2; x++) {
        const edge = y === 0 || y === hh - 1 || x === 0 || x === bw2 - 1;
        put(bx + x, top + y, edge ? (k === 0 ? C.pink : C.pinkDim) : C.char, edge ? 1 : .55);
      }
      for (let x = 2; x < Math.round(bw2 * (k === 0 ? .62 : .4)); x++)
        put(bx + x, top + 2, C.pinkLo, .9);
    }
  }
  c.globalAlpha = 1;
}

/* ---- the deck ------------------------------------------------------------------ */
export class Gallery {
  constructor({ deck, prev, next, hint, panelsHost, overlay }) {
    this.deck = deck; this.hint = hint; this.panelsHost = panelsHost; this.overlay = overlay;
    this.i = Math.floor(DECK.length / 2);
    this.cards = DECK.map((p, idx) => this._card(p, idx));
    this.cards.forEach(c => deck.appendChild(c));
    prev?.addEventListener("click", () => this.go(this.i - 1));
    next?.addEventListener("click", () => this.go(this.i + 1));
    deck.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft") { e.preventDefault(); this.go(this.i - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); this.go(this.i + 1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.open(this.i); }
    });
    this._swipe(deck);
    addEventListener("resize", () => this.layout(), { passive: true });
    this.layout();
  }

  _card(p, idx) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "card"; b.dataset.i = idx;
    b.setAttribute("role", "option");
    b.setAttribute("aria-label", `${p.name}. ${p.tag}. Open project details.`);
    b.innerHTML = `<span class="ctag">${String(idx + 1).padStart(2, "0")} ${p.tag}</span>
      <canvas class="cviz" aria-hidden="true"></canvas>
      <span class="cfoot"><span class="cname">${p.name}</span><span class="cmark">KN</span></span>`;
    b.addEventListener("click", () => (idx === this.i ? this.open(idx) : this.go(idx)));
    return b;
  }

  _swipe(el) {
    let x0 = null;
    el.addEventListener("pointerdown", e => { x0 = e.clientX; }, { passive: true });
    el.addEventListener("pointerup", e => {
      if (x0 === null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 42) this.go(this.i + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  go(n) {
    this.i = clamp(n, 0, DECK.length - 1);
    this.layout();
  }

  layout() {
    const narrow = innerWidth < 860;
    const step = narrow ? 92 : 148;            // how far each neighbour sits out
    this.cards.forEach((c, idx) => {
      const d = idx - this.i, ad = Math.abs(d);
      const vis = ad <= (narrow ? 2 : 3);
      c.style.display = vis ? "flex" : "none";
      if (!vis) return;
      const x = d * step * (1 - Math.min(ad, 4) * .06);
      const y = ad * (narrow ? 12 : 16);
      const rot = d * (narrow ? 4 : 5.5);
      const sc = ad === 0 ? 1.18 : 1 - ad * .07;
      // the -50% pair centres the card on the deck first; the fan offsets come after
      c.style.transform =
        `translate(-50%,-50%) translate3d(${x}px,${y}px,0) rotate(${rot}deg) scale(${sc})`;
      c.style.zIndex = String(40 - ad);
      // neighbours must stay legible: at 1-ad*.26 on a near-black stage they vanished
      c.style.opacity = ad === 0 ? "1" : String(Math.max(.58, 1 - ad * .13));
      c.classList.toggle("is-active", ad === 0);
      c.setAttribute("aria-selected", ad === 0 ? "true" : "false");
      c.tabIndex = ad === 0 ? 0 : -1;
      if (!c.dataset.drawn) {
        drawArt(c.querySelector(".cviz"), DECK[idx].art, idx + 1);
        c.dataset.drawn = "1";
      }
    });
    if (this.hint) {
      const p = DECK[this.i];
      this.hint.textContent = `${String(this.i + 1).padStart(2, "0")} / ${String(DECK.length).padStart(2, "0")}  ·  ${p.name}  ·  ${p.placeholder ? "in progress" : "open for detail"}`;
    }
    this.onChange?.(this.i);
  }

  /* detail: clone the panel the page already built so the figures stay the real ones */
  open(idx) {
    const p = DECK[idx];
    const body = this.overlay.querySelector(".pdet-body");
    body.textContent = "";
    if (p.panel !== null && this.panelsHost) {
      const src = this.panelsHost.querySelector(`.panel[data-i="${p.panel}"]`);
      if (src) {
        const clone = src.cloneNode(true);
        clone.classList.remove("reveal");
        body.appendChild(clone);
        // the originals animate on scroll; a clone never gets that, so fire it here
        clone.querySelectorAll("[data-bars] i").forEach(b => { b.style.height = b.getAttribute("data-h") + "%"; });
        const roc = clone.querySelector("[data-roc]");
        if (roc) { roc.style.transition = "stroke-dashoffset 1.2s ease"; roc.style.strokeDashoffset = "0"; }
      }
    }
    if (!body.childNodes.length) {
      body.innerHTML = `<div class="kick">${p.tag} · 2026</div>
        <h3 class="disp">${p.name}</h3>
        <p>${p.blurb || ""}</p>
        ${p.note ? `<p style="color:var(--warn,#E0A33C);font-size:.88rem">${p.note}</p>` : ""}`;
    }
    this.overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    this.overlay.querySelector(".pdet-close")?.focus();
  }

  close() {
    this.overlay.classList.remove("open");
    document.body.style.overflow = "";
    this.cards[this.i]?.focus();
  }
}
