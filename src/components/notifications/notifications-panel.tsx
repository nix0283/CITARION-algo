"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  BellRing,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Trash2,
  Settings,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: "low" | "normal" | "high" | "critical";
  data?: Record<string, unknown>;
  read: boolean;
  timestamp: string;
}

interface NotificationSettings {
  positionOpened: boolean;
  positionClosed: boolean;
  tpHit: boolean;
  slHit: boolean;
  newSignal: boolean;
  externalPosition: boolean;
  fundingRate: boolean;
  systemAlerts: boolean;
}

const NOTIFICATION_TYPES: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  POSITION_OPENED: { icon: TrendingUp, color: "text-green-500", label: "Позиция открыта" },
  POSITION_CLOSED: { icon: CheckCircle, color: "text-blue-500", label: "Позиция закрыта" },
  TP_HIT: { icon: TrendingUp, color: "text-green-500", label: "Take Profit" },
  SL_HIT: { icon: TrendingDown, color: "text-red-500", label: "Stop Loss" },
  NEW_SIGNAL: { icon: Info, color: "text-blue-500", label: "Новый сигнал" },
  EXTERNAL_POSITION_DETECTED: { icon: ExternalLink, color: "text-purple-500", label: "Внешняя позиция" },
  FUNDING_RATE_WARNING: { icon: AlertTriangle, color: "text-yellow-500", label: "Funding Rate" },
  SYSTEM_WARNING: { icon: AlertTriangle, color: "text-yellow-500", label: "Предупреждение" },
  SYSTEM_ERROR: { icon: XCircle, color: "text-red-500", label: "Ошибка" },
};

const DEFAULT_SETTINGS: NotificationSettings = {
  positionOpened: true,
  positionClosed: true,
  tpHit: true,
  slHit: true,
  newSignal: true,
  externalPosition: true,
  fundingRate: true,
  systemAlerts: true,
};

export function NotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadNotifications();
    loadSettings();
    connectSSE();
  }, []);

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/notifications?history=true");
      const data = await response.json();
      if (data.success) {
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error("Failed to load notifications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/notifications?settings=true");
      const data = await response.json();
      if (data.success && data.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const connectSSE = () => {
    try {
      const eventSource = new EventSource("/api/notifications");

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const notification: Notification = JSON.parse(event.data);
          if (notification.title === "Connected") return;

          setNotifications((prev) => [notification, ...prev].slice(0, 100));
        } catch {
          // Ignore parse errors
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();
        setTimeout(connectSSE, 5000);
      };
    } catch {
      setTimeout(connectSSE, 5000);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast.success("Все уведомления отмечены прочитанными");
  };

  const handleClearAll = async () => {
    if (!confirm("Удалить все уведомления?")) return;
    setNotifications([]);
    toast.success("Все уведомления удалены");
  };

  const handleUpdateSettings = async (key: keyof NotificationSettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: newSettings }),
      });
    } catch (error) {
      console.error("Failed to update settings:", error);
    }
  };

  const getNotificationIcon = (type: string) => {
    const config = NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.SYSTEM_WARNING;
    const Icon = config.icon;
    return <Icon className={cn("h-5 w-5", config.color)} />;
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "critical":
        return <Badge className="bg-red-500 text-xs">Критический</Badge>;
      case "high":
        return <Badge className="bg-orange-500 text-xs">Высокий</Badge>;
      case "normal":
        return <Badge variant="outline" className="text-xs">Обычный</Badge>;
      default:
        return <Badge variant="outline" className="text-xs text-muted-foreground">Низкий</Badge>;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Только что";
    if (minutes < 60) return `${minutes} мин. назад`;
    if (hours < 24) return `${hours} ч. назад`;
    return `${days} дн. назад`;
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Уведомления
            {unreadCount > 0 && (
              <Badge className="ml-2 bg-primary">{unreadCount}</Badge>
            )}
          </h2>
          <p className="text-muted-foreground mt-1">
            Управление уведомлениями и настройками
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            className={cn(
              isConnected
                ? "bg-green-500/10 text-green-500"
                : "bg-red-500/10 text-red-500"
            )}
          >
            {isConnected ? (
              <>
                <BellRing className="h-3 w-3 mr-1" />
                Подключено
              </>
            ) : (
              "Отключено"
            )}
          </Badge>
          <Button variant="outline" onClick={loadNotifications} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Обновить
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Notifications List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">История уведомлений</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Прочитать все
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-500"
                  onClick={handleClearAll}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Очистить
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {notifications.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Нет уведомлений</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={cn(
                        "p-4 rounded-lg border transition-colors cursor-pointer",
                        notification.read
                          ? "bg-card opacity-70"
                          : "bg-primary/5 border-primary/20"
                      )}
                      onClick={() => handleMarkAsRead(notification.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium truncate">
                              {notification.title}
                            </div>
                            <div className="flex items-center gap-2">
                              {getPriorityBadge(notification.priority)}
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatTime(notification.timestamp)}
                              </span>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Настройки
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Торговля</h4>
              {[
                { key: "positionOpened", label: "Позиция открыта" },
                { key: "positionClosed", label: "Позиция закрыта" },
                { key: "tpHit", label: "Take Profit сработал" },
                { key: "slHit", label: "Stop Loss сработал" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <span className="text-sm">{item.label}</span>
                  <Switch
                    checked={settings[item.key as keyof NotificationSettings]}
                    onCheckedChange={(v) =>
                      handleUpdateSettings(item.key as keyof NotificationSettings, v)
                    }
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-3 border-t">
              <h4 className="text-sm font-medium text-muted-foreground">Сигналы</h4>
              {[
                { key: "newSignal", label: "Новые сигналы" },
                { key: "externalPosition", label: "Внешние позиции" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <span className="text-sm">{item.label}</span>
                  <Switch
                    checked={settings[item.key as keyof NotificationSettings]}
                    onCheckedChange={(v) =>
                      handleUpdateSettings(item.key as keyof NotificationSettings, v)
                    }
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-3 border-t">
              <h4 className="text-sm font-medium text-muted-foreground">Система</h4>
              {[
                { key: "fundingRate", label: "Funding Rate предупреждения" },
                { key: "systemAlerts", label: "Системные уведомления" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <span className="text-sm">{item.label}</span>
                  <Switch
                    checked={settings[item.key as keyof NotificationSettings]}
                    onCheckedChange={(v) =>
                      handleUpdateSettings(item.key as keyof NotificationSettings, v)
                    }
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
