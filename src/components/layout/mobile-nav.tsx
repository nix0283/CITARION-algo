"use client";

import { useCryptoStore } from "@/stores/crypto-store";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CandlestickChart,
  LineChart,
  Bot,
  Settings,
} from "lucide-react";

interface MobileNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const mobileNavItems: MobileNavItem[] = [
  { id: "dashboard", label: "Дашборд", icon: LayoutDashboard },
  { id: "chart", label: "График", icon: CandlestickChart },
  { id: "trading", label: "Торговля", icon: LineChart },
  { id: "grid-bot", label: "Боты", icon: Bot },
  { id: "settings", label: "Настройки", icon: Settings },
];

export function MobileNav() {
  const { activeTab, setActiveTab } = useCryptoStore();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-border bg-card/95 backdrop-blur-sm"
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around px-2 py-1 safe-area-bottom">
        {mobileNavItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex flex-col items-center justify-center min-h-11 min-w-11 px-3 py-2 rounded-lg transition-colors",
                "touch-target",
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="text-[10px] mt-0.5 font-medium">
                {item.label}
              </span>
              {/* Active indicator dot */}
              {isActive && (
                <span
                  className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
      {/* Safe area padding for iOS devices */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
