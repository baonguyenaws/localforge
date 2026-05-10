export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getProject } from "@/lib/projects";

export type FileNode = {
  name: string;
  path: string; // relative to project root
  type: "file" | "directory";
  children?: FileNode[];
};

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  ".cache",
  "coverage",
  ".nyc_output",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  ".eggs",
  "*.egg-info",
  ".DS_Store",
  "out",
]);

const MAX_DEPTH = 5;
const MAX_ENTRIES_PER_DIR = 200;

function readTree(
  absPath: string,
  relPath: string,
  depth: number,
): FileNode[] {
  if (depth > MAX_DEPTH) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absPath, { withFileTypes: true });
  } catch {
    return [];
  }

  // Dirs first, then files, both sorted alphabetically
  const dirs = entries
    .filter((e) => e.isDirectory() && !IGNORE_DIRS.has(e.name) && !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_ENTRIES_PER_DIR);

  const files = entries
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_ENTRIES_PER_DIR);

  const nodes: FileNode[] = [];

  for (const d of dirs) {
    const childRel = relPath ? `${relPath}/${d.name}` : d.name;
    const childAbs = path.join(absPath, d.name);
    nodes.push({
      name: d.name,
      path: childRel,
      type: "directory",
      children: readTree(childAbs, childRel, depth + 1),
    });
  }

  for (const f of files) {
    const childRel = relPath ? `${relPath}/${f.name}` : f.name;
    nodes.push({
      name: f.name,
      path: childRel,
      type: "file",
    });
  }

  return nodes;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const project = getProject(numericId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const folderPath = project.folderPath;
  if (!folderPath || !fs.existsSync(folderPath)) {
    return NextResponse.json({ tree: [] });
  }

  const tree = readTree(folderPath, "", 0);
  return NextResponse.json({ tree });
}
