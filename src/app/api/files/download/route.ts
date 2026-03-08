import { NextRequest, NextResponse } from "next/server";
import { readFile, access } from "fs/promises";
import { constants } from "fs";
import path from "path";

const DOWNLOAD_DIR = "/home/z/my-project/download";
const UPLOAD_DIR = "/home/z/my-project/upload";

// Allowed directories for security
const ALLOWED_DIRS = [DOWNLOAD_DIR, UPLOAD_DIR];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }

    // Security check - ensure path is within allowed directories
    const resolvedPath = path.resolve(filePath);
    const isAllowed = ALLOWED_DIRS.some(dir => resolvedPath.startsWith(dir));

    if (!isAllowed) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if file exists
    try {
      await access(resolvedPath, constants.R_OK);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Read file
    const fileBuffer = await readFile(resolvedPath);
    const fileName = path.basename(resolvedPath);

    // Determine content type
    const contentType = getContentType(fileName);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}

function getContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".json": "application/json",
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".js": "application/javascript",
    ".ts": "application/typescript",
  };

  return contentTypes[ext] || "application/octet-stream";
}
