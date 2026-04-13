import { NextResponse } from "next/server";
import {
  readDashboardData,
  writeDashboardData,
} from "../../../../lib/dashboardData";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id } = body as { id?: string };

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'id' field" },
        { status: 400 },
      );
    }

    const data = readDashboardData();

    // Mark in recommendedInstalls
    const install = data.recommendedInstalls?.items?.find((i) => i.id === id);
    if (!install) {
      return NextResponse.json(
        { error: `Install "${id}" not found` },
        { status: 404 },
      );
    }

    // Update status immutably
    const updatedItems = data.recommendedInstalls.items.map((i) =>
      i.id === id ? { ...i, status: "INSTALLED" as const } : i,
    );

    const updatedData = {
      ...data,
      recommendedInstalls: {
        ...data.recommendedInstalls,
        items: updatedItems,
      },
    };

    // Also remove from priorityInbox.aiSuggested if present
    const setupId = `setup-${id}`;
    const filteredAiSuggested = (
      updatedData.priorityInbox?.aiSuggested ?? []
    ).filter((item) => item.id !== setupId && item.id !== id);

    updatedData.priorityInbox = {
      ...updatedData.priorityInbox,
      aiSuggested: filteredAiSuggested,
    };

    writeDashboardData(updatedData);

    return NextResponse.json({
      success: true,
      name: install.name,
      status: "INSTALLED",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to mark install" },
      { status: 500 },
    );
  }
}
