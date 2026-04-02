# Weekly Todo Review Skill

## Description

Reviews completed work across all initiatives, prompts user to add impact statements, generates IBP-formatted weekly summary, archives the current week, and sets up next week's planning files.

Run this skill on **Friday afternoon** to close out the week.

## Usage

```bash
/weekly-todo-review
```

No parameters required. The skill automatically discovers all initiative todos and the coordinator plan.

## Workflow

### Step 1: Discover Current Week Files

Read the following files to gather current week context:

- `C:/Users/liam.bond/Documents/Productivity Tool/workspace/coordinator/weekly-plan.md`
- `C:/Users/liam.bond/Documents/Productivity Tool/workspace/coordinator/daily-log.md`
- `C:/Users/liam.bond/Documents/Productivity Tool/workspace/initiatives/ukcaud/weekly-todos.md`
- `C:/Users/liam.bond/Documents/Productivity Tool/workspace/initiatives/ukcas/weekly-todos.md`
- `C:/Users/liam.bond/Documents/Productivity Tool/workspace/initiatives/dist/weekly-todos.md`

Parse each file to extract:

- Week start/end dates from metadata section
- Completed items (checked checkboxes: `- [x]`)
- In progress items (for carryover to next week)
- Blocked items (for escalation tracking)

### Step 2: Extract Completed Work

For each file, identify completed items by searching for `- [x]` patterns.

**Example extraction**:

```markdown
From initiatives/ukcaud/weekly-todos.md:

- [x] Create Agentic UKCAUD Beta initiative (Jira + Confluence)
- [x] Review document ingest tickets and identify missing stories

From initiatives/ukcas/weekly-todos.md:

- [x] Check with team on UKCAS Figma (UKCAUD-1036)

From initiatives/dist/weekly-todos.md:

- [x] Document Shared Auth v2.0 migration guide
```

### Step 2.5: Synthesize Daily Log

Read `coordinator/daily-log.md` and extract content from all entries for the current week.

**What to extract from each entry type**:

- **Morning entries**: Today's focus areas (signals what was planned)
- **Evening entries**: "Accomplished" and "IBP-notable" fields (signals what actually happened)
- **Ad-hoc entries**: Any notable mid-day captures

**Group extracted content by initiative** (Cross-Cutting, UKCAUD, UKCAS, DIST) by reading the context of each entry. If an entry mentions a specific initiative, assign it there. Otherwise, assign to Cross-Cutting.

**Draft pre-populated Wins & Impact bullets** using the daily log content:

- Pull from "IBP-notable" fields first (highest signal)
- Supplement with "Accomplished" fields from evening entries
- Merge with completed todo items from Step 2
- Write each bullet in **narrative style**: accomplishment + implicit value, no `→ Impact:` separator

**Example synthesis**:

```
Daily log evening entries contained:
- 2026-02-24: "UKCAS citations release shipped, 81% baseline established"
- 2026-02-25: "Re-engaged alpha/beta partner" (IBP-notable)
- 2026-02-26: "Held QA/Dev/Product agentic quality session, booked weekly CoE sync"

Draft bullets:
UKCAS:
- UKCAS citations release shipped + 81% suggestion accuracy baseline established
- Re-engaged alpha/beta partner for UKCAS Canada launch

Cross-Cutting:
- Held agentic quality QA/Dev/Product session + booked weekly CoE sync
```

**If daily-log.md is empty or doesn't exist**:
Skip this step and proceed to Step 3 prompt (will rely on user input only).

### Step 2.7: Commitment Completion Assessment

After synthesizing the daily log (Step 2.5), assess weekly commitment completion:

1. Load "🔥 This Week: Top Priorities" from `coordinator/weekly-plan.md` — extract all `**bold text**` items as commitment names (the numbered, bolded items under each initiative subsection).
2. For each commitment, cross-reference against:
   - Completed todo items (Step 2)
   - Daily log accomplishments (Step 2.5)
   - "Weekly commitment progress" entries from evening log entries
3. Assign each a status: ✅ Done / 🟡 Partially done / 🔴 Not done / ↗️ Carried to next week
4. Calculate completion rate

**Include in the Step 3 draft output** (before the Wins & Impact bullets):

```
📊 Commitment Tracking:
- Committed: N items
- Completed: N (X%)
- Partially done: N
- Carried to next week: N
- Not done: N

Items carried forward:
- [Item] — reason for carry, plan for next week
```

**Carry-forward handling**: Items marked ↗️ should be pre-populated as the first items in next week's "🔥 This Week: Top Priorities" section (in Step 7), with context about why they were carried. Format:

```markdown
1. **[Carried item name]** _(carried from last week: [brief reason])_ — [original description]
```

### Step 3: Present Draft and Collect User Input

Present the pre-populated draft to the user for review and editing:

```
📋 Here's a draft "Wins & Impact" for the week based on your daily log and completed todos.
Review, edit, or add anything missing:

### Cross-Cutting Work
- [pre-populated narrative bullet]
- [pre-populated narrative bullet]

### UKCAUD
- [pre-populated narrative bullet]

### UKCAS
- [pre-populated narrative bullet]

### DIST
- [pre-populated narrative bullet]

---

Add, remove, or rephrase any bullets. Type "done" when ready, or paste revised bullets.
(Add new bullets in the format: "[initiative]: [bullet text]")
```

If no daily log content exists, use the original prompt approach:

```
📋 No daily log entries found. Let's build the Wins & Impact section from scratch.
What were the key accomplishments this week? (Group by initiative, one per line)
```

**Accept any format from the user** — don't require structured input.

### Step 4: Categorize Accomplishments

Group completed items by initiative and cross-cutting work:

**Cross-Cutting Work** (if applicable):

- Items that affect multiple initiatives
- Foundational work (workspace setup, documentation, architecture)
- Strategic decisions or planning

**Initiative-Specific Work**:

- **UKCAS**: Items from `initiatives/ukcas/weekly-todos.md`
- **UKCAUD**: Items from `initiatives/ukcaud/weekly-todos.md`
- **DIST**: Items from `initiatives/dist/weekly-todos.md`
- **UKJPD**: Items related to UK JPD product discovery (if present)

### Step 5: Generate IBP "Wins & Impact" Section

Build the "🚀 Current Week: Wins & Impact" section in IBP format using the user-reviewed content from Step 3.

```markdown
## 🚀 Current Week: Wins & Impact

### Cross-Cutting Work

- [Narrative bullet: accomplishment + implicit value inline]
- [Narrative bullet]

### UKCAUD

- [Narrative bullet]

### UKCAS

- [Narrative bullet]

### DIST

- [Narrative bullet]
```

**Format Rules**:

- **Narrative style**: Each bullet reads as a status update — what happened AND its significance are in one sentence
- No `→ Impact:` separator — weave accomplishment and value together naturally
- Bold is used sparingly (for names or initiative labels), not for every word
- Skip sections with no content
- Group by initiative

**Good example** (narrative):

```
- UKCAS citations release shipped — 81% suggestion accuracy baseline established
- Re-engaged alpha/beta partner for UKCAS & UKCAUD Canada launch
- Held agentic quality QA/Dev/Product session + booked weekly CoE sync to sustain momentum
```

**Bad example** (old format — avoid):

```
- **Ship UKCAS citations** → Impact: Enabled beta baseline measurement
```

### Step 6: Archive Current Week Files

Create archive directories if they don't exist:

```bash
mkdir -p coordinator/archive
mkdir -p initiatives/ukcaud/archive
mkdir -p initiatives/ukcas/archive
mkdir -p initiatives/dist/archive
```

Extract week start date from file metadata (format: `Week Start: YYYY-MM-DD`).

Copy files to archive with date prefix:

```bash
# Archive coordinator plan
cp coordinator/weekly-plan.md \
   coordinator/archive/weekly-plan-YYYY-MM-DD.md

# Archive daily log
cp coordinator/daily-log.md \
   coordinator/archive/daily-log-YYYY-MM-DD.md

# Archive initiative todos
cp initiatives/ukcaud/weekly-todos.md \
   initiatives/ukcaud/archive/weekly-todos-YYYY-MM-DD.md

cp initiatives/ukcas/weekly-todos.md \
   initiatives/ukcas/archive/weekly-todos-YYYY-MM-DD.md

cp initiatives/dist/weekly-todos.md \
   initiatives/dist/archive/weekly-todos-YYYY-MM-DD.md
```

**Archive Naming Convention**: `{type}-YYYY-MM-DD.md` where date is the **Monday** of that week.

**Reset daily-log.md** after archiving — replace with a fresh template for next week:

```markdown
# Daily Log - Week of YYYY-MM-DD

Week: YYYY-MM-DD → YYYY-MM-DD

---
```

Use next Monday as the week start date.

**Note**: Archives are read-only snapshots. Never edit archived files.

### Step 7: Update Coordinator Plan with IBP Format

Read the current `coordinator/weekly-plan.md` file.

**Transform to IBP format**:

1. **Replace or add "🚀 Current Week: Wins & Impact" section** with generated content from Step 5
2. **Move current "🔥 This Week: Top Priorities" into "🚀 Last Week" position** (these were this week's targets)
3. **Clear "🔥 This Week: Top Priorities" section** for user to fill in during Monday planning
4. **Update blockers**:
   - Remove resolved blockers (those that were completed this week)
   - Carry over unresolved blockers to next week
   - Update status on informational blockers
5. **Update "🔮 Looking Ahead" section** if any milestones passed
6. **Update metadata**:
   - Week Start: [Next Monday's date]
   - Week End: [Next Friday's date]
   - Created By: Coordinator Agent (via /weekly-todo-review)

**Example IBP Structure** (full template):

```markdown
# Cross-Initiative Weekly Plan - Week of YYYY-MM-DD

## 🔥 This Week: Top Priorities

### Cross-Cutting Work

[Cleared - to be filled during Monday planning]

### UKCAUD

[Cleared - to be filled during Monday planning]

### UKCAS

[Cleared - to be filled during Monday planning]

### DIST

[Cleared - to be filled during Monday planning]

---

## 🚀 Last Week: Wins & Impact (Mon DD–DD)

### Cross-Cutting Work

[Generated narrative bullets from Step 5]

### UKCAUD

[Generated narrative bullets]

### UKCAS

[Generated narrative bullets]

### DIST

[Generated narrative bullets]

---

## ⚠️ Issues / Blockers

### Critical (Blocking Work)

[Carried over from last week if unresolved]

### Informational (Monitoring)

[Updated status from last week]

---

## 🔮 Looking Ahead

- **[Date]**: [Major milestone] — [Jira link] / [one-pager link]
  [Maintained from last week, updated if milestones passed]
```

### Step 8: Update Initiative Todos

For each initiative file (`initiatives/{name}/weekly-todos.md`):

1. **Move completed items to "Completed This Week ✅" section** with impact statements:

   ```markdown
   ## Completed This Week ✅

   - [x] **[Task description]** - [Related Jira: UKCAUD-XXX]
     - **Impact**: [User-provided impact from Step 3]
     - Completed: YYYY-MM-DD
   ```

2. **Promote "In Progress" items to "Priorities"** if still relevant:
   - Move uncompleted in-progress items to next week's priorities
   - Update status notes if applicable

3. **Clear old priorities** that are done or no longer relevant

4. **Add "This Week's Focus" section** (cleared for Monday planning):

   ```markdown
   ## 📋 This Week's Focus

   [To be filled during Monday planning session]
   ```

5. **Carry over "Blocked" items** with updated status:

   ```markdown
   ## Blocked

   - [ ] **[Task]** - [Related Jira: UKCAUD-XXX]
     - Blocker: [Description]
     - Waiting On: [Person/Team]
     - Escalation Path: [If not resolved by date]
   ```

6. **Update metadata**:
   - Week Start: [Next Monday]
   - Week End: [Next Friday]
   - Last Updated: [Today's date]

**Example transformed file**:

```markdown
# UKCAUD Weekly Todos - Week of 2026-02-16

## 📋 This Week's Focus

[To be filled during Monday planning - describe this week's focus in 1-2 sentences]

## Priorities (Ranked)

[Cleared - to be filled during Monday planning with P1, P2, P3 tasks]

## In Progress

[Carried over from last week if items still in progress]

## Completed Last Week ✅

- [x] **Create Agentic UKCAUD Beta initiative** - [Related Jira: UKCAUD-XXXX]
  - **Impact**: Enables March 25 beta launch, defines scope and success criteria
  - Completed: 2026-02-10

- [x] **Review document ingest tickets**
  - **Impact**: Identified 3 missing stories for Q1, prioritized backlog refinement
  - Completed: 2026-02-11

## Blocked

[Carried over if any items are still blocked]

## Notes

[Cleared - available for context notes during the week]

---

**Week Start**: 2026-02-16
**Week End**: 2026-02-21
**Last Updated**: 2026-02-14
```

### Step 9: Generate Summary Report

Display final summary for user:

```
✅ Weekly Review Complete!

📊 This Week's Summary (Week of YYYY-MM-DD):

**Total Completed**: X items across all initiatives
  - Cross-Cutting: X items
  - UKCAUD: X items
  - UKCAS: X items
  - DIST: X items

**Impact Statements Collected**: X/X (100%)

📁 Archived:
  ✅ coordinator/archive/weekly-plan-YYYY-MM-DD.md
  ✅ coordinator/archive/daily-log-YYYY-MM-DD.md
  ✅ initiatives/ukcaud/archive/weekly-todos-YYYY-MM-DD.md
  ✅ initiatives/ukcas/archive/weekly-todos-YYYY-MM-DD.md
  ✅ initiatives/dist/archive/weekly-todos-YYYY-MM-DD.md

📝 Updated for Next Week (Week of YYYY-MM-DD):
  ✅ coordinator/weekly-plan.md (IBP format applied)
  ✅ coordinator/daily-log.md (reset for next week)
  ✅ initiatives/ukcaud/weekly-todos.md
  ✅ initiatives/ukcas/weekly-todos.md
  ✅ initiatives/dist/weekly-todos.md

⚠️ Blockers Carried Over:
  - Critical: X items
  - Informational: X items

🎯 Next Steps:
1. Review coordinator/weekly-plan.md "🔥 This Week: Top Priorities" section
2. Fill in priorities for Week of YYYY-MM-DD (Sunday/Monday planning)
3. Run `/weekly-todo-review` again next Friday (YYYY-MM-DD)

📧 IBP Summary Ready:
Your IBP-formatted "Current Week: Wins & Impact" section is now in:
coordinator/weekly-plan.md

This summary is ready to share with your org and boss! 🚀
```

## Error Handling

### Error: Week Start Date Not Found

If `Week Start: YYYY-MM-DD` metadata is missing from files:

```
❌ Error: Could not determine week start date from coordinator/weekly-plan.md

Please ensure the file contains:
---
Week Start: YYYY-MM-DD
Week End: YYYY-MM-DD
---

Add this metadata to the file and re-run /weekly-todo-review.
```

### Error: No Completed Items Found

If no checked checkboxes (`- [x]`) found across all files:

```
⚠️  No completed items found this week.

This could mean:
1. Work is still in progress (will carry over to next week)
2. Checkboxes not marked as completed in weekly-todos.md files
3. First week of workspace setup (expected)

Proceed with archival and next week setup anyway? (yes/no)
```

If user selects "yes", continue with empty "Wins & Impact" section.

### Error: Archive Directory Creation Failed

If mkdir fails:

```
❌ Error creating archive directory: [error message]

Please check:
1. File system permissions
2. Disk space available
3. Path is correct

Retry creating archives? (yes/no)
```

### Error: Invalid Impact Statement

If user provides generic impact:

```
⚠️  Impact statement seems generic: "Completed the task"

Good impact statements explain business value:
- "Enabled March 25 beta launch"
- "Identified 3 missing stories"
- "Unblocked UKCAUD Beta initiative"

Please provide a more specific impact statement, or type "skip" to fill later:
```

## Integration with Other Skills

### With `/update-milestone`

When milestones are updated during the week, note in weekly-todos.md:

```markdown
- [x] Updated UKCAUD-909 target date to May 21 - [Jira: UKCAUD-909]
```

During weekly review, impact template:

```
Impact: Aligned UK delivery with GA readiness
```

### With `/check-updates`

Recommended pattern before weekly review:

```bash
/check-updates --all
/weekly-todo-review
```

This ensures Jira/Confluence data is fresh before archiving.

### With Task List

The coordinator creates tasks from "Next Week: Top Priorities" on Monday. When agents complete tasks in the shared list, they should also mark corresponding items in weekly-todos.md as complete. The weekly review cross-references both sources for completeness.

## Best Practices

### For Users

1. **Run on Friday afternoons** - End of week timing allows you to reflect on accomplishments
2. **Be specific with impact statements** - Explain business value, not just activity
3. **Review archived files periodically** - Track momentum and velocity trends
4. **Share IBP summary with stakeholders** - The "Wins & Impact" section is ready for leadership

### For Agents

1. **Mark items complete during the week** - Don't wait until Friday to check boxes
2. **Update "In Progress" status** - Keep stakeholders informed of current work
3. **Log blockers immediately** - Don't wait for Friday review to escalate
4. **Link Jira issues** - Include `[Related Jira: UKCAUD-XXX]` for traceability

## Notes

- **First run migration**: The first time this skill runs, it will transform existing files to IBP format
- **Backward compatibility**: Archived files preserve old format for reference
- **Read-only archives**: Never edit archived files - they are historical snapshots
- **User involvement required**: This skill prompts for user input (impact statements), so it's not fully automated
- **Estimated duration**: 10-15 minutes including user input for impact statements

## Example Session

```bash
$ /weekly-todo-review

📋 Reading current week files...
✅ Found coordinator/weekly-plan.md (Week of 2026-02-09)
✅ Found initiatives/ukcaud/weekly-todos.md
✅ Found initiatives/ukcas/weekly-todos.md
✅ Found initiatives/dist/weekly-todos.md

📋 Extracting completed work...
✅ Found 6 completed items:
  - UKCAUD: 3 items
  - UKCAS: 2 items
  - DIST: 1 item

📋 Please provide impact statements for completed work...

1. UKCAUD: "Create Agentic UKCAUD Beta initiative (Jira + Confluence)"
   Impact: > Enables March 25 beta launch with team, defines scope and success criteria

2. UKCAUD: "Review document ingest tickets and identify missing stories"
   Impact: > Identified 3 missing stories for Q1 backlog, prioritized refinement

[... continues for all items ...]

✅ Impact statements collected! (6/6)

📁 Creating archive directories...
✅ coordinator/archive/ created
✅ initiatives/ukcaud/archive/ created
✅ initiatives/ukcas/archive/ created
✅ initiatives/dist/archive/ created

📁 Archiving current week files...
✅ coordinator/archive/weekly-plan-2026-02-09.md
✅ initiatives/ukcaud/archive/weekly-todos-2026-02-09.md
✅ initiatives/ukcas/archive/weekly-todos-2026-02-09.md
✅ initiatives/dist/archive/weekly-todos-2026-02-09.md

📝 Updating coordinator plan with IBP format...
✅ "🚀 Current Week: Wins & Impact" section generated
✅ "🔥 Next Week: Top Priorities" promoted to current
✅ Metadata updated (Week of 2026-02-16)

📝 Updating initiative todos...
✅ initiatives/ukcaud/weekly-todos.md updated
✅ initiatives/ukcas/weekly-todos.md updated
✅ initiatives/dist/weekly-todos.md updated

✅ Weekly Review Complete!

[Summary report displays as shown in Step 9]
```

---

**Last Updated**: 2026-03-04
**Version**: 1.2 (Added Step 2.7: Commitment Completion Assessment with carry-forward)
