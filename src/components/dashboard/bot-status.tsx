"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Power,
  Settings2,
  Shield,
  Target,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function BotStatus() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [riskPerTrade, setRiskPerTrade] = useState([2]);
  const [maxPositions, setMaxPositions] = useState([5]);
  const [defaultLeverage, setDefaultLeverage] = useState("10");
  const [trailingStop, setTrailingStop] = useState(false);
  const [autoTP, setAutoTP] = useState(true);
  const [autoSL, setAutoSL] = useState(true);

  const handleToggleBot = (enabled: boolean) => {
    setIsEnabled(enabled);
    toast.success(
      enabled
        ? "Бот активирован"
        : "Бот остановлен",
      {
        description: enabled
          ? "Сигналы будут автоматически исполняться"
          : "Автоматическая торговля приостановлена",
      }
    );
  };

  const handleSaveSettings = () => {
    toast.success("Настройки сохранены");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-primary" />
            Торговый бот
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {isEnabled ? "Активен" : "Остановлен"}
            </span>
            <Switch
              checked={isEnabled}
              onCheckedChange={handleToggleBot}
              className={cn(
                isEnabled ? "bg-green-500" : "bg-gray-400"
              )}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Banner */}
        <div
          className={cn(
            "rounded-lg p-4 flex items-center gap-3",
            isEnabled
              ? "bg-green-500/10 border border-green-500/20"
              : "bg-secondary/50 border border-border"
          )}
        >
          <div
            className={cn(
              "h-10 w-10 rounded-full flex items-center justify-center",
              isEnabled ? "bg-green-500/20" : "bg-secondary"
            )}
          >
            <Power
              className={cn(
                "h-5 w-5",
                isEnabled ? "text-green-500" : "text-muted-foreground"
              )}
            />
          </div>
          <div>
            <p className="font-medium text-sm">
              {isEnabled ? "Бот работает" : "Бот на паузе"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isEnabled
                ? "Автоматическое исполнение сигналов активно"
                : "Нажмите переключатель для запуска"}
            </p>
          </div>
        </div>

        <Separator />

        {/* Risk Settings */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Управление рисками
          </Label>

          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Риск на сделку</span>
                <span className="font-mono">{riskPerTrade[0]}%</span>
              </div>
              <Slider
                value={riskPerTrade}
                onValueChange={setRiskPerTrade}
                max={10}
                min={0.5}
                step={0.5}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Макс. позиций</span>
                <span className="font-mono">{maxPositions[0]}</span>
              </div>
              <Slider
                value={maxPositions}
                onValueChange={setMaxPositions}
                max={20}
                min={1}
                step={1}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Дефолтное плечо
              </Label>
              <Select value={defaultLeverage} onValueChange={setDefaultLeverage}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 10, 20, 50, 100].map((lev) => (
                    <SelectItem key={lev} value={lev.toString()}>
                      {lev}x
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        {/* Auto Settings */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Автоматизация
          </Label>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Auto Take Profit</p>
                <p className="text-xs text-muted-foreground">
                  Автоматическое закрытие на TP
                </p>
              </div>
              <Switch checked={autoTP} onCheckedChange={setAutoTP} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Auto Stop Loss</p>
                <p className="text-xs text-muted-foreground">
                  Автоматическое закрытие на SL
                </p>
              </div>
              <Switch checked={autoSL} onCheckedChange={setAutoSL} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Trailing Stop</p>
                <p className="text-xs text-muted-foreground">
                  Следящий стоп-лосс
                </p>
              </div>
              <Switch checked={trailingStop} onCheckedChange={setTrailingStop} />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <Button className="w-full" onClick={handleSaveSettings}>
          <Settings2 className="mr-2 h-4 w-4" />
          Сохранить настройки
        </Button>
      </CardContent>
    </Card>
  );
}
