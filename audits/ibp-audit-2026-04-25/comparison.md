# Side-by-Side: Current vs Peer Benchmark vs Refactored Target

Three columns showing the same week (Mon 20 Apr – Fri 24 Apr 2026):

| Column | Source | Length |
|---|---|---|
| **A. Current** | `ibp-FRESH-2026-04-25.md` (this pipeline) | 935 words |
| **B. Peer benchmark** | Kartik Narayan's typical IBP (avg of 13-week archive) | ~300 words |
| **C. Refactored target** | What the pipeline would produce after F1–F12 fixes | ~340 words |

---

## Section 1 — `Last Week: Wins & Impact`

### A. Current (Liam, raw heuristic markdown — 580 words for this section alone)

```
## Impact

Delivered progress across HAT UK — Financial Statements, HAT UK Company Audit — Sampling
& Sample Size, Mercia UK — AI Testing Audit, and HAT UK Corporate this week.

**HAT UK — Financial Statements**
- Enable financial statements document option for all main audit templates (×8 audit templates)
- Add "statement": true to all main audit template configurations
- Verify financial statements document option is available across all main audit templates

[... three more bold-initiative blocks of raw Jira titles ...]

**Engineering & AI-assisted work**
- Ukcaud Spec Studio: batch 1 complete — all tests green, lastIngested bug fixed,
  data-field-path…, JSON export, publish routes, Replit config, typed routes + Suspense fixes
- Productivity Tool: wire gnews scraper into live scan, extract tool suggestions from google
  news…, live morning scan with automated sources, Popular Repos tab, install queue, source
  badges on stories, signal as link, trending-only filters, expand newsletter RSS to 14
  sources, fix broken feeds, add real pub-date sorting, expand RSS to 22 sources — lab blogs,
  arXiv, Reddit community signals
[... 6 more bullets, several truncated with … ]

**Collaboration & documentation**
- Updated best practice guide: Claude AI - Session Management Best Practice
- Updated content schedule tracker
[...]
```

**Annotations:**
- ❌ Wrong section name (`Impact` instead of `Last Week: Wins & Impact`)
- ❌ Bullet on Productivity Tool packs 22 items — readable peers never do this
- ❌ Bullets are raw Jira titles, not synthesised wins
- ❌ Multiple `…` truncations
- ❌ No customer / business impact narrative — peer spec mandates "outcomes and their customer or business impacts"

### B. Peer benchmark (Kartik, typical week — 130 words for Wins section)

```
🚀 Last Week: Wins & Impact

SE Granular Permissions: Advanced the initiative by finalizing and sharing the proposed
solution, moving closer to design sign-off and development kickoff.

Wipfli Security Settings: Enabled the client to independently manage their Cloud security
setup and API usage through targeted training and best-practice implementation.

Release Planning: Launched the 39.0 release work with Dev, Documentation, and Translation
teams.

JIRA Cleanup: Improved backlog health and focus by removing stale and low-priority items,
setting a cleaner foundation for upcoming quarters.
```

**Annotations:**
- ✅ Correct spec section name with 🚀 emoji
- ✅ Bold initiative + colon + 1-sentence narrative describing **outcome and impact**
- ✅ 4 wins, ~30 words each — readable, scannable
- ✅ Each bullet names what *advanced*, not what was *done*

### C. Refactored target (what fixed pipeline would produce — ~150 words)

```
🚀 Last Week: Wins & Impact

HAT UK — Financial Statements: Enabled the financial statements document option across
8 main audit templates, completing the rollout that unblocks Charity, LLP, and Corporate
audits for the next sprint.

Mercia UK — AI Testing Audit: Coordinated the new cloud solution request, putting the
AI testing pipeline on track for production release.

QA + AI Zephyr Audit: Delivered a full Zephyr Scale audit across UKCAUD and UKCFS,
identifying Advanced licence gaps and what each project does well that the other could
adopt — shared async to the channel for cross-team adoption.

Claude Footprint Expansion: Onboarded Lee Hatcher, Damaris Dumitru, and Mitchell Payne
to Claude Code (FreshService tickets raised); shipped V1 Claude Starter Kit
(`CLAUDE-CODE-COMPLETE-GUIDE.md`) for the wider company. Andrew Smith called it
"phenomenal" in the Claude Council.

Productivity Tooling: Ramped the morning-scan automation — RSS expanded to 22 sources
(lab blogs, arXiv, Reddit signals), live news ingestion, install queue.
```

**Annotations:**
- ✅ Spec-correct section name
- ✅ Each bullet names outcome + impact (not just activity)
- ✅ "Communications" content distilled into 1–2 wins (Claude Footprint Expansion) instead of separate section
- ✅ ~30–50 words per win; total ~150 words

---

## Section 2 — `Issues / Blockers`

### A. Current
```
## Blockers

- None
```

❌ **False.** `~/.claude/primer.md` tracks DIST-69292 ("MCP not on HAT server, raised Apr 9, unresolved") plus 3 other open blockers.

### B. Peer benchmark (Kartik most weeks)
```
⚠️ Issues / Blockers

• No new blockers identified this week.
```

✅ Acceptable — but Kartik will write a real blocker when he has one (e.g., "A critical bug identified during regression testing led to the delay of 40.0 Beta deployment").

### C. Refactored target
```
⚠️ Issues / Blockers

• DIST-69292 — MCP not on HAT server (raised 2026-04-09, unresolved). Need DIST team
  to prioritise; blocks UK Audit team's MCP rollout. (Help Needed)
• HAT spec/form mismatch — Mercier sampling form spec finalisation pending; QA/Dev
  review held until spec is locked. (FYI — owned, no help needed)
• UKCAS ↔ UKCAUD Phase 1.5 reverse sync — blocked on DIST admin access. (Help Needed)
```

✅ Distinguishes FYI vs Help Needed per spec
✅ Cross-references known blockers from `primer.md`
✅ Each blocker is one sentence — peer norm

---

## Section 3 — `This Week: Top Priorities`

### A. Current (~140 words)
```
## Priorities
_Mon 27 Apr - Fri 01 May_

**HAT UK Company Audit — Sampling & Sample Size**
- Start Audit Exemption Mercia UK Company - Enable Contact Access (contactAccess)

**HAT UK — Financial Statements**
- Start Audit HAT UK LLP - Enable financial statements document option for all main audit templates
- Start Audit HAT UK Charity - Enable financial statements document option for all main audit templates
- Start Enable financial statements document option for all main audit templates

- Upcoming: UK UAT 2026-04 - Catch up, UK Quarterly Roadmap Review, Following: North America
  Cloud Solutions bi-weekly sprint review/demo, PM Weekly Meeting, UK - Release Readiness Meeting
```

❌ Raw Jira titles ("Start Audit HAT UK LLP — Enable financial statements...")
❌ No "biggest lever" called out (spec mandates this)
❌ Mixes priorities with upcoming meetings (wrong section for that)

### B. Peer benchmark (Kartik)
```
🔥 This Week: Top Priorities

SE Granular Permissions: Conduct validation session with CBIZ/MHM to gather feedback
and build confidence.

Regression Test Planning: Identify key test areas with Dev and align sprint planning
accordingly.

Smith + Howard Merger: Finalize and communicate the alternate plan with the client
alongside Shazad.
```

✅ 2–3 strategic priorities (not Jira-dump)
✅ Each phrased as forward-looking outcome ("Conduct...", "Finalize...")

### C. Refactored target
```
🔥 This Week: Top Priorities

HAT UK Financial Statements rollout: Complete the LLP and Charity templates this week
to close out the 8-template programme. Coordinate Mercia UK Contact Access enablement
in parallel.

Sampling form spec finalisation: Lock the Mercier spec with Federico (QA/Dev review
gated on this). This is the biggest lever for UK Audit form-system quality this quarter.

UK Quarterly Roadmap Review prep: Build the deck and align stakeholders ahead of the
UAT catch-up and Roadmap Review on Mon 27 Apr.

**Biggest lever:** Closing the HAT financial statements template rollout — unblocks all
8 audit templates for the next sprint and clears the queue for Q2 work.
```

✅ Top 3 strategic priorities (not 5+ Jira titles)
✅ Forward-looking action language
✅ "Biggest lever" line per official spec

---

## Section 4 — `Looking Ahead`

### A. Current
```
## Looking Ahead

**Rest of this week:**
- No upcoming meetings scheduled for this week.

**Next week:**
- Mon: UK UAT 2026-04 - Catch up, UK Quarterly Roadmap Review, Following: North America
  Cloud Solutions bi-weekly sprint review/demo
- Tue: PM Weekly Meeting
- Wed: UK - Release Readiness Meeting, Bi-weekly UK meeting - Cloud engagements,
  SE Builder Bi-Weekly Check-in
- Thu: Backlog Refinement Prep, Specifications Sync (Review Cards + Ask Questions),
  Monthly Solution Day, Following: SE Platform Demo
- Fri: Backlog Refinement Prep, RetroSpective Document Contribution
```

❌ Wrong content — daily meeting names. Spec asks for release dates, OOO ≥2 days, cross-team milestones over **next couple of months**.

### B. Peer benchmark (Kartik)
```
🔮 Looking Ahead

Collaborate 40.0 Release Timeline:
• Code Cut-off: 8th May 2025
• Partner and Beta Deployment: 13th May 2025
• Production Deployment: 20th–22nd May 2025

OOO: September 9th to 17th
```

✅ Release milestones (months ahead)
✅ OOO blocks (no reasons, per spec)

### C. Refactored target
```
🔮 Looking Ahead

UK Audit release calendar:
• HAT UK financial statements rollout completes: w/o 4 May
• UAT cycle 2026-04: 27 Apr – 8 May
• Q2 sprint kickoff: 11 May

Cross-team:
• DIST 39.0 release production deploy: 12–14 May
• North America Cloud Solutions bi-weekly review: ongoing

OOO: None planned next 4 weeks.
```

✅ Months-ahead milestones, not daily meetings
✅ OOO line per spec (even when "None")
✅ Cross-team milestones called out

---

## Section 5 — `## Communications` (REMOVE)

### A. Current
14 bullets of 1:1 / team sync content occupying ~280 words.

### B. Peer benchmark
**No such section exists in any peer IBP.** The 13 archived Kartik IBPs and the official Quinn/Ian examples have exactly 4 sections.

### C. Refactored target
**Section removed.** The 1–2 highest-impact items (e.g., Claude Footprint Expansion, QA + AI Zephyr audit) get distilled into `Last Week: Wins & Impact` as outcome-framed bullets. Everything else dropped.

---

## Length Comparison Summary

| | Current (A) | Peer (B) | Target (C) |
|---|---|---|---|
| Wins | 580 words | 130 words | 150 words |
| Blockers | 4 words ("None") | ~10 words | ~60 words |
| Priorities | 140 words | 60 words | 100 words |
| Looking Ahead | 100 words | 50 words | 70 words |
| Communications | 280 words | — | — |
| **Total** | **935** | **~300** | **~340** |

Target lands at peer mean. Current pipeline is 2.3× too long while quality is materially lower.
