import { NextRequest, NextResponse } from "next/server";

const JIRA_BASE = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

// Minimal ADF node → plain text (good enough for display without a full ADF renderer)
function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text") return String(n.text ?? "");
  if (Array.isArray(n.content)) {
    return (n.content as unknown[])
      .map(adfToText)
      .join(n.type === "paragraph" || n.type === "heading" ? "\n" : "");
  }
  return "";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  if (!JIRA_BASE || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    return NextResponse.json(
      { error: "Jira credentials not configured" },
      { status: 503 },
    );
  }

  const { key } = await params;
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString(
    "base64",
  );
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  };

  const [issueRes, commentsRes] = await Promise.all([
    fetch(
      `${JIRA_BASE}/rest/api/3/issue/${key}?fields=summary,status,priority,issuetype,description,subtasks,comment,assignee,reporter,created,updated`,
      { headers, next: { revalidate: 300 } },
    ),
    fetch(
      `${JIRA_BASE}/rest/api/3/issue/${key}/comment?maxResults=5&orderBy=-created`,
      {
        headers,
        next: { revalidate: 300 },
      },
    ),
  ]);

  if (!issueRes.ok) {
    const body = await issueRes.text();
    return NextResponse.json(
      { error: `Jira returned ${issueRes.status}`, detail: body },
      { status: issueRes.status },
    );
  }

  const issue = await issueRes.json();
  const commentsBody = commentsRes.ok
    ? await commentsRes.json()
    : { comments: [] };

  const fields = issue.fields ?? {};

  const subtasks = (fields.subtasks ?? []).map(
    (st: Record<string, unknown>) => ({
      key: st.key,
      summary: (st.fields as Record<string, unknown>)?.summary ?? "",
      status:
        (
          (st.fields as Record<string, unknown>)?.status as Record<
            string,
            unknown
          >
        )?.name ?? "",
    }),
  );

  const comments = (commentsBody.comments ?? []).map(
    (c: Record<string, unknown>) => ({
      id: c.id,
      author: (c.author as Record<string, unknown>)?.displayName ?? "Unknown",
      body: adfToText(c.body),
      created: c.created,
    }),
  );

  return NextResponse.json(
    {
      key,
      summary: fields.summary ?? "",
      status: (fields.status as Record<string, unknown>)?.name ?? "",
      priority: (fields.priority as Record<string, unknown>)?.name ?? "",
      issueType: (fields.issuetype as Record<string, unknown>)?.name ?? "",
      assignee:
        (fields.assignee as Record<string, unknown>)?.displayName ?? null,
      reporter:
        (fields.reporter as Record<string, unknown>)?.displayName ?? null,
      created: fields.created ?? null,
      updated: fields.updated ?? null,
      description: adfToText(fields.description),
      subtasks,
      comments,
      jiraUrl: `${JIRA_BASE}/browse/${key}`,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    },
  );
}
