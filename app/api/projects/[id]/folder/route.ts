export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getProject } from "@/lib/projects";

type RouteContext = { params: Promise<{ id: string }> };

function resolveFolderPath(
  projectFolder: string,
  relPath: string,
): string | null {
  const resolved = path.resolve(projectFolder, relPath);
  if (
    !resolved.startsWith(path.resolve(projectFolder) + path.sep) &&
    resolved !== path.resolve(projectFolder)
  ) {
    return null;
  }
  return resolved;
}

/**
 * POST /api/projects/:id/folder?path=<relative-path>
 * Creates a new directory inside the project folder.
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

  const relPath = req.nextUrl.searchParams.get("path");
  if (!relPath) {
    return NextResponse.json({ error: "Missing path param" }, { status: 400 });
  }

  const absPath = resolveFolderPath(project.folderPath, relPath);
  if (!absPath) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (fs.existsSync(absPath)) {
    return NextResponse.json({ error: "Folder already exists" }, { status: 409 });
  }

  try {
    fs.mkdirSync(absPath, { recursive: true });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
