export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exec } from "node:child_process";
import { getProject } from "@/lib/projects";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/terminal
 * Executes a shell command in the project's folder.
 * Body: { command: string }
 * Returns: { stdout: string; stderr: string; exitCode: number }
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const project = getProject(numericId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: { command?: string };
  try {
    body = (await req.json()) as { command?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const command = body.command?.trim();
  if (!command) {
    return NextResponse.json({ error: "Missing command" }, { status: 400 });
  }

  return new Promise<NextResponse>((resolve) => {
    exec(
      command,
      { cwd: project.folderPath, timeout: 30_000, maxBuffer: 1024 * 512 },
      (error, stdout, stderr) => {
        resolve(
          NextResponse.json({
            stdout,
            stderr,
            exitCode: error ? (error.code ?? 1) : 0,
          }),
        );
      },
    );
  });
}
