"use client";

import { useCryptoStore, TradingMode } from "@/stores/crypto-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Moon, Sun, User, LogOut, RefreshCw, Bell, Wallet, ChevronDown } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { useState, useEffect } from "react";

export function Header() {
  const { account, setTradingMode, resetDemoBalance, setActiveTab } = useCryptoStore();
  const { theme, setTheme } = useTheme();
  
  const isDemo = account?.accountType === "DEMO";
  const balance = account?.virtualBalance?.USDT || 0;
  
  // Notification count state
  const [notificationCount] = useState(3);

  const handleModeSwitch = (mode: TradingMode) => {
    setTradingMode(mode);
  };

  const handleResetBalance = async () => {
    try {
      const response = await fetch("/api/account/reset-balance", {
        method: "POST",
      });
      if (response.ok) {
        resetDemoBalance();
      }
    } catch (error) {
      console.error("Failed to reset balance:", error);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <header className="sticky top-0 z-30 h-14 md:h-16 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="flex h-full items-center justify-between px-3 md:px-6">
        {/* Left side - Page Title + Mobile Balance */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Mobile spacing for menu button */}
          <div className="w-11 md:hidden" aria-hidden="true" />
          
          <h2 className="text-sm md:text-lg font-semibold text-foreground truncate">
            Панель управления
          </h2>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] md:text-xs font-medium hidden sm:inline-flex",
              isDemo ? "demo-badge" : "real-badge"
            )}
          >
            {isDemo ? "[DEMO]" : "[REAL]"}
          </Badge>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Mobile Balance Display */}
          <div className="flex md:hidden items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold">
              ${formatNumber(balance, 0)}
            </span>
          </div>

          {/* Reset Balance (Demo only) - Hidden on mobile */}
          {isDemo && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetBalance}
              className="hidden md:flex h-8"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Сбросить
            </Button>
          )}

          {/* Trading Mode Switch - Hidden on mobile */}
          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
            <Label
              htmlFor="mode-switch"
              className={cn(
                "text-xs font-medium cursor-pointer",
                !isDemo ? "text-green-500" : "text-muted-foreground"
              )}
            >
              REAL
            </Label>
            <Switch
              id="mode-switch"
              checked={isDemo}
              onCheckedChange={(checked) =>
                handleModeSwitch(checked ? "DEMO" : "REAL")
              }
              className="data-[state=checked]:bg-amber-500 data-[state=unchecked]:bg-green-500"
            />
            <Label
              htmlFor="mode-switch"
              className={cn(
                "text-xs font-medium cursor-pointer",
                isDemo ? "text-amber-500" : "text-muted-foreground"
              )}
            >
              DEMO
            </Label>
          </div>

          {/* Notification Bell - Desktop */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex h-8 w-8 relative"
            aria-label="Notifications"
            onClick={() => setActiveTab("notifications")}
          >
            <Bell className="h-4 w-4" />
            {/* Notification badge */}
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[10px] font-medium text-white flex items-center justify-center">
                {notificationCount}
              </span>
            )}
          </Button>

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8"
            suppressHydrationWarning
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          {/* User Menu - Desktop */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="hidden md:flex relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src="/avatar.png" alt="User" />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">
                    TR
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">Trader</p>
                  <p className="text-xs text-muted-foreground">
                    Balance: ${formatNumber(balance, 2)}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>Профиль</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Выйти</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile Quick Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden h-8 px-2"
                aria-label="Quick menu"
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src="/avatar.png" alt="User" />
                  <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                    TR
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">Trader</p>
                  <p className="text-xs text-muted-foreground">
                    Balance: ${formatNumber(balance, 2)} USDT
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Mode:</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant={!isDemo ? "default" : "ghost"}
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => handleModeSwitch("REAL")}
                    >
                      REAL
                    </Button>
                    <Button
                      variant={isDemo ? "default" : "ghost"}
                      size="sm"
                      className={cn(
                        "h-6 px-2 text-[10px]",
                        isDemo && "bg-amber-500 hover:bg-amber-600"
                      )}
                      onClick={() => handleModeSwitch("DEMO")}
                    >
                      DEMO
                    </Button>
                  </div>
                </div>
              </div>
              {isDemo && (
                <DropdownMenuItem onClick={handleResetBalance}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  <span>Reset Balance</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setActiveTab("notifications")}>
                <Bell className="mr-2 h-4 w-4" />
                <span>Notifications</span>
                {notificationCount > 0 && (
                  <Badge variant="destructive" className="ml-auto text-[10px] h-4 px-1">
                    {notificationCount}
                  </Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
