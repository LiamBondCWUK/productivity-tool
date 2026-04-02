import { NextRequest, NextResponse } from "next/server";
import {
  readDashboardData,
  writeDashboardData,
} from "../../../lib/dashboardData";
import type { ProjectPhase } from "../../../types/dashboard";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    projectId: string;
    phase: ProjectPhase;
  };
  const { projectId, phase } = body;

  const data = readDashboardData();
  const updatedProjects = data.personalProjects.projects.map((project) =>
    project.id === projectId ? { ...project, phase } : project,
  );

  const updated = {
    ...data,
    personalProjects: {
      ...data.personalProjects,
      projects: updatedProjects,
    },
  };

  writeDashboardData(updated);
  return NextResponse.json({ ok: true });
}
