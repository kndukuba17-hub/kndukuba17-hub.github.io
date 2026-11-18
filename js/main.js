/* Wires the Portfolio 2.0 layers onto the existing page.
 *
 * Deliberately additive: the original site still renders and works if this module fails
 * to load or the browser cannot run it. Everything here is enhancement.
 */
import { tick, clamp, reduced, coarse } from "./tokens.js?v=20261118193802";
import { PixelField } from "./pixel-field.js?v=20261118193802";
import { Mii } from "./mii.js?v=20261118193802";
import { Morph } from "./morph.js?v=20261118193802";
import { Spotlight } from "./spotlight.js?v=20261118193802";
import { Gallery } from "./gallery.js?v=20261118193802";
import { AboutStory } from "./about.js?v=20261118193802";

const $ = id => document.getElementById(id);

// declared up here because the bootstrap onScroll() below runs before the Featured
// Work setup, and updateWall() reads `spot` - a later `let` would be in its TDZ
let spot = null, gallery = null;

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
  guide.classList.add("is-forming");   // invisible until the portrait hands it over
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
  work:    ["Here's a closer look at some selected work.<br>Click a card to go deeper.", "pointing"],
  skills:  ["And this is what I build with.", "attentive"],
  contact: ["You made it to the end. Say hello?", "celebrating"],
};
let current = "";
const sections = ["work", "skills", "contact"].map(id => $(id)).filter(Boolean);

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

/* ------------------------------------------- hero portrait → character bubble ---- */
const heroEl = $("top"), binEl = $("bin"), morphCv = $("morph");
let morph = null;
if (heroEl && binEl && morphCv && btn) {
  morph = new Morph({
    canvas: morphCv, source: binEl,
    // land on whichever character is on screen: the big About one once its stage is up,
    // otherwise the floating guide
    target: () => {
      const ab = $("abMii"), st = $("abstage");
      if (ab && st) {
        const r = st.getBoundingClientRect();
        if (r.top < innerHeight * .75 && r.bottom > 0) return ab;
      }
      return btn;
    },
    onProgress: p => {
      // The portrait comes apart as its characters leave, and the hero type lifts with
      // it, so the handover is one continuous movement rather than a copy flying off an
      // intact picture.
      window.__heroDissolve = p;
      heroEl.style.setProperty("--gone", p.toFixed(3));
      // the character only becomes solid once the characters have arrived
      guide.style.setProperty("--form", p.toFixed(3));
      guide.classList.toggle("is-forming", p < .98);
      if (p > .9 && !guide.dataset.arrived) {
        guide.dataset.arrived = "1";
        mii?.set("waking", 900);
        field?.burst(12);
      } else if (p < .4) delete guide.dataset.arrived;
    },
  });
}

/* -------------------------------------------------- scroll → field progress ---- */
let ticking = false;
function onScroll() {
  // Also driven from the ticker. Scroll covers a backgrounded tab (where the ticker is
  // deliberately paused); the ticker covers programmatic scrolls and resize. Writing the
  // same value twice costs nothing.
  updateWall();
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const p = clamp(scrollY / max, 0, 1);
    field?.setProgress(p);
    // calm the edges down while reading the long project panels
    field?.setIntensity(p > .12 && p < .78 ? .55 : 1);

    // the handover runs across the back half of the hero
    if (morph && heroEl) {
      const h = heroEl.getBoundingClientRect();
      const gone = clamp((-h.top) / Math.max(1, h.height * .62), 0, 1);
      morph.setProgress(gone);
    }
    ticking = false;
  });
  // belt and braces: if that frame never runs, do not stay latched for ever
  setTimeout(() => { ticking = false; }, 400);
}
addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* reduced motion: keep the character, drop the ambient movement ---------------- */
if (reduced()) field?.setIntensity(.25);

/* ------------------------------------------------- featured work: lit stage ---- */
if ($("litbg")) {
  try { spot = new Spotlight($("litbg")); }
  catch (e) { console.warn("spotlight unavailable", e); $("litbg")?.remove(); }
}
if (spot) tick(() => updateWall());

/* How strongly the wall shows, per section: the whole point of Featured Work, a quiet
   texture behind About and Contact, and absent on the hero where the portrait is the
   subject. Whichever section holds the middle of the viewport wins - an
   IntersectionObserver picked whichever entry happened to be in the callback batch, so
   the hero leaving could set the strength even once Featured Work filled the screen. */
const WALL = { top: 0, about: .42, work: 1, skills: .5, contact: .6 };
/* Driven from the shared ticker rather than the scroll event. Four getBoundingClientRect
   calls a frame is nothing, and it removes every question about when scroll fires, when
   a programmatic jump settles, and whether an rAF guard is still latched. */
const wallSections = Object.keys(WALL).map(id => [id, $(id)]).filter(([, el]) => el);
function updateWall() {
  if (!spot) return;
  const mid = innerHeight / 2;
  for (const [id, el] of wallSections) {
    const r = el.getBoundingClientRect();
    if (r.top <= mid && r.bottom >= mid) {
      // written every time rather than deduped against a remembered section: the guard
      // held a stale value and left the strength a section behind the scroll
      $("litbg").style.opacity = String(WALL[id]);
      return;
    }
  }
}
if ($("deck")) {
  gallery = new Gallery({
    deck: $("deck"), prev: $("deckPrev"), next: $("deckNext"), hint: $("deckHint"),
    panelsHost: $("panels"), overlay: $("pdet"),
  });
  // the character points toward whichever card has focus
  gallery.onChange = i => {
    if (!mii) return;
    const mid = (gallery.cards.length - 1) / 2;
    mii.pointAt(clamp((i - mid) / mid, -1, 1));
  };
  $("pdetClose")?.addEventListener("click", () => gallery.close());
  $("pdet")?.addEventListener("click", e => { if (e.target === $("pdet")) gallery.close(); });
  addEventListener("keydown", e => {
    if (e.key === "Escape" && $("pdet").classList.contains("open")) gallery.close();
  });
}

/* ----------------------------------------------- about: the pinned narrative ---- */
let story = null, abMii = null;
const abStage = $("abstage");
if (abStage && $("abMii")) {
  abMii = new Mii($("abMii"), { crop: "bust", sleepAfter: 9e9 });  // he is on duty here
  const sizeAb = () => {
    const px = Math.round(Math.min(innerWidth * .62, innerHeight * .38, 420));
    abMii.resize(Math.max(170, px));
  };
  sizeAb();
  addEventListener("resize", sizeAb, { passive: true });
  requestAnimationFrame(sizeAb);
  setTimeout(sizeAb, 400);

  story = new AboutStory({
    stage: abStage, bubble: $("abBubble"), dots: $("abDots"), mii: abMii, media: $("abMedia"),
    // one character at a time: the floating guide stands down while the big one talks
    onBeat: i => guide?.classList.toggle("is-hidden", i >= 0),
  });
  tick(() => story.update());
}

/* --------------------------------------------------------------- capabilities ---- */
const tkGrid = $("tkgrid");
if (tkGrid) {
  const TOOLS = ["Python","pandas","NumPy","scikit-learn","XGBoost","SHAP","PyTorch","TensorFlow",
    "SQL","PostgreSQL","BigQuery","Snowflake","dbt","LangChain","FAISS","Transformers",
    "Docker","AWS","GCP","MLflow","GitHub Actions","Git","Matplotlib","Seaborn","Streamlit","R"];
  tkGrid.innerHTML = TOOLS.map(t => `<span>${t}</span>`).join("");
  const chips = [...tkGrid.children];
  const io = new IntersectionObserver(es => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      // light them in sequence rather than all at once - it reads as the set loading
      chips.forEach((c, i) => setTimeout(() => c.classList.add("lit"), reduced() ? 0 : i * 45));
    }
  }, { threshold: .2 });
  io.observe(tkGrid);
}

const capBars = [...document.querySelectorAll(".capbar")];
if (capBars.length) {
  const io2 = new IntersectionObserver(es => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      io2.unobserve(e.target);
      const i = e.target.querySelector("i");
      if (i) i.style.width = e.target.dataset.fill + "%";
    }
  }, { threshold: .5 });
  capBars.forEach(b => io2.observe(b));
}

/* expose for testing */
window.__p2 = { field, mii, speak, morph, spot, gallery, story, abMii };
