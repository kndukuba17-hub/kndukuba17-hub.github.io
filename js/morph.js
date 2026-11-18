/* Hero portrait -> character bubble.
 *
 * When the landing section leaves the viewport, characters are lifted straight out of the
 * binary portrait - real sample positions read back from the hero canvas, not invented
 * ones - and flown into the bubble, where the Mii fades up as they land. Scroll back and
 * it plays in reverse, so the character always comes from the picture rather than just
 * appearing.
 */
import { C, tick, clamp, reduced } from "./tokens.js?v=20261118180005";

const glyph = () => (Math.random() < .5 ? "0" : "1");

export class Morph {
  constructor({ canvas, source, target, onProgress }) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.source = source;            // the hero <canvas>
    this.target = target;            // the bubble element
    this.onProgress = onProgress || (() => {});
    this.p = 0;                      // 0 = in the portrait, 1 = landed in the bubble
    this.want = 0;
    this.parts = [];
    this.seeded = false;
    this.resize();
    addEventListener("resize", () => { this.resize(); this.seeded = false; }, { passive: true });
    this.stop = tick(dt => this._frame(dt));
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.w = innerWidth; this.h = innerHeight;
    this.cv.width = this.w * dpr; this.cv.height = this.h * dpr;
    this.cv.style.width = this.w + "px"; this.cv.style.height = this.h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* Read the portrait back off the hero canvas and keep the bright cells - those are the
     characters that make up the face, so the particles genuinely come from the picture. */
  _seed() {
    const src = this.source, want = this.w < 640 ? 120 : 230;
    const pts = [];
    try {
      const r = src.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return false;
      const sc = src.width / r.width;
      const step = Math.max(6, Math.round(14 * sc));
      const d = src.getContext("2d").getImageData(0, 0, src.width, src.height).data;
      for (let y = 0; y < src.height; y += step) {
        for (let x = 0; x < src.width; x += step) {
          const i = (y * src.width + x) * 4;
          // the portrait paints pink; the ambient field behind it is dim grey
          if (d[i] < 120 || d[i + 3] < 40) continue;
          if (d[i] - d[i + 2] < 10 && d[i] < 190) continue;
          pts.push([r.left + x / sc, r.top + y / sc]);
        }
      }
    } catch { return false; }
    if (pts.length < 20) return false;

    // thin evenly rather than taking the first N, so we keep the whole face not just its top
    const keep = [];
    const stride = Math.max(1, Math.floor(pts.length / want));
    for (let i = 0; i < pts.length; i += stride) keep.push(pts[i]);

    const t = this.target.getBoundingClientRect();
    const tx = t.left + t.width / 2, ty = t.top + t.height / 2;
    this.parts = keep.map(([x, y], i) => {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * t.width * .34;
      return {
        x0: x, y0: y,
        x1: tx + Math.cos(a) * rr, y1: ty + Math.sin(a) * rr,
        // a control point off to one side turns the straight line into an arc
        cx: (x + tx) / 2 + (Math.random() - .5) * 260,
        cy: (y + ty) / 2 + (Math.random() - .5) * 200,
        d: (i % 11) / 11 * .22,          // staggered departure
        g: glyph(), sw: 0.5 + Math.random() * 0.9,
      };
    });
    this.seeded = true;
    return true;
  }

  setProgress(v) { this.want = clamp(v, 0, 1); }

  _frame(dt) {
    // ease toward the requested progress so a flicked scroll does not strobe
    const k = reduced() ? 1 : 1 - Math.exp(-0.011 * dt);
    this.p += (this.want - this.p) * k;
    // Once the characters have landed, or returned home, there is nothing left to draw.
    // Without this the canvas repainted hundreds of fully transparent glyphs every frame
    // for the whole of the rest of the page.
    const settled = (this.p < .002 && this.want === 0) || (this.p > .999 && this.want === 1);
    if (settled) {
      if (this._cleared) return;
      this.ctx.clearRect(0, 0, this.w, this.h); this._cleared = true;
      this.onProgress(this.p); return;
    }
    this._cleared = false;
    if (!this.seeded && !this._seed()) return;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.font = "700 11px 'SF Mono',ui-monospace,Menlo,monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";

    for (const q of this.parts) {
      // each particle runs its own window of the global progress
      const u = clamp((this.p - q.d) / (1 - q.d), 0, 1);
      if (u <= 0) continue;
      const e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const m = 1 - e;
      // quadratic bezier: portrait -> control -> bubble
      const x = m * m * q.x0 + 2 * m * e * q.cx + e * e * q.x1;
      const y = m * m * q.y0 + 2 * m * e * q.cy + e * e * q.y1;
      // brightest in flight, fading as they land so the Mii can take over
      const a = e < .12 ? e / .12 : e > .86 ? (1 - e) / .14 : 1;
      ctx.globalAlpha = clamp(a, 0, 1) * .95;
      ctx.fillStyle = e > .55 ? C.pink : e > .25 ? C.pinkDim : C.pinkLo;
      if (Math.random() < .04) q.g = glyph();
      ctx.fillText(q.g, x, y);
    }
    ctx.globalAlpha = 1;
    this.onProgress(this.p);
  }

  destroy() { this.stop?.(); }
}
