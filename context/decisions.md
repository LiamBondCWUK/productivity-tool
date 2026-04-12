# Decisions Log

Format: Append-only (newest at top within each sprint)  
Purpose: Centralized record of sprint decisions, blockers, and resolutions  
Audience: Executive, team leads, planning

---

## Sprint 50 (Current)

### Decision: Support Rota Proposal by Will Walker
- **Date**: 2026-04-10 (Sprint 50 checkpoint)
- **Owner**: Will Walker
- **Status**: 🟡 Pending approval (next sprint planning)
- **Context**: Will proposed systematic support rota to reduce ad-hoc interruptions; systems thinking evident
- **Action Items**: 
  - [ ] Review proposal (Patrick / Adam by 2026-04-15)
  - [ ] Present to team (Sprint 50 retro or Sprint 51 planning)
  - [ ] Implement if approved (Will + Patrick to mentor)
- **Impact**: Could reduce context-switching overhead for developers
- **Related**: Sprint 50 retro health 5.0/10 — identified interruption management as gap

### Decision: HAT Sampling Three-Way Audit Completion
- **Date**: 2026-04-08
- **Owner**: Alice Maghie, David Cook (QA leads)
- **Status**: ✅ Complete
- **Context**: Excel specs vs Jira cards vs live product audited; 17 dev bugs + 10 spec changes identified
- **Evidence**: 40+ QA items from Alice, 30+ from David with systematic root cause analysis
- **Action Items**:
  - [✅] Create dev bug cards (UKCAUD-15xxx series) — COMPLETE
  - [✅] Create spec change cards — COMPLETE
  - [ ] Track resolution (Patrick to assign & track against DoD)
- **Impact**: Confidence in HAT Sampling v1 release candidate
- **Related**: Builder Forms HAT Sampling project README created (April 12)

### Decision: Sprint 50 Retro Health Score 5.0/10
- **Date**: 2026-04-09 (Sprint 50 retro ceremony)
- **Owner**: Adam Martin (retro facilitator)
- **Status**: 🟡 Action items in progress
- **Context**: Team identified process gaps; lowest health since Sprint 45
- **Main Issues**:
  - Interruption management (ad-hoc support requests)
  - Goal tracking unclear (Jira cascading not visible to all)
  - Overnight analysis false positives (3 alerts this sprint)
- **Action Items** (Adam owns):
  - [ ] Consolidate overnight analysis sensitivity (Liam to tune thresholds by April 20)
  - [ ] Make Jira cascading goals visible in Command Center (Liam to add goals.md refresh by April 18)
  - [ ] Implement support rota trial (Will proposal — pending approval)
- **Impact**: Health target Sprint 51: 7/10
- **Related**: goals.md (goal visibility), decisions.md (retrospective tracking)

### Decision: UKCAUD Ceremony Automation v2 Architecture
- **Date**: 2026-04-07
- **Owner**: Liam Bond (automation lead), Patrick (technical lead), Adam (process owner)
- **Status**: 🟡 Design complete, implementation phased
- **Context**: v1 stable; v2 adds: Obsidian consolidation, AI agents, ceremony transcript analysis
- **Action Items**:
  - [✅] v1 baseline achieved (ceremony-dashboard.mjs, 70+ JSON files)
  - [ ] B1: NotesTab in Command Center (April 25 target)
  - [ ] B3: CeremoniesTab with iframe embed (May 1 target)
  - [ ] B5-B8: Obsidian plugin cleanup (May 10 target)
- **Impact**: Unified ceremony experience; reduced tool switching
- **Related**: Workstream B (Obsidian consolidation), Command Center expansion

### Decision: AI Onboarding Consolidation
- **Date**: 2026-04-05
- **Owner**: Liam Bond
- **Status**: ✅ Complete
- **Context**: Merged AI Onboarding + AI Onboarding Guide folders; created navigation README
- **Action Items**:
  - [✅] Archive AI Onboarding Guide → _archive/ (complete)
  - [✅] Create AI Onboarding/README.md with export commands (complete)
  - [ ] Schedule next AI onboarding delivery (HR to coordinate)
- **Impact**: Cleaner project structure; unified delivery artifact
- **Related**: CW-PROJECTS-INDEX.md merged projects section

### Decision: Builder Forms HAT Sampling Documentation
- **Date**: 2026-04-03
- **Owner**: Liam Bond
- **Status**: ✅ Complete
- **Context**: Documented three-way audit workflow, 17 PowerShell scripts, prerequisites
- **Action Items**:
  - [✅] Create README.md with workflow diagram (complete April 12)
  - [ ] Schedule quarterly rerun (recommended for post-release validation)
- **Impact**: Knowledge transfer for future audits; repeatability established
- **Related**: HAT sampling project README and evidence dossier

---

## Sprint 49 (Previous)

### Decision: Overnight Analysis Integration into Command Center
- **Date**: 2026-03-31
- **Owner**: Liam Bond, Adam Martin
- **Status**: ✅ Live (3 sprints running)
- **Context**: Moved from ad-hoc manual analysis to scheduled 02:00 Mon–Fri runs
- **Action Items**:
  - [✅] overnight-analysis.mjs deployed and running
  - [ ] Sensitivity tuning (ongoing — 3 false positives in Sprint 50)
- **Impact**: Reliable overnight insights; team starts day with prepared context

---

## Historic Decisions (Older Sprints)

### Q1 2026: Jira API Automation Framework
- **Status**: ✅ Complete
- **Impact**: Enabled ceremony orchestration, HAT sampling audit, bulk issue operations

### Q1 2026: Productivity Tool (Command Center) v1
- **Status**: ✅ Live
- **Impact**: Unified dashboard for tasks, projects, calendar, time tracking, system health

### Q1 2026: UKCAUD Ceremony Dashboard v1
- **Status**: ✅ Live (70+ ceremony documents, 80+ team members served)
- **Impact**: Automated ceremony prep, reduced manual work by ~6h/week

---

## Blocking Issues (To Resolve)

### Blocker: Bamboo HR Integration
- **Issue**: Feedback forms due April 18; no automated data fetch (SSO only via browser)
- **Owner**: Liam Bond (collect questions from user)
- **Depends On**: User providing feedback form questions + self-review prompts
- **Impact**: Blocks peer feedback drafting (E2-E3)
- **Target Resolution**: April 14 (4 days buffer before April 18 deadline)

### Blocker: Overnight Analysis False Positives
- **Issue**: 3 alerts in Sprint 50 — threshold tuning needed
- **Owner**: Liam Bond
- **Action**: Adjust sensitivity in doc-freshness-check.mjs logic (A1-A5 implementation)
- **Target Resolution**: April 20 (Sprint 51 start)

### Blocker: Obsidian Jira Plugin Misconfiguration
- **Issue**: Host is mycompany.atlassian.net; should be caseware.atlassian.net
- **Owner**: Liam Bond
- **Action**: Fix config + test Jira issue embedding in Obsidian
- **Target Resolution**: April 25 (before B5-B8 Obsidian plugin cleanup)

---

## Cross-Reference Files

- **team.md** — Team roster; use to identify decision owners
- **goals.md** — Goals; decisions log shows goal-related blockers and progress
- **CW UKCAUD Project Tracker/** — Sprint metrics used in retro decisions
- **Productivity Tool/** — Command Center + overnight analysis implementation
