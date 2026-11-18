/* The pinned About narrative.
 *
 * The character holds still in a sticky frame while the page scrolls past him; the beat
 * is chosen from how far through the stage you are. Each beat gets its own band of
 * scroll rather than changing on every pixel, so a line stays put long enough to read.
 *
 * Every word here is Kaycee's own, lifted from the About copy below - this retells it,
 * it does not invent a second version of him.
 */
import { clamp, reduced } from "./tokens.js?v=20261118193007";

export const BEATS = [
  { t: `Hi, I&rsquo;m Kaycee!`, s: "excited" },
  { t: `A curious mind, a creative thinker and someone who&rsquo;s <b>always building something</b>.`, s: "attentive" },
  { t: `Psychology taught me to understand the <b>why</b> behind human behaviour and decision-making.`, s: "talking" },
  { t: `Data Science took that further &mdash; teaching me how to uncover patterns, extract meaning from
         complex datasets and use those insights to <b>understand what happens next</b>.`, s: "talking" },
  { t: `I&rsquo;m driven by <b>possibility</b>.`, s: "excited" },
  { t: `I design and build intelligent systems, bringing together AI, data science and software
         engineering to turn complex ideas into <b>practical, end-to-end solutions</b>.`, s: "talking" },
  { t: `From machine learning models and intelligent workflows to AI-powered products, I enjoy working
         across the entire process &mdash; from the initial idea and architecture to development,
         integration and deployment.`, s: "pointing" },
  { t: `Right now I&rsquo;m building <b>Yves</b> &mdash; an AI-powered desktop assistant that brings
         information, tools and workflows into one intelligent workspace.`,
    s: "excited", media: "yves" },
  { t: `For me it&rsquo;s about more than building technology. It&rsquo;s about rethinking what&rsquo;s
         possible with it, solving meaningful problems and creating things that <b>change the way people
         work</b> and interact with the world.`, s: "celebrating" },
];

export class AboutStory {
  constructor({ stage, bubble, dots, mii, media, onBeat }) {
    this.stage = stage; this.bubble = bubble; this.mii = mii; this.media = media;
    this.onBeat = onBeat || (() => {});
    this.i = -1;
    this.p = this.bubble.querySelector("p");
    if (dots) {
      dots.innerHTML = BEATS.map(() => "<i></i>").join("");
      this.dots = [...dots.children];
    }
    // the stage needs room for every beat to get its own scroll band
    // 62svh a beat left long empty stretches between lines
    stage.style.height = `${BEATS.length * 46 + 30}svh`;
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
      this.bubble.classList.toggle("has-media", !!b.media);
      this.bubble.classList.add("in");
      this.mii?.set(b.s, b.s === "talking" ? 2200 : 1800);
      if (this.media) {
        const on = !!b.media;
        this.media.hidden = !on;
        const v = this.media.querySelector("video");
        // only ever playing on its own beat - a looping video off-screen is wasted work
        if (v) { if (on) v.play().catch(() => {}); else { v.pause(); v.currentTime = 0; } }
      }
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
