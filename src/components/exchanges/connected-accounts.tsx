"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SUPPORTED_EXCHANGES,
  getExchangeById,
  type ExchangeType,
} from "@/lib/exchanges";
import {
  Building2,
  Link2,
  Unlink,
  AlertTriangle,
  CheckCircle,
  Clock,
  Settings,
  Key,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ConnectedAccount {
  id: string;
  exchangeId: string;
  exchangeType: ExchangeType;
  exchangeName: string;
  accountType: "DEMO" | "REAL";
  isActive: boolean;
  isTestnet: boolean;
  apiKey?: string;
  apiPassphrase?: string;
  lastSyncAt?: string;
  lastError?: string;
}

export function ConnectedAccounts() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<ConnectedAccount | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch accounts from API
  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch("/api/exchange");
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleToggleActive = async (account: ConnectedAccount) => {
    try {
      const response = await fetch("/api/exchange", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: account.id,
          isActive: !account.isActive,
        }),
      });

      if (response.ok) {
        toast.success(account.isActive ? "Аккаунт отключён" : "Аккаунт активирован");
        fetchAccounts();
      } else {
        toast.error("Ошибка обновления");
      }
    } catch (error) {
      toast.error("Ошибка соединения");
    }
  };

  const handleDisconnect = async (account: ConnectedAccount) => {
    if (!confirm(`Отключить ${account.exchangeName}?`)) return;

    try {
      const response = await fetch(`/api/exchange?id=${account.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Биржа отключена");
        fetchAccounts();
      } else {
        toast.error("Ошибка отключения");
      }
    } catch (error) {
      toast.error("Ошибка соединения");
    }
  };

  const openSettings = (account: ConnectedAccount) => {
    setSelectedAccount(account);
    setShowSettingsDialog(true);
  };

  const handleVerify = async () => {
    if (!selectedAccount) return;

    setIsVerifying(true);

    try {
      const response = await fetch("/api/exchange/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selectedAccount.id }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message);
        fetchAccounts();
        // Update selected account
        setSelectedAccount(prev => prev ? {
          ...prev,
          lastSyncAt: new Date().toISOString(),
          lastError: undefined
        } : null);
      } else {
        toast.error(data.message || "Ошибка верификации");
      }
    } catch (error) {
      toast.error("Ошибка верификации");
    } finally {
      setIsVerifying(false);
    }
  };

  const getStatusIcon = (account: ConnectedAccount) => {
    if (account.lastError) {
      return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
    }
    if (account.isActive) {
      return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    }
    return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const getStatusLabel = (account: ConnectedAccount) => {
    if (account.lastError) return "Ошибка";
    if (account.isActive) return "Активен";
    return "Остановлен";
  };

  // Get unique exchanges for display
  const getExchangeDisplay = (exchangeId: string) => {
    const exchange = getExchangeById(exchangeId);
    return exchange?.displayName || exchangeId;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-5 w-5 text-primary" />
            Подключённые аккаунты
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{accounts.length}</Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={fetchAccounts}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <ScrollArea className="h-[350px] px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Link2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                Нет подключённых аккаунтов
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Подключите биржу через форму выше
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => {
                const exchange = getExchangeById(account.exchangeId);

                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {account.exchangeName || getExchangeDisplay(account.exchangeId)}
                          </span>
                          <Badge variant="outline" className="text-xs capitalize">
                            {account.exchangeType}
                          </Badge>
                          {account.isTestnet && (
                            <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20 text-xs">
                              Testnet
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              account.accountType === "DEMO"
                                ? "demo-badge"
                                : "real-badge"
                            )}
                          >
                            {account.accountType}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {getStatusIcon(account)}
                          <span className="text-xs text-muted-foreground">
                            {getStatusLabel(account)}
                          </span>
                          {account.lastSyncAt && (
                            <>
                              <span className="text-xs text-muted-foreground">•</span>
                              <span className="text-xs text-muted-foreground">
                                Синхр: {new Date(account.lastSyncAt).toLocaleTimeString("ru-RU")}
                              </span>
                            </>
                          )}
                        </div>
                        {account.lastError && (
                          <p className="text-xs text-red-500 mt-0.5 line-clamp-1">
                            {account.lastError}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={account.isActive}
                        onCheckedChange={() => handleToggleActive(account)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openSettings(account)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDisconnect(account)}
                      >
                        <Unlink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Summary Stats */}
        <div className="px-6 pt-4 border-t border-border">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">
                {accounts.filter((a) => a.isActive).length}
              </p>
              <p className="text-xs text-muted-foreground">Активных</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {accounts.filter((a) => a.accountType === "REAL").length}
              </p>
              <p className="text-xs text-muted-foreground">Real</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {accounts.filter((a) => a.accountType === "DEMO").length}
              </p>
              <p className="text-xs text-muted-foreground">Demo</p>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Настройки {selectedAccount?.exchangeName}
            </DialogTitle>
            <DialogDescription>
              Управление подключением к бирже
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedAccount && (
              <>
                {/* Status */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-2">
                    {selectedAccount.lastError ? (
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                    ) : selectedAccount.isActive ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <Clock className="h-5 w-5 text-yellow-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {selectedAccount.lastError ? "Ошибка подключения" : selectedAccount.isActive ? "Подключено" : "Отключено"}
                      </p>
                      {selectedAccount.lastSyncAt && (
                        <p className="text-xs text-muted-foreground">
                          Последняя синхронизация: {new Date(selectedAccount.lastSyncAt).toLocaleString("ru-RU")}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant={selectedAccount.isTestnet ? "outline" : "default"}>
                    {selectedAccount.isTestnet ? "Testnet" : "Mainnet"}
                  </Badge>
                </div>

                {selectedAccount.lastError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-500 font-medium mb-1">Ошибка:</p>
                    <p className="text-xs text-red-500">{selectedAccount.lastError}</p>
                  </div>
                )}

                {/* API Key info */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Key className="h-3 w-3" />
                    API ключ
                  </Label>
                  <Input value={selectedAccount.apiKey || "Не указан"} disabled />
                </div>

                {/* Account type */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <span className="text-sm">Тип аккаунта</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      selectedAccount.accountType === "DEMO" ? "demo-badge" : "real-badge"
                    )}
                  >
                    {selectedAccount.accountType}
                  </Badge>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleVerify}
                    disabled={isVerifying}
                  >
                    {isVerifying ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-1" />
                    )}
                    Проверить
                  </Button>
                  <Button
                    variant={selectedAccount.isActive ? "destructive" : "default"}
                    className="flex-1"
                    onClick={() => {
                      handleToggleActive(selectedAccount);
                      setShowSettingsDialog(false);
                    }}
                    disabled={isUpdating}
                  >
                    {selectedAccount.isActive ? "Отключить" : "Активировать"}
                  </Button>
                </div>

                {/* Disconnect */}
                <Button
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => {
                    handleDisconnect(selectedAccount);
                    setShowSettingsDialog(false);
                  }}
                >
                  <Unlink className="h-4 w-4 mr-1" />
                  Отключить биржу
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
