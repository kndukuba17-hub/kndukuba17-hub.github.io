/* The pinned About narrative.
 *
 * The character holds still in a sticky frame while the page scrolls past him; the beat
 * is chosen from how far through the stage you are. Each beat gets its own band of
 * scroll rather than changing on every pixel, so a line stays put long enough to read.
 *
 * Every word here is Kaycee's own, lifted from the About copy below - this retells it,
 * it does not invent a second version of him.
 */
import { clamp, reduced } from "./tokens.js";

export const BEATS = [
  { t: `Hey — I'm Kaycee.<span class="small">02 / About</span>`,                       s: "attentive" },
  { t: `Psychology taught me <b>why</b> people decide.`,                                s: "talking" },
  { t: `Data science lets me <b>predict</b> what they'll do next — and turn it into a decision.`, s: "talking" },
  { t: `I build end-to-end on <b>real, messy public data</b>. Not synthetic demos.`,     s: "pointing" },
  { t: `Honest metrics. I report the limitation, not just the headline number.`,         s: "attentive" },
  { t: `And interpretability — <b>the why</b>, not a black box.`,                        s: "talking" },
  { t: `Every model ends in an action someone can actually take.`,                       s: "excited" },
  { t: `Right now I'm an <b>AI &amp; Data Scientist at Yves OS</b>, applying machine learning and LLMs to product analytics.`, s: "talking" },
  { t: `That's me. Keep scrolling for the detail — or just say hello.`,                  s: "celebrating" },
];

export class AboutStory {
  constructor({ stage, bubble, dots, mii, onBeat }) {
    this.stage = stage; this.bubble = bubble; this.mii = mii;
    this.onBeat = onBeat || (() => {});
    this.i = -1;
    this.p = this.bubble.querySelector("p");
    if (dots) {
      dots.innerHTML = BEATS.map(() => "<i></i>").join("");
      this.dots = [...dots.children];
    }
    // the stage needs room for every beat to get its own scroll band
    stage.style.height = `${BEATS.length * 62 + 40}svh`;
  }

  /* progress through the stage, 0 before it, 1 after */
  progress() {
    const r = this.stage.getBoundingClientRect();
    const travel = Math.max(1, r.height - innerHeight);
    return clamp(-r.top / travel, 0, 1);
  }

  update() {
    const r = this.stage.getBoundingClientRect();
    const onScreen = r.top < innerHeight && r.bottom > 0;
    if (!onScreen) { this.set(-1); return false; }
    // a small dead band at each end so the first and last beats hold while the sticky
    // frame is still settling into and out of place
    const p = clamp((this.progress() - .04) / .9, 0, 1);
    this.set(Math.min(BEATS.length - 1, Math.floor(p * BEATS.length)));
    return true;
  }

  set(i) {
    if (i === this.i) return;
    const first = this.i === -1;
    this.i = i;
    if (i < 0) { this.bubble.classList.remove("in"); this.onBeat(-1); return; }

    const b = BEATS[i];
    const swap = () => {
      this.p.innerHTML = b.t;
      this.bubble.classList.add("in");
      this.mii?.set(b.s, b.s === "talking" ? 2200 : 1800);
    };
    if (first || reduced()) swap();
    else {
      // drop the old line out before the new one arrives, so they never cross-fade
      this.bubble.classList.remove("in");
      clearTimeout(this._t);
      this._t = setTimeout(swap, 190);
    }
    this.dots?.forEach((d, k) => d.classList.toggle("on", k === i));
    this.onBeat(i);
  }
}
