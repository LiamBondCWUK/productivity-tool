# Internal Presentation Deck

## Description

Generate branded internal presentation decks in markdown. Follows Caseware brand guidelines (League Spartan font, brand colors). Can pull Jira data for progress slides. Uses generic team references (no named individuals).

## Trigger

Run when user says:
- `/deck`
- "create a deck" / "build a presentation" / "internal deck"

## Workflow

### Step 1: Gather Requirements

Ask:
```
What's the deck for?

1. Topic: [what's being presented]
2. Audience: [who's viewing — leadership, team, stakeholders]
3. Meeting goal: [decision needed, alignment, status update, kickoff]
4. Duration: [5 min / 15 min / 30 min]
5. Key content: [specific data, decisions, proposals to include]
```

### Step 2: Pull Data (if applicable)

If the deck topic relates to Jira data:
- Sprint status → pull from `/prep` flow
- Initiative progress → pull from Goals API
- Epic breakdown → pull from Jira

### Step 3: Build Deck

Structure based on duration:
- **5 min:** Title + 3 content slides + closing
- **15 min:** Title + context + 5-7 content slides + next steps
- **30 min:** Title + agenda + context + 8-12 content slides + discussion + next steps

Apply Caseware branding:
- Font: League Spartan (headings), system font (body)
- Colors: from `brand-assets/01_Caseware_Brand_Guides/`
- Logo reference: `brand-assets/02_Caseware_Logo/`

Generic team references only — no named individuals unless explicitly requested.

### Step 4: Output

Save to: `workspace/coordinator/notes/{today}-{topic-slug}.md`

Print inline preview of slide titles + key content.

---

# Markdown to PDF

## Description

Convert a local markdown file to branded PDF using pandoc + typst. Applies Caseware branding (logo, colors, League Spartan font). Opens the result on Windows.

## Trigger

Run when user says:
- `/pdf`
- `/pdf path/to/file.md`
- "convert to PDF" / "make a PDF"

## Arguments

- `filePath` (required): path to the markdown file
- `outputPath` (optional): where to save the PDF (default: same dir, .pdf extension)

## Workflow

### Step 1: Validate Tools

Check pandoc and typst are installed:
```powershell
pandoc --version
typst --version
```

If missing, suggest install:
```
pandoc not found. Install with: winget install JohnMacFarlane.Pandoc
typst not found. Install with: winget install typst
```

### Step 2: Convert

```powershell
pandoc "{filePath}" -o "{outputPath}" --pdf-engine=typst
```

With Caseware branding template if available.

### Step 3: Open

```powershell
start "{outputPath}"
```

### Step 4: Output

```
PDF created: {outputPath}
Opening...
```

---

# Process Raw Input

## Description

Extract key insights from raw content (presentations, transcripts, interviews, notes) and route to appropriate workspace files. Offers to create Jira tickets, log decisions, or hand off to other commands based on content.

## Trigger

Run when user says:
- `/process`
- "process this" / "extract insights from" / "what are the key takeaways"

## Workflow

### Step 1: Identify Content Type

Ask or infer:
```
What type of content is this?
1. Meeting transcript
2. Presentation / slides
3. Interview / user feedback
4. Strategic notes / planning
5. Technical notes
6. Other
```

### Step 2: Accept Content

User pastes raw content into the conversation.

### Step 3: Extract Insights

Analyse and extract:
- **3-5 key insights** — actionable takeaways
- **Decisions made** — any clear decisions with rationale
- **Action items** — tasks that need to happen
- **Strategic implications** — how this affects product direction
- **Customer feedback** — any user/customer signals

### Step 4: Route Insights

For each insight, determine routing:

| Insight Type | Destination |
|-------------|-------------|
| Strategic decision | `workspace/coordinator/decision-log.md` |
| Initiative-specific insight | `workspace/initiatives/{dir}/context.md` |
| Customer feedback | `workspace/strategy/key-customers.md` |
| Product strategy signal | `workspace/strategy/product-strategy.md` |
| Action item (Jira-worthy) | Offer `/ticket` creation |
| Goal-relevant | Offer to log against Atlassian Goal |
| New feature need | Offer `/discover` → Ticket Factory |

### Step 5: Confirm and Apply

```
Extracted {N} insights from {content type}:

1. [Insight] → route to: {destination}
2. [Insight] → route to: {destination}
3. [Action item] → create Jira ticket? (y/n)

Apply routing? (all / review each / cancel)
```

### Step 6: Output

```
Processed {content type}:
- {N} insights routed to workspace files
- {N} action items created as Jira tickets
- {N} decisions logged
```
