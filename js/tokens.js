/* Shared design + motion tokens. Everything that more than one module needs to agree
   on lives here, so timing and colour stay consistent across the site. */
export const C = {
  ink:    "#f3f4f6",
  bg:     "#07070a",
  pink:   "#ff2d8f",
  pinkDim:"#d42472",
  pinkLo: "#8e1b4d",
  char:   "#4a2238",   /* lifted: on a near-black page the dark end has to stay readable */
  muted:  "#8b8b96",
};

export const T = {
  fast: 180, base: 420, slow: 900, scene: 1400,
  ease:    "cubic-bezier(.22,.61,.36,1)",
  easeOut: "cubic-bezier(.16,1,.3,1)",
  easeIO:  "cubic-bezier(.65,0,.35,1)",
};

export const BP = { sm: 560, md: 860, lg: 1200 };

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const coarse  = () => matchMedia("(pointer:coarse)").matches;

/* One shared ticker. Every animated module registers here rather than starting its own
   rAF loop, so we never have six loops fighting for frames. */
const subs = new Set();
let raf = 0, last = 0, running = false;
function frame(t) {
  const dt = Math.min(64, t - last); last = t;
  for (const fn of subs) { try { fn(dt, t); } catch (e) { subs.delete(fn); console.error(e); } }
  raf = subs.size ? requestAnimationFrame(frame) : (running = false, 0);
}
export function tick(fn) {
  subs.add(fn);
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  return () => subs.delete(fn);
}
/* Pause everything when the tab is hidden - no point burning battery on an unseen canvas. */
document.addEventListener("visibilitychange", () => {
  if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; running = false; }
  else if (!document.hidden && subs.size && !running) {
    running = true; last = performance.now(); raf = requestAnimationFrame(frame);
  }
});

export const lerp  = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const ease  = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
/* frame-rate independent smoothing */
export const approach = (cur, target, dt, rate = .012) => lerp(cur, target, 1 - Math.exp(-rate * dt));
