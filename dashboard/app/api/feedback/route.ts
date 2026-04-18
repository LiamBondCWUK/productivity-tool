import { NextRequest, NextResponse } from "next/server";
import { readDashboardData, writeDashboardData } from "../../../lib/dashboardData";
import type { FeedbackItem, FeedbackStatus } from "../../../types/dashboard";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const data = readDashboardData();
  return NextResponse.json(data.feedback ?? { items: [] }, { headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const text = String(body.text ?? "").trim();
  const source = String(body.source ?? "manual").trim();

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const data = readDashboardData();
  if (!data.feedback) {
    data.feedback = { items: [] };
  }

  const item: FeedbackItem = {
    id: `fb-${Date.now()}`,
    text,
    source,
    status: "inbox",
    createdAt: new Date().toISOString(),
  };

  data.feedback.items.unshift(item);
  writeDashboardData(data);

  return NextResponse.json(item, { status: 201, headers: CORS_HEADERS });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const id = String(body.id ?? "").trim();
  const status = body.status as FeedbackStatus;

  if (!id || !["inbox", "accepted", "denied"].includes(status)) {
    return NextResponse.json({ error: "id and valid status required" }, { status: 400, headers: CORS_HEADERS });
  }

  const data = readDashboardData();
  if (!data.feedback) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const item = data.feedback.items.find((i) => i.id === id);
  if (!item) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  item.status = status;
  writeDashboardData(data);

  return NextResponse.json(item, { headers: CORS_HEADERS });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const data = readDashboardData();
  if (!data.feedback) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  data.feedback.items = data.feedback.items.filter((i) => i.id !== id);
  writeDashboardData(data);

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
