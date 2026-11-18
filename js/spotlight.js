/* The lit pixel wall behind the whole page.
 *
 * A pixel wall that is almost black until the light passes over it. The wall is painted
 * once to an offscreen canvas; every frame only the lit disc is repainted, which is what
 * keeps this affordable - a full repaint would be tens of thousands of rects a frame.
 */
import { C, tick, clamp, lerp, reduced } from "./tokens.js?v=20261118180005";

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), ux),
              lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux), uy);
}

export class Spotlight {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext("2d");
    this.base = document.createElement("canvas");
    this.bx = this.base.getContext("2d");
    this.lx = 0; this.ly = 0; this.tx = 0; this.ty = 0;
    this.has = false; this.t = 0;
    this.radius = 300;
    this.resize();
    addEventListener("resize", () => this.resize(), { passive: true });
    // the layer is fixed to the viewport, so pointer coordinates need no offset
    addEventListener("pointermove", e => {
      this.tx = e.clientX; this.ty = e.clientY; this.has = true;
    }, { passive: true });
    document.addEventListener("pointerleave", () => { this.has = false; }, { passive: true });
    this.stop = tick(dt => this._frame(dt));
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.w = Math.max(1, innerWidth); this.h = Math.max(1, innerHeight);
    for (const c of [this.cv, this.base]) { c.width = this.w * dpr; c.height = this.h * dpr; }
    this.cv.style.width = this.w + "px"; this.cv.style.height = this.h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cell = this.w < 600 ? 7 : this.w < 1000 ? 8 : 9;
    this.cols = Math.ceil(this.w / this.cell) + 1;
    this.rows = Math.ceil(this.h / this.cell) + 1;
    this.radius = Math.min(420, Math.max(190, this.w * 0.26));
    // the wall texture: cached so it is only computed on resize
    this.tone = new Float32Array(this.cols * this.rows);
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      const n = vnoise(x * .055, y * .055) * .65 + vnoise(x * .17, y * .17) * .35;
      this.tone[y * this.cols + x] = n;
    }
    this._paintBase();
    this.lx = this.w / 2; this.ly = this.h * .55;
  }

  _paintBase() {
    const b = this.bx, cell = this.cell, s = cell * .86;
    b.clearRect(0, 0, this.w, this.h);
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      const n = this.tone[y * this.cols + x];
      if (n < .34) continue;                       // unlit wall is mostly empty black
      b.fillStyle = n > .72 ? "#16161d" : "#101016";
      b.fillRect(x * cell, y * cell, s, s);
    }
  }

  _frame(dt) {
    this.t += dt;
    // when nobody is pointing, the light drifts on its own so the page is never dead
    if (!this.has) {
      this.tx = this.w * (.5 + .26 * Math.sin(this.t / 2600));
      this.ty = this.h * (.52 + .16 * Math.cos(this.t / 3100));
    }
    const k = reduced() ? 1 : 1 - Math.exp(-0.009 * dt);
    this.lx += (this.tx - this.lx) * k;
    this.ly += (this.ty - this.ly) * k;

    const ctx = this.ctx, cell = this.cell, s = cell * .86;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.drawImage(this.base, 0, 0, this.w, this.h);

    const R = this.radius * (1 + .035 * Math.sin(this.t / 420));   // the flame breathes
    const c0 = Math.max(0, ((this.lx - R) / cell) | 0), c1 = Math.min(this.cols - 1, ((this.lx + R) / cell) | 0);
    const r0 = Math.max(0, ((this.ly - R) / cell) | 0), r1 = Math.min(this.rows - 1, ((this.ly + R) / cell) | 0);
    for (let y = r0; y <= r1; y++) {
      for (let x = c0; x <= c1; x++) {
        const px = x * cell + cell / 2, py = y * cell + cell / 2;
        const d = Math.hypot(px - this.lx, py - this.ly);
        if (d >= R) continue;
        let f = 1 - d / R; f *= f;                                 // soft falloff
        const n = this.tone[y * this.cols + x];
        const v = n * (.35 + f * 1.5);
        if (v < .3) continue;
        ctx.globalAlpha = clamp(f * 1.15, 0, 1);
        ctx.fillStyle = v > 1.02 ? C.pink : v > .78 ? C.pinkDim : v > .52 ? C.pinkLo : C.char;
        ctx.fillRect(x * cell, y * cell, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  destroy() { this.stop?.(); }
}
