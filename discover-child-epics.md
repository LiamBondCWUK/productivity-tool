# Discover Child Epics Skill

When you need to find ALL child epics under a Jira initiative, use this proven method.

## Problem

Jira REST API doesn't reliably expose parent-child epic hierarchy:
- `fields.subtasks[]` is EMPTY for Initiative-type issues
- `fields.issuelinks[]` only shows explicitly linked epics (misses many parent-child relationships)
- JQL search works but requires full API access and may miss epics without parent field set

## Solution: Reverse Lookup from Existing JSON Files

**Best Method**: Analyze epic JSON files to extract parent relationships.

### Step 1: Run the Analysis Script

```bash
node scripts/analyze-epic-hierarchy.mjs
```

This script:
1. Reads all `content/raw/jira-*.json` files
2. Filters for Epic-type issues
3. Extracts `fields.parent.key` from each epic
4. Groups epics by parent initiative
5. Saves complete hierarchy to `content/raw/epic-hierarchy.json`

### Step 2: Review the Output

Check the analysis results:
```bash
cat content/raw/epic-hierarchy.json | jq '.initiatives[] | {key, summary, childEpicCount, childEpics: [.childEpics[].key]}'
```

Or review the console output from Step 1 which shows:
- Total initiatives and epics
- Child epic count per initiative
- Epics with/without parent field
- Warnings for epics lacking parent field

### Step 3: Verify Against Jira UI (Optional)

If epic counts seem incorrect or incomplete:
1. Open the initiative issue in Jira UI (e.g., browse to AI-909)
2. Expand the "Child issues" section
3. Count epics shown in the UI
4. Compare against the analysis output
5. If counts differ, investigate discrepancies

### Step 4: Fetch Missing Epics

If you discover epics in Jira UI that aren't in the JSON files:

```bash
# Update scripts/fetch-missing-epics.mjs with the missing epic keys
# Then run:
node scripts/fetch-missing-epics.mjs
```

Or use MCP tools to fetch individual epics:
```javascript
mcp__atlassian__jira_get_issue({
  issueKey: "AI-1018"
})
```

### Step 5: Update Documentation

After verifying epic hierarchy:
1. Update `initiatives/{name}/epics.md` with correct epic counts
2. Update `initiatives/{name}/context.md` Child Epics summary
3. Log discovery in `context.md` Recent Decisions section

## When to Use This

- **After fetching new initiatives**: Run analysis to discover child epics
- **Before documenting epics**: Verify you have complete epic list
- **When counts seem wrong**: Epic counts in documentation don't match expectations
- **Periodic validation**: Re-run monthly to catch new epics

## Why This Works

The `fields.parent` field in epic JSON files is the **source of truth** for parent-child relationships. This reverse lookup method:
- ✅ Finds all epics with parent field set (true children)
- ✅ Works with existing data (no additional API calls)
- ✅ Identifies epics without parent field (relationship issues)
- ✅ Fast and reliable

Limitations:
- ❌ Won't find epics not yet fetched
- ❌ Won't find epics with incorrect/missing parent field

## Fallback Method: Jira UI + Manual Fetch

If reverse lookup gives incomplete results:

1. Open initiative in Jira UI
2. Screenshot or manually list child epics
3. Fetch each epic by key using MCP or fetch script
4. Save JSON files to `content/raw/`
5. Re-run analysis script to verify

## Example Output

```
📋 Epic Hierarchy by Initiative:

AI-909: Engagement Intelligence - CWX Launch to Production
Status: To Do
Child Epics: 4

  ├─ AI-1018: Let users guide AiDA to the right context
  │  Status: To Do

  ├─ AI-1019: AiDA proactive guidance
  │  Status: To Do

  ├─ AI-1057: AiDA Usage Caps
  │  Status: To Do

  ├─ AI-1058: AiDA Reliability & Response Quality
  │  Status: To Do
```

## Lessons Learned (2026-02-10)

- Initial method using `issuelinks[]` found only 13 epics; reverse lookup found 17
- AI-909 had 4 child epics, not 2 (AI-606 and AI-897 belonged to AI-536)
- AI-312 had 1 child epic, not 3 (AI-884 and AI-910 lacked parent field)
- AI-536 initiative was discovered via reverse lookup (was not in initial fetch)
- Always verify epic counts against Jira UI if numbers seem low

## Related Files

- `scripts/analyze-epic-hierarchy.mjs` - Main analysis script
- `content/raw/epic-hierarchy.json` - Generated hierarchy data
- `CLAUDE.md` - Epic discovery pattern documentation
- `initiatives/{name}/epics.md` - Epic tracking per initiative

---

**Last Updated**: 2026-02-10
**Method**: Reverse lookup from epic parent fields (most reliable)
