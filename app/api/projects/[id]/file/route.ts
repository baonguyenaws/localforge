export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getProject } from "@/lib/projects";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB — refuse to load huge binaries

function resolveFilePath(
  folderPath: string,
  relPath: string,
): string | null {
  // Prevent path traversal: resolve the canonical path and ensure it stays
  // inside the project folder.
  const resolved = path.resolve(folderPath, relPath);
  if (!resolved.startsWith(path.resolve(folderPath) + path.sep) &&
      resolved !== path.resolve(folderPath)) {
    return null;
  }
  return resolved;
}

/**
 * GET /api/projects/:id/file?path=<relative-path>
 * Returns the text content of a file inside the project folder.
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
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

  const absPath = resolveFilePath(project.folderPath, relPath);
  if (!absPath) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const size = fs.statSync(absPath).size;
  if (size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large (${(size / 1024).toFixed(0)} KB). Max 2 MB.` },
      { status: 413 },
    );
  }

  try {
    const content = fs.readFileSync(absPath, "utf-8");
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}

/**
 * PUT /api/projects/:id/file?path=<relative-path>
 * Overwrites a file inside the project folder with the provided content.
 * Body: { content: string }
 */
export async function PUT(req: NextRequest, ctx: RouteContext) {
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

  const absPath = resolveFilePath(project.folderPath, relPath);
  if (!absPath) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Only allow editing files that already exist — don't create new paths via API
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  let body: { content?: string };
  try {
    body = await req.json() as { content?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "Missing content field" }, { status: 400 });
  }

  try {
    fs.writeFileSync(absPath, body.content, "utf-8");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to write file" }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/:id/file?path=<relative-path>
 * Permanently deletes a file inside the project folder.
 */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
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

  const absPath = resolveFilePath(project.folderPath, relPath);
  if (!absPath) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    fs.unlinkSync(absPath);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
