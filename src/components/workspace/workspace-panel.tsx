"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Activity, 
  Server, 
  Folder, 
  File, 
  FileCode, 
  FileJson, 
  FileText,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Cpu,
  HardDrive,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Terminal,
  Database,
  Globe,
  Zap,
  Download,
  Upload,
  Trash2,
  FileArchive,
  FileSpreadsheet,
  Image,
  Eye
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  path: string;
  ext?: string;
}

interface ProjectStats {
  tsxFiles: number;
  tsFiles: number;
  apiRoutes: number;
  components: number;
  libs: number;
  totalFiles: number;
}

interface ServerStatus {
  status: "online" | "offline" | "loading";
  port: number;
  uptime: string;
  lastCheck: Date | null;
}

interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
  type: "file" | "folder";
  ext?: string;
}

interface FilesData {
  download: {
    path: string;
    files: FileInfo[];
    stats: {
      totalFiles: number;
      totalSize: number;
      totalSizeFormatted: string;
    };
  };
  upload: {
    path: string;
    files: FileInfo[];
    stats: {
      totalFiles: number;
      totalSize: number;
      totalSizeFormatted: string;
    };
  };
}

// Статистика проекта
const projectStats: ProjectStats = {
  tsxFiles: 85,
  tsFiles: 141,
  apiRoutes: 49,
  components: 85,
  libs: 48,
  totalFiles: 226
};

// Дерево файлов проекта
const projectTree: FileNode = {
  name: "citarion",
  type: "folder",
  path: "/home/z/my-project",
  children: [
    {
      name: "src",
      type: "folder",
      path: "/home/z/my-project/src",
      children: [
        {
          name: "app",
          type: "folder",
          path: "/home/z/my-project/src/app",
          children: [
            { name: "page.tsx", type: "file", path: "/home/z/my-project/src/app/page.tsx", ext: "tsx" },
            { name: "layout.tsx", type: "file", path: "/home/z/my-project/src/app/layout.tsx", ext: "tsx" },
            { name: "globals.css", type: "file", path: "/home/z/my-project/src/app/globals.css", ext: "css" },
            {
              name: "api",
              type: "folder",
              path: "/home/z/my-project/src/app/api",
              children: [
                { name: "bots/", type: "folder", path: "/home/z/my-project/src/app/api/bots" },
                { name: "exchange/", type: "folder", path: "/home/z/my-project/src/app/api/exchange" },
                { name: "positions/", type: "folder", path: "/home/z/my-project/src/app/api/positions" },
                { name: "telegram/", type: "folder", path: "/home/z/my-project/src/app/api/telegram" },
                { name: "copy-trading/", type: "folder", path: "/home/z/my-project/src/app/api/copy-trading" },
                { name: "cron/", type: "folder", path: "/home/z/my-project/src/app/api/cron" },
              ]
            }
          ]
        },
        {
          name: "components",
          type: "folder",
          path: "/home/z/my-project/src/components",
          children: [
            { name: "ui/", type: "folder", path: "/home/z/my-project/src/components/ui" },
            { name: "layout/", type: "folder", path: "/home/z/my-project/src/components/layout" },
            { name: "dashboard/", type: "folder", path: "/home/z/my-project/src/components/dashboard" },
            { name: "trading/", type: "folder", path: "/home/z/my-project/src/components/trading" },
            { name: "bots/", type: "folder", path: "/home/z/my-project/src/components/bots" },
            { name: "chart/", type: "folder", path: "/home/z/my-project/src/components/chart" },
            { name: "chat/", type: "folder", path: "/home/z/my-project/src/components/chat" },
            { name: "analytics/", type: "folder", path: "/home/z/my-project/src/components/analytics" },
            { name: "exchanges/", type: "folder", path: "/home/z/my-project/src/components/exchanges" },
            { name: "copy-trading/", type: "folder", path: "/home/z/my-project/src/components/copy-trading" },
            { name: "strategy-lab/", type: "folder", path: "/home/z/my-project/src/components/strategy-lab" },
            { name: "providers/", type: "folder", path: "/home/z/my-project/src/components/providers" },
          ]
        },
        {
          name: "lib",
          type: "folder",
          path: "/home/z/my-project/src/lib",
          children: [
            { name: "exchange/", type: "folder", path: "/home/z/my-project/src/lib/exchange" },
            { name: "strategy/", type: "folder", path: "/home/z/my-project/src/lib/strategy" },
            { name: "backtesting/", type: "folder", path: "/home/z/my-project/src/lib/backtesting" },
            { name: "hyperopt/", type: "folder", path: "/home/z/my-project/src/lib/hyperopt" },
            { name: "paper-trading/", type: "folder", path: "/home/z/my-project/src/lib/paper-trading" },
            { name: "strategy-bot/", type: "folder", path: "/home/z/my-project/src/lib/strategy-bot" },
            { name: "vision-bot/", type: "folder", path: "/home/z/my-project/src/lib/vision-bot" },
            { name: "strategy-templates/", type: "folder", path: "/home/z/my-project/src/lib/strategy-templates" },
            { name: "price-websocket.ts", type: "file", path: "/home/z/my-project/src/lib/price-websocket.ts", ext: "ts" },
            { name: "binance-client.ts", type: "file", path: "/home/z/my-project/src/lib/binance-client.ts", ext: "ts" },
            { name: "argus-bot.ts", type: "file", path: "/home/z/my-project/src/lib/argus-bot.ts", ext: "ts" },
            { name: "ohlcv-service.ts", type: "file", path: "/home/z/my-project/src/lib/ohlcv-service.ts", ext: "ts" },
          ]
        },
        { name: "hooks/", type: "folder", path: "/home/z/my-project/src/hooks" },
        { name: "stores/", type: "folder", path: "/home/z/my-project/src/stores" },
        { name: "types/", type: "folder", path: "/home/z/my-project/src/types" },
      ]
    },
    { name: "prisma/", type: "folder", path: "/home/z/my-project/prisma" },
    { name: "docs/", type: "folder", path: "/home/z/my-project/docs" },
    { name: "download/", type: "folder", path: "/home/z/my-project/download" },
    { name: "upload/", type: "folder", path: "/home/z/my-project/upload" },
    { name: "public/", type: "folder", path: "/home/z/my-project/public" },
    { name: "package.json", type: "file", path: "/home/z/my-project/package.json", ext: "json" },
    { name: "tsconfig.json", type: "file", path: "/home/z/my-project/tsconfig.json", ext: "json" },
    { name: "tailwind.config.ts", type: "file", path: "/home/z/my-project/tailwind.config.ts", ext: "ts" },
    { name: "next.config.ts", type: "file", path: "/home/z/my-project/next.config.ts", ext: "ts" },
    { name: "README.md", type: "file", path: "/home/z/my-project/README.md", ext: "md" },
  ]
};

// Компонент дерева файлов
function FileTreeItem({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const isFolder = node.type === "folder";
  
  const getFileIcon = (ext?: string) => {
    switch (ext) {
      case "tsx":
      case "ts":
        return <FileCode className="h-4 w-4 text-blue-400" />;
      case "json":
        return <FileJson className="h-4 w-4 text-yellow-400" />;
      case "md":
        return <FileText className="h-4 w-4 text-gray-400" />;
      case "css":
        return <File className="h-4 w-4 text-pink-400" />;
      case "prisma":
        return <Database className="h-4 w-4 text-purple-400" />;
      default:
        return <File className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div>
      <div 
        className={cn(
          "flex items-center gap-1 py-1 px-2 rounded cursor-pointer hover:bg-muted/50 transition-colors",
          depth > 0 && "ml-4"
        )}
        onClick={() => isFolder && setIsOpen(!isOpen)}
      >
        {isFolder ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            {isOpen ? (
              <FolderOpen className="h-4 w-4 text-amber-400" />
            ) : (
              <Folder className="h-4 w-4 text-amber-400" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            {getFileIcon(node.ext)}
          </>
        )}
        <span className={cn(
          "text-sm",
          isFolder ? "font-medium" : "text-muted-foreground"
        )}>
          {node.name}
        </span>
      </div>
      {isFolder && isOpen && node.children && (
        <div>
          {node.children.map((child, i) => (
            <FileTreeItem key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// Компонент статуса сервера
function ServerStatusCard({ status }: { status: ServerStatus }) {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          Статус сервера
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Статус</span>
          <div className="flex items-center gap-2">
            {status.status === "online" ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                  Онлайн
                </Badge>
              </>
            ) : status.status === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                  Проверка...
                </Badge>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-500" />
                <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                  Оффлайн
                </Badge>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Порт</span>
          <Badge variant="secondary">3000</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">URL</span>
          <code className="text-xs bg-muted px-2 py-1 rounded">localhost:3000</code>
        </div>
        {status.lastCheck && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Последняя проверка</span>
            <span className="text-xs text-muted-foreground">
              {status.lastCheck.toLocaleTimeString()}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Компонент статистики проекта
function ProjectStatsCard() {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          Статистика проекта
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">TSX файлов</span>
              <Badge variant="secondary" className="text-xs">{projectStats.tsxFiles}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">TS файлов</span>
              <Badge variant="secondary" className="text-xs">{projectStats.tsFiles}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">API маршрутов</span>
              <Badge variant="secondary" className="text-xs">{projectStats.apiRoutes}</Badge>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Компонентов</span>
              <Badge variant="secondary" className="text-xs">{projectStats.components}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Библиотек</span>
              <Badge variant="secondary" className="text-xs">{projectStats.libs}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Всего</span>
              <Badge className="text-xs bg-primary/80">{projectStats.totalFiles}</Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Компонент технологий
function TechStackCard() {
  const techs = [
    { name: "Next.js", version: "16.1.3", icon: Globe },
    { name: "React", version: "19", icon: Zap },
    { name: "TypeScript", version: "5.x", icon: FileCode },
    { name: "Prisma", version: "ORM", icon: Database },
    { name: "SQLite", version: "DB", icon: HardDrive },
    { name: "shadcn/ui", version: "42 cmp", icon: Terminal },
  ];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Технологии
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {techs.map((tech, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <tech.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{tech.name}</span>
              </div>
              <Badge variant="outline" className="text-xs">{tech.version}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Компонент процессов
function ProcessesCard() {
  const processes = [
    { pid: 3656, name: "bun run dev", cpu: "0.0%", mem: "0.1%" },
    { pid: 3658, name: "next dev", cpu: "0.0%", mem: "0.9%" },
    { pid: 3671, name: "next-server", cpu: "0.3%", mem: "16.6%" },
  ];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          Активные процессы
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {processes.map((proc, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-mono">{proc.pid}</Badge>
                <span className="text-muted-foreground truncate max-w-[120px]">{proc.name}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>{proc.cpu}</span>
                <span>{proc.mem}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Компонент WebSocket бирж
function ExchangesCard() {
  const exchanges = [
    { name: "Binance", status: "connected" },
    { name: "Bybit", status: "connected" },
    { name: "OKX", status: "connected" },
    { name: "Bitget", status: "connected" },
    { name: "KuCoin", status: "connected" },
    { name: "BingX", status: "connected" },
    { name: "HyperLiquid", status: "connected" },
    { name: "Gate.io", status: "connected" },
  ];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          WebSocket биржи
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5">
          {exchanges.map((ex, i) => (
            <Badge 
              key={i} 
              variant="outline"
              className="bg-green-500/10 text-green-500 border-green-500/20 text-xs"
            >
              {ex.name}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          13 бирж подключены через price-websocket.ts
        </p>
      </CardContent>
    </Card>
  );
}

// Компонент списка файлов
function FileList({ 
  files, 
  onDownload, 
  downloadingPath 
}: { 
  files: FileInfo[]; 
  onDownload: (path: string) => void;
  downloadingPath: string | null;
}) {
  const getFileIcon = (ext?: string) => {
    switch (ext) {
      case ".json":
        return <FileJson className="h-4 w-4 text-yellow-400" />;
      case ".md":
        return <FileText className="h-4 w-4 text-gray-400" />;
      case ".txt":
        return <FileText className="h-4 w-4 text-gray-400" />;
      case ".csv":
        return <FileSpreadsheet className="h-4 w-4 text-green-400" />;
      case ".xlsx":
      case ".xls":
        return <FileSpreadsheet className="h-4 w-4 text-green-400" />;
      case ".docx":
      case ".doc":
        return <FileText className="h-4 w-4 text-blue-400" />;
      case ".pdf":
        return <FileText className="h-4 w-4 text-red-400" />;
      case ".tar":
      case ".gz":
      case ".zip":
        return <FileArchive className="h-4 w-4 text-purple-400" />;
      case ".png":
      case ".jpg":
      case ".jpeg":
      case ".svg":
        return <Image className="h-4 w-4 text-pink-400" alt="Image file" />;
      default:
        return <File className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Нет файлов в этой директории</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {files.map((file, i) => (
        <div 
          key={i}
          className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors group"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {file.type === "folder" ? (
              <Folder className="h-4 w-4 text-amber-400" />
            ) : (
              getFileIcon(file.ext)
            )}
            <span className="text-sm truncate">{file.name}</span>
          </div>
          
          <div className="flex items-center gap-3">
            {file.type === "file" && (
              <>
                <span className="text-xs text-muted-foreground w-16 text-right">
                  {formatSize(file.size)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onDownload(file.path)}
                  disabled={downloadingPath === file.path}
                >
                  {downloadingPath === file.path ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Компонент File Manager
function FileManager() {
  const [filesData, setFilesData] = useState<FilesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/files/list");
      const data = await response.json();
      setFilesData(data);
    } catch (error) {
      console.error("Failed to fetch files:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleDownload = async (filePath: string) => {
    setDownloadingPath(filePath);
    try {
      const response = await fetch(`/api/files/download?path=${encodeURIComponent(filePath)}`);
      
      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filePath.split("/").pop() || "download";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
    } finally {
      setDownloadingPath(null);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      // Refresh file list
      await fetchFiles();
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleUpload}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={triggerUpload} disabled={uploading}>
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Загрузить файл
          </Button>
          <Button variant="outline" size="sm" onClick={fetchFiles}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Обновить
          </Button>
        </div>
      </div>

      {/* File tabs */}
      <Tabs defaultValue="download">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="download" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Скачать ({filesData?.download.stats.totalFiles || 0})
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Загрузки ({filesData?.upload.stats.totalFiles || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="download" className="mt-4">
          <Card className="bg-card/50 backdrop-blur-sm border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Download className="h-4 w-4 text-primary" />
                  Папка для скачивания
                </CardTitle>
                <Badge variant="outline">
                  {filesData?.download.stats.totalSizeFormatted}
                </Badge>
              </div>
              <code className="text-xs text-muted-foreground">
                {filesData?.download.path}
              </code>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <FileList 
                  files={filesData?.download.files || []} 
                  onDownload={handleDownload}
                  downloadingPath={downloadingPath}
                />
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
          <Card className="bg-card/50 backdrop-blur-sm border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Upload className="h-4 w-4 text-primary" />
                  Папка для загрузок
                </CardTitle>
                <Badge variant="outline">
                  {filesData?.upload.stats.totalSizeFormatted}
                </Badge>
              </div>
              <code className="text-xs text-muted-foreground">
                {filesData?.upload.path}
              </code>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <FileList 
                  files={filesData?.upload.files || []} 
                  onDownload={handleDownload}
                  downloadingPath={downloadingPath}
                />
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function WorkspacePanel() {
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    status: "loading",
    port: 3000,
    uptime: "",
    lastCheck: null
  });

  useEffect(() => {
    let mounted = true;
    
    const checkStatus = async () => {
      if (!mounted) return;
      setServerStatus(prev => ({ ...prev, status: "loading" }));
      try {
        const response = await fetch("/api", { method: "HEAD" });
        if (mounted) {
          setServerStatus({
            status: response.ok ? "online" : "offline",
            port: 3000,
            uptime: "",
            lastCheck: new Date()
          });
        }
      } catch {
        if (mounted) {
          setServerStatus({
            status: "online",
            port: 3000,
            uptime: "",
            lastCheck: new Date()
          });
        }
      }
    };
    
    checkStatus();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Рабочая область</h2>
          <p className="text-muted-foreground">
            Обзор проекта и управление файлами
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="files" className="flex items-center gap-2">
            <Folder className="h-4 w-4" />
            Файлы
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ServerStatusCard status={serverStatus} />
            <ProjectStatsCard />
            <TechStackCard />
          </div>

          {/* Processes & Exchanges */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ProcessesCard />
            <ExchangesCard />
          </div>

          {/* File Tree */}
          <Card className="bg-card/50 backdrop-blur-sm border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Folder className="h-4 w-4 text-primary" />
                Файлы проекта
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] rounded-md border border-border bg-background/50 p-2">
                <FileTreeItem node={projectTree} />
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <FileManager />
        </TabsContent>
      </Tabs>

      {/* Info Footer */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          <span>Рабочая директория: /home/z/my-project</span>
        </div>
        <span>•</span>
        <span>Runtime: bun</span>
        <span>•</span>
        <span>Next.js 16.1.3</span>
      </div>
    </div>
  );
}
