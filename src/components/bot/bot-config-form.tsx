"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DollarSign,
  TrendingUp,
  Target,
  Shield,
  Filter,
  Zap,
  Bell,
  Save,
  RotateCcw,
  Percent,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Helper function for trailing type descriptions
function getTrailingDescription(type: string): string {
  switch (type) {
    case "BREAKEVEN":
      return "SL перемещается на цену безубытка после достижения триггера. Защищает от убытков.";
    case "MOVING_TARGET":
      return "SL следует за ценой на расстоянии 1 таргета. Идеально для трендовых движений.";
    case "MOVING_2_TARGET":
      return "SL следует за ценой на расстоянии 2 таргетов. Даёт больше пространства для движения.";
    case "PERCENT_BELOW_TRIGGERS":
      return "SL устанавливается на X% ниже цены активации. Фиксированная защита.";
    case "PERCENT_BELOW_HIGHEST":
      return "SL следует за максимальной ценой. Классический динамический трейлинг-стоп.";
    default:
      return "";
  }
}

// Types for bot configuration
interface BotConfigData {
  // General
  tradeAmount: number;
  amountType: "FIXED" | "PERCENTAGE";
  amountOverride: boolean;
  closeOnTPSLBeforeEntry: boolean;
  
  // First Entry as Market (Cornix-compatible)
  firstEntryAsMarketEnabled: boolean;
  firstEntryAsMarketCap: number; // 0.05-20
  firstEntryAsMarketActivate: "ENTRY_PRICE_REACHED" | "IMMEDIATELY";
  
  // Trailing (5 Cornix-compatible types)
  trailingEnabled: boolean;
  trailingType: "BREAKEVEN" | "MOVING_TARGET" | "MOVING_2_TARGET" | "PERCENT_BELOW_TRIGGERS" | "PERCENT_BELOW_HIGHEST";
  trailingTriggerType: "TARGET_REACHED" | "PERCENT_ABOVE_ENTRY";
  trailingTriggerValue: number;
  trailingPercent: number; // % distance for PERCENT_BELOW_TRIGGERS, PERCENT_BELOW_HIGHEST
  
  // Entry Strategy
  entryStrategy: "EVENLY_DIVIDED" | "CUSTOM_RATIOS" | "DECREASING_EXP" | "INCREASING_EXP" | "DCA";
  entryWeights: number[];
  entryZoneTargets: number;

  // DCA Entry Settings (Cornix-compatible)
  dcaFirstEntryPercent: number | null;
  dcaAmountScale: number;
  dcaPriceDiff: number;
  dcaPriceScale: number;
  dcaMaxPriceDiff: number;
  
  // Take-Profit
  tpStrategy: "ONE_TARGET" | "MULTIPLE_TARGETS" | "ALL_TARGETS";
  tpTargetCount: number;
  tpCustomRatios: number[];
  
  // Take Profit Grace (Cornix-compatible)
  tpGraceEnabled: boolean;
  tpGraceMaxCap: number; // Maximum price cap % for retries
  
  // Stop-Loss
  defaultStopLoss: number | null;
  slTimeout: number;
  slTimeoutUnit: "SECONDS" | "MINUTES" | "HOURS";
  slOrderType: "MARKET" | "LIMIT";
  
  // Margin
  leverage: number;
  leverageOverride: boolean;
  hedgeMode: boolean;
  marginMode: "ISOLATED" | "CROSSED";
  
  // Filters
  maxOpenTrades: number;
  minTradeInterval: number;
  blacklistedSymbols: string[];
  
  // Fee Settings (Customizable)
  useCustomFees: boolean;
  spotMakerFee: number;      // 0.001 = 0.1%
  spotTakerFee: number;      // 0.001 = 0.1%
  futuresMakerFee: number;   // 0.0002 = 0.02%
  futuresTakerFee: number;   // 0.0004 = 0.04%
  slippagePercent: number;   // 0.0005 = 0.05%
  
  // Notifications
  notifyOnEntry: boolean;
  notifyOnExit: boolean;
  notifyOnSL: boolean;
  notifyOnTP: boolean;
  notifyOnError: boolean;
}

const DEFAULT_CONFIG: BotConfigData = {
  tradeAmount: 100,
  amountType: "FIXED",
  amountOverride: false,
  closeOnTPSLBeforeEntry: true,
  firstEntryAsMarketEnabled: false,
  firstEntryAsMarketCap: 1, // 1% default
  firstEntryAsMarketActivate: "ENTRY_PRICE_REACHED",
  
  trailingEnabled: false,
  trailingType: "BREAKEVEN",
  trailingTriggerType: "TARGET_REACHED",
  trailingTriggerValue: 1,
  trailingPercent: 2, // Default 2% for percent-based trailing
  
  entryStrategy: "EVENLY_DIVIDED",
  entryWeights: [],
  entryZoneTargets: 1,

  // DCA Entry Settings
  dcaFirstEntryPercent: null,
  dcaAmountScale: 1.5,
  dcaPriceDiff: 1,
  dcaPriceScale: 1,
  dcaMaxPriceDiff: 10,
  
  tpStrategy: "ONE_TARGET",
  tpTargetCount: 1,
  tpCustomRatios: [],
  
  // Take Profit Grace (Cornix-compatible)
  tpGraceEnabled: false,
  tpGraceMaxCap: 0.5, // 0.5% default max cap
  
  defaultStopLoss: 15,
  slTimeout: 0,
  slTimeoutUnit: "MINUTES",
  slOrderType: "MARKET",
  
  leverage: 10,
  leverageOverride: false,
  hedgeMode: false,
  marginMode: "ISOLATED",
  
  maxOpenTrades: 5,
  minTradeInterval: 5,
  blacklistedSymbols: [],
  
  // Fee Settings (Default values)
  useCustomFees: false,
  spotMakerFee: 0.001,       // 0.1%
  spotTakerFee: 0.001,       // 0.1%
  futuresMakerFee: 0.0002,   // 0.02%
  futuresTakerFee: 0.0004,   // 0.04%
  slippagePercent: 0.0005,   // 0.05%
  
  notifyOnEntry: true,
  notifyOnExit: true,
  notifyOnSL: true,
  notifyOnTP: true,
  notifyOnError: true,
};

export function BotConfigForm() {
  const [config, setConfig] = useState<BotConfigData>(DEFAULT_CONFIG);
  const [hasChanges, setHasChanges] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/bot/config");
        const data = await response.json();
        if (data.success && data.config) {
          setConfig({ ...DEFAULT_CONFIG, ...data.config });
        }
      } catch (error) {
        console.error("Failed to load config:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadConfig();
  }, []);

  const updateConfig = <K extends keyof BotConfigData>(key: K, value: BotConfigData[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/bot/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await response.json();
      
      if (data.success) {
        toast.success(data.message || "Настройки бота сохранены");
        setHasChanges(false);
        // Update config with returned data (including id)
        if (data.config) {
          setConfig({ ...DEFAULT_CONFIG, ...data.config });
        }
      } else {
        throw new Error(data.error || "Ошибка сохранения");
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error(error instanceof Error ? error.message : "Ошибка при сохранении");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    setHasChanges(false);
    setShowResetDialog(false);
    toast.info("Настройки сброшены");
  };

  return (
    <div className="space-y-4">
      {/* Header with Save Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Конфигурация бота</h2>
          <p className="text-sm text-muted-foreground">
            Настройте параметры автоматической торговли
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-amber-500 border-amber-500/30">
              Несохранённые изменения
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowResetDialog(true)}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Сбросить
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            {isSaving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["general", "trailing", "strategies", "stoploss", "filters", "margin", "fees"]} className="space-y-4">
        
        {/* ==================== GENERAL SETTINGS ==================== */}
        <AccordionItem value="general" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <span className="font-medium">General (Общие настройки)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Amount per Trade */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Amount per Trade</Label>
                  <Select
                    value={config.amountType}
                    onValueChange={(v) => updateConfig("amountType", v as "FIXED" | "PERCENTAGE")}
                  >
                    <SelectTrigger className="w-[140px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED">Fixed (USDT)</SelectItem>
                      <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    value={config.tradeAmount}
                    onChange={(e) => updateConfig("tradeAmount", parseFloat(e.target.value))}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">
                    {config.amountType === "PERCENTAGE" ? "% от баланса" : "USDT"}
                  </span>
                </div>
                
                {/* Override Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div>
                    <p className="text-sm font-medium">Override</p>
                    <p className="text-xs text-muted-foreground">
                      Использовать вашу настройку вместо сигнала канала
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className={cn("text-xs", !config.amountOverride && "text-muted-foreground")}>
                      No
                    </Label>
                    <Switch
                      checked={config.amountOverride}
                      onCheckedChange={(v) => updateConfig("amountOverride", v)}
                    />
                    <Label className={cn("text-xs", config.amountOverride && "text-primary")}>
                      Yes
                    </Label>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Close Trade on TP/SL before Entry */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Close Trade on TP/SL before Entry</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Автоматически закрывать сделку при достижении TP/SL без входа
                  </p>
                </div>
                <Switch
                  checked={config.closeOnTPSLBeforeEntry}
                  onCheckedChange={(v) => updateConfig("closeOnTPSLBeforeEntry", v)}
                />
              </div>

              <Separator />

              {/* First Entry as Market - Cornix-compatible */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">First Entry as Market</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Расширяет диапазон цены первого входа для увеличения вероятности исполнения
                    </p>
                  </div>
                  <Switch
                    checked={config.firstEntryAsMarketEnabled}
                    onCheckedChange={(v) => updateConfig("firstEntryAsMarketEnabled", v)}
                  />
                </div>

                {config.firstEntryAsMarketEnabled && (
                  <>
                    {/* Maximum Price Cap */}
                    <div className="space-y-2 p-3 rounded-lg bg-secondary/50">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Maximum Price Cap</Label>
                        <Badge variant="outline" className="text-xs">
                          {config.firstEntryAsMarketCap}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Максимальное расширение цены от оригинального уровня
                      </p>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[config.firstEntryAsMarketCap]}
                          onValueChange={([v]) => updateConfig("firstEntryAsMarketCap", v)}
                          max={20}
                          min={0.05}
                          step={0.05}
                          className="flex-1"
                        />
                        <span className="text-sm font-mono w-12 text-right">
                          {config.firstEntryAsMarketCap}%
                        </span>
                      </div>
                    </div>

                    {/* When to Activate */}
                    <div className="space-y-2 p-3 rounded-lg bg-secondary/50">
                      <Label className="text-xs font-medium">When to Activate</Label>
                      <p className="text-xs text-muted-foreground">
                        Когда начинать расширять цену входа
                      </p>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <button
                          onClick={() => updateConfig("firstEntryAsMarketActivate", "ENTRY_PRICE_REACHED")}
                          className={cn(
                            "p-3 rounded-lg border text-left transition-colors",
                            config.firstEntryAsMarketActivate === "ENTRY_PRICE_REACHED"
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-secondary/50"
                          )}
                        >
                          <p className="font-medium text-sm">Entry Price Reached</p>
                          <p className="text-xs text-muted-foreground">
                            Активируется при достижении цены входа
                          </p>
                        </button>
                        <button
                          onClick={() => updateConfig("firstEntryAsMarketActivate", "IMMEDIATELY")}
                          className={cn(
                            "p-3 rounded-lg border text-left transition-colors",
                            config.firstEntryAsMarketActivate === "IMMEDIATELY"
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-secondary/50"
                          )}
                        >
                          <p className="font-medium text-sm">Immediately</p>
                          <p className="text-xs text-muted-foreground">
                            Активируется сразу при открытии сделки
                          </p>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== TRAILING SETTINGS ==================== */}
        <AccordionItem value="trailing" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="font-medium">Trailing (Трейлинг)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Trailing Enable */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Включить Trailing Stop</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Стоп-лосс будет перемещаться вслед за ценой
                  </p>
                </div>
                <Switch
                  checked={config.trailingEnabled}
                  onCheckedChange={(v) => updateConfig("trailingEnabled", v)}
                />
              </div>

              {config.trailingEnabled && (
                <>
                  <Separator />
                  
                  {/* Trailing Type with Descriptions */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Тип трейлинга</Label>
                    
                    {/* Type Cards */}
                    <div className="grid grid-cols-1 gap-2">
                      {/* BREAKEVEN */}
                      <button
                        type="button"
                        onClick={() => updateConfig("trailingType", "BREAKEVEN")}
                        className={cn(
                          "p-3 rounded-lg border text-left transition-colors",
                          config.trailingType === "BREAKEVEN"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-secondary/50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">🔹 Breakeven</p>
                          <Badge variant="outline" className="text-xs">Безубыток</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          SL перемещается на точку безубытка (средняя цена входа)
                        </p>
                      </button>

                      {/* MOVING_TARGET */}
                      <button
                        type="button"
                        onClick={() => updateConfig("trailingType", "MOVING_TARGET")}
                        className={cn(
                          "p-3 rounded-lg border text-left transition-colors",
                          config.trailingType === "MOVING_TARGET"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-secondary/50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">📍 Moving Target</p>
                          <Badge variant="outline" className="text-xs">1 TP дистанция</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          SL перемещается на расстояние 1 таргета от последнего достигнутого TP
                        </p>
                      </button>

                      {/* MOVING_2_TARGET */}
                      <button
                        type="button"
                        onClick={() => updateConfig("trailingType", "MOVING_2_TARGET")}
                        className={cn(
                          "p-3 rounded-lg border text-left transition-colors",
                          config.trailingType === "MOVING_2_TARGET"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-secondary/50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">🎯 Moving 2-Target</p>
                          <Badge variant="outline" className="text-xs">2 TP дистанции</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          SL перемещается на расстояние 2 таргетов от последнего достигнутого TP
                        </p>
                      </button>

                      {/* PERCENT_BELOW_TRIGGERS */}
                      <button
                        type="button"
                        onClick={() => updateConfig("trailingType", "PERCENT_BELOW_TRIGGERS")}
                        className={cn(
                          "p-3 rounded-lg border text-left transition-colors",
                          config.trailingType === "PERCENT_BELOW_TRIGGERS"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-secondary/50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">📊 % Below Triggers</p>
                          <Badge variant="outline" className="text-xs">Фиксированный %</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          SL устанавливается на X% ниже триггер-цены (цены активации)
                        </p>
                      </button>

                      {/* PERCENT_BELOW_HIGHEST */}
                      <button
                        type="button"
                        onClick={() => updateConfig("trailingType", "PERCENT_BELOW_HIGHEST")}
                        className={cn(
                          "p-3 rounded-lg border text-left transition-colors",
                          config.trailingType === "PERCENT_BELOW_HIGHEST"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-secondary/50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">📈 % Below Highest</p>
                          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-500">Динамический</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          SL следует за максимальной ценой на расстоянии X% (классический трейлинг)
                        </p>
                      </button>
                    </div>
                  </div>

                  <Separator />

                  {/* Trigger Settings - for types that need trigger */}
                  {["BREAKEVEN", "MOVING_TARGET", "MOVING_2_TARGET", "PERCENT_BELOW_TRIGGERS"].includes(config.trailingType) && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">Условие активации</Label>
                        <Badge variant="secondary" className="text-xs">Триггер</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Select
                            value={config.trailingTriggerType}
                            onValueChange={(v) => updateConfig("trailingTriggerType", v as BotConfigData["trailingTriggerType"])}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="TARGET_REACHED">Target достигнут</SelectItem>
                              <SelectItem value="PERCENT_ABOVE_ENTRY">% выше входа</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={config.trailingTriggerValue}
                              onChange={(e) => updateConfig("trailingTriggerValue", parseFloat(e.target.value) || 0)}
                              className="w-24"
                              min={config.trailingTriggerType === "TARGET_REACHED" ? 1 : 0}
                              max={config.trailingTriggerType === "TARGET_REACHED" ? 10 : 100}
                              step={config.trailingTriggerType === "TARGET_REACHED" ? 1 : 0.5}
                            />
                            <span className="text-sm text-muted-foreground">
                              {config.trailingTriggerType === "TARGET_REACHED" ? "Target #" : "%"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {config.trailingTriggerType === "TARGET_REACHED" 
                          ? `Активация при достижении TP${config.trailingTriggerValue}`
                          : `Активация при движении цены на ${config.trailingTriggerValue}% выше входа`
                        }
                      </p>
                    </div>
                  )}

                  {/* PERCENT_BELOW_HIGHEST - only needs trigger for activation */}
                  {config.trailingType === "PERCENT_BELOW_HIGHEST" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">Условие активации</Label>
                        <Badge variant="secondary" className="text-xs">Опционально</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Select
                            value={config.trailingTriggerType}
                            onValueChange={(v) => updateConfig("trailingTriggerType", v as BotConfigData["trailingTriggerType"])}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="TARGET_REACHED">Target достигнут</SelectItem>
                              <SelectItem value="PERCENT_ABOVE_ENTRY">% выше входа</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={config.trailingTriggerValue}
                              onChange={(e) => updateConfig("trailingTriggerValue", parseFloat(e.target.value) || 0)}
                              className="w-24"
                              min={0}
                              max={100}
                              step={0.5}
                            />
                            <span className="text-sm text-muted-foreground">
                              {config.trailingTriggerType === "TARGET_REACHED" ? "Target #" : "%"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Trailing Percent - for PERCENT_BELOW_TRIGGERS and PERCENT_BELOW_HIGHEST */}
                  {["PERCENT_BELOW_TRIGGERS", "PERCENT_BELOW_HIGHEST"].includes(config.trailingType) && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">
                            {config.trailingType === "PERCENT_BELOW_HIGHEST" 
                              ? "Trailing Distance" 
                              : "Stop Distance"
                            }
                          </Label>
                          <Badge variant="outline">{config.trailingPercent}%</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {config.trailingType === "PERCENT_BELOW_HIGHEST"
                            ? "Расстояние SL от максимальной цены"
                            : "Расстояние SL от триггер-цены"
                          }
                        </p>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[config.trailingPercent]}
                            onValueChange={([v]) => updateConfig("trailingPercent", v)}
                            max={20}
                            min={0.5}
                            step={0.5}
                            className="flex-1"
                          />
                          <span className="text-sm font-mono w-12 text-right">
                            {config.trailingPercent}%
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Info Box */}
                  <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      💡 <strong>Подсказка:</strong> {getTrailingDescription(config.trailingType)}
                    </p>
                  </div>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== STRATEGIES ==================== */}
        <AccordionItem value="strategies" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <span className="font-medium">Strategies (Стратегии)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Entry Zone Targets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Entry Zone - Number of Targets</Label>
                  <Badge variant="outline">{config.entryZoneTargets}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  На сколько частей разделить зону входа
                </p>
                <Slider
                  value={[config.entryZoneTargets]}
                  onValueChange={([v]) => updateConfig("entryZoneTargets", v)}
                  max={10}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>

              <Separator />

              {/* Entry Strategy */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Entry Strategy</Label>
                <p className="text-xs text-muted-foreground">
                  Распределение объема между ордерами входа
                </p>
                <Select
                  value={config.entryStrategy}
                  onValueChange={(v) => updateConfig("entryStrategy", v as BotConfigData["entryStrategy"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EVENLY_DIVIDED">Evenly Divided (Равномерно)</SelectItem>
                    <SelectItem value="CUSTOM_RATIOS">Custom Ratios (10-3-5-7...)</SelectItem>
                    <SelectItem value="DECREASING_EXP">Decreasing Exponential</SelectItem>
                    <SelectItem value="INCREASING_EXP">Increasing Exponential</SelectItem>
                    <SelectItem value="DCA">DCA (Dollar-Cost Averaging)</SelectItem>
                  </SelectContent>
                </Select>

                {config.entryStrategy === "CUSTOM_RATIOS" && (
                  <div className="mt-2 p-3 rounded-lg bg-secondary/50">
                    <Label className="text-xs">Проценты для каждого ордера (сумма = 100%)</Label>
                    <Input
                      placeholder="10, 30, 40, 20"
                      className="mt-1"
                    />
                  </div>
                )}

                {config.entryStrategy === "DCA" && (
                  <div className="mt-4 space-y-4 p-4 rounded-lg border bg-secondary/30">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="outline" className="bg-primary/10 text-primary">DCA Strategy</Badge>
                      <span className="text-xs text-muted-foreground">Cornix-compatible</span>
                    </div>

                    {/* First Entry Percent */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">First Entry %</Label>
                        <Switch
                          checked={config.dcaFirstEntryPercent !== null}
                          onCheckedChange={(v) => updateConfig("dcaFirstEntryPercent", v ? 20 : null)}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Процент от общей суммы для первого входа (null = равное распределение)
                      </p>
                      {config.dcaFirstEntryPercent !== null && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={config.dcaFirstEntryPercent}
                            onChange={(e) => updateConfig("dcaFirstEntryPercent", parseFloat(e.target.value))}
                            className="w-24"
                            min={1}
                            max={99}
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Amount Scale */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Amount Scale</Label>
                        <Badge variant="outline">{config.dcaAmountScale}x</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Множитель между ордерами (2 = удвоение каждого следующего)
                      </p>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[config.dcaAmountScale]}
                          onValueChange={([v]) => updateConfig("dcaAmountScale", v)}
                          max={5}
                          min={0.5}
                          step={0.1}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          value={config.dcaAmountScale}
                          onChange={(e) => updateConfig("dcaAmountScale", parseFloat(e.target.value))}
                          className="w-20"
                          min={0.5}
                          max={10}
                          step={0.1}
                        />
                      </div>
                    </div>

                    <Separator />

                    {/* Price Settings */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm">Price Diff %</Label>
                        <p className="text-xs text-muted-foreground">Разница цены 1-2 ордер</p>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={config.dcaPriceDiff}
                            onChange={(e) => updateConfig("dcaPriceDiff", parseFloat(e.target.value))}
                            className="w-full"
                            min={0.1}
                            max={50}
                            step={0.1}
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Price Scale</Label>
                        <p className="text-xs text-muted-foreground">Множитель разницы цены</p>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={config.dcaPriceScale}
                            onChange={(e) => updateConfig("dcaPriceScale", parseFloat(e.target.value))}
                            className="w-full"
                            min={0.5}
                            max={5}
                            step={0.1}
                          />
                          <span className="text-sm text-muted-foreground">x</span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Max Price Distance */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Max Price Distance</Label>
                        <Badge variant="outline">{config.dcaMaxPriceDiff}%</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Максимальная дистанция от первого до последнего ордера
                      </p>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[config.dcaMaxPriceDiff]}
                          onValueChange={([v]) => updateConfig("dcaMaxPriceDiff", v)}
                          max={50}
                          min={1}
                          step={0.5}
                          className="flex-1"
                        />
                        <span className="text-sm font-mono w-12 text-right">{config.dcaMaxPriceDiff}%</span>
                      </div>
                    </div>

                    {/* DCA Preview */}
                    <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
                      <p className="text-xs font-medium mb-2">Пример расчета (для 3 ордеров):</p>
                      <div className="text-xs text-muted-foreground space-y-1">
                        {config.dcaFirstEntryPercent !== null ? (
                          <>
                            <p>• Ордер 1: {config.dcaFirstEntryPercent.toFixed(1)}% от суммы</p>
                            <p>• Ордер 2: {(config.dcaFirstEntryPercent * config.dcaAmountScale).toFixed(1)}%</p>
                            <p>• Ордер 3: {(config.dcaFirstEntryPercent * Math.pow(config.dcaAmountScale, 2)).toFixed(1)}%</p>
                          </>
                        ) : (
                          <>
                            <p>• Amount Scale = {config.dcaAmountScale}x (каждый следующий ордер больше в {config.dcaAmountScale} раза)</p>
                            <p>• Price Diff = {config.dcaPriceDiff}% между 1 и 2 ордером</p>
                            <p>• Price Scale = {config.dcaPriceScale}x для последующих ордеров</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Take-Profit Strategy */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Take-Profit Strategy</Label>
                <p className="text-xs text-muted-foreground">
                  Стратегия фиксации прибыли
                </p>
                <Select
                  value={config.tpStrategy}
                  onValueChange={(v) => updateConfig("tpStrategy", v as BotConfigData["tpStrategy"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ONE_TARGET">One Target (Весь объем сразу)</SelectItem>
                    <SelectItem value="MULTIPLE_TARGETS">Multiple Targets (Частями)</SelectItem>
                    <SelectItem value="ALL_TARGETS">All Targets (По всем целям)</SelectItem>
                  </SelectContent>
                </Select>
                
                {config.tpStrategy === "MULTIPLE_TARGETS" && (
                  <div className="flex items-center gap-2 mt-2">
                    <Label className="text-xs">Кол-во целей:</Label>
                    <Input
                      type="number"
                      value={config.tpTargetCount}
                      onChange={(e) => updateConfig("tpTargetCount", parseInt(e.target.value))}
                      className="w-20"
                      min={1}
                      max={10}
                    />
                  </div>
                )}
              </div>

              <Separator />

              {/* Take Profit Grace (Cornix-compatible) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Take Profit Grace</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Увеличивает шансы исполнения TP при низкой ликвидности
                    </p>
                  </div>
                  <Switch
                    checked={config.tpGraceEnabled}
                    onCheckedChange={(v) => updateConfig("tpGraceEnabled", v)}
                  />
                </div>
                
                {config.tpGraceEnabled && (
                  <div className="space-y-3 p-3 rounded-lg bg-secondary/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-medium">Maximum Price Cap</Label>
                        <p className="text-xs text-muted-foreground">
                          Макс. отклонение цены при повторных попытках
                        </p>
                      </div>
                      <Badge variant="outline">{config.tpGraceMaxCap}%</Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[config.tpGraceMaxCap]}
                        onValueChange={([v]) => updateConfig("tpGraceMaxCap", v)}
                        max={5}
                        min={0.1}
                        step={0.1}
                        className="flex-1"
                      />
                      <span className="text-sm font-mono w-12 text-right">
                        {config.tpGraceMaxCap}%
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground p-2 rounded bg-background/50">
                      <p className="font-medium mb-1">Как работает:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li>Для LONG: цена понижается при каждой попытке</li>
                        <li>Для SHORT: цена повышается при каждой попытке</li>
                        <li>Повторяет пока не исполнится или не достигнет капа</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== STOP-LOSS ==================== */}
        <AccordionItem value="stoploss" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-medium">Stop-Loss (Стоп-лосс)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Default Stop-Loss */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Default Stop-Loss</Label>
                  <Switch
                    checked={config.defaultStopLoss !== null}
                    onCheckedChange={(v) => updateConfig("defaultStopLoss", v ? 15 : null)}
                  />
                </div>
                
                {config.defaultStopLoss !== null && (
                  <div className="flex items-center gap-4">
                    <Input
                      type="number"
                      value={config.defaultStopLoss}
                      onChange={(e) => updateConfig("defaultStopLoss", parseFloat(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">% от цены входа</span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Stop Timeout */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Stop Timeout</Label>
                <p className="text-xs text-muted-foreground">
                  Задержка перед срабатыванием SL (избегание проколов)
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={config.slTimeout}
                    onChange={(e) => updateConfig("slTimeout", parseInt(e.target.value))}
                    className="w-24"
                    min={0}
                  />
                  <Select
                    value={config.slTimeoutUnit}
                    onValueChange={(v) => updateConfig("slTimeoutUnit", v as BotConfigData["slTimeoutUnit"])}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SECONDS">Секунд</SelectItem>
                      <SelectItem value="MINUTES">Минут</SelectItem>
                      <SelectItem value="HOURS">Часов</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Stop Type */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Stop Order Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateConfig("slOrderType", "MARKET")}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-colors",
                      config.slOrderType === "MARKET"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/50"
                    )}
                  >
                    <p className="font-medium text-sm">Market</p>
                    <p className="text-xs text-muted-foreground">
                      Гарантирует исполнение
                    </p>
                  </button>
                  <button
                    onClick={() => updateConfig("slOrderType", "LIMIT")}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-colors",
                      config.slOrderType === "LIMIT"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/50"
                    )}
                  >
                    <p className="font-medium text-sm">Limit</p>
                    <p className="text-xs text-muted-foreground">
                      Гарантирует цену
                    </p>
                  </button>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== MARGIN ==================== */}
        <AccordionItem value="margin" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <span className="font-medium">Margin (Маржа)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Leverage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Leverage (Плечо)</Label>
                  <Badge variant="outline">{config.leverage}x</Badge>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[1, 2, 3, 5, 10, 20, 50, 100, 125].map((lev) => (
                    <Button
                      key={lev}
                      variant={config.leverage === lev ? "default" : "outline"}
                      size="sm"
                      className="w-12 h-8"
                      onClick={() => updateConfig("leverage", lev)}
                    >
                      {lev}x
                    </Button>
                  ))}
                </div>
                
                {/* Leverage Override */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 mt-2">
                  <div>
                    <p className="text-sm font-medium">Override</p>
                    <p className="text-xs text-muted-foreground">
                      Использовать ваше плечо вместо сигнала
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className={cn("text-xs", !config.leverageOverride && "text-muted-foreground")}>
                      No
                    </Label>
                    <Switch
                      checked={config.leverageOverride}
                      onCheckedChange={(v) => updateConfig("leverageOverride", v)}
                    />
                    <Label className={cn("text-xs", config.leverageOverride && "text-primary")}>
                      Yes
                    </Label>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Hedge Mode */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Mode (Hedge)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateConfig("hedgeMode", false)}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-colors",
                      !config.hedgeMode
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/50"
                    )}
                  >
                    <p className="font-medium text-sm">One-Way</p>
                    <p className="text-xs text-muted-foreground">
                      Только одна позиция (Long или Short)
                    </p>
                  </button>
                  <button
                    onClick={() => updateConfig("hedgeMode", true)}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-colors",
                      config.hedgeMode
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/50"
                    )}
                  >
                    <p className="font-medium text-sm">Hedge Mode</p>
                    <p className="text-xs text-muted-foreground">
                      Long и Short одновременно
                    </p>
                  </button>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== FILTERS ==================== */}
        <AccordionItem value="filters" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              <span className="font-medium">Auto-trading Filters</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Max Trades */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Max Trades</Label>
                  <Badge variant="outline">{config.maxOpenTrades}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Макс. количество одновременно открытых сделок
                </p>
                <Slider
                  value={[config.maxOpenTrades]}
                  onValueChange={([v]) => updateConfig("maxOpenTrades", v)}
                  max={20}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>

              <Separator />

              {/* Interval Between Trades */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Interval Between Trades</Label>
                  <Badge variant="outline">{config.minTradeInterval} мин</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Мин. интервал между сделками по одной паре
                </p>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[config.minTradeInterval]}
                    onValueChange={([v]) => updateConfig("minTradeInterval", v)}
                    max={60}
                    min={0}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono">{config.minTradeInterval} мин</span>
                </div>
              </div>

              <Separator />

              {/* Blacklisted Symbols */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Blacklisted Symbols/Pairs</Label>
                <p className="text-xs text-muted-foreground">
                  Монеты, которые бот должен игнорировать
                </p>
                <Input placeholder="BTCUSDT, ETHUSDT, DOGEUSDT..." />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== FEE SETTINGS ==================== */}
        <AccordionItem value="fees" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" />
              <span className="font-medium">Комиссии и проскальзывание</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Use Custom Fees Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div>
                  <p className="text-sm font-medium">Свои комиссии</p>
                  <p className="text-xs text-muted-foreground">
                    Использовать свои значения вместо биржевых по умолчанию
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Label className={cn("text-xs", !config.useCustomFees && "text-muted-foreground")}>
                    Нет
                  </Label>
                  <Switch
                    checked={config.useCustomFees}
                    onCheckedChange={(v) => updateConfig("useCustomFees", v)}
                  />
                  <Label className={cn("text-xs", config.useCustomFees && "text-primary")}>
                    Да
                  </Label>
                </div>
              </div>

              {config.useCustomFees && (
                <>
                  <Separator />
                  
                  {/* Spot Fees */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">SPOT</Badge>
                      <span className="text-sm text-muted-foreground">Комиссии для спотовой торговли</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Maker Fee</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={(config.spotMakerFee * 100).toFixed(2)}
                            onChange={(e) => updateConfig("spotMakerFee", parseFloat(e.target.value) / 100)}
                            className="w-24"
                            step="0.01"
                            min="0"
                            max="1"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Limit ордера</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Taker Fee</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={(config.spotTakerFee * 100).toFixed(2)}
                            onChange={(e) => updateConfig("spotTakerFee", parseFloat(e.target.value) / 100)}
                            className="w-24"
                            step="0.01"
                            min="0"
                            max="1"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Market ордера</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Futures Fees */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500">FUTURES</Badge>
                      <span className="text-sm text-muted-foreground">Комиссии для фьючерсной торговли</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Maker Fee</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={(config.futuresMakerFee * 100).toFixed(3)}
                            onChange={(e) => updateConfig("futuresMakerFee", parseFloat(e.target.value) / 100)}
                            className="w-24"
                            step="0.001"
                            min="0"
                            max="1"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Limit ордера</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Taker Fee</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={(config.futuresTakerFee * 100).toFixed(3)}
                            onChange={(e) => updateConfig("futuresTakerFee", parseFloat(e.target.value) / 100)}
                            className="w-24"
                            step="0.001"
                            min="0"
                            max="1"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Market ордера</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Slippage */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500">DEMO</Badge>
                      <span className="text-sm text-muted-foreground">Проскальзывание для демо-торговли</span>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Slippage (проскальзывание)</Label>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[config.slippagePercent * 100]}
                          onValueChange={([v]) => updateConfig("slippagePercent", v / 100)}
                          max={1}
                          min={0}
                          step={0.01}
                          className="flex-1"
                        />
                        <span className="text-sm font-mono w-16">
                          {(config.slippagePercent * 100).toFixed(2)}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Имитация проскальзывания цены при исполнении Market ордеров
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== NOTIFICATIONS ==================== */}
        <AccordionItem value="notifications" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <span className="font-medium">Notifications</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-4 pt-2">
              {[
                { key: "notifyOnEntry", label: "На входе" },
                { key: "notifyOnExit", label: "На выходе" },
                { key: "notifyOnSL", label: "На Stop-Loss" },
                { key: "notifyOnTP", label: "На Take-Profit" },
                { key: "notifyOnError", label: "При ошибках" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <Label className="text-sm">{item.label}</Label>
                  <Switch
                    checked={config[item.key as keyof BotConfigData] as boolean}
                    onCheckedChange={(v) => updateConfig(item.key as keyof BotConfigData, v)}
                  />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сбросить настройки?</DialogTitle>
            <DialogDescription>
              Все параметры будут возвращены к значениям по умолчанию. Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleReset}>
              Сбросить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
