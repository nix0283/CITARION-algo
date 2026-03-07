"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SUPPORTED_EXCHANGES,
  EXCHANGE_GROUPS,
  getExchangeById,
  type ExchangeType,
  type Exchange,
} from "@/lib/exchanges";
import {
  Building2,
  Plus,
  Check,
  AlertCircle,
  Settings,
  Key,
  TestTube,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ExchangeSelectorProps {
  selectedExchange?: string;
  selectedType?: ExchangeType;
  onExchangeChange?: (exchangeId: string, type: ExchangeType) => void;
}

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

export function ExchangeSelector({
  selectedExchange = "binance",
  selectedType = "futures",
  onExchangeChange,
}: ExchangeSelectorProps) {
  const [currentExchange, setCurrentExchange] = useState(selectedExchange);
  const [currentType, setCurrentType] = useState<ExchangeType>(selectedType);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<ConnectedAccount | null>(null);
  
  // Form state
  const [formExchange, setFormExchange] = useState("binance");
  const [formType, setFormType] = useState<ExchangeType>("futures");
  const [formApiKey, setFormApiKey] = useState("");
  const [formApiSecret, setFormApiSecret] = useState("");
  const [formPassphrase, setFormPassphrase] = useState("");
  const [formTestnet, setFormTestnet] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  
  // Connected accounts from API
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);

  // Fetch connected accounts
  const fetchAccounts = async () => {
    try {
      const response = await fetch("/api/exchange");
      if (response.ok) {
        const data = await response.json();
        setConnectedAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Get unique exchanges for select
  const uniqueExchanges = SUPPORTED_EXCHANGES.reduce((acc, exchange) => {
    if (!acc.find(e => e.id === exchange.id)) {
      acc.push(exchange);
    }
    return acc;
  }, [] as Exchange[]);

  const selectedExchangeConfig = getExchangeById(formExchange, formType);

  const handleExchangeSelect = (exchangeId: string, type: ExchangeType) => {
    setCurrentExchange(exchangeId);
    setCurrentType(type);
    onExchangeChange?.(exchangeId, type);
  };

  const openSettingsFor = (exchangeId: string, type: ExchangeType) => {
    const account = connectedAccounts.find(
      a => a.exchangeId === exchangeId && a.exchangeType === type
    );
    if (account) {
      setSelectedAccount(account);
      setFormExchange(account.exchangeId);
      setFormType(account.exchangeType as ExchangeType);
      setFormTestnet(account.isTestnet);
      setShowSettingsDialog(true);
    } else {
      // Open add dialog
      setFormExchange(exchangeId);
      setFormType(type);
      setFormApiKey("");
      setFormApiSecret("");
      setFormPassphrase("");
      setFormTestnet(false);
      setShowAddDialog(true);
    }
  };

  const handleSubmit = async () => {
    if (!formApiKey || !formApiSecret) {
      toast.error("API Key и API Secret обязательны");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchangeId: formExchange,
          exchangeType: formType,
          exchangeName: selectedExchangeConfig?.displayName || formExchange,
          apiKey: formApiKey,
          apiSecret: formApiSecret,
          apiPassphrase: formPassphrase || null,
          isTestnet: formTestnet,
          accountType: "REAL",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message);
        setShowAddDialog(false);
        fetchAccounts();
        // Reset form
        setFormApiKey("");
        setFormApiSecret("");
        setFormPassphrase("");
      } else {
        toast.error(data.error || "Ошибка подключения");
      }
    } catch (error) {
      toast.error("Ошибка соединения");
    } finally {
      setIsSubmitting(false);
    }
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
      } else {
        toast.error(data.message || "Ошибка верификации");
      }
    } catch (error) {
      toast.error("Ошибка верификации");
    } finally {
      setIsVerifying(false);
    }
  };

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
      }
    } catch (error) {
      toast.error("Ошибка");
    }
  };

  // Check if exchange is connected
  const isExchangeConnected = (exchangeId: string, type: ExchangeType) => {
    return connectedAccounts.some(
      a => a.exchangeId === exchangeId && a.exchangeType === type && a.isActive
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-5 w-5 text-primary" />
            Выбор биржи
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFormExchange("binance");
              setFormType("futures");
              setFormApiKey("");
              setFormApiSecret("");
              setFormPassphrase("");
              setFormTestnet(false);
              setShowAddDialog(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Добавить
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="futures" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="spot">Spot</TabsTrigger>
            <TabsTrigger value="futures">Futures</TabsTrigger>
            <TabsTrigger value="inverse">Inverse</TabsTrigger>
          </TabsList>

          {(["spot", "futures", "inverse"] as ExchangeType[]).map((type) => (
            <TabsContent key={type} value={type} className="mt-0">
              <ScrollArea className="h-[300px]">
                <div className="grid grid-cols-2 gap-2 pr-4">
                  {EXCHANGE_GROUPS[type].map((exchange) => {
                    const isSelected =
                      currentExchange === exchange.id && currentType === type;
                    const isConnected = isExchangeConnected(exchange.id, type);
                    
                    return (
                      <button
                        key={`${exchange.id}-${type}`}
                        onClick={() => handleExchangeSelect(exchange.id, type)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border transition-all text-left relative",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:border-primary/50 hover:bg-secondary/50"
                        )}
                      >
                        {/* Connected indicator */}
                        {isConnected && (
                          <div className="absolute top-2 right-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          </div>
                        )}

                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">
                              {exchange.displayName}
                            </span>
                            {isSelected && (
                              <Badge
                                variant="default"
                                className="h-5 px-1.5 text-xs"
                              >
                                <Check className="h-3 w-3 mr-0.5" />
                                Выбрана
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              Maker: {(exchange.fees.maker * 100).toFixed(2)}%
                            </span>
                            <span className="text-xs text-muted-foreground">
                              •
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Taker: {(exchange.fees.taker * 100).toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>

        {/* Selected Exchange Info */}
        {currentExchange && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {getExchangeById(currentExchange)?.displayName} •{" "}
                  <span className="text-muted-foreground capitalize">
                    {currentType}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {getExchangeById(currentExchange)?.features.hedgeMode
                    ? "✓ Hedge Mode"
                    : "✗ Hedge Mode"}
                  {" • "}
                  {getExchangeById(currentExchange)?.features.trailingStop
                    ? "✓ Trailing Stop"
                    : "✗ Trailing Stop"}
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => openSettingsFor(currentExchange, currentType)}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Add Exchange Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Подключить биржу
            </DialogTitle>
            <DialogDescription>
              Введите API ключи для подключения реальной биржи
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Биржа</Label>
              <Select value={formExchange} onValueChange={setFormExchange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {uniqueExchanges.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Тип</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as ExchangeType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spot">Spot</SelectItem>
                  <SelectItem value="futures">Futures</SelectItem>
                  <SelectItem value="inverse">Inverse</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div className="flex items-center gap-2">
                <TestTube className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Тестовый режим (Testnet)</span>
              </div>
              <Switch
                checked={formTestnet}
                onCheckedChange={setFormTestnet}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Key className="h-3 w-3" />
                API ключ
              </Label>
              <Input
                type="password"
                placeholder="Введите API ключ"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Key className="h-3 w-3" />
                Секретный ключ
              </Label>
              <Input
                type="password"
                placeholder="Введите секретный ключ"
                value={formApiSecret}
                onChange={(e) => setFormApiSecret(e.target.value)}
              />
            </div>

            {selectedExchangeConfig?.requiresPassphrase && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Key className="h-3 w-3" />
                  API пароль
                </Label>
                <Input
                  type="password"
                  placeholder="Введите пароль"
                  value={formPassphrase}
                  onChange={(e) => setFormPassphrase(e.target.value)}
                />
              </div>
            )}

            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  <p className="font-medium">Важно!</p>
                  <p className="mt-1">
                    Убедитесь, что API ключ имеет только права на чтение и торговлю.
                    Запрещено использовать ключи с правом вывода средств.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowAddDialog(false)}
              >
                Отмена
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={isSubmitting || !formApiKey || !formApiSecret}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Подключить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : selectedAccount.isActive ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {selectedAccount.lastError ? "Ошибка" : selectedAccount.isActive ? "Активен" : "Отключён"}
                      </p>
                      {selectedAccount.lastSyncAt && (
                        <p className="text-xs text-muted-foreground">
                          Синхронизация: {new Date(selectedAccount.lastSyncAt).toLocaleString("ru-RU")}
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
                    <p className="text-xs text-red-500">{selectedAccount.lastError}</p>
                  </div>
                )}

                {/* API Key info */}
                <div className="space-y-2">
                  <Label>API ключ</Label>
                  <Input value={selectedAccount.apiKey || "Не указан"} disabled />
                </div>

                {/* Testnet toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-2">
                    <TestTube className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Тестовый режим (Testnet)</span>
                  </div>
                  <Switch
                    checked={selectedAccount.isTestnet}
                    disabled
                  />
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
                    onClick={() => handleToggleActive(selectedAccount)}
                  >
                    {selectedAccount.isActive ? "Отключить" : "Активировать"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
