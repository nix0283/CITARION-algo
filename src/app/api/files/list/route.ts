import { NextRequest, NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";

const DOWNLOAD_DIR = "/home/z/my-project/download";
const UPLOAD_DIR = "/home/z/my-project/upload";

interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
  type: "file" | "folder";
  ext?: string;
}

async function getFilesInDir(dirPath: string): Promise<FileInfo[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files: FileInfo[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        files.push({
          name: entry.name,
          path: fullPath,
          size: 0,
          modified: "",
          type: "folder",
        });
      } else {
        const stats = await stat(fullPath);
        const ext = path.extname(entry.name).toLowerCase();
        
        files.push({
          name: entry.name,
          path: fullPath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          type: "file",
          ext,
        });
      }
    }

    // Sort: folders first, then files by name
    return files.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
    return [];
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dir = searchParams.get("dir") || "all";

    let downloadFiles: FileInfo[] = [];
    let uploadFiles: FileInfo[] = [];

    if (dir === "download" || dir === "all") {
      downloadFiles = await getFilesInDir(DOWNLOAD_DIR);
    }

    if (dir === "upload" || dir === "all") {
      uploadFiles = await getFilesInDir(UPLOAD_DIR);
    }

    // Calculate totals
    const downloadStats = {
      totalFiles: downloadFiles.filter(f => f.type === "file").length,
      totalSize: downloadFiles.reduce((sum, f) => sum + f.size, 0),
    };

    const uploadStats = {
      totalFiles: uploadFiles.filter(f => f.type === "file").length,
      totalSize: uploadFiles.reduce((sum, f) => sum + f.size, 0),
    };

    return NextResponse.json({
      download: {
        path: DOWNLOAD_DIR,
        files: downloadFiles,
        stats: {
          ...downloadStats,
          totalSizeFormatted: formatSize(downloadStats.totalSize),
        },
      },
      upload: {
        path: UPLOAD_DIR,
        files: uploadFiles,
        stats: {
          ...uploadStats,
          totalSizeFormatted: formatSize(uploadStats.totalSize),
        },
      },
    });
  } catch (error) {
    console.error("List files error:", error);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}
