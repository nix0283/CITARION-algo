"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  ArrowLeftRight,
  Building2,
  Key, 
  TestTube, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  AlertTriangle,
  Settings,
  ExternalLink
} from "lucide-react";

// Exchange configurations
const EXCHANGES = [
  {
    id: "binance",
    name: "Binance",
    hasTestnet: true,
    hasDemo: false,
    testnetUrl: "https://testnet.binancefuture.com",
    docsUrl: "https://www.binance.com/en/support/faq/how-to-create-api-keys-on-binance-360002502072"
  },
  {
    id: "bybit",
    name: "Bybit",
    hasTestnet: true,
    hasDemo: false,
    testnetUrl: "https://testnet.bybit.com",
    docsUrl: "https://www.bybit.com/en-US/help-center/article/How-to-create-an-API-key"
  },
  {
    id: "okx",
    name: "OKX",
    hasTestnet: false,
    hasDemo: true,
    testnetUrl: null,
    docsUrl: "https://www.okx.com/learn/how-to-create-an-okx-api-key"
  },
  {
    id: "bitget",
    name: "Bitget",
    hasTestnet: false,
    hasDemo: true,
    testnetUrl: null,
    docsUrl: "https://www.bitget.com/academy/how-to-create-bitget-api-key"
  },
  {
    id: "bingx",
    name: "BingX",
    hasTestnet: false,
    hasDemo: true,
    testnetUrl: null,
    docsUrl: "https://bingx.com/en-us/academy/detail/How-to-create-API-key-on-BingX.htm"
  }
] as const;

type ExchangeId = typeof EXCHANGES[number]["id"];
type TradingMode = "PAPER" | "TESTNET" | "DEMO" | "LIVE";

interface BotExchangeConfigProps {
  botType: string;
  botId?: string;
  currentExchange?: ExchangeId;
  currentMode?: TradingMode;
  onConfigChange?: (config: {
    exchange: ExchangeId;
    mode: TradingMode;
    apiKey?: string;
    apiSecret?: string;
    passphrase?: string;
  }) => void;
}

interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

export function BotExchangeConfig({
  botType,
  botId,
  currentExchange = "binance",
  currentMode = "PAPER",
  onConfigChange
}: BotExchangeConfigProps) {
  const [selectedExchange, setSelectedExchange] = useState<ExchangeId>(currentExchange);
  const [tradingMode, setTradingMode] = useState<TradingMode>(currentMode);
  const [credentials, setCredentials] = useState<ExchangeCredentials>({
    apiKey: "",
    apiSecret: "",
    passphrase: ""
  });
  const [showCredentials, setShowCredentials] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const exchange = EXCHANGES.find(e => e.id === selectedExchange)!;

  const getAvailableModes = useCallback(() => {
    const modes: TradingMode[] = ["PAPER"];
    
    if (exchange.hasTestnet) {
      modes.push("TESTNET");
    }
    if (exchange.hasDemo) {
      modes.push("DEMO");
    }
    modes.push("LIVE");
    
    return modes;
  }, [exchange]);

  const handleConnect = async () => {
    if (tradingMode === "PAPER") {
      setConnectionStatus("success");
      onConfigChange?.({
        exchange: selectedExchange,
        mode: tradingMode
      });
      return;
    }

    if (!credentials.apiKey || !credentials.apiSecret) {
      setErrorMessage("API Key and Secret are required for real trading");
      setConnectionStatus("error");
      return;
    }

    setIsConnecting(true);
    setConnectionStatus("idle");
    setErrorMessage("");

    try {
      const response = await fetch("/api/exchange/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: selectedExchange,
          mode: tradingMode,
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          passphrase: credentials.passphrase
        })
      });

      const data = await response.json();

      if (data.success) {
        setConnectionStatus("success");
        onConfigChange?.({
          exchange: selectedExchange,
          mode: tradingMode,
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          passphrase: credentials.passphrase
        });
      } else {
        setConnectionStatus("error");
        setErrorMessage(data.error || "Connection failed");
      }
    } catch (error) {
      setConnectionStatus("error");
      setErrorMessage("Failed to connect to exchange");
    } finally {
      setIsConnecting(false);
    }
  };

  const getModeDescription = (mode: TradingMode): string => {
    switch (mode) {
      case "PAPER":
        return "Simulated trading without real funds";
      case "TESTNET":
        return "Test network with fake funds (exchange testnet)";
      case "DEMO":
        return "Demo mode on live exchange";
      case "LIVE":
        return "⚠️ Real trading with actual funds";
      default:
        return "";
    }
  };

  const getModeColor = (mode: TradingMode): string => {
    switch (mode) {
      case "PAPER":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "TESTNET":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "DEMO":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "LIVE":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "";
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5" />
          Exchange Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Exchange Selection */}
        <div className="space-y-2">
          <Label>Select Exchange</Label>
          <Select
            value={selectedExchange}
            onValueChange={(value) => {
              setSelectedExchange(value as ExchangeId);
              setConnectionStatus("idle");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select exchange" />
            </SelectTrigger>
            <SelectContent>
              {EXCHANGES.map((ex) => (
                <SelectItem key={ex.id} value={ex.id}>
                  <div className="flex items-center gap-2">
                    <span>{ex.name}</span>
                    <div className="flex gap-1">
                      {ex.hasTestnet && (
                        <Badge variant="outline" className="text-xs">Testnet</Badge>
                      )}
                      {ex.hasDemo && (
                        <Badge variant="outline" className="text-xs">Demo</Badge>
                      )}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Trading Mode Selection */}
        <div className="space-y-2">
          <Label>Trading Mode</Label>
          <Select
            value={tradingMode}
            onValueChange={(value) => {
              setTradingMode(value as TradingMode);
              setConnectionStatus("idle");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent>
              {getAvailableModes().map((mode) => (
                <SelectItem key={mode} value={mode}>
                  <div className="flex items-center gap-2">
                    <Badge className={getModeColor(mode)} variant="outline">
                      {mode}
                    </Badge>
                    <span className="text-muted-foreground text-sm">
                      {getModeDescription(mode)}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Credentials for non-PAPER modes */}
        {tradingMode !== "PAPER" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                API Credentials
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCredentials(!showCredentials)}
              >
                {showCredentials ? "Hide" : "Show"}
              </Button>
            </div>

            {showCredentials && (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="Enter your API key"
                    value={credentials.apiKey}
                    onChange={(e) => setCredentials({ ...credentials, apiKey: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiSecret">API Secret</Label>
                  <Input
                    id="apiSecret"
                    type="password"
                    placeholder="Enter your API secret"
                    value={credentials.apiSecret}
                    onChange={(e) => setCredentials({ ...credentials, apiSecret: e.target.value })}
                  />
                </div>

                {(exchange.id === "okx" || exchange.id === "bitget" || exchange.id === "kucoin") && (
                  <div className="space-y-2">
                    <Label htmlFor="passphrase">Passphrase</Label>
                    <Input
                      id="passphrase"
                      type="password"
                      placeholder="Enter your passphrase"
                      value={credentials.passphrase || ""}
                      onChange={(e) => setCredentials({ ...credentials, passphrase: e.target.value })}
                    />
                  </div>
                )}

                <a
                  href={exchange.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-3 w-3" />
                  How to create API keys for {exchange.name}
                </a>
              </div>
            )}

            {tradingMode === "TESTNET" && exchange.testnetUrl && (
              <Alert>
                <TestTube className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Get testnet funds at{" "}
                  <a
                    href={exchange.testnetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-primary"
                  >
                    {exchange.testnetUrl}
                  </a>
                </AlertDescription>
              </Alert>
            )}

            {tradingMode === "LIVE" && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Warning: LIVE mode will trade with real funds. Ensure you understand the risks.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Connection Status */}
        {connectionStatus !== "idle" && (
          <Alert variant={connectionStatus === "success" ? "default" : "destructive"}>
            {connectionStatus === "success" ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <AlertDescription>
              {connectionStatus === "success"
                ? `Connected to ${exchange.name} in ${tradingMode} mode`
                : errorMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Connect Button */}
        <Button
          className="w-full"
          onClick={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : tradingMode === "PAPER" ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Use Paper Trading
            </>
          ) : (
            <>
              <Key className="h-4 w-4 mr-2" />
              Connect to {exchange.name}
            </>
          )}
        </Button>

        {/* Current Config Summary */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Settings className="h-4 w-4" />
          <span>
            {botType} bot • {exchange.name} • 
            <Badge className={`ml-1 ${getModeColor(tradingMode)}`} variant="outline">
              {tradingMode}
            </Badge>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default BotExchangeConfig;
