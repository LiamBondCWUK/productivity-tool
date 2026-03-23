# UKCAS Board Configuration — Enhancement Plan

**Date:** 2026-03-22
**Updated:** 2026-06-30 — Corrected to reflect existing board (was incorrectly listed as "no board configured")
**Project:** Internal Support (UKCAS)
**CWAS Framework:** Kanban (unplanned, reactive work — on-call support, defect resolution)

---

## 1. Current State (Verified 2026-06-30)

| Attribute | Current |
|-----------|---------|
| Issue types | Bug only |
| Workflow | ✅ Custom Kanban with 8 columns: Open → Awaiting Info → Waiting For Files → In Progress → Escalated Internal → Escalated Platform Team → Awaiting Update → Done |
| Board | ✅ Active Kanban board at `/jira/core/projects/UKCAS/board` |
| Escalation Tiers | ✅ L1-Support → L2-Content → L3-Product/Dev → L4-Platform |
| Approvals | ✅ Approvals tab active |
| Integrations | Microsoft Teams, Zephyr, ScriptRunner, Checklist |
| Views | Summary, Board, List, Calendar, Timeline, Reports, Forms, Pages |
| Labels | L1-Support, L2-Content, L3-Product/Dev, L4-Platform |
| Components | None configured |
| Metrics | None configured |
| Key Assignees | David Garcia, Federico Marchionni, Will Walker, Jemma White |
| Triage flow | L1 → L2 → L3 → Escalated Internal / Escalated Platform Team |

## 2. Recommended Enhancements (CWAS-Aligned)

> The board and workflow already exist and are functional. The following are optional enhancements to improve CWAS compliance.

### 2.1 — Current Workflow States (Already Implemented)

The existing 8-column workflow is well-suited for support operations:

```
Open → Awaiting Info → Waiting For Files → In Progress → Escalated Internal → Escalated Platform Team → Awaiting Update → Done
```

This maps well to CWAS Kanban requirements. No workflow changes recommended — the existing escalation tiers provide good visibility.

### 2.2 — Kanban Board Configuration (Already Active)

**Board Type:** Kanban (continuous flow, no sprints) ✅
**Board Name:** UK Cloud Audit Support ✅
**WIP Limits:** Not configured — excluded from scope per team decision

### Quick Filters

| Filter | JQL |
|--------|-----|
| L1 - Support | `labels = "L1-Support"` |
| L2 - Content | `labels = "L2-Content"` |
| L3 - Product/Dev | `labels = "L3-Product/Dev"` |
| My Issues | `assignee = currentUser()` |
| Stale (>7 days) | `status != Closed AND status != Resolved AND updated <= -7d` |
| Escalated to UKCAUD | `status = Escalated AND issueFunction in linkedIssuesOf("project = UKCAUD")` |
| Escalated to DIST | `status = Escalated AND issueFunction in linkedIssuesOf("project = DIST")` |

### 2.3 — KTLO Labels (CWAS Requirement)

All UKCAS bugs are **Reactive KTLO** by nature. Apply label:
- `reactive-ktlo` — on all UKCAS bugs (can be auto-set via automation)

### 2.4 — Bug Template (CWAS Standard)

UKCAS bugs must follow the company-wide CWAS bug standard:

**Mandatory Fields:**
- Summary (standardised: `[Product] - [Brief Description]`)
- Description (bug template with: Steps to Reproduce, Expected Result, Actual Result, Environment)
- Priority (P1-Critical, P2-Major, P3-Minor, P4-Trivial)
- Component (product area — to be set up)
- Environment (Production / UAT / Development)
- Escalation Label (L1-Support / L2-Content / L3-Product/Dev)

**Recommended Components:**
- Audit Mercia UK Academy
- Audit Mercia UK Charity
- Audit Mercia UK Corporate
- Audit Mercia International
- Audit Mercia ROI
- Audit HAT UK
- Platform / Infrastructure
- Other

### 2.5 — Automation Rules

#### Rule 1: Auto-assign Based on Escalation Label

**Trigger:** Issue label changed
**Conditions:**
- Label = `L1-Support` → Assign to Support team queue
- Label = `L2-Content` → Assign to Content team queue
- Label = `L3-Product/Dev` → Assign to Product/Dev queue

#### Rule 2: Escalation to UKCAUD

**Trigger:** Status changed to "Escalated" AND label = `L3-Product/Dev` AND escalation type = "Code Fix"
**Action:**
1. Create linked UKCAUD Bug: `DEVELOP - {Component} - {Summary}`
2. Set link type: "is caused by" on UKCAUD bug
3. Copy fields: Priority, Component, Description
4. Add comment on UKCAS ticket: "Escalated to UKCAUD — see linked ticket"

#### Rule 3: Escalation to DIST

**Trigger:** Status changed to "Escalated" AND escalation target = DIST
**Action:**
1. Create linked DIST Request
2. Set link type: "is caused by"
3. Copy fields: Priority, Description
4. Add comment on UKCAS ticket: "Escalated to DIST — see linked ticket"

#### Rule 4: SLA Warning — Stale Tickets

**Trigger:** Scheduled daily
**Condition:** Status IN (Open, Triaging, In Progress) AND updated <= -5d
**Action:** Add comment tagging support lead: "This ticket has had no updates for 5+ days."

#### Rule 5: Auto-close Resolved Tickets

**Trigger:** Scheduled daily
**Condition:** Status = Resolved AND updated <= -14d
**Action:** Transition to Closed. Add comment: "Auto-closed after 14 days with no further updates."

#### Rule 6: KTLO Label Auto-apply

**Trigger:** Issue Created
**Action:** Add label `reactive-ktlo`

#### Rule 7: Enhancement Request → UKJPD

**Trigger:** Manual trigger OR label added = `enhancement-request`
**Action:**
1. Create UKJPD Idea with Source = "Support"
2. Copy: Summary, Description
3. Link: UKCAS bug "relates to" UKJPD Idea
4. Add comment: "Enhancement request routed to UKJPD — see linked Idea"
5. Transition UKCAS ticket to Resolved (with resolution: "Not a Bug — Enhancement Request")

### 2.6 — Metrics (CWAS Kanban Requirements)

| Metric | How to Track |
|--------|-------------|
| **Cycle Time** | Measure time from Triaging → Resolved (automated via board settings) |
| **MTTA (Mean Time to Acknowledge)** | Time from Open → Triaging (must be < 4 hours for P1, < 1 day for P2) |
| **MTTR (Mean Time to Resolve)** | Time from Open → Resolved |
| **SLA Compliance** | % of tickets resolved within SLA target for each priority |
| **WIP** | Items in "In Progress" at any time (target: ≤ 3) |
| **Throughput** | Tickets resolved per week |
| **Escalation Rate** | % of tickets escalated to UKCAUD or DIST |

**SLA Targets (proposed):**

| Priority | Acknowledge | Resolve |
|----------|-------------|---------|
| P1 - Critical | 4 hours | 1 business day |
| P2 - Major | 1 business day | 3 business days |
| P3 - Minor | 2 business days | 10 business days |
| P4 - Trivial | 5 business days | 30 business days |

---

## 3. Implementation Steps

| Step | Action | Effort |
|------|--------|--------|
| 1 | Create custom workflow in UKCAS project settings | 30 min |
| 2 | Configure Kanban board with columns and WIP limits | 15 min |
| 3 | Add quick filters | 10 min |
| 4 | Add bug template with mandatory fields | 15 min |
| 5 | Create automation rules 1-7 | 1-2 hours |
| 6 | Add components (product areas) | 15 min |
| 7 | Test: Create test bug, walk through full workflow | 30 min |
| 8 | Test: Escalation to UKCAUD — verify linked ticket creation | 15 min |
| 9 | Test: Enhancement route to UKJPD — verify Idea creation | 15 min |
| 10 | Document board config in context file | 15 min |

**Total estimated effort:** ~3-4 hours

---

## 4. UKCAS → UKJPD Routing (Multi-Source Intake)

Per the already-documented architecture in `CW UKJPD Workflows/plans/ukjpd-multi-source-intake.md`:

```
Customer Bug Report
    → UKCAS (Support Triage)
        ├── L1/L2: Resolved in support
        ├── L3 Code Fix: → UKCAUD Bug (linked)
        ├── L3 Platform: → DIST Request (linked)
        └── Enhancement: → UKJPD Idea (Source=Support)
```

This ensures support-surfaced enhancement requests enter the UKJPD discovery pipeline rather than being lost in the UKCAS backlog.
