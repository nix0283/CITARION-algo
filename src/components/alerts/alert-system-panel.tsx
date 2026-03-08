"use client";

import * as React from "react";
import { useState, useCallback } from "react";
import {
  Bell,
  Send,
  MessageSquare,
  Mail,
  Webhook,
  Settings,
  History,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  TestTube,
  Trash2,
  RefreshCw,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertConfig,
  Alert,
  AlertStats,
  AlertChannel,
  AlertPriority,
  defaultAlertConfig,
} from "@/lib/alert-system";

// =============================================================================
// TYPES
// =============================================================================

interface AlertRule {
  id: string;
  name: string;
  type: "price" | "trade" | "risk";
  enabled: boolean;
  conditions: {
    field: string;
    operator: string;
    value: string;
  }[];
  channels: AlertChannel[];
  priority: AlertPriority;
}

// =============================================================================
// MOCK DATA
// =============================================================================

const mockAlertHistory: Alert[] = [
  {
    id: "alert-1",
    timestamp: Date.now() - 3600000,
    channel: "telegram",
    priority: "high",
    title: "Position Closed: BTC/USDT",
    message: "Closed LONG position with +2.5% PnL",
    sent: true,
    sentAt: Date.now() - 3600000,
  },
  {
    id: "alert-2",
    timestamp: Date.now() - 7200000,
    channel: "email",
    priority: "critical",
    title: "Risk Alert: Drawdown Limit",
    message: "Daily drawdown reached 5% threshold",
    sent: true,
    sentAt: Date.now() - 7200000,
  },
  {
    id: "alert-3",
    timestamp: Date.now() - 10800000,
    channel: "webhook",
    priority: "normal",
    title: "Signal Generated: ETH/USDT",
    message: "LONG signal with 78% confidence",
    sent: true,
    sentAt: Date.now() - 10800000,
  },
  {
    id: "alert-4",
    timestamp: Date.now() - 14400000,
    channel: "telegram",
    priority: "low",
    title: "Bot Status: Argus Bot",
    message: "Bot started successfully",
    sent: true,
    sentAt: Date.now() - 14400000,
  },
  {
    id: "alert-5",
    timestamp: Date.now() - 18000000,
    channel: "telegram",
    priority: "high",
    title: "Price Alert: SOL/USDT",
    message: "Price crossed above $150 resistance",
    sent: false,
    error: "Rate limit exceeded",
  },
];

const mockStats: AlertStats = {
  sent: 156,
  failed: 12,
  queued: 3,
  byChannel: { telegram: 98, email: 34, webhook: 24 },
  byPriority: { low: 45, normal: 67, high: 32, critical: 12 },
};

const defaultAlertRules: AlertRule[] = [
  {
    id: "rule-1",
    name: "Price Breakout Alert",
    type: "price",
    enabled: true,
    conditions: [
      { field: "price_change", operator: ">", value: "5" },
    ],
    channels: ["telegram"],
    priority: "high",
  },
  {
    id: "rule-2",
    name: "Trade Execution Alert",
    type: "trade",
    enabled: true,
    conditions: [
      { field: "trade_size", operator: ">", value: "1000" },
    ],
    channels: ["telegram", "email"],
    priority: "normal",
  },
  {
    id: "rule-3",
    name: "Drawdown Warning",
    type: "risk",
    enabled: true,
    conditions: [
      { field: "drawdown", operator: ">", value: "3" },
    ],
    channels: ["telegram", "email", "webhook"],
    priority: "critical",
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPriorityColor(priority: AlertPriority): string {
  switch (priority) {
    case "critical":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "high":
      return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    case "normal":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "low":
      return "bg-gray-500/10 text-gray-500 border-gray-500/20";
  }
}

function getChannelIcon(channel: AlertChannel) {
  switch (channel) {
    case "telegram":
      return <MessageSquare className="h-4 w-4" />;
    case "email":
      return <Mail className="h-4 w-4" />;
    case "webhook":
      return <Webhook className="h-4 w-4" />;
  }
}

// =============================================================================
// COMPONENTS
// =============================================================================

interface ChannelConfigCardProps {
  channel: AlertChannel;
  title: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children?: React.ReactNode;
}

function ChannelConfigCard({
  channel,
  title,
  description,
  icon,
  enabled,
  onToggle,
  children,
}: ChannelConfigCardProps) {
  return (
    <Card className="transition-colors">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">{icon}</div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-sm">{description}</CardDescription>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>
      </CardHeader>
      {enabled && children && (
        <CardContent className="pt-0">
          <Separator className="mb-4" />
          {children}
        </CardContent>
      )}
    </Card>
  );
}

interface AlertHistoryItemProps {
  alert: Alert;
}

function AlertHistoryItem({ alert }: AlertHistoryItemProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
      <div className="mt-0.5">{getChannelIcon(alert.channel)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm truncate">{alert.title}</span>
          <Badge variant="outline" className={`text-xs ${getPriorityColor(alert.priority)}`}>
            {alert.priority}
          </Badge>
          {alert.sent ? (
            <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500 ml-auto shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
        <div className="flex items-center gap-2 mt-1">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{formatTime(alert.timestamp)}</span>
          {alert.error && (
            <Badge variant="destructive" className="text-xs">
              {alert.error}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

interface AlertRuleItemProps {
  rule: AlertRule;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}

function AlertRuleItem({ rule, onToggle, onDelete }: AlertRuleItemProps) {
  const typeIcons = {
    price: <TrendingUp className="h-4 w-4" />,
    trade: <Zap className="h-4 w-4" />,
    risk: <Shield className="h-4 w-4" />,
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-background">{typeIcons[rule.type]}</div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{rule.name}</span>
            <Badge variant="outline" className={`text-xs ${getPriorityColor(rule.priority)}`}>
              {rule.priority}
            </Badge>
          </div>
          <div className="flex items-center gap-1 mt-1">
            {rule.channels.map((ch) => (
              <span key={ch} className="text-muted-foreground">
                {getChannelIcon(ch)}
              </span>
            ))}
            <span className="text-xs text-muted-foreground ml-2">
              {rule.conditions.length} condition(s)
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={rule.enabled}
          onCheckedChange={(checked) => onToggle(rule.id, checked)}
        />
        <Button variant="ghost" size="icon" onClick={() => onDelete(rule.id)}>
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AlertSystemPanel() {
  // State for alert configuration
  const [config, setConfig] = useState<AlertConfig>(defaultAlertConfig);
  const [alertHistory, setAlertHistory] = useState<Alert[]>(mockAlertHistory);
  const [alertRules, setAlertRules] = useState<AlertRule[]>(defaultAlertRules);
  const [stats] = useState<AlertStats>(mockStats);

  // Test alert state
  const [testAlert, setTestAlert] = useState({
    title: "Test Alert",
    message: "This is a test alert message",
    channel: "telegram" as AlertChannel,
    priority: "normal" as AlertPriority,
  });
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Handlers
  const handleTelegramChange = useCallback((field: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      telegram: { ...prev.telegram!, [field]: value },
    }));
  }, []);

  const handleEmailChange = useCallback((field: string, value: string | string[]) => {
    setConfig((prev) => ({
      ...prev,
      email: { ...prev.email!, [field]: value },
    }));
  }, []);

  const handleWebhookChange = useCallback((field: string, value: string | Record<string, string>) => {
    setConfig((prev) => ({
      ...prev,
      webhook: { ...prev.webhook!, [field]: value },
    }));
  }, []);

  const handleRateLimitChange = useCallback((field: string, value: number) => {
    setConfig((prev) => ({
      ...prev,
      rateLimits: { ...prev.rateLimits, [field]: value },
    }));
  }, []);

  const handleRuleToggle = useCallback((id: string, enabled: boolean) => {
    setAlertRules((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, enabled } : rule))
    );
  }, []);

  const handleRuleDelete = useCallback((id: string) => {
    setAlertRules((prev) => prev.filter((rule) => rule.id !== id));
  }, []);

  const handleSendTestAlert = useCallback(async () => {
    setIsSendingTest(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const newAlert: Alert = {
      id: `alert-test-${Date.now()}`,
      timestamp: Date.now(),
      channel: testAlert.channel,
      priority: testAlert.priority,
      title: testAlert.title,
      message: testAlert.message,
      sent: true,
      sentAt: Date.now(),
    };

    setAlertHistory((prev) => [newAlert, ...prev]);
    setIsSendingTest(false);
  }, [testAlert]);

  const handleClearHistory = useCallback(() => {
    setAlertHistory([]);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Sent</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.sent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Failed</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.failed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Queued</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.queued}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {stats.sent + stats.failed + stats.queued}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="channels" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="channels" className="gap-2">
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Channels</span>
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Alert Rules</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-2">
            <TestTube className="h-4 w-4" />
            <span className="hidden sm:inline">Test</span>
          </TabsTrigger>
        </TabsList>

        {/* Channels Tab */}
        <TabsContent value="channels" className="mt-4 space-y-4">
          {/* Telegram */}
          <ChannelConfigCard
            channel="telegram"
            title="Telegram"
            description="Send alerts to Telegram chat"
            icon={<MessageSquare className="h-5 w-5" />}
            enabled={config.telegram?.enabled ?? false}
            onToggle={(enabled) =>
              setConfig((prev) => ({
                ...prev,
                telegram: { ...prev.telegram!, enabled },
              }))
            }
          >
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="telegram-bot-token">Bot Token</Label>
                <Input
                  id="telegram-bot-token"
                  type="password"
                  placeholder="Enter bot token"
                  value={config.telegram?.botToken ?? ""}
                  onChange={(e) => handleTelegramChange("botToken", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="telegram-chat-id">Chat ID</Label>
                <Input
                  id="telegram-chat-id"
                  placeholder="Enter chat ID"
                  value={config.telegram?.chatId ?? ""}
                  onChange={(e) => handleTelegramChange("chatId", e.target.value)}
                />
              </div>
            </div>
          </ChannelConfigCard>

          {/* Email */}
          <ChannelConfigCard
            channel="email"
            title="Email"
            description="Send alerts via email"
            icon={<Mail className="h-5 w-5" />}
            enabled={config.email?.enabled ?? false}
            onToggle={(enabled) =>
              setConfig((prev) => ({
                ...prev,
                email: { ...prev.email!, enabled },
              }))
            }
          >
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email-smtp-host">SMTP Host</Label>
                  <Input
                    id="email-smtp-host"
                    placeholder="smtp.example.com"
                    value={config.email?.smtpHost ?? ""}
                    onChange={(e) => handleEmailChange("smtpHost", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email-smtp-port">SMTP Port</Label>
                  <Input
                    id="email-smtp-port"
                    type="number"
                    placeholder="587"
                    value={config.email?.smtpPort ?? ""}
                    onChange={(e) => handleEmailChange("smtpPort", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email-smtp-user">SMTP User</Label>
                  <Input
                    id="email-smtp-user"
                    placeholder="user@example.com"
                    value={config.email?.smtpUser ?? ""}
                    onChange={(e) => handleEmailChange("smtpUser", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email-smtp-pass">SMTP Password</Label>
                  <Input
                    id="email-smtp-pass"
                    type="password"
                    placeholder="Enter password"
                    value={config.email?.smtpPass ?? ""}
                    onChange={(e) => handleEmailChange("smtpPass", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email-from">From Address</Label>
                  <Input
                    id="email-from"
                    placeholder="alerts@example.com"
                    value={config.email?.fromAddress ?? ""}
                    onChange={(e) => handleEmailChange("fromAddress", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email-to">To Addresses</Label>
                  <Input
                    id="email-to"
                    placeholder="user1@example.com, user2@example.com"
                    value={config.email?.toAddresses?.join(", ") ?? ""}
                    onChange={(e) =>
                      handleEmailChange(
                        "toAddresses",
                        e.target.value.split(",").map((s) => s.trim())
                      )
                    }
                  />
                </div>
              </div>
            </div>
          </ChannelConfigCard>

          {/* Webhook */}
          <ChannelConfigCard
            channel="webhook"
            title="Webhook"
            description="Send alerts to custom webhook endpoint"
            icon={<Webhook className="h-5 w-5" />}
            enabled={config.webhook?.enabled ?? false}
            onToggle={(enabled) =>
              setConfig((prev) => ({
                ...prev,
                webhook: { ...prev.webhook!, enabled },
              }))
            }
          >
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="webhook-url">Webhook URL</Label>
                <Input
                  id="webhook-url"
                  placeholder="https://api.example.com/webhook"
                  value={config.webhook?.url ?? ""}
                  onChange={(e) => handleWebhookChange("url", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="webhook-headers">Custom Headers (JSON)</Label>
                <Textarea
                  id="webhook-headers"
                  placeholder='{"Authorization": "Bearer token"}'
                  className="font-mono text-sm"
                  value={
                    config.webhook?.headers
                      ? JSON.stringify(config.webhook.headers, null, 2)
                      : ""
                  }
                  onChange={(e) => {
                    try {
                      const headers = JSON.parse(e.target.value);
                      handleWebhookChange("headers", headers);
                    } catch {
                      // Invalid JSON, ignore
                    }
                  }}
                />
              </div>
            </div>
          </ChannelConfigCard>
        </TabsContent>

        {/* Rules Tab */}
        <TabsContent value="rules" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Alert Rules</CardTitle>
                  <CardDescription>
                    Configure automated alert rules for trading events
                  </CardDescription>
                </div>
                <Button size="sm">
                  <Zap className="h-4 w-4 mr-2" />
                  Add Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {/* Price Alerts */}
                <AccordionItem value="price">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      <span>Price Alerts</span>
                      <Badge variant="secondary" className="ml-2">
                        {alertRules.filter((r) => r.type === "price").length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {alertRules
                        .filter((rule) => rule.type === "price")
                        .map((rule) => (
                          <AlertRuleItem
                            key={rule.id}
                            rule={rule}
                            onToggle={handleRuleToggle}
                            onDelete={handleRuleDelete}
                          />
                        ))}
                      {alertRules.filter((r) => r.type === "price").length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No price alerts configured
                        </p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Trade Alerts */}
                <AccordionItem value="trade">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <span>Trade Alerts</span>
                      <Badge variant="secondary" className="ml-2">
                        {alertRules.filter((r) => r.type === "trade").length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {alertRules
                        .filter((rule) => rule.type === "trade")
                        .map((rule) => (
                          <AlertRuleItem
                            key={rule.id}
                            rule={rule}
                            onToggle={handleRuleToggle}
                            onDelete={handleRuleDelete}
                          />
                        ))}
                      {alertRules.filter((r) => r.type === "trade").length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No trade alerts configured
                        </p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Risk Alerts */}
                <AccordionItem value="risk">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-red-500" />
                      <span>Risk Alerts</span>
                      <Badge variant="secondary" className="ml-2">
                        {alertRules.filter((r) => r.type === "risk").length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {alertRules
                        .filter((rule) => rule.type === "risk")
                        .map((rule) => (
                          <AlertRuleItem
                            key={rule.id}
                            rule={rule}
                            onToggle={handleRuleToggle}
                            onDelete={handleRuleDelete}
                          />
                        ))}
                      {alertRules.filter((r) => r.type === "risk").length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No risk alerts configured
                        </p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="mt-4">
          <div className="grid gap-6">
            {/* Global Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Global Settings</CardTitle>
                <CardDescription>
                  Configure global alert system settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Alerts</Label>
                    <p className="text-sm text-muted-foreground">
                      Turn on/off all alert notifications
                    </p>
                  </div>
                  <Switch
                    checked={config.enabled}
                    onCheckedChange={(enabled) =>
                      setConfig((prev) => ({ ...prev, enabled }))
                    }
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Log Alerts</Label>
                    <p className="text-sm text-muted-foreground">
                      Keep a history of all sent alerts
                    </p>
                  </div>
                  <Switch
                    checked={config.logAlerts}
                    onCheckedChange={(logAlerts) =>
                      setConfig((prev) => ({ ...prev, logAlerts }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Rate Limiting */}
            <Card>
              <CardHeader>
                <CardTitle>Rate Limiting</CardTitle>
                <CardDescription>
                  Prevent alert flooding with rate limits
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Max Per Minute: {config.rateLimits.maxPerMinute}</Label>
                  </div>
                  <Slider
                    value={[config.rateLimits.maxPerMinute]}
                    min={1}
                    max={60}
                    step={1}
                    onValueChange={([value]) =>
                      handleRateLimitChange("maxPerMinute", value)
                    }
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Max Per Hour: {config.rateLimits.maxPerHour}</Label>
                  </div>
                  <Slider
                    value={[config.rateLimits.maxPerHour]}
                    min={1}
                    max={200}
                    step={1}
                    onValueChange={([value]) =>
                      handleRateLimitChange("maxPerHour", value)
                    }
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Max Per Day: {config.rateLimits.maxPerDay}</Label>
                  </div>
                  <Slider
                    value={[config.rateLimits.maxPerDay]}
                    min={1}
                    max={1000}
                    step={1}
                    onValueChange={([value]) =>
                      handleRateLimitChange("maxPerDay", value)
                    }
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Burst Limit: {config.rateLimits.burstLimit}</Label>
                  </div>
                  <Slider
                    value={[config.rateLimits.burstLimit]}
                    min={1}
                    max={10}
                    step={1}
                    onValueChange={([value]) =>
                      handleRateLimitChange("burstLimit", value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum alerts that can be sent in a single second
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Priority Levels */}
            <Card>
              <CardHeader>
                <CardTitle>Priority Levels</CardTitle>
                <CardDescription>
                  Alert priority determines delivery urgency and rate limit bypass
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-gray-500" />
                      <div>
                        <p className="font-medium text-sm">Low</p>
                        <p className="text-xs text-muted-foreground">
                          Informational alerts, no urgency
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{stats.byPriority.low}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <div>
                        <p className="font-medium text-sm">Normal</p>
                        <p className="text-xs text-muted-foreground">
                          Standard alerts, respects rate limits
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{stats.byPriority.normal}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-orange-500" />
                      <div>
                        <p className="font-medium text-sm">High</p>
                        <p className="text-xs text-muted-foreground">
                          Important alerts, priority delivery
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{stats.byPriority.high}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <div>
                        <p className="font-medium text-sm">Critical</p>
                        <p className="text-xs text-muted-foreground">
                          Emergency alerts, bypasses rate limits
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{stats.byPriority.critical}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Alert History</CardTitle>
                  <CardDescription>
                    Recent alert notifications and their status
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleClearHistory}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-2">
                  {alertHistory.length === 0 ? (
                    <div className="text-center py-8">
                      <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No alerts in history
                      </p>
                    </div>
                  ) : (
                    alertHistory.map((alert) => (
                      <AlertHistoryItem key={alert.id} alert={alert} />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test Tab */}
        <TabsContent value="test" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Alert</CardTitle>
              <CardDescription>
                Send a test alert to verify your configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="test-title">Alert Title</Label>
                  <Input
                    id="test-title"
                    placeholder="Enter alert title"
                    value={testAlert.title}
                    onChange={(e) =>
                      setTestAlert((prev) => ({ ...prev, title: e.target.value }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="test-message">Alert Message</Label>
                  <Textarea
                    id="test-message"
                    placeholder="Enter alert message"
                    value={testAlert.message}
                    onChange={(e) =>
                      setTestAlert((prev) => ({ ...prev, message: e.target.value }))
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Channel</Label>
                    <Select
                      value={testAlert.channel}
                      onValueChange={(value: AlertChannel) =>
                        setTestAlert((prev) => ({ ...prev, channel: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="telegram">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Telegram
                          </div>
                        </SelectItem>
                        <SelectItem value="email">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Email
                          </div>
                        </SelectItem>
                        <SelectItem value="webhook">
                          <div className="flex items-center gap-2">
                            <Webhook className="h-4 w-4" />
                            Webhook
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>Priority</Label>
                    <Select
                      value={testAlert.priority}
                      onValueChange={(value: AlertPriority) =>
                        setTestAlert((prev) => ({ ...prev, priority: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={handleSendTestAlert}
                  disabled={isSendingTest}
                >
                  {isSendingTest ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Test Alert
                    </>
                  )}
                </Button>
              </div>

              {/* Channel Status */}
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Channel Status
                </Label>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-sm">Telegram</span>
                    </div>
                    {config.telegram?.enabled ? (
                      <Badge variant="outline" className="text-green-500 border-green-500/20">
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Not Configured</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <span className="text-sm">Email</span>
                    </div>
                    {config.email?.enabled ? (
                      <Badge variant="outline" className="text-green-500 border-green-500/20">
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Not Configured</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Webhook className="h-4 w-4" />
                      <span className="text-sm">Webhook</span>
                    </div>
                    {config.webhook?.enabled ? (
                      <Badge variant="outline" className="text-green-500 border-green-500/20">
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Not Configured</Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AlertSystemPanel;
