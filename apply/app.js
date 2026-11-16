import * as E from "./engine.js";

const $ = id => document.getElementById(id);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const flat = s => String(s ?? "").replace(/\s+/g, " ").trim();

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

// carry contact details over from the previous version rather than make him retype them
function initialSettings() {
  const s = LS.get("kc_settings", null);
  if (s) return { model: E.DEFAULT_MODEL, ...s };
  const old = LS.get("kc_contact", {});
  return { key: "", model: E.DEFAULT_MODEL,
           email: old.email || "", phone: old.phone || "", loc: old.loc || "London, UK" };
}

const S = {
  profile: null,
  settings: initialSettings(),
  job: { text: "", source: "paste", url: "" },
  analysis: null, cv: null, letter: null, qc: null,
  cost: 0, calls: 0, running: false, abort: null,
};

/* --------------------------------------------------------------- profile io ---- */

async function loadProfile() {
  const saved = LS.get("kc_profile_v2", null);
  if (saved && saved.schema_version === 2) { S.profile = saved; return; }
  const r = await fetch("profile.json");
  S.profile = await r.json();
  LS.set("kc_profile_v2", S.profile);
}
const saveProfile = () => {
  if (!LS.set("kc_profile_v2", S.profile)) toast("Could not save - browser storage is full or blocked.");
};
const saveSettings = () => LS.set("kc_settings", S.settings);

/* Contact details are per-device and never leave localStorage. */
const contactLine = () => [S.settings.loc, S.settings.email, S.settings.phone].filter(Boolean).join("  |  ");

/* ------------------------------------------------------------------- toasts ---- */

let toastTimer;
function toast(msg, kind) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show" + (kind ? " " + kind : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 4200);
}

/* --------------------------------------------------------------- navigation ---- */

const STEPS = ["profile", "job", "strategy", "review"];
let step = "profile";
function go(name) {
  step = name;
  STEPS.forEach(s => $("step-" + s).hidden = s !== name);
  document.querySelectorAll(".stepper b").forEach(b =>
    b.setAttribute("aria-current", b.dataset.s === name ? "true" : "false"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* --------------------------------------------------------- profile rendering ---- */

const KINDS = { employment: "Employment", freelance: "Freelance", hospitality: "Hospitality",
                retail: "Retail", sales: "Sales", volunteering: "Volunteering" };

function renderProfile() {
  const p = S.profile, host = $("profile-body");
  host.textContent = "";

  const gaps = p.experience.filter(e => e.needs_detail).length;
  const noInterests = !p.interests?.length;
  if (gaps || noInterests) {
    const bits = [];
    if (gaps) bits.push(`${gaps} ${gaps === 1 ? "role has" : "roles have"} no employer or dates yet`);
    if (noInterests) bits.push("no interests saved, and every CV needs that section");
    host.appendChild(el("div", "card warnbox", `<h3>Finish these</h3><p class="meta">${esc(bits.join(". "))}.
      Nothing here is invented for you - blanks stay blank until you fill them.</p>`));
  }

  // interests: required by the brief, and the one thing that must never be guessed
  const ic = el("div", "card");
  ic.innerHTML = `<h3>Hobbies &amp; interests</h3>
    <p class="meta">One per line. These go on every CV, so keep them real and worth a conversation.</p>
    <textarea id="p-interests" class="small" placeholder="Five-a-side football on Sundays&#10;Building small web projects for friends' businesses">${esc((p.interests || []).map(i => i.text).join("\n"))}</textarea>`;
  host.appendChild(ic);
  ic.querySelector("textarea").addEventListener("change", e => {
    p.interests = e.target.value.split("\n").map(s => flat(s)).filter(Boolean).map(t => ({ text: t, tags: [] }));
    saveProfile(); renderProfile();
  });

  // motivations - feeds the cover letter, which is where most of the value is
  const mc = el("div", "card");
  mc.innerHTML = `<h3>What you want</h3>
    <p class="meta">The cover letter leans on this. A sentence each is plenty.</p>
    <label>What I want next</label><input id="m1" value="${esc(p.motivations?.what_i_want || "")}">
    <label>Why I am moving</label><input id="m2" value="${esc(p.motivations?.why_moving || "")}">
    <label>Where I want to get to</label><input id="m3" value="${esc(p.motivations?.aspirations || "")}">`;
  host.appendChild(mc);
  [["m1", "what_i_want"], ["m2", "why_moving"], ["m3", "aspirations"]].forEach(([id, k]) =>
    mc.querySelector("#" + id).addEventListener("change", e => {
      p.motivations = p.motivations || {}; p.motivations[k] = flat(e.target.value); saveProfile();
    }));

  // experience
  const ec = el("div", "card");
  ec.innerHTML = `<h3>Experience <span class="count">${p.experience.length}</span></h3>`;
  p.experience.forEach((e, i) => ec.appendChild(expRow(e, i)));
  const addBtn = el("button", "ghost", "+ Add a role");
  addBtn.onclick = () => {
    p.experience.push({ id: "exp" + (p.experience.length + 1), kind: "employment", role: "", org: "",
      place: "", start: "", end: "", stack: "", bullets: [], needs_detail: true });
    saveProfile(); renderProfile();
  };
  ec.appendChild(addBtn);
  host.appendChild(ec);

  // projects + skills, read-mostly
  const pc = el("div", "card");
  pc.innerHTML = `<h3>Projects <span class="count">${p.projects.length}</span></h3>` +
    p.projects.map(pr => `<div class="row"><b>${esc(pr.name)}</b>
      <span class="pill">${esc(pr.kind)}</span></div>`).join("");
  host.appendChild(pc);

  const sc = el("div", "card");
  sc.innerHTML = `<h3>Skills <span class="count">${p.skills.length}</span></h3>` +
    p.skills.map(s => `<div class="row"><b>${esc(s.label)}</b><div class="meta">${esc(s.text)}</div></div>`).join("");
  host.appendChild(sc);

  const reset = el("button", "ghost danger", "Reset profile to the shipped version");
  reset.onclick = async () => {
    if (!confirm("This replaces your saved profile, including anything you have edited. Continue?")) return;
    localStorage.removeItem("kc_profile_v2"); await loadProfile(); renderProfile(); toast("Profile reset.");
  };
  host.appendChild(reset);
}

function expRow(e, i) {
  const d = el("details", "exp" + (e.needs_detail ? " flag" : ""));
  d.innerHTML = `<summary>${esc(e.role || "Untitled role")}
      <span class="meta">${esc(e.org || "—")}${e.start || e.end ? " · " + esc([e.start, e.end].filter(Boolean).join(" to ")) : ""}</span>
      ${e.needs_detail ? '<span class="pill warn">needs detail</span>' : ""}</summary>
    <label>Job title</label><input data-f="role" value="${esc(e.role)}">
    <label>Employer</label><input data-f="org" value="${esc(e.org)}">
    <label>Location</label><input data-f="place" value="${esc(e.place)}">
    <div class="two"><div><label>From</label><input data-f="start" placeholder="Mar 2022" value="${esc(e.start)}"></div>
      <div><label>To</label><input data-f="end" placeholder="Present" value="${esc(e.end)}"></div></div>
    <label>Type</label><select data-f="kind">${Object.entries(KINDS).map(([k, v]) =>
      `<option value="${k}"${e.kind === k ? " selected" : ""}>${v}</option>`).join("")}</select>
    <label>What you did — one per line</label>
    <textarea data-f="bullets" class="small">${esc(e.bullets.map(b => b.text).join("\n"))}</textarea>
    <button class="ghost danger" data-del="1">Remove this role</button>`;

  d.querySelectorAll("[data-f]").forEach(inp => inp.addEventListener("change", ev => {
    const f = ev.target.dataset.f;
    if (f === "bullets") {
      const lines = ev.target.value.split("\n").map(flat).filter(Boolean);
      e.bullets = lines.map((t, n) => ({ text: t, tags: e.bullets[n]?.tags || [] }));
    } else e[f] = flat(ev.target.value);
    e.needs_detail = !(e.org && !e.org.startsWith("(") && e.start);
    saveProfile(); renderProfile();
  }));
  d.querySelector("[data-del]").onclick = () => {
    if (!confirm(`Remove "${e.role || "this role"}" from your profile?`)) return;
    S.profile.experience.splice(i, 1); saveProfile(); renderProfile();
  };
  return d;
}

/* ------------------------------------------------------------- CV importing ---- */

async function importCvText(text) {
  if (!S.settings.key) { toast("Add your API key in Settings first.", "bad"); return; }
  if (text.trim().length < 200) { toast("That is too short to read as a CV.", "bad"); return; }
  busy(true, "Reading your CV...");
  try {
    const schema = { type: "object", additionalProperties: false,
      required: ["experience", "education", "skills", "interests"],
      properties: {
        experience: { type: "array", items: { type: "object", additionalProperties: false,
          required: ["role", "org", "place", "start", "end", "kind", "bullets"],
          properties: { role: { type: "string" }, org: { type: "string" }, place: { type: "string" },
            start: { type: "string" }, end: { type: "string" },
            kind: { type: "string", enum: Object.keys(KINDS) },
            bullets: { type: "array", items: { type: "string" } } } } },
        education: { type: "array", items: { type: "object", additionalProperties: false,
          required: ["qual", "org", "years", "detail"],
          properties: { qual: { type: "string" }, org: { type: "string" }, years: { type: "string" }, detail: { type: "string" } } } },
        skills: { type: "array", items: { type: "string" } },
        interests: { type: "array", items: { type: "string" } },
      } };
    const { data, usage } = await E.callClaude({
      key: S.settings.key, model: S.settings.model,
      system: [{ type: "text", text: "You extract structured data from CVs. Copy what is written. Never infer a date, employer or qualification that is not on the page. Leave a field as an empty string if the CV does not say." }],
      user: `<cv>\n${text.slice(0, 30000)}\n</cv>\n\nExtract every role, qualification, skill line and interest exactly as written.`,
      schema, maxTokens: 8000, effort: "medium",
    });
    meter(usage);
    const p = S.profile;
    const base = p.experience.length;
    data.experience.forEach((x, n) => p.experience.push({
      id: "imp" + (base + n + 1), kind: x.kind || "employment", role: x.role, org: x.org, place: x.place,
      start: x.start, end: x.end, stack: "", bullets: x.bullets.map(t => ({ text: t, tags: [] })),
      needs_detail: !(x.org && x.start),
    }));
    data.education.forEach((x, n) => p.education.push({ id: "imped" + n, ...x }));
    if (data.skills.length) p.skills.push({ id: "impsk", label: "From your CV", text: data.skills.join(", "), tags: [], always: false, category: "technical" });
    data.interests.forEach(t => (p.interests ||= []).push({ text: t, tags: [] }));
    saveProfile(); renderProfile();
    toast(`Added ${data.experience.length} roles and ${data.education.length} qualifications. Check them.`, "good");
  } catch (err) { toast(err.message, "bad"); }
  finally { busy(false); }
}

async function readFile(file) {
  if (/\.(txt|md)$/i.test(file.name)) return file.text();
  if (/\.pdf$/i.test(file.name)) {
    try {
      const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs";
      const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      let out = "";
      for (let i = 1; i <= doc.numPages; i++)
        out += (await (await doc.getPage(i)).getTextContent()).items.map(t => t.str).join(" ") + "\n";
      return out;
    } catch { throw new Error("Could not read that PDF. Copy the text out and paste it instead."); }
  }
  throw new Error("Upload a .pdf or .txt, or paste the text. Word files are not read here.");
}

/* ------------------------------------------------------------------- the run ---- */

function busy(on, label) {
  S.running = on;
  $("runbar").hidden = !on;
  if (label) $("runlabel").textContent = label;
  document.querySelectorAll("button.go").forEach(b => b.disabled = on);
}
function meter(usage) {
  S.cost += E.costOf(usage, S.settings.model);
  S.calls++;
  $("meter").textContent = `${S.calls} call${S.calls === 1 ? "" : "s"} · about £${(S.cost * 0.79).toFixed(2)}`;
}

async function getJobText() {
  const pasted = $("jd").value.trim();
  const url = $("joburl").value.trim();
  if (url) {
    busy(true, "Fetching that page...");
    const r = await E.fetchJobFromUrl(url);
    busy(false);
    if (!r.ok) {
      // the brief is explicit: never pretend a page was read
      toast(r.why + " Paste the job description instead.", "bad");
      $("jd").focus();
      return null;
    }
    toast(`Read ${r.text.length.toLocaleString()} characters from ${r.host}.`, "good");
    return { text: r.text, source: "url:" + r.host };
  }
  if (pasted.length < 120) { toast("Paste the job description, or a link to it.", "bad"); return null; }
  return { text: pasted, source: "paste" };
}

async function runAnalysis() {
  if (!S.settings.key) { toast("Add your API key in Settings first.", "bad"); openSettings(); return; }
  const job = await getJobText();
  if (!job) return;
  S.job = job;

  const hits = E.scanForInjection(job.text);
  if (hits.length) {
    $("injection").hidden = false;
    $("injection").innerHTML = `<h3>Heads up</h3><p class="meta">This advert contains text that reads like
      an instruction aimed at an AI. It is being treated as data and ignored, but you should know it is there:</p>
      <pre>${esc(hits.join("\n"))}</pre>`;
  } else $("injection").hidden = true;

  S.abort = new AbortController();
  busy(true, "Working out what they actually want...");
  try {
    const ctx = { jobText: job.text, jobSource: job.source,
      call: { key: S.settings.key, model: S.settings.model, system: E.buildSystem(S.profile), signal: S.abort.signal } };
    const { data, usage } = await E.analyseJob(ctx);
    meter(usage);
    if (!data.usable) { toast(data.not_usable_why || "That does not read as a job advert.", "bad"); return; }
    S.analysis = data;
    renderStrategy();
    go("strategy");
  } catch (err) { if (err.name !== "AbortError") toast(err.message, "bad"); }
  finally { busy(false); }
}

async function runGeneration() {
  S.abort = new AbortController();
  const ctx = { jobText: S.job.text, jobSource: S.job.source,
    call: { key: S.settings.key, model: S.settings.model, system: E.buildSystem(S.profile), signal: S.abort.signal } };
  busy(true, "Writing the CV...");
  try {
    let r = await E.writeCV(ctx, S.analysis); meter(r.usage); S.cv = r.data;

    busy(true, "Writing the cover letter...");
    r = await E.writeLetter(ctx, S.analysis, E.cvToText(S.cv)); meter(r.usage); S.letter = r.data;

    busy(true, "Checking it before you see it...");
    r = await E.qualityCheck(ctx, S.analysis, E.cvToText(S.cv), E.letterToText(S.letter));
    meter(r.usage); S.qc = r.data;

    if (S.qc.cv_needs_revision) {
      busy(true, "Fixing the CV...");
      const f = await E.revise(ctx, "cv", S.analysis, E.cvToText(S.cv), S.qc.fix_instructions);
      meter(f.usage); S.cv = f.data;
    }
    if (S.qc.letter_needs_revision) {
      busy(true, "Fixing the letter...");
      const f = await E.revise(ctx, "letter", S.analysis, E.letterToText(S.letter), S.qc.fix_instructions);
      meter(f.usage); S.letter = f.data;
    }
    renderReview();
    go("review");
  } catch (err) { if (err.name !== "AbortError") toast(err.message, "bad"); }
  finally { busy(false); }
}

/* ------------------------------------------------------------------ strategy ---- */

function renderStrategy() {
  const a = S.analysis, h = $("strategy-body");
  const badge = s => `<span class="pill ${s === "strong" ? "good" : s === "gap" ? "warn" : ""}">${s}</span>`;
  h.innerHTML = `
    <div class="card"><h3>The opportunity</h3>
      <div class="row"><b>${esc(a.role)}</b> · ${esc(a.company || "company not named")}
        ${a.location ? " · " + esc(a.location) : ""}</div>
      <div class="row"><span class="pill">${esc(a.seniority)}</span> <span class="pill">${esc(a.register)}</span>
        ${a.sector ? `<span class="pill">${esc(a.sector)}</span>` : ""}</div>
      <p class="meta"><b>What they are really trying to solve:</b> ${esc(a.employer_problem)}</p></div>

    <div class="card"><h3>Your application strategy</h3>
      <p class="lead">${esc(a.strategy.narrative)}</p>
      <div class="row"><b>Lead with</b><ul>${a.strategy.lead_with.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="row"><b>Support with</b><ul>${a.strategy.support_with.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="row"><b>Play down</b><ul>${a.strategy.de_emphasise.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>

    <div class="card"><h3>The five that decide it</h3>
      ${a.top_competencies.map(c => `<div class="row"><b>${esc(c.name)}</b> ${badge(c.strength)}
        <div class="meta">${esc(c.why_it_matters)}</div>
        <div class="meta ev">${c.candidate_evidence.map(e => esc(e)).join(" · ") || "no evidence in your profile"}</div></div>`).join("")}</div>

    ${a.strategy.gaps.length ? `<div class="card"><h3>Gaps, and how to handle them</h3>
      ${a.strategy.gaps.map(g => `<div class="row"><b>${esc(g.gap)}</b>
        <div class="meta">${esc(g.honest_bridge)}</div></div>`).join("")}</div>` : ""}

    <div class="card"><h3>What would make you exceptional here</h3>
      <p class="meta">${esc(a.what_makes_exceptional)}</p></div>`;
}

/* -------------------------------------------------------------------- review ---- */

const REWRITES = {
  cv: [["Rewrite the professional profile", "Rewrite the summary so it is sharper and more specific to this role."],
       ["Make it more concise", "Cut the length by about a fifth. Remove the weakest bullets, keep the evidence."],
       ["Less technical", "Reduce technical detail and jargon. Translate it for a non-technical reader."],
       ["Strengthen the achievements", "Make the bullets more clearly about outcomes, using only facts already present."]],
  letter: [["Make the opening better", "Replace the first paragraph with a more specific and interesting opening."],
       ["More personal", "Make it warmer and more personal. More of the human reasoning, less of the credentials."],
       ["Shorter", "Cut it to around 250 words without losing the argument."],
       ["Less like the CV", "Remove anything that repeats the CV and replace it with motivation and reasoning."]],
};

const header = () => [S.profile.identity.name, contactLine(),
  (S.profile.identity.links || []).join("  |  ")].filter(Boolean).join("\n");

function renderReview() {
  $("cvtext").textContent = header() + "\n\n" + E.cvToText(S.cv);
  $("covtext").textContent = header() + "\n\n" + E.letterToText(S.letter);
  renderChecks();
  ["cv", "letter"].forEach(kind => {
    const host = $("rw-" + kind); host.textContent = "";
    REWRITES[kind].forEach(([label, ask]) => {
      const b = el("button", "ghost", esc(label));
      b.onclick = () => rerun(kind, ask);
      host.appendChild(b);
    });
  });
}

async function rerun(kind, ask) {
  S.abort = new AbortController();
  busy(true, "Rewriting...");
  try {
    const ctx = { jobText: S.job.text, jobSource: S.job.source,
      call: { key: S.settings.key, model: S.settings.model, system: E.buildSystem(S.profile), signal: S.abort.signal } };
    const cur = kind === "cv" ? E.cvToText(S.cv) : E.letterToText(S.letter);
    const r = await E.rewriteSection(ctx, kind, S.analysis, cur, ask);
    meter(r.usage);
    if (kind === "cv") S.cv = r.data; else S.letter = r.data;
    renderReview();
    toast("Done.", "good");
  } catch (err) { if (err.name !== "AbortError") toast(err.message, "bad"); }
  finally { busy(false); }
}

function renderChecks() {
  const q = S.qc, host = $("checks");
  const numFlags = [...E.checkNumbers(E.cvToText(S.cv), S.profile),
                    ...E.checkNumbers(E.letterToText(S.letter), S.profile)];
  const line = c => `<div class="chk ${c.pass ? "ok" : "no"}"><span>${c.pass ? "✓" : "✗"}</span>
      <div><b>${esc(c.check)}</b>${c.note ? `<div class="meta">${esc(c.note)}</div>` : ""}</div></div>`;

  const noInterests = !S.cv.interests || S.cv.interests === "ASK_USER";

  host.innerHTML =
    (noInterests ? `<div class="card warnbox"><h3>No interests on the CV</h3>
      <p class="meta">Your profile has no interests saved, so that section is a placeholder. Add two or three
      in step 1 and rewrite - they were not invented for you.</p></div>` : "")
    + (numFlags.length ? `<div class="card warnbox"><h3>Numbers not found in your profile</h3>
      <p class="meta">These appear in the output but not in your saved profile. Check each one before you send it -
      this check is mechanical, so a reworded figure can show up here even when it is true.</p>
      <div class="chips">${[...new Set(numFlags)].map(n => `<span class="chip no">${esc(n)}</span>`).join("")}</div></div>` : "")
    + (q.fabrication_flags?.length ? `<div class="card warnbox"><h3>Claims the reviewer could not support</h3>
      ${q.fabrication_flags.map(f => `<div class="row"><b>${esc(f.where)}</b>
        <div class="meta">“${esc(f.claim)}” — ${esc(f.why)}</div></div>`).join("")}</div>` : "")
    + `<div class="card"><h3>CV checks</h3>${(q.cv_checks || []).map(line).join("")}</div>
       <div class="card"><h3>Cover letter checks</h3>${(q.letter_checks || []).map(line).join("")}</div>`
    + (S.letter.adds_beyond_cv?.length ? `<div class="card"><h3>What the letter adds that the CV does not</h3>
        <ul>${S.letter.adds_beyond_cv.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "")
    + (S.cv.omitted?.length ? `<div class="card"><h3>Deliberately left out</h3>
        ${S.cv.omitted.map(o => `<div class="row"><b>${esc(o.source_id)}</b>
          <div class="meta">${esc(o.reason)}</div></div>`).join("")}</div>` : "");
}

/* ------------------------------------------------------------------ exports ---- */

const copy = (id, btn) => navigator.clipboard.writeText($(id).textContent).then(() => {
  const o = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = o), 1200);
}, () => toast("Clipboard blocked by the browser.", "bad"));

/* Word opens an HTML document saved as .doc, which keeps the layout without a zip
 * library in the browser. Open it in Word and Save As .docx before uploading anywhere
 * that parses CVs - some ATS parsers dislike HTML-backed .doc files. */
function toDoc(id, filename) {
  const raw = $(id).textContent;
  const lines = raw.split("\n");
  const body = lines.map((l, i) => {
    const t = l.trim();
    if (!t) return "<p style='margin:0;font-size:6pt'>&nbsp;</p>";
    if (i === 0) return `<p style='margin:0 0 2pt;font-size:15pt;font-weight:700'>${esc(t)}</p>`;
    if (/^[A-Z][A-Z &]{3,}$/.test(t))
      return `<p style='margin:11pt 0 3pt;font-size:9pt;font-weight:700;letter-spacing:.8pt;border-bottom:.5pt solid #999'>${esc(t)}</p>`;
    if (t.startsWith("•")) return `<p style='margin:0 0 2pt 12pt;text-indent:-10pt'>${esc(t)}</p>`;
    return `<p style='margin:0 0 3pt'>${esc(t)}</p>`;
  }).join("");
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
    xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>${esc(filename)}</title>
    <style>@page{margin:1.6cm} body{font-family:Calibri,Arial,sans-serif;font-size:10pt;line-height:1.25}</style>
    </head><body>${body}</body></html>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿", html], { type: "application/msword" }));
  a.download = filename + ".doc";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* PDF goes through the browser's own print dialog: "Save as PDF" on desktop,
 * share sheet to Files on iOS. No renderer to ship and the typography is the same. */
function toPdf(id, title) {
  const w = window.open("", "_blank");
  if (!w) { toast("Your browser blocked the print window.", "bad"); return; }
  const lines = $(id).textContent.split("\n");
  const body = lines.map((l, i) => {
    const t = l.trim();
    if (!t) return "<div class='sp'></div>";
    if (i === 0) return `<h1>${esc(t)}</h1>`;
    if (/^[A-Z][A-Z &]{3,}$/.test(t)) return `<h2>${esc(t)}</h2>`;
    if (t.startsWith("•")) return `<p class='b'>${esc(t.slice(1).trim())}</p>`;
    return `<p>${esc(t)}</p>`;
  }).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page{size:A4;margin:16mm}
    body{font:10.5pt/1.42 Calibri,Helvetica,Arial,sans-serif;color:#111;margin:0}
    h1{font-size:17pt;margin:0 0 2pt;letter-spacing:-.3pt}
    h2{font-size:9pt;letter-spacing:1pt;margin:13pt 0 4pt;padding-bottom:2pt;border-bottom:.6pt solid #999;break-after:avoid}
    p{margin:0 0 3pt} p.b{margin:0 0 2pt 11pt;text-indent:-9pt} p.b:before{content:"• "}
    .sp{height:5pt}
  </style></head><body>${body}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}

/* ----------------------------------------------------------------- settings ---- */

function openSettings() {
  const s = S.settings;
  $("s-key").value = s.key || "";
  $("s-email").value = s.email || "";
  $("s-phone").value = s.phone || "";
  $("s-loc").value = s.loc || "London, UK";
  const m = $("s-model");
  m.innerHTML = Object.entries(E.MODELS).map(([id, v]) =>
    `<option value="${id}"${s.model === id ? " selected" : ""}>${v.label}</option>`).join("");
  $("dlg").showModal();
}

/* --------------------------------------------------------------------- init ---- */

async function init() {
  await loadProfile();
  renderProfile();

  $("gear").onclick = openSettings;
  $("s-close").onclick = () => $("dlg").close();
  $("s-save").onclick = () => {
    Object.assign(S.settings, {
      key: $("s-key").value.trim(), model: $("s-model").value,
      email: $("s-email").value.trim(), phone: $("s-phone").value.trim(), loc: $("s-loc").value.trim(),
    });
    saveSettings(); $("dlg").close();
    toast(S.settings.key ? "Saved." : "Saved, but without a key nothing can generate.", S.settings.key ? "good" : "bad");
  };
  $("s-forget").onclick = () => {
    S.settings.key = ""; saveSettings(); $("s-key").value = ""; toast("Key removed from this device.");
  };

  document.querySelectorAll(".stepper b").forEach(b => b.onclick = () => {
    const t = b.dataset.s;
    if (t === "strategy" && !S.analysis) return toast("Analyse a job first.");
    if (t === "review" && !S.cv) return toast("Nothing generated yet.");
    go(t);
  });

  $("to-job").onclick = () => go("job");
  $("analyse").onclick = runAnalysis;
  $("generate").onclick = runGeneration;
  $("back-job").onclick = () => go("job");
  $("cancel").onclick = () => { S.abort?.abort(); busy(false); toast("Stopped."); };

  $("cvfile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await importCvText(await readFile(f)); } catch (err) { toast(err.message, "bad"); }
    e.target.value = "";
  };
  $("cvpaste-go").onclick = () => importCvText($("cvpaste").value);

  document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
    document.querySelectorAll(".tab").forEach(x => x.setAttribute("aria-selected", String(x === t)));
    ["cv", "cover", "checks"].forEach(p => $("p-" + p).hidden = p !== t.dataset.p);
  });

  const co = () => $("company").value.trim() || S.analysis?.company || "";
  $("cv-copy").onclick = e => copy("cvtext", e.target);
  $("cv-doc").onclick = () => toDoc("cvtext", `Kaycee Ndukuba - CV${co() ? " - " + co() : ""}`);
  $("cv-pdf").onclick = () => toPdf("cvtext", "CV");
  $("cov-copy").onclick = e => copy("covtext", e.target);
  $("cov-doc").onclick = () => toDoc("covtext", `Kaycee Ndukuba - Cover Letter${co() ? " - " + co() : ""}`);
  $("cov-pdf").onclick = () => toPdf("covtext", "Cover letter");

  // editable output: typing in the panes updates what gets exported
  ["cvtext", "covtext"].forEach(id => $(id).addEventListener("input", () => $("edited").hidden = false));

  if (!S.settings.key) toast("Add your Anthropic API key in Settings to start.");
}

init().catch(e => {
  document.body.insertAdjacentHTML("afterbegin",
    `<div class="card warnbox" style="margin:16px">Could not start: ${esc(e.message)}</div>`);
});
