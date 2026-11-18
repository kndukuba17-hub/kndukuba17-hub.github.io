/* Binary spike formations along the top and bottom of the viewport.
 *
 * One canvas, one draw pass, no DOM elements. Column heights come from layered value
 * noise so the edges are irregular rather than symmetrical, and scroll progress shifts
 * both the density and the noise offset so the formations breathe as you move through
 * the page. Pointer-events are off: this never intercepts a click.
 */
import { C, tick, lerp, clamp, reduced } from "./tokens.js?v=20261118191940";

const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
function noise(x) {                      // 1-D value noise, smooth between integers
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u);
}
const fbm = (x, oct = 4) => {
  let v = 0, a = .5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * noise(x * f); f *= 2.03; a *= .5; }
  return v;
};

export class PixelField {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.cell = opts.cell || 7;
    this.maxDepth = opts.maxDepth || 9;   // cells deep at the thickest
    this.progress = 0;                    // 0..1 scroll through the page
    this.intensity = 1;                   // sections can calm the field down
    this._int = 1;
    this.t = 0;
    this.sparks = [];
    this.resize();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(document.documentElement);
    this.stop = tick((dt) => this._frame(dt));
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = innerWidth, h = innerHeight;
    this.cv.width = w * dpr; this.cv.height = h * dpr;
    this.cv.style.width = w + "px"; this.cv.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
    this.cell = w < 560 ? 5 : w < 900 ? 6 : 7;
    this.cols = Math.ceil(w / this.cell) + 1;
  }

  setProgress(p) { this.progress = clamp(p, 0, 1); }
  setIntensity(v) { this.intensity = clamp(v, 0, 1); }

  /* Release a few particles from the edge - called on section changes. */
  burst(n = 10) {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const top = Math.random() < .5;
      this.sparks.push({
        x: Math.random() * this.w,
        y: top ? Math.random() * 30 : this.h - Math.random() * 30,
        vx: (Math.random() - .5) * .02,
        vy: (top ? 1 : -1) * (.015 + Math.random() * .03),
        life: 1,
      });
    }
    if (this.sparks.length > 90) this.sparks.splice(0, this.sparks.length - 90);
  }

  _frame(dt) {
    if (!reduced()) this.t += dt;
    this._int = lerp(this._int, this.intensity, 1 - Math.exp(-0.004 * dt));
    const ctx = this.ctx, cell = this.cell;
    ctx.clearRect(0, 0, this.w, this.h);
    if (this._int < .02) return;

    const drift = this.t / 9000 + this.progress * 2.2;
    const s = cell * .88;

    for (let edge = 0; edge < 2; edge++) {
      const top = edge === 0;
      // the two edges read different parts of the noise so they never mirror each other
      const seed = top ? 0 : 57.3;
      for (let c = 0; c < this.cols; c++) {
        const nx = c * .14 + drift * (top ? 1 : -.8) + seed;
        // two octaves of different scale give jagged peaks on a slow swell
        const base = fbm(nx, 4) * .7 + fbm(nx * 3.1, 2) * .3;
        const swell = .55 + .45 * Math.sin(this.progress * Math.PI * 2 + c * .02);
        let depth = Math.round(base * this.maxDepth * swell * this._int);
        if (depth <= 0) continue;
        const x = c * cell;
        for (let d = 0; d < depth; d++) {
          const y = top ? d * cell : this.h - (d + 1) * cell;
          // density falls off toward the tip so the formations dissolve rather than stop
          const fall = 1 - d / depth;
          if (hash(c * 31.7 + d * 7.3 + seed) > fall * .96) continue;
          const tip = d / depth;
          ctx.fillStyle = tip > .82 ? C.pink : tip > .62 ? C.pinkLo : C.char;
          ctx.globalAlpha = (.30 + fall * .62) * this._int;
          ctx.fillRect(x, y, s, s);
        }
      }
    }

    // released particles
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt / 2600;
      if (p.life <= 0) { this.sparks.splice(i, 1); continue; }
      ctx.globalAlpha = p.life * .7 * this._int;
      ctx.fillStyle = C.pink;
      ctx.fillRect(p.x, p.y, cell * .6, cell * .6);
    }
    ctx.globalAlpha = 1;
  }

  destroy() { this.stop?.(); this._ro?.disconnect(); }
}
