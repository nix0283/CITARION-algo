"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Plus,
  X,
  Settings,
  ChevronDown,
  ChevronUp,
  Layers,
} from "lucide-react";
import {
  BUILTIN_INDICATORS,
  getIndicatorCategories,
  type BuiltInIndicator,
} from "@/lib/indicators/builtin";

interface IndicatorConfig {
  id: string;
  indicator: BuiltInIndicator;
  inputs: Record<string, number | string | boolean>;
  visible: boolean;
}

interface IndicatorsPanelProps {
  onIndicatorsChange?: (indicators: IndicatorConfig[]) => void;
}

export function IndicatorsPanel({ onIndicatorsChange }: IndicatorsPanelProps) {
  const [activeIndicators, setActiveIndicators] = useState<IndicatorConfig[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isExpanded, setIsExpanded] = useState(true);
  const categories = getIndicatorCategories().filter(cat => cat !== '');

  const addIndicator = (indicator: BuiltInIndicator) => {
    const defaultInputs: Record<string, number | string | boolean> = {};
    indicator.inputSchema.forEach((input) => {
      defaultInputs[input.name] = input.default;
    });

    const newConfig: IndicatorConfig = {
      id: `${indicator.id}-${Date.now()}`,
      indicator,
      inputs: defaultInputs,
      visible: true,
    };

    const updated = [...activeIndicators, newConfig];
    setActiveIndicators(updated);
    onIndicatorsChange?.(updated);
  };

  const removeIndicator = (id: string) => {
    const updated = activeIndicators.filter((ind) => ind.id !== id);
    setActiveIndicators(updated);
    onIndicatorsChange?.(updated);
  };

  const toggleIndicator = (id: string) => {
    const updated = activeIndicators.map((ind) =>
      ind.id === id ? { ...ind, visible: !ind.visible } : ind
    );
    setActiveIndicators(updated);
    onIndicatorsChange?.(updated);
  };

  const updateInput = (indicatorId: string, inputName: string, value: number | string | boolean) => {
    const updated = activeIndicators.map((ind) =>
      ind.id === indicatorId
        ? { ...ind, inputs: { ...ind.inputs, [inputName]: value } }
        : ind
    );
    setActiveIndicators(updated);
    onIndicatorsChange?.(updated);
  };

  const filteredIndicators = selectedCategory === "all"
    ? BUILTIN_INDICATORS
    : BUILTIN_INDICATORS.filter((ind) => ind.category === selectedCategory);

  return (
    <div className="bg-card border border-border rounded-lg">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Индикаторы</span>
          {activeIndicators.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeIndicators.length}
            </Badge>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border p-3 space-y-4">
          {/* Active Indicators */}
          {activeIndicators.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Активные</div>
              {activeIndicators.map((config) => (
                <div
                  key={config.id}
                  className="flex items-center justify-between p-2 rounded bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={config.visible}
                      onCheckedChange={() => toggleIndicator(config.id)}
                      className="data-[state=checked]:bg-primary"
                    />
                    <span className="text-sm">{config.indicator.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeIndicator(config.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Category Filter */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Категория</div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat === 'moving_average' ? 'Скользящие средние' :
                     cat === 'oscillator' ? 'Осцилляторы' :
                     cat === 'volatility' ? 'Волатильность' :
                     cat === 'volume' ? 'Объём' :
                     cat === 'trend' ? 'Тренд' : 'Другие'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Available Indicators */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Доступные</div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {filteredIndicators.map((indicator) => (
                <Button
                  key={indicator.id}
                  variant="outline"
                  size="sm"
                  className="h-auto py-2 justify-start text-left"
                  onClick={() => addIndicator(indicator)}
                >
                  <Plus className="h-3 w-3 mr-1 flex-shrink-0" />
                  <span className="truncate text-xs">{indicator.name}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Indicator Settings */}
          {activeIndicators.some((c) => c.visible && c.indicator.inputSchema.length > 0) && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Settings className="h-3 w-3" />
                Настройки
              </div>
              {activeIndicators
                .filter((c) => c.visible && c.indicator.inputSchema.length > 0)
                .map((config) => (
                  <div key={config.id} className="space-y-2 p-2 rounded bg-muted/20">
                    <div className="text-xs font-medium">{config.indicator.name}</div>
                    {config.indicator.inputSchema.map((input) => (
                      <div key={input.name} className="flex items-center justify-between gap-2">
                        <Label className="text-xs text-muted-foreground">
                          {input.name}
                        </Label>
                        {input.type === 'int' || input.type === 'float' ? (
                          <Input
                            type="number"
                            value={config.inputs[input.name] as number}
                            onChange={(e) =>
                              updateInput(
                                config.id,
                                input.name,
                                input.type === 'int'
                                  ? parseInt(e.target.value)
                                  : parseFloat(e.target.value)
                              )
                            }
                            className="w-20 h-7 text-xs"
                            min={input.min}
                            max={input.max}
                          />
                        ) : input.type === 'bool' ? (
                          <Switch
                            checked={config.inputs[input.name] as boolean}
                            onCheckedChange={(checked) =>
                              updateInput(config.id, input.name, checked)
                            }
                            className="data-[state=checked]:bg-primary"
                          />
                        ) : (
                          <Input
                            type="text"
                            value={config.inputs[input.name] as string}
                            onChange={(e) =>
                              updateInput(config.id, input.name, e.target.value)
                            }
                            className="w-20 h-7 text-xs"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
