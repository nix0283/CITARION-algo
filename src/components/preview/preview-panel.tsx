"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Eye, 
  Terminal,
  FileText,
  RefreshCw,
  ExternalLink,
  Monitor,
  Tablet,
  Smartphone,
  Globe,
  Zap,
  Activity,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewTab {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const previewTabs: PreviewTab[] = [
  { id: "app", label: "Превью приложения", icon: <Monitor className="h-4 w-4" /> },
  { id: "api", label: "Статус API", icon: <Terminal className="h-4 w-4" /> },
  { id: "ws", label: "WebSocket", icon: <Zap className="h-4 w-4" /> },
  { id: "logs", label: "Логи", icon: <FileText className="h-4 w-4" /> },
];

// Device presets for responsive preview
const devicePresets = [
  { id: "desktop", label: "Десктоп", icon: Monitor, width: "100%", height: "600px" },
  { id: "tablet", label: "Планшет", icon: Tablet, width: "768px", height: "1024px" },
  { id: "mobile", label: "Телефон", icon: Smartphone, width: "375px", height: "667px" },
];

// API endpoints status
const apiEndpoints = [
  { path: "/api/prices", method: "GET", status: "active", latency: "12ms" },
  { path: "/api/bots/active", method: "GET", status: "active", latency: "8ms" },
  { path: "/api/exchange", method: "GET", status: "active", latency: "15ms" },
  { path: "/api/positions/sync", method: "POST", status: "active", latency: "23ms" },
  { path: "/api/trade/open", method: "POST", status: "active", latency: "45ms" },
  { path: "/api/telegram/webhook", method: "POST", status: "active", latency: "18ms" },
  { path: "/api/cron/grid", method: "GET", status: "cron", latency: "-" },
  { path: "/api/cron/dca", method: "GET", status: "cron", latency: "-" },
];

// WebSocket connections
const wsConnections = [
  { exchange: "Binance", pairs: 156, status: "connected", latency: "8ms" },
  { exchange: "Bybit", pairs: 89, status: "connected", latency: "12ms" },
  { exchange: "OKX", pairs: 124, status: "connected", latency: "15ms" },
  { exchange: "Bitget", pairs: 67, status: "connected", latency: "18ms" },
  { exchange: "KuCoin", pairs: 45, status: "connected", latency: "22ms" },
  { exchange: "BingX", pairs: 34, status: "connected", latency: "25ms" },
  { exchange: "HyperLiquid", pairs: 28, status: "connected", latency: "35ms" },
  { exchange: "Gate.io", pairs: 112, status: "connected", latency: "20ms" },
];

// Recent logs
const recentLogs = [
  { time: "09:15:32", level: "info", message: "WebSocket connected to Binance" },
  { time: "09:15:31", level: "info", message: "Price update: BTCUSDT $97,234.50" },
  { time: "09:15:30", level: "debug", message: "Fetching OHLCV data for ETHUSDT" },
  { time: "09:15:28", level: "info", message: "Grid bot executed order #12345" },
  { time: "09:15:25", level: "warn", message: "Rate limit approaching for Bybit API" },
  { time: "09:15:20", level: "info", message: "Position synced: LONG BTCUSDT" },
  { time: "09:15:15", level: "debug", message: "Checking funding rates..." },
  { time: "09:15:10", level: "info", message: "DCA bot averaging down BTCUSDT" },
];

function AppPreview() {
  const [device, setDevice] = useState("desktop");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const currentDevice = devicePresets.find(d => d.id === device) || devicePresets[0];

  const handleRefresh = () => {
    setLastRefresh(new Date());
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Device Presets */}
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            {devicePresets.map((preset) => (
              <Button
                key={preset.id}
                variant={device === preset.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setDevice(preset.id)}
                className="h-8"
              >
                <preset.icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {lastRefresh.toLocaleTimeString()}
          </span>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Обновить
          </Button>
          <Button variant="outline" size="sm">
            <ExternalLink className="h-4 w-4 mr-2" />
            Открыть
          </Button>
        </div>
      </div>

      {/* Preview Frame */}
      <div className="relative rounded-lg border border-border bg-background overflow-hidden">
        <div className="bg-muted/50 border-b border-border px-4 py-2 flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="bg-background rounded px-4 py-1 text-xs text-muted-foreground flex items-center gap-2">
              <Globe className="h-3 w-3" />
              localhost:3000
            </div>
          </div>
        </div>
        
        <div 
          className="bg-background transition-all duration-300 mx-auto overflow-auto"
          style={{ 
            width: currentDevice.width, 
            height: currentDevice.height,
            maxWidth: '100%'
          }}
        >
          <iframe 
            src="/" 
            className="w-full h-full border-0"
            title="App Preview"
          />
        </div>
      </div>
    </div>
  );
}

function ApiStatusPanel() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Всего эндпоинтов</span>
              <Badge variant="secondary">49</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Активных</span>
              <Badge className="bg-green-500/10 text-green-500">46</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Cron задач</span>
              <Badge className="bg-blue-500/10 text-blue-500">6</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Avg Latency</span>
              <Badge variant="outline">18ms</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            API Endpoints
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {apiEndpoints.map((endpoint, i) => (
                <div 
                  key={i}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={endpoint.method === "GET" ? "outline" : "secondary"}
                      className="font-mono text-xs"
                    >
                      {endpoint.method}
                    </Badge>
                    <code className="text-sm">{endpoint.path}</code>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant="outline"
                      className={cn(
                        endpoint.status === "active" 
                          ? "bg-green-500/10 text-green-500 border-green-500/20"
                          : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      )}
                    >
                      {endpoint.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {endpoint.latency}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function WebSocketPanel() {
  // Calculate total pairs directly (no useEffect needed for static data)
  const totalPairs = wsConnections.reduce((sum, ws) => sum + ws.pairs, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Exchanges</span>
              <Badge className="bg-green-500/10 text-green-500">8 Connected</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Pairs</span>
              <Badge variant="secondary">{totalPairs}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Avg Latency</span>
              <Badge variant="outline">19ms</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            WebSocket Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {wsConnections.map((ws, i) => (
              <div 
                key={i}
                className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Activity className={cn(
                    "h-4 w-4",
                    ws.status === "connected" ? "text-green-500" : "text-red-500"
                  )} />
                  <span className="font-medium">{ws.exchange}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {ws.pairs} pairs
                  </span>
                  <Badge 
                    variant="outline"
                    className="bg-green-500/10 text-green-500 border-green-500/20"
                  >
                    {ws.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {ws.latency}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LogsPanel() {
  const [autoScroll, setAutoScroll] = useState(true);

  const getLogColor = (level: string) => {
    switch (level) {
      case "error": return "text-red-500";
      case "warn": return "text-yellow-500";
      case "debug": return "text-blue-500";
      default: return "text-green-500";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-green-500/10 text-green-500">
            Live
          </Badge>
          <span className="text-sm text-muted-foreground">
            Real-time logs
          </span>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setAutoScroll(!autoScroll)}
        >
          {autoScroll ? "Pause" : "Resume"}
        </Button>
      </div>

      <Card className="bg-card/50">
        <CardContent className="pt-4">
          <ScrollArea className="h-[400px]">
            <div className="font-mono text-sm space-y-1">
              {recentLogs.map((log, i) => (
                <div 
                  key={i}
                  className="flex items-start gap-3 py-1 px-2 rounded hover:bg-muted/30 transition-colors"
                >
                  <span className="text-muted-foreground text-xs w-20 flex-shrink-0">
                    {log.time}
                  </span>
                  <Badge 
                    variant="outline" 
                    className={cn("text-xs uppercase", getLogColor(log.level))}
                  >
                    {log.level}
                  </Badge>
                  <span className="text-foreground">
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export function PreviewPanel() {
  const [activeTab, setActiveTab] = useState("app");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Preview Panel</h2>
          <p className="text-muted-foreground">
            Live preview and system monitoring
          </p>
        </div>
        <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
          <Activity className="h-3 w-3 mr-1" />
          Live
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          {previewTabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2">
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="app" className="mt-4">
          <AppPreview />
        </TabsContent>

        <TabsContent value="api" className="mt-4">
          <ApiStatusPanel />
        </TabsContent>

        <TabsContent value="ws" className="mt-4">
          <WebSocketPanel />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <LogsPanel />
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          <span>Auto-refresh: 5s</span>
        </div>
        <span>•</span>
        <span>Preview Mode: Embedded</span>
        <span>•</span>
        <span>localhost:3000</span>
      </div>
    </div>
  );
}
