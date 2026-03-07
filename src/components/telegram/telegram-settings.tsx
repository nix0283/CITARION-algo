"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  MessageSquare,
  Send,
  CheckCircle,
  XCircle,
  RefreshCw,
  Settings,
  Link,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TelegramStatus {
  isConnected: boolean;
  botUsername: string;
  webhookUrl: string;
  chatId: string;
  isActive: boolean;
}

interface TelegramSettings {
  notifyOnEntry: boolean;
  notifyOnExit: boolean;
  notifyOnSL: boolean;
  notifyOnTP: boolean;
  notifyOnSignal: boolean;
  notifyOnExternal: boolean;
}

export function TelegramSettings() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [settings, setSettings] = useState<TelegramSettings>({
    notifyOnEntry: true,
    notifyOnExit: true,
    notifyOnSL: true,
    notifyOnTP: true,
    notifyOnSignal: true,
    notifyOnExternal: true,
  });
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadStatus();
    loadSettings();
  }, []);

  const loadStatus = async () => {
    try {
      const response = await fetch("/api/telegram/webhook");
      const data = await response.json();
      if (data.success) {
        setStatus(data.status);
      }
    } catch (error) {
      console.error("Failed to load Telegram status:", error);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/telegram/settings");
      const data = await response.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error("Failed to load Telegram settings:", error);
    }
  };

  const handleSetWebhook = async () => {
    if (!botToken) {
      toast.error("Введите токен бота");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/telegram/set-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Webhook установлен успешно!");
        loadStatus();
      } else {
        toast.error(data.error || "Ошибка установки webhook");
      }
    } catch (error) {
      toast.error("Ошибка при установке webhook");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetCommands = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/telegram/set-commands", {
        method: "POST",
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Команды бота обновлены!");
      } else {
        toast.error(data.error || "Ошибка установки команд");
      }
    } catch (error) {
      toast.error("Ошибка при установке команд");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveChatId = async () => {
    if (!chatId) {
      toast.error("Введите Chat ID");
      return;
    }

    try {
      const response = await fetch("/api/telegram/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Chat ID сохранён!");
        loadStatus();
      }
    } catch (error) {
      toast.error("Ошибка сохранения");
    }
  };

  const handleUpdateSettings = async (key: keyof TelegramSettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    try {
      await fetch("/api/telegram/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: newSettings }),
      });
    } catch (error) {
      console.error("Failed to update settings:", error);
    }
  };

  const handleCopyWebhook = () => {
    if (status?.webhookUrl) {
      navigator.clipboard.writeText(status.webhookUrl);
      toast.success("Webhook URL скопирован");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            Telegram интеграция
          </h2>
          <p className="text-muted-foreground mt-1">
            Настройка бота для уведомлений и управления
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link className="h-5 w-5" />
              Статус подключения
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {status ? (
              <>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    {status.isConnected ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <div className="font-medium">
                        {status.isConnected ? "Подключено" : "Не подключено"}
                      </div>
                      {status.botUsername && (
                        <div className="text-sm text-muted-foreground">
                          @{status.botUsername}
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge variant={status.isActive ? "default" : "outline"}>
                    {status.isActive ? "Активен" : "Неактивен"}
                  </Badge>
                </div>

                {status.webhookUrl && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Webhook URL</label>
                    <div className="flex gap-2">
                      <Input
                        value={status.webhookUrl}
                        readOnly
                        className="text-xs"
                      />
                      <Button variant="outline" size="icon" onClick={handleCopyWebhook}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {status.chatId && (
                  <div className="flex items-center justify-between p-2 rounded bg-green-500/10 text-green-600">
                    <span className="text-sm">Chat ID настроен</span>
                    <span className="font-mono text-xs">{status.chatId}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Загрузка статуса...</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Setup Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Настройка бота
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Bot Token</label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                />
                <Button onClick={handleSetWebhook} disabled={isLoading}>
                  {isLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Получите токен у @BotFather
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Chat ID</label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="-1001234567890"
                />
                <Button variant="outline" onClick={handleSaveChatId}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Узнайте ID у @userinfobot
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleSetCommands}
              disabled={isLoading}
            >
              Установить команды бота
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Уведомления</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: "notifyOnEntry", label: "Открытие позиции", desc: "Уведомлять при открытии новой позиции" },
              { key: "notifyOnExit", label: "Закрытие позиции", desc: "Уведомлять при закрытии позиции" },
              { key: "notifyOnSL", label: "Stop Loss", desc: "Уведомлять при срабатывании SL" },
              { key: "notifyOnTP", label: "Take Profit", desc: "Уведомлять при срабатывании TP" },
              { key: "notifyOnSignal", label: "Новые сигналы", desc: "Уведомлять о новых торговых сигналах" },
              { key: "notifyOnExternal", label: "Внешние позиции", desc: "Уведомлять о позициях с биржи" },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between p-4 rounded-lg border bg-card"
              >
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
                <Switch
                  checked={settings[item.key as keyof TelegramSettings]}
                  onCheckedChange={(v) =>
                    handleUpdateSettings(item.key as keyof TelegramSettings, v)
                  }
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Available Commands */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Доступные команды</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { cmd: "/start", desc: "Запуск бота" },
              { cmd: "/status", desc: "Статус аккаунтов" },
              { cmd: "/positions", desc: "Открытые позиции" },
              { cmd: "/signals", desc: "Последние сигналы" },
              { cmd: "/balance", desc: "Баланс кошелька" },
              { cmd: "/close [symbol]", desc: "Закрыть позицию" },
            ].map((item) => (
              <div
                key={item.cmd}
                className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
              >
                <code className="text-sm font-mono text-primary">{item.cmd}</code>
                <span className="text-xs text-muted-foreground">{item.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
