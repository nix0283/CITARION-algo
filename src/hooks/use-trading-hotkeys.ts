"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useCryptoStore } from "@/stores/crypto-store";
import { toast } from "sonner";

export interface TradingHotkeysConfig {
  enabled: boolean;
  buyKey: string;
  sellKey: string;
  closeAllKey: string;
  cancelOrdersKey: string;
  refreshKey: string;
  toggleChartKey: string;
  quickBuy1Percent: string;
  quickBuy5Percent: string;
  quickBuy10Percent: string;
  quickBuy25Percent: string;
  quickBuy50Percent: string;
  quickBuy100Percent: string;
}

const DEFAULT_CONFIG: TradingHotkeysConfig = {
  enabled: true,
  buyKey: "b",
  sellKey: "s",
  closeAllKey: "shift+e",
  cancelOrdersKey: "shift+c",
  refreshKey: "r",
  toggleChartKey: "t",
  quickBuy1Percent: "1",
  quickBuy5Percent: "2",
  quickBuy10Percent: "3",
  quickBuy25Percent: "4",
  quickBuy50Percent: "5",
  quickBuy100Percent: "6",
};

export interface HotkeyAction {
  type: "buy" | "sell" | "closeAll" | "cancelOrders" | "refresh" | "toggleChart" | "quickBuy";
  percent?: number;
}

export interface UseTradingHotkeysOptions {
  onBuy?: () => void;
  onSell?: () => void;
  onCloseAll?: () => void;
  onCancelOrders?: () => void;
  onRefresh?: () => void;
  onToggleChart?: () => void;
  onQuickBuy?: (percent: number) => void;
  config?: Partial<TradingHotkeysConfig>;
  scope?: string;
}

export function useTradingHotkeys(options: UseTradingHotkeysOptions = {}) {
  const {
    onBuy,
    onSell,
    onCloseAll,
    onCancelOrders,
    onRefresh,
    onToggleChart,
    onQuickBuy,
    config: userConfig,
    scope = "trading",
  } = options;

  // Memoize config to prevent recreating on every render
  const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...userConfig }), [userConfig]);
  
  const { activeTab } = useCryptoStore();
  const [lastAction, setLastAction] = useState<HotkeyAction | null>(null);
  const [hotkeysPanelOpen, setHotkeysPanelOpen] = useState(false);

  const isActive = config.enabled && (activeTab === "chart" || activeTab === "trading");

  // Use refs for callbacks to avoid re-creating executeAction
  const onBuyRef = useRef(onBuy);
  const onSellRef = useRef(onSell);
  const onCloseAllRef = useRef(onCloseAll);
  const onCancelOrdersRef = useRef(onCancelOrders);
  const onRefreshRef = useRef(onRefresh);
  const onToggleChartRef = useRef(onToggleChart);
  const onQuickBuyRef = useRef(onQuickBuy);
  
  // Update refs when callbacks change
  useEffect(() => {
    onBuyRef.current = onBuy;
    onSellRef.current = onSell;
    onCloseAllRef.current = onCloseAll;
    onCancelOrdersRef.current = onCancelOrders;
    onRefreshRef.current = onRefresh;
    onToggleChartRef.current = onToggleChart;
    onQuickBuyRef.current = onQuickBuy;
  });

  const executeAction = useCallback(
    (action: HotkeyAction) => {
      if (!isActive) return;

      setLastAction(action);

      switch (action.type) {
        case "buy":
          onBuyRef.current?.();
          toast.success("Buy action triggered", { duration: 1500 });
          break;
        case "sell":
          onSellRef.current?.();
          toast.success("Sell action triggered", { duration: 1500 });
          break;
        case "closeAll":
          onCloseAllRef.current?.();
          toast.success("Close all positions triggered", { duration: 1500 });
          break;
        case "cancelOrders":
          onCancelOrdersRef.current?.();
          toast.success("Cancel orders triggered", { duration: 1500 });
          break;
        case "refresh":
          onRefreshRef.current?.();
          toast.success("Refresh triggered", { duration: 1500 });
          break;
        case "toggleChart":
          onToggleChartRef.current?.();
          break;
        case "quickBuy":
          if (action.percent !== undefined) {
            onQuickBuyRef.current?.(action.percent);
            toast.success(`Quick buy ${action.percent}% triggered`, { duration: 1500 });
          }
          break;
      }
    },
    [isActive]
  );

  // Main hotkeys
  useHotkeys(
    config.buyKey,
    () => executeAction({ type: "buy" }),
    {
      enabled: isActive,
      preventDefault: true,
      scopes: [scope],
    },
    [executeAction, isActive]
  );

  useHotkeys(
    config.sellKey,
    () => executeAction({ type: "sell" }),
    {
      enabled: isActive,
      preventDefault: true,
      scopes: [scope],
    },
    [executeAction, isActive]
  );

  useHotkeys(
    config.closeAllKey,
    () => executeAction({ type: "closeAll" }),
    {
      enabled: isActive,
      preventDefault: true,
      scopes: [scope],
    },
    [executeAction, isActive]
  );

  useHotkeys(
    config.cancelOrdersKey,
    () => executeAction({ type: "cancelOrders" }),
    {
      enabled: isActive,
      preventDefault: true,
      scopes: [scope],
    },
    [executeAction, isActive]
  );

  useHotkeys(
    config.refreshKey,
    () => executeAction({ type: "refresh" }),
    {
      enabled: isActive,
      preventDefault: true,
      scopes: [scope],
    },
    [executeAction, isActive]
  );

  useHotkeys(
    config.toggleChartKey,
    () => executeAction({ type: "toggleChart" }),
    {
      enabled: isActive,
      preventDefault: true,
      scopes: [scope],
    },
    [executeAction, isActive]
  );

  // Quick buy hotkeys
  useHotkeys(
    config.quickBuy1Percent,
    () => executeAction({ type: "quickBuy", percent: 1 }),
    { enabled: isActive, preventDefault: true, scopes: [scope] },
    [executeAction, isActive]
  );

  useHotkeys(
    config.quickBuy5Percent,
    () => executeAction({ type: "quickBuy", percent: 5 }),
    { enabled: isActive, preventDefault: true, scopes: [scope] },
    [executeAction, isActive]
  );

  useHotkeys(
    config.quickBuy10Percent,
    () => executeAction({ type: "quickBuy", percent: 10 }),
    { enabled: isActive, preventDefault: true, scopes: [scope] },
    [executeAction, isActive]
  );

  useHotkeys(
    config.quickBuy25Percent,
    () => executeAction({ type: "quickBuy", percent: 25 }),
    { enabled: isActive, preventDefault: true, scopes: [scope] },
    [executeAction, isActive]
  );

  useHotkeys(
    config.quickBuy50Percent,
    () => executeAction({ type: "quickBuy", percent: 50 }),
    { enabled: isActive, preventDefault: true, scopes: [scope] },
    [executeAction, isActive]
  );

  useHotkeys(
    config.quickBuy100Percent,
    () => executeAction({ type: "quickBuy", percent: 100 }),
    { enabled: isActive, preventDefault: true, scopes: [scope] },
    [executeAction, isActive]
  );

  // Help panel toggle
  useHotkeys(
    "?",
    () => setHotkeysPanelOpen((prev) => !prev),
    { enabled: isActive, preventDefault: true, scopes: [scope] },
    [isActive]
  );

  // Enable hotkeys scope when component mounts
  useEffect(() => {
    if (isActive) {
      // Hotkeys are active when on chart or trading tab
    }
  }, [isActive]);

  return {
    lastAction,
    hotkeysPanelOpen,
    setHotkeysPanelOpen,
    config,
    isActive,
  };
}

export const HOTKEYS_HELP = [
  { key: "B", description: "Open buy dialog" },
  { key: "S", description: "Open sell dialog" },
  { key: "Shift+E", description: "Close all positions" },
  { key: "Shift+C", description: "Cancel all open orders" },
  { key: "R", description: "Refresh chart data" },
  { key: "T", description: "Toggle chart type" },
  { key: "1", description: "Quick buy 1% of balance" },
  { key: "2", description: "Quick buy 5% of balance" },
  { key: "3", description: "Quick buy 10% of balance" },
  { key: "4", description: "Quick buy 25% of balance" },
  { key: "5", description: "Quick buy 50% of balance" },
  { key: "6", description: "Quick buy 100% of balance" },
  { key: "?", description: "Toggle hotkeys help" },
  { key: "Esc", description: "Close dialogs" },
];
