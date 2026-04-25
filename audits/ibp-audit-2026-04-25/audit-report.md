# IBP Generator Audit — Findings & Recommendations

**Date:** 2026-04-25
**Subject:** `Productivity Tool/scripts/generate-ibp.mjs` (1933 lines)
**Reference output:** `ibp-FRESH-2026-04-25.md` (935 words)
**Benchmark:** `IBP Roll out_All Product.docx` (official Caseware spec); Kartik Narayan's 13-week archive; Quinn / Ian official examples

---

## Executive Summary

The IBP generator is failing on every measurable dimension. The single most consequential finding is that **the Claude narrative is not running at all** — all three OAuth invocation paths fail silently due to a Windows-specific spawn bug, and the pipeline emits raw heuristic markdown without warning. Every IBP submitted for an unknown number of weeks has been an unsupervised regex rollup, not a Claude-synthesised summary.

Beyond that, the output violates the official Caseware IBP format on **every section**: wrong section names, wrong section count (5 instead of 4), false `Blockers: None` while real blockers are tracked, raw Jira titles in Priorities instead of strategic priorities + lever, and a `Looking Ahead` section filled with daily meeting names instead of the spec-required release dates / OOO blocks.

Length is **2.3× the peer mean** (935 words vs 300-word Kartik average, 110-word Quinn baseline) while quality is materially lower.

### Scores (1–5)

| Dimension | Score | Headline finding |
|---|---|---|
| Section adherence | **1/5** | 5 sections instead of 4; non-standard `## Communications`; Priorities/Looking Ahead content type wrong |
| Prose quality | **1/5** | 11 mid-sentence `…` truncations; one bullet of 22 comma-separated items; no narrative synthesis at all |
| Factual accuracy | **2/5** | `Blockers: None` is false (DIST-69292 is open); Priorities are raw Jira titles; "Communications" repeats Wins items |
| Length & density | **1/5** | 935 words vs 250–400 target band; 2.3× peer mean |
| Spec principles | **1/5** | Fluff over impact; no "biggest lever" named; meeting list instead of milestones; Priorities are Jira-dump |
| **Overall** | **1.2/5** | Failing on all dimensions — root cause is silent Claude failure + prompt drift |

---

## Root-Cause Map

Every quality complaint traces to a specific code path:

| # | Quality issue | Root cause | File:line |
|---|---|---|---|
| R1 | No narrative synthesis appears | `claude` CLI never executes — all 3 OAuth paths fail silently with `EINVAL` on Windows because the script doesn't append `.cmd` to the `claude` command (only `npx`) | `generate-ibp.mjs:1357` (`const cmd = process.platform === "win32" && attempt.cmd === "npx" ? "npx.cmd" : attempt.cmd;` — should also handle `claude`) |
| R2 | Silent fallback hides R1 | When Claude returns null, the pipeline emits plain summary with only a `console.log` warning that does not fail the run | `generate-ibp.mjs:1378` + `generate-ibp.mjs:1916` (fallback) |
| R3 | Wrong section names (Impact/Communications/Blockers/Priorities/Looking Ahead) | `buildPlainSummary()` hard-codes its own section structure that pre-dates the Claude narrative integration | `generate-ibp.mjs:550–1296` |
| R4 | Non-standard `## Communications` section | Section emitted unconditionally from Teams chat data; not in IBP spec | `generate-ibp.mjs:~900–1000` (Communications builder) |
| R5 | `Blockers: None` while DIST-69292 is open | Builder only checks Jira `DIST` status; never cross-references `~/.claude/primer.md` `## Open Blockers` | `generate-ibp.mjs:1174` (status-based filter) |
| R6 | Mid-sentence `…` truncations (11 occurrences in fresh IBP) | Hard char limits in `cleanText(text, 80/90/110/120)` | `generate-ibp.mjs:~700` (cleanText) + 50+ call sites |
| R7 | 200-word comma-soup engineering bullet | `buildPlainSummary()` joins all per-workstream items into one bullet via `.join(", ")` | `generate-ibp.mjs:~830` (Engineering & AI-assisted block) |
| R8 | Priorities are raw Jira titles ("Start Audit HAT UK LLP — Enable financial statements...") | Builder emits `"Start " + issue.summary` directly; never asks the model to synthesise to strategic priority + lever | `generate-ibp.mjs:~1100–1200` (priorities) |
| R9 | `Looking Ahead` is daily meeting names | Builder pulls calendar events and groups by day; spec asks for release dates / OOO / cross-team milestones | `generate-ibp.mjs:~1230–1260` (looking ahead) |
| R10 | Daily-vs-weekly prompt mismatch (now moot since Claude isn't running, but will hit when fixed) | Prompt body says "today / tomorrow" while output is weekly | `generate-ibp.mjs:1313`, `1335–1339` |
| R11 | No model/temp specified | Claude CLI defaults are used (likely Opus + temp 1.0) — high variance, expensive | `generate-ibp.mjs:1349, 1351, 1353` |
| R12 | No output validation | Nothing asserts section list, word count, blockers, or that Claude ran | (absent — needs `validateIbpOutput()`) |
| R13 | Hand-crafted sections (Daily Standup / Meeting / Retro) absent from output | Either user hasn't authored them this week, or regex preservation fails | `generate-ibp.mjs:1283–1293` (preservation) |
| R14 | Duplicate content across days (04-24 = 04-25 byte-identical) | Output deterministic given identical input + `claude` returning null both runs | (consequence of R1) |

---

## Side-by-Side Evidence

### Spec section vs current output

| Official IBP spec | Current generator output | Verdict |
|---|---|---|
| `Last Week: Wins & Impact` | `## Impact` | ❌ Wrong name + bloated content |
| `Issues / Blockers` (optional) | `## Blockers — None` | ❌ False — DIST-69292 is open |
| `This Week: Top Priorities` | `## Priorities — _Mon 27 Apr - Fri 01 May_` followed by raw Jira titles | ❌ Wrong format |
| `Looking Ahead` (optional) | `## Looking Ahead — Mon: meeting1, meeting2, meeting3...` | ❌ Wrong content type |
| (none) | `## Communications` (14 bullets) | ❌ Non-standard section |

### Length comparison

```
Liam's current pipeline output  ████████████████████████████████  935 words
Kartik (peer benchmark, avg)    ██████████                       300 words
Quinn (official spec example)   ████                             110 words
Ian   (official spec example)   ███                               85 words
Target band                     [██████──────████]               250–400 words
```

### Truncation count

```
$ grep -c "…" ibp-FRESH-2026-04-25.md → 11 occurrences mid-sentence
```

Sample truncations from fresh IBP:
- Line 22: "lastIngested bug fixed, data-field-path…, JSON export"
- Line 24: "plan-prompt-frameworks — Run a structured multi-framework prompt Q&A, dual-path score and gate the res..."
- Line 25: "Investigate LLM harnesses and how I can implement it into my setup…"
- Line 36: "Contributed to UKCAUD-16146: Split this for you now its all in backlog other than…"
- Line 40: "Bethany reached out: 'I don't suppose you could do me an intro to claude could you? Tbh I'm struggling to get started…"

### Comma-soup evidence

Fresh IBP line 23 — a single bullet that violates every readability principle:

> *Productivity Tool: wire gnews scraper into live scan, extract tool suggestions from google news…, live morning scan with automated sources, Popular Repos tab, install queue, source badges on stories, signal as link, trending-only filters, expand newsletter RSS to 14 sources, fix broken feeds, add real pub-date sorting, expand RSS to 22 sources — lab blogs, arXiv, Reddit community signals*

22 items separated by commas. Should be split into a single bold-initiative bullet with one synthesised sentence per peer norm.

---

## Ranked Fix List

Fixes ordered by **impact ÷ effort**. Apply 1–5 first to recover the basics; 6–14 for spec parity and quality.

### Tier 1 — Fix the silent failure (highest impact, hours not days)

**F1. Fix Windows `claude` command resolution** *(S, critical)*
- Edit `generate-ibp.mjs:1357` to also handle `claude` on Windows: `const cmd = process.platform === "win32" ? `${attempt.cmd}.cmd` : attempt.cmd;` (apply to both `claude` and `npx`)
- Without this, no other prompt fix matters — narrative will keep failing silently.

**F2. Replace silent fallback with loud error** *(S)*
- `generate-ibp.mjs:1378` and `1916`: when Claude returns null, exit non-zero with explicit message: `"FATAL: Claude narrative unavailable. Fix CLI or run claude login. IBP not generated."`
- Add stderr log of which OAuth path succeeded (or `null` if all failed) for debuggability.

**F3. Pin model + temperature** *(S)*
- All three CLI invocations (`generate-ibp.mjs:1349, 1351, 1353`) should include `--model claude-sonnet-4-6 --temperature 0.5`.
- Eliminates Opus default + temp 1.0 high-variance generation.

### Tier 2 — Format & section adherence

**F4. Rewrite prompt as XML-structured with peer multi-shot** *(M, highest quality lift)*
- Replace `buildNarrativePrompt()` (`generate-ibp.mjs:1299–1342`) with an XML-tagged prompt containing `<role>`, `<format>` (the official 4 sections), `<constraints>` (no Communications, no comma-soup, 250–400 words, top 2–3 priorities + biggest lever), and `<examples>` with 3 peer IBPs (Kartik short + Kartik long + Quinn).
- See `refactored-prompt.md` for the full new prompt text.

**F5. Add `validateIbpOutput()`** *(S)*
- Assertions: section list matches official 4; word count 250–400; zero `…`; no bullet >60 words; Blockers section present if `primer.md ## Open Blockers` non-empty.
- Fail loud + write `ibp-validation-failures.json` next to the output.

**F6. Cross-reference `primer.md` for blockers** *(M)*
- Parse `~/.claude/primer.md` `## Open Blockers` section; merge with active DIST issues; never emit "None" if either has content.

**F7. Remove `## Communications` section** *(S)*
- Delete the Teams-chat-driven Communications builder. Distill at most 1–2 cross-team highlights into `Last Week: Wins & Impact` (e.g. "Aligned QA on Claude access via Federico/Mitchell sessions").

### Tier 3 — Prose quality

**F8. Raise `cleanText()` char limits** *(M)*
- Change all 50+ call sites from 80/90/110/120 → 240/280/320/360, OR replace with priority-sort + soft-wrap. Eliminates 11 mid-sentence ellipses.

**F9. Kill the comma-soup engineering bullet** *(S)*
- In `buildPlainSummary()`'s Engineering & AI-assisted block, emit one bullet per workstream with bold initiative + 1-line synthesised description. Drop the `.join(", ")` pattern.

**F10. Strategic priorities + biggest lever** *(M)*
- Limit Priorities to top 2–3 strategic items, each phrased as a forward-looking action ("Finalize HAT financial statements rollout"), and append a single "Biggest lever" line per spec. Drop raw Jira-title dumps.

**F11. `Looking Ahead` content rewrite** *(M)*
- Replace daily meeting list with: (a) upcoming Caseware release dates from Confluence, (b) OOO blocks ≥2 days from calendar, (c) cross-team milestones (e.g. "DIST 39.0 release production deploy 12–14 May"). Drop the per-day meeting names.

**F12. Build peer examples library** *(S)*
- Create `Productivity Tool/scripts/ibp-examples/` with 3 hand-picked Kartik/Quinn IBPs as `.md` files. Loaded into prompt at gen time (multi-shot anchors).

### Tier 4 — Hygiene

**F13. Verify hand-crafted section preservation** *(S)*
- Investigate why `## Daily Standup Highlights` etc. are absent in fresh output (`generate-ibp.mjs:1283–1293`). If user simply hasn't authored them, no fix needed; if regex broken, repair.

**F14. Move Confluence/Teams fetch to gen time** *(M)*
- Currently fetched at module-load time. Add explicit gen-time fetch + timestamp footer to detect staleness.

---

## Recommended Implementation Order

1. **Day 1 (3h)**: F1 → F2 → F3 → F4 (rebuild prompt) → F5 (validation). After this, the basic pipeline is sound and the prompt is correct.
2. **Day 2 (3h)**: F6 → F7 → F8 → F9. Cleans up the regex layer that feeds the prompt.
3. **Day 3 (2h)**: F10 → F11 → F12. Final spec adherence fixes + examples library.
4. **Verification (1h)**: regenerate, score against rubric, side-by-side vs Kartik.

Total path to high-quality IBP: ~9 hours of focused work. **F1–F5 alone (~3 hours) get the pipeline from 1.2/5 to ~3.5/5.**

---

## Verification Criteria

After implementation, regenerate `ibp-2026-04-25.md` and score:
- Section list = exactly `Last Week: Wins & Impact` / `Issues / Blockers` / `This Week: Top Priorities` / `Looking Ahead` ✓
- Total words 250–400 ✓
- Zero `…` mid-sentence ✓
- No `## Communications` section ✓
- Blockers populated if `primer.md` has any ✓
- Priorities are 2–3 strategic items + named biggest lever ✓
- Looking Ahead contains release dates / OOO blocks (no daily meeting names) ✓
- Side-by-side vs Kartik's same-week IBP shows visual quality parity ✓
