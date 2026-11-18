/* The character.
 *
 * One <canvas>. The body comes from a luminance map derived from Kaycee's real Mii
 * (assets/mii/mii-map.png), sampled into a pixel grid and drawn as pink/charcoal cells so
 * it speaks the same visual language as the binary hero portrait. Eyes and mouth are
 * drawn over the measured feature boxes, which is what makes expressions possible from a
 * single still image - no sprite sheet, no generated frames that could drift off-model.
 */
import { C, tick, lerp, clamp, approach, reduced } from "./tokens.js?v=20261118153621";

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
      // The map and its geometry are plain assets, so the module's own ?v= does not reach
      // them - carry it across by hand or an edited face keeps serving from cache.
      const v = (import.meta.url.split("?v=")[1] || "").split("&")[0];
      const bust = u => v ? u + (u.includes("?") ? "&" : "?") + "v=" + v : u;
      this.geo = await (await fetch(bust(geoUrl))).json();
      const img = new Image();
      img.decoding = "async";
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = bust(this.geo.src); });
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

    /* Masking features one box at a time left remnants of the originals - stray brow
       ends, the nose shadow, hair fringe - which read as a second face on the forehead.
       Blank the whole face oval instead and draw every feature ourselves. FACE is in
       crop space: the eyes measure to y .40-.47 and the mouth to y .60, so this covers
       brow line to chin. */
    const FACE = { cx: .500, cy: .487, rx: .232, ry: .268 };
    this.face = FACE;
    const inFace = (u, v) => {
      const nx = (u - FACE.cx) / FACE.rx, ny = (v - FACE.cy) / FACE.ry;
      return nx * nx + ny * ny <= 1;
    };
    const cells = [], skin = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      if (d[i + 3] < 70) continue;                       // outside the silhouette
      const u = (x + .5) / cols, v = (y + .5) / rows, t = d[i] / 255;
      // the photographed brows are heavy and angled, which reads as cross; mask them out
      // and draw softer raised arcs instead
      const f = inFace(u, v) ? 1 : 0;
      cells.push({ x, y, v: t, f });
      // The face tone painted over the feature boxes: the panel under the eyes and above
      // the mouth. Measured at ~0.69 against 0.46 for the cheeks beside the eyes, which
      // reach into the hair, and against a nose sample that catches its shadow.
      // skin tone sampled from the ring just outside the oval, which is still cheek
      if (!f && inFace(u, (v - FACE.cy) * .82 + FACE.cy) && v > FACE.cy) skin.push(t);
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

    this._brows(st);
    this._blush();
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

  /* Everything below draws in crop space (0-1 across the drawn figure) and converts to
     grid cells, so a feature's position is stated once and never drifts from the mask. */
  _cell(u, v) {
    const { ox, oy, cw, drawW, drawH } = this._geom;
    return { gx: Math.round(u * drawW / cw), gy: Math.round(v * drawH / cw), cw, ox, oy };
  }
  _dot(u, v, r, col) {
    const { cw, drawW, drawH, ox, oy } = this._geom;
    const gx = u * drawW / cw, gy = v * drawH / cw, g = Math.max(.6, r * drawH / cw);
    this.ctx.fillStyle = col;
    for (let i = Math.floor(gx - g); i <= Math.ceil(gx + g); i++)
      for (let j = Math.floor(gy - g); j <= Math.ceil(gy + g); j++) {
        const nx = (i + .5 - gx) / g, ny = (j + .5 - gy) / g;
        if (nx * nx + ny * ny > 1) continue;
        this._put(i, j, cw, ox, oy);
      }
  }
  /* an arc: positive bow curves up (a smile, a raised brow), negative curves down */
  _arc(u0, u1, v, bow, col, thick = 1) {
    const { cw, drawW, drawH, ox, oy } = this._geom;
    this.ctx.fillStyle = col;
    const x0 = u0 * drawW / cw, x1 = u1 * drawW / cw, y = v * drawH / cw;
    const n = Math.max(3, Math.round(x1 - x0));
    const amp = bow * drawH / cw;
    for (let i = 0; i <= n; i++) {
      const t = i / n, yy = Math.round(y - Math.sin(t * Math.PI) * amp);
      for (let k = 0; k < thick; k++) this._put(Math.round(x0 + (x1 - x0) * t), yy + k, cw, ox, oy);
    }
  }

  _brows(st) {
    const lift = st.eye === "wide" || st.eye === "happy" ? .020 : 0;
    const v = .340 - lift;                      // higher, so the face opens up
    // shorter and in the softer tone: a full-length bar in the darkest colour reads cross
    this._arc(.345, .440, v, .026, C.pinkLo, 1);
    this._arc(.560, .655, v, .026, C.pinkLo, 1);
  }

  _blush() {
    const ctx = this.ctx;
    ctx.globalAlpha = .40;
    this._dot(.318, .545, .028, C.pink);
    this._dot(.682, .545, .028, C.pink);
    ctx.globalAlpha = 1;
  }

  _eyes(st) {
    const shut = st.eye === "closed" ? 1 : Math.max(this.blink, 0);
    const EY = .446, EX = [.388, .612];
    const dx = this.look.x * .012, dy = this.look.y * .010;

    for (const ex of EX) {
      if (shut > .5) { this._arc(ex - .052, ex + .052, EY + .012, .018, C.char, 1); continue; }
      if (st.eye === "happy") { this._arc(ex - .052, ex + .052, EY + .016, .030, C.char, 1); continue; }
      const r = st.eye === "wide" ? .048 : .041;
      this._dot(ex + dx, EY + dy, r, C.char);
      this._dot(ex + dx - r * .36, EY + dy - r * .38, r * .26, "#fff3f8");   // catchlight
    }
    // a small nose so the gap between eyes and mouth is not empty
    this._dot(.5, .527, .013, C.pinkLo);
  }

  _mouth(st) {
    const ctx = this.ctx;
    const CY = .606, HALF = .092;
    if (st.mouth === "flat")  { this._arc(.455, .545, CY, 0, C.char, 1); return; }
    if (st.mouth === "small") { this._arc(.470, .530, CY, .010, C.char, 1); return; }
    if (st.mouth === "o")     { this._dot(.5, CY, .030, C.char);
                                this._dot(.5, CY + .004, .018, "#5d1030"); return; }

    // open smile: a curved band with a lighter inside and a row of teeth along the top,
    // which is what stops a dark open mouth reading as a gape
    const open = st.mouth === "talk" ? .018 + (Math.sin(this.t / 120) * .5 + .5) * .040
               : st.mouth === "grin" ? .056 : .034;
    const { cw, drawW, drawH, ox, oy } = this._geom;
    const x0 = (.5 - HALF) * drawW / cw, x1 = (.5 + HALF) * drawW / cw;
    const yTop = CY * drawH / cw, bow = .026 * drawH / cw, depth = open * drawH / cw;
    const n = Math.max(5, Math.round(x1 - x0));
    const cols = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, fall = Math.sin(t * Math.PI);
      const top = Math.round(yTop - bow + fall * bow * 2);
      const len = Math.max(1, Math.round(1 + fall * depth));
      cols.push([Math.round(x0 + (x1 - x0) * t), top, len]);
    }
    ctx.fillStyle = C.char;                                   // the mouth opening
    for (const [gx, top, len] of cols) for (let j = 0; j < len; j++) this._put(gx, top + j, cw, ox, oy);
    ctx.fillStyle = "#5d1030";                                // inside, one shade up
    for (const [gx, top, len] of cols) if (len > 2)
      for (let j = 1; j < len - 1; j++) this._put(gx, top + j, cw, ox, oy);
    ctx.fillStyle = "#fff0f6";                                // teeth along the upper lip
    for (const [gx, top, len] of cols) if (len > 1) this._put(gx, top, cw, ox, oy);
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
