/* The character.
 *
 * One <canvas>. The body comes from a luminance map derived from Kaycee's real Mii
 * (assets/mii/mii-map.png), sampled into a pixel grid and drawn as pink/charcoal cells so
 * it speaks the same visual language as the binary hero portrait. Eyes and mouth are
 * drawn over the measured feature boxes, which is what makes expressions possible from a
 * single still image - no sprite sheet, no generated frames that could drift off-model.
 */
import { C, tick, lerp, clamp, approach, reduced } from "./tokens.js?v=20261117135457";

const STATES = {
  idle:       { eye: "open",   mouth: "smile",  bob: 1.0, pri: 0 },
  attentive:  { eye: "open",   mouth: "small",  bob: 0.6, pri: 1 },
  talking:    { eye: "open",   mouth: "talk",   bob: 0.8, pri: 2 },
  pointing:   { eye: "open",   mouth: "smile",  bob: 0.7, pri: 2 },
  surprised:  { eye: "wide",   mouth: "o",      bob: 0.3, pri: 3 },
  excited:    { eye: "happy",  mouth: "grin",   bob: 1.8, pri: 3 },
  celebrating:{ eye: "happy",  mouth: "grin",   bob: 2.6, pri: 4 },
  sleeping:   { eye: "closed", mouth: "flat",   bob: 0.35, pri: 1 },
  waking:     { eye: "wide",   mouth: "small",  bob: 1.2, pri: 3 },
};

export class Mii {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.cell = opts.cell || 4;
    // "bust" gives the head the whole frame, which is the only way the eyes and mouth
    // carry an expression at bubble size. "full" shows the whole figure.
    this.crop = opts.crop || "bust";
    this.state = "idle";
    this.until = 0;                 // transient states expire; idle is the floor
    this.look = { x: 0, y: 0 };     // where the eyes are pointing, -1..1
    this.target = { x: 0, y: 0 };
    this.t = 0;
    this.blink = 0;                 // 0 open, 1 shut
    this.nextBlink = 1400 + Math.random() * 2600;
    this.lastPoke = performance.now();
    this.sleepAfter = opts.sleepAfter || 22000;
    this.scale = 1;
    this.targetScale = 1;
    this.ready = false;
    this.point = 0;
    this.grid = null;
    this.onState = opts.onState || (() => {});
    this._load(opts.geo || "assets/mii/mii.json");
  }

  async _load(geoUrl) {
    try {
      this.geo = await (await fetch(geoUrl)).json();
      const img = new Image();
      img.decoding = "async";
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = this.geo.src; });
      this.img = img;
      this._sample();
      this.ready = true;
      this.cv.classList.add("is-ready");
      this.stop = tick((dt, t) => this._frame(dt, t));
    } catch (e) {
      // the character is an enhancement; the page must not depend on it
      console.warn("Mii asset unavailable", e);
      this.cv.setAttribute("data-failed", "1");
    }
  }

  /* Read the luminance map once into a grid of cells, and mark the cells that fall
     inside the measured eye and mouth boxes so the body pass can skip them. Drawing the
     features as grid cells - rather than as rectangles on top - is what keeps the whole
     character on one pixel grid. Re-run only on resize. */
  _sample() {
    const g = this.geo, cell = this.cell;
    // the window of the source we actually draw
    const win = this.crop === "full" ? [0, 0, 1, 1] : [0.03, g.headTop, 0.97, 0.60];
    const wFrac = win[2] - win[0], hFrac = win[3] - win[1];
    const aspect = (g.w * wFrac) / (g.h * hFrac);
    // density is set in CSS pixels, not device pixels, or the grid doubles on retina and
    // the character stops reading as pixel art. Size whichever axis is longer.
    const long = Math.max(18, Math.round((this.px || 180) / cell));
    const rows = aspect >= 1 ? Math.round(long / aspect) : long;
    const cols = aspect >= 1 ? long : Math.round(long * aspect);
    const off = document.createElement("canvas");
    off.width = cols; off.height = rows;
    const o = off.getContext("2d", { willReadFrequently: true });
    o.drawImage(this.img, win[0] * g.w, win[1] * g.h, wFrac * g.w, hFrac * g.h, 0, 0, cols, rows);
    this.win = win;
    const d = o.getImageData(0, 0, cols, rows).data;

    const pad = 0.012;
    // re-express the measured boxes inside the crop window
    const rb = b => [(b[0] - win[0]) / wFrac, (b[1] - win[1]) / hFrac,
                     (b[2] - win[0]) / wFrac, (b[3] - win[1]) / hFrac];
    const EL = rb(g.eyeL), ER = rb(g.eyeR), MO = rb(g.mouth);
    this.box = { eyeL: EL, eyeR: ER, mouth: MO };
    const inBox = (u, v, b) => u >= b[0] - pad && u <= b[2] + pad && v >= b[1] - pad && v <= b[3] + pad;
    const cells = [], skin = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      if (d[i + 3] < 70) continue;                       // outside the silhouette
      const u = (x + .5) / cols, v = (y + .5) / rows, t = d[i] / 255;
      const f = inBox(u, v, EL) ? 1 : inBox(u, v, ER) ? 2 : inBox(u, v, MO) ? 3 : 0;
      cells.push({ x, y, v: t, f });
      // The face tone painted over the feature boxes: the panel under the eyes and above
      // the mouth. Measured at ~0.69 against 0.46 for the cheeks beside the eyes, which
      // reach into the hair, and against a nose sample that catches its shadow.
      if (!f && u > EL[0] && u < ER[2] && v > EL[3] + .01 && v < MO[1] - .01) skin.push(t);
    }
    skin.sort((a, b) => a - b);
    this.grid = { cols, rows, cells, cell,
                  skin: skin.length ? skin[skin.length >> 1] : .69 };
  }

  resize(px) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.cv.width = px * dpr; this.cv.height = px * dpr;
    this.cv.style.width = this.cv.style.height = px + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.px = px;
    // cells are sized against the long axis so the grid density is stable across sizes
    // small bubbles need a denser grid or the face loses its expression
    this.cell = px < 120 ? 2.1 : px < 200 ? 2.7 : px < 300 ? 3.4 : 4.2;
    if (this.img) this._sample();
  }

  /* --- public API ------------------------------------------------------- */

  set(state, ms) {
    const next = STATES[state]; if (!next) return;
    const cur = STATES[this.state];
    const now = performance.now();
    // a lower-priority request cannot interrupt a transient higher-priority one
    if (now < this.until && next.pri < cur.pri) return;
    this.state = state;
    this.until = ms ? now + ms : 0;
    this.onState(state);
  }
  poke() {
    this.lastPoke = performance.now();
    if (this.state === "sleeping") { this.set("waking", 1100); return; }
    this.set(Math.random() < .25 ? "surprised" : "excited", 900);
  }
  lookAt(nx, ny) { this.target.x = clamp(nx, -1, 1); this.target.y = clamp(ny, -1, 1); this.lastPoke = performance.now(); }
  setScale(s) { this.targetScale = s; }
  pointAt(dir) { this.point = clamp(dir, -1, 1); this.set("pointing", 1500); }

  /* --- render ----------------------------------------------------------- */

  _frame(dt, now) {
    if (!this.ready) return;
    this.t += dt;

    if (this.until && now > this.until) { this.state = "idle"; this.until = 0; this.onState("idle"); }
    if (now - this.lastPoke > this.sleepAfter && this.state === "idle") this.set("sleeping");

    const st = STATES[this.state];
    this.look.x = approach(this.look.x, this.state === "sleeping" ? 0 : this.target.x, dt, .006);
    this.look.y = approach(this.look.y, this.state === "sleeping" ? .25 : this.target.y, dt, .006);
    this.scale  = approach(this.scale, this.targetScale, dt, .005);
    this.point  = approach(this.point, 0, dt, .002);

    if (st.eye === "open" || st.eye === "wide") {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) { this.blink = 1; this.nextBlink = 1800 + Math.random() * 3800; }
    }
    this.blink = Math.max(0, this.blink - dt / 110);

    this._draw(st);
  }

  _tone(v) {
    return v > .78 ? C.pink : v > .56 ? C.pinkDim : v > .34 ? C.pinkLo : C.char;
  }

  _draw(st) {
    const ctx = this.ctx, px = this.px, g = this.grid;
    ctx.clearRect(0, 0, px, px);
    if (!g) return;

    const bob  = reduced() ? 0 : Math.sin(this.t / 620) * 1.6 * st.bob;
    const sway = reduced() ? 0 : Math.sin(this.t / 950) * 1.1 * st.bob;
    // the figure is portrait, so fit on the long axis or it overflows a square canvas
    const cw = px / Math.max(g.cols, g.rows) * this.scale;
    const drawW = g.cols * cw, drawH = g.rows * cw;
    const ox = (px - drawW) / 2 + sway + this.look.x * 2.5 + this.point * 6;
    const oy = (px - drawH) / 2 + bob;
    const s = cw * .92;
    this._geom = { ox, oy, cw, drawW, drawH };

    // body, plus the face tone painted across the feature boxes
    for (const c of g.cells) {
      const v = c.f ? g.skin : c.v;
      if (v < .10) continue;
      ctx.fillStyle = this._tone(v);
      ctx.fillRect(ox + c.x * cw, oy + c.y * cw, s, s);
    }

    this._eyes(st);
    this._mouth(st);
    if (this.state === "sleeping") this._zzz();
  }

  /* Feature drawing works in grid space: pick the cells the feature covers, then fill
     those cells. Everything stays snapped to the same lattice as the body. */
  _cellsOf(box) {
    const { ox, oy, cw, drawW, drawH } = this._geom;
    const x0 = Math.round(box[0] * drawW / cw), x1 = Math.round(box[2] * drawW / cw);
    const y0 = Math.round(box[1] * drawH / cw), y1 = Math.round(box[3] * drawH / cw);
    return { x0, x1, y0, y1, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), ox, oy, cw };
  }
  _put(gx, gy, cw, ox, oy) { this.ctx.fillRect(ox + gx * cw, oy + gy * cw, cw * .92, cw * .92); }

  _eyes(st) {
    const ctx = this.ctx;
    const shut = st.eye === "closed" ? 1 : Math.max(this.blink, 0);
    for (const b of [this.box.eyeL, this.box.eyeR]) {
      const e = this._cellsOf(b);
      ctx.fillStyle = C.char;
      const dx = Math.round(this.look.x * Math.max(1, e.w * .22));
      const dy = Math.round(this.look.y * Math.max(1, e.h * .3));

      if (shut > .5) {                                   // closed: one flat row
        const y = e.y0 + Math.round(e.h * .55);
        for (let i = 0; i < e.w; i++) this._put(e.x0 + i, y, e.cw, e.ox, e.oy);
        continue;
      }
      if (st.eye === "happy") {                          // ^ ^
        for (let i = 0; i < e.w; i++) {
          const u = i / (e.w - 1 || 1);
          const y = e.y0 + Math.round(e.h * (.75 - Math.sin(u * Math.PI) * .45));
          this._put(e.x0 + i, y, e.cw, e.ox, e.oy);
        }
        continue;
      }
      const grow = st.eye === "wide" ? 1.25 : 1;
      const hh = Math.max(1, Math.round(e.h * grow * (1 - shut * .75)));
      const ww = Math.max(1, Math.round(e.w * grow));
      const sx = e.x0 - ((ww - e.w) >> 1) + dx;
      const sy = e.y0 + ((e.h - hh) >> 1) + dy;
      for (let i = 0; i < ww; i++) for (let j = 0; j < hh; j++) {
        const rx = (i + .5) / ww - .5, ry = (j + .5) / hh - .5;
        if (rx * rx * 4 + ry * ry * 4 > 1.08) continue;  // oval mask
        this._put(sx + i, sy + j, e.cw, e.ox, e.oy);
      }
    }
  }

  _mouth(st) {
    const ctx = this.ctx, m = this._cellsOf(this.geo.mouth);
    ctx.fillStyle = C.char;
    const midY = m.y0 + Math.round(m.h / 2);

    if (st.mouth === "flat" || st.mouth === "small") {
      const n = Math.max(2, Math.round(m.w * (st.mouth === "flat" ? .5 : .32)));
      const sx = m.x0 + ((m.w - n) >> 1);
      for (let i = 0; i < n; i++) this._put(sx + i, midY, m.cw, m.ox, m.oy);
      return;
    }
    if (st.mouth === "o") {
      const r = Math.max(1, Math.round(m.h * .75));
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (i * i + j * j > r * r + r) continue;
        this._put(m.x0 + (m.w >> 1) + i, midY + j, m.cw, m.ox, m.oy);
      }
      return;
    }
    // smile / grin / talk: a curve of columns, opening by state
    const open = st.mouth === "talk" ? (Math.sin(this.t / 115) * .5 + .5) * m.h * 1.5
               : st.mouth === "grin" ? m.h * 1.25 : m.h * .5;
    const teeth = [];
    for (let i = 0; i < m.w; i++) {
      const u = m.w > 1 ? i / (m.w - 1) : .5, dip = Math.sin(u * Math.PI);
      const top = midY + Math.round(dip * m.h * .30) - 1;
      const len = Math.max(1, Math.round(1 + dip * open));
      for (let j = 0; j < len; j++) this._put(m.x0 + i, top + j, m.cw, m.ox, m.oy);
      if (dip > .45 && len > 2) teeth.push([m.x0 + i, top]);
    }
    if (st.mouth === "grin" && teeth.length) {
      ctx.fillStyle = "#f3e2ea";
      for (const [gx, gy] of teeth) this._put(gx, gy, m.cw, m.ox, m.oy);
    }
  }

  _zzz() {
    const { ox, oy, cw, drawW, drawH } = this._geom;
    const ctx = this.ctx;
    ctx.fillStyle = C.pinkDim;
    const bx = ox + drawW * .74, by = oy + drawH * .14;
    for (let k = 0; k < 3; k++) {
      const ph = (this.t / 1000 + k * .33) % 1;
      const a = Math.sin(ph * Math.PI);
      if (a <= .02) continue;
      ctx.globalAlpha = a * .9;
      const s = cw * (1 + k * .45);
      ctx.fillRect(bx + k * cw * 1.9 + ph * cw * 3, by - ph * cw * 10, s, s);
    }
    ctx.globalAlpha = 1;
  }

  destroy() { this.stop?.(); }
}
