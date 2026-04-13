import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readDashboardData, writeDashboardData } from '../../../lib/dashboardData';
import type { ProjectPhase, ProjectEntry } from '../../../types/dashboard';

export const dynamic = 'force-dynamic';

function removeUtf8Bom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export async function GET() {
  const registryPath = join(process.cwd(), '..', 'workspace', 'coordinator', 'project-registry.json');
  try {
    const raw = removeUtf8Bom(readFileSync(registryPath, 'utf-8'));
    const registry = JSON.parse(raw) as { updatedAt: string; projects: ProjectEntry[] };
    return NextResponse.json(registry);
  } catch {
    return NextResponse.json({ updatedAt: null, projects: [] });
  }
}

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
