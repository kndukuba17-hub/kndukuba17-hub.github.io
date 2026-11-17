/* Wires the Portfolio 2.0 layers onto the existing page.
 *
 * Deliberately additive: the original site still renders and works if this module fails
 * to load or the browser cannot run it. Everything here is enhancement.
 */
import { tick, clamp, reduced, coarse } from "./tokens.js?v=202611171248";
import { PixelField } from "./pixel-field.js?v=202611171248";
import { Mii } from "./mii.js?v=202611171248";

const $ = id => document.getElementById(id);

/* ---------------------------------------------------------------- edge field ---- */
let field = null;
try {
  field = new PixelField($("field"), { maxDepth: 9 });
} catch (e) { console.warn("pixel field unavailable", e); $("field")?.remove(); }

/* ----------------------------------------------------------------- character ---- */
const guide = $("guide"), btn = $("guideBtn"), say = $("guideSay"), cv = $("miiCv");
let mii = null;

function sizeMii() {
  if (!mii) return;
  const px = btn.clientWidth || 92;
  mii.resize(px);
}

if (guide && cv) {
  mii = new Mii(cv, { crop: "bust", sleepAfter: 24000 });
  guide.hidden = false;
  sizeMii();
  addEventListener("resize", sizeMii, { passive: true });
  // the canvas only reports a size once layout has run
  requestAnimationFrame(sizeMii);
  setTimeout(sizeMii, 400);
}

/* speech bubbles -------------------------------------------------------------- */
let sayTimer = 0;
function speak(text, ms = 4200) {
  if (!say) return;
  say.innerHTML = text;
  say.hidden = false;
  requestAnimationFrame(() => say.classList.add("in"));
  mii?.set("talking", Math.min(ms, 2600));
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => {
    say.classList.remove("in");
    setTimeout(() => { say.hidden = true; }, 420);
  }, ms);
}

/* pointer tracking: the eyes follow, the body does not chase ------------------- */
if (mii && !coarse()) {
  addEventListener("pointermove", e => {
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    mii.lookAt(clamp((e.clientX - cx) / 420, -1, 1), clamp((e.clientY - cy) / 420, -1, 1));
  }, { passive: true });
}

btn?.addEventListener("click", () => {
  mii?.poke();
  const lines = [
    "That tickles.",
    "Scroll on — the work's below.",
    "I'm the tour guide. Badly paid, very committed.",
    "Still here? Good.",
  ];
  speak(lines[Math.floor(Math.random() * lines.length)], 3000);
});

/* ------------------------------------------------- section-aware behaviour ---- */
const SECTION_LINES = {
  work:    ["Six projects, all on real data.<br>Have a look.", "excited"],
  about:   ["This bit's about me, if you're curious.", "attentive"],
  contact: ["You made it to the end. Say hello?", "celebrating"],
};
let current = "";
const sections = ["work", "about", "contact"].map(id => $(id)).filter(Boolean);

if (sections.length) {
  const io = new IntersectionObserver(entries => {
    for (const en of entries) {
      if (!en.isIntersecting || en.intersectionRatio < .35) continue;
      const id = en.target.id;
      if (id === current) continue;
      current = id;
      field?.burst(14);
      guide?.classList.toggle("is-big", id === "about");
      requestAnimationFrame(sizeMii);
      const line = SECTION_LINES[id];
      if (line) { speak(line[0], 4200); setTimeout(() => mii?.set(line[1], 2200), 500); }
    }
  }, { threshold: [.35, .6] });
  sections.forEach(s => io.observe(s));
}

/* "Get in touch" taken straight from the nav: greet them rather than ignore it --- */
document.querySelectorAll('a[href="#contact"]').forEach(a => {
  a.addEventListener("click", () => {
    if (current === "contact") return;
    setTimeout(() => speak("Straight to business? <b>Respect.</b><br>Email's right there.", 5200), 700);
  });
});

/* -------------------------------------------------- scroll → field progress ---- */
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const p = clamp(scrollY / max, 0, 1);
    field?.setProgress(p);
    // calm the edges down while reading the long project panels
    field?.setIntensity(p > .12 && p < .78 ? .55 : 1);
    ticking = false;
  });
}
addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* reduced motion: keep the character, drop the ambient movement ---------------- */
if (reduced()) field?.setIntensity(.25);

/* expose for testing */
window.__p2 = { field, mii, speak };
