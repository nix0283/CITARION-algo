# shadcn/ui

shadcn/ui - это коллекция переиспользуемых React компонентов, построенных на Radix UI и Tailwind CSS. Используется в CITARION для создания UI интерфейса.

## Обзор

### Особенности

- Компоненты копируются в проект (не npm пакет)
- Построены на Radix UI (доступность)
- Стилизация через Tailwind CSS
- Полная кастомизация
- TypeScript поддержка

### Установка новых компонентов

```bash
# Добавить компонент
bunx shadcn@latest add button

# Добавить несколько компонентов
bunx shadcn@latest add button card dialog form

# Добавить все компоненты
bunx shadcn@latest add
```

---

## Структура компонентов

```
src/components/
├── ui/
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── form.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── table.tsx
│   └── ...
└── ...
```

---

## Основные компоненты

### Button

```typescript
// src/components/ui/button.tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3",
        lg: "h-10 rounded-md px-6",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

**Использование:**

```tsx
import { Button } from "@/components/ui/button"

// Варианты
<Button>Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Размеры
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>

// С иконкой
<Button>
  <Plus className="h-4 w-4" />
  Add Position
</Button>

// Как ссылка
<Button asChild>
  <a href="/trading">Go to Trading</a>
</Button>
```

### Card

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

<Card>
  <CardHeader>
    <CardTitle>Position BTCUSDT</CardTitle>
    <CardDescription>Long position, 10x leverage</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-sm text-muted-foreground">Entry Price</p>
        <p className="text-2xl font-bold">$97,000</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">PnL</p>
        <p className="text-2xl font-bold text-green-500">+$300</p>
      </div>
    </div>
  </CardContent>
  <CardFooter>
    <Button variant="destructive">Close Position</Button>
  </CardFooter>
</Card>
```

### Dialog

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline">Open Position</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Open New Position</DialogTitle>
      <DialogDescription>
        Configure your position parameters
      </DialogDescription>
    </DialogHeader>
    <div className="py-4">
      {/* Form content */}
    </div>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Form (react-hook-form + zod)

```tsx
"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

// Схема валидации
const positionSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  direction: z.enum(["LONG", "SHORT"]),
  amount: z.number().positive("Amount must be positive"),
  leverage: z.number().min(1).max(100),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
})

type PositionFormValues = z.infer<typeof positionSchema>

export function PositionForm() {
  const form = useForm<PositionFormValues>({
    resolver: zodResolver(positionSchema),
    defaultValues: {
      symbol: "BTCUSDT",
      direction: "LONG",
      amount: 0.01,
      leverage: 10,
    },
  })

  const onSubmit = (data: PositionFormValues) => {
    console.log(data)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="symbol"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Symbol</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...field}
                  onChange={e => field.onChange(parseFloat(e.target.value))}
                />
              </FormControl>
              <FormDescription>
                Position size in BTC
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit">Open Position</Button>
      </form>
    </Form>
  )
}
```

### Select

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

<Select
  value={symbol}
  onValueChange={setSymbol}
>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="Select symbol" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="BTCUSDT">BTC/USDT</SelectItem>
    <SelectItem value="ETHUSDT">ETH/USDT</SelectItem>
    <SelectItem value="SOLUSDT">SOL/USDT</SelectItem>
  </SelectContent>
</Select>
```

### Table

```tsx
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

<Table>
  <TableCaption>List of open positions</TableCaption>
  <TableHeader>
    <TableRow>
      <TableHead>Symbol</TableHead>
      <TableHead>Direction</TableHead>
      <TableHead>Entry Price</TableHead>
      <TableHead className="text-right">PnL</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {positions.map((pos) => (
      <TableRow key={pos.id}>
        <TableCell className="font-medium">{pos.symbol}</TableCell>
        <TableCell>{pos.direction}</TableCell>
        <TableCell>${pos.entryPrice.toLocaleString()}</TableCell>
        <TableCell className="text-right">
          <span className={pos.pnl >= 0 ? "text-green-500" : "text-red-500"}>
            ${pos.pnl.toFixed(2)}
          </span>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### Badge

```tsx
import { Badge } from "@/components/ui/badge"

// Варианты
<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge variant="outline">Outline</Badge>

// Примеры использования
<div className="flex items-center gap-2">
  <span>BTCUSDT</span>
  <Badge className="bg-green-500/10 text-green-500">
    LONG
  </Badge>
</div>

<div className="flex items-center gap-2">
  <span>Status:</span>
  <Badge variant="outline">OPEN</Badge>
</div>
```

### Tabs

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

<Tabs defaultValue="positions">
  <TabsList>
    <TabsTrigger value="positions">Positions</TabsTrigger>
    <TabsTrigger value="orders">Orders</TabsTrigger>
    <TabsTrigger value="history">History</TabsTrigger>
  </TabsList>
  <TabsContent value="positions">
    <PositionsTable />
  </TabsContent>
  <TabsContent value="orders">
    <OrdersTable />
  </TabsContent>
  <TabsContent value="history">
    <HistoryTable />
  </TabsContent>
</Tabs>
```

### Toast / Sonner

```tsx
import { toast } from "sonner"

// Базовое использование
toast("Position opened successfully")

// С описанием
toast("Position opened", {
  description: "BTCUSDT LONG @ $97,000",
})

// Типы
toast.success("Position closed with profit")
toast.error("Failed to open position")
toast.warning("High volatility detected")
toast.info("New signal received")

// С action
toast("Position opened", {
  action: {
    label: "View",
    onClick: () => router.push("/positions"),
  },
})

// Loading state
const toastId = toast.loading("Opening position...")
// ... async operation
toast.success("Position opened", { id: toastId })
```

---

## Создание кастомных компонентов

### Торговая кнопка

```tsx
// src/components/trading/trade-button.tsx
"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown } from "lucide-react"

interface TradeButtonProps {
  direction: "LONG" | "SHORT"
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

export function TradeButton({
  direction,
  onClick,
  disabled,
  loading,
}: TradeButtonProps) {
  return (
    <Button
      className={cn(
        "w-full",
        direction === "LONG"
          ? "bg-green-500 hover:bg-green-600"
          : "bg-red-500 hover:bg-red-600"
      )}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {direction === "LONG" ? (
        <>
          <TrendingUp className="h-4 w-4 mr-2" />
          Long
        </>
      ) : (
        <>
          <TrendingDown className="h-4 w-4 mr-2" />
          Short
        </>
      )}
    </Button>
  )
}
```

### Карточка позиции

```tsx
// src/components/trading/position-card.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Position } from "@/types"

interface PositionCardProps {
  position: Position
  onClose?: () => void
}

export function PositionCard({ position, onClose }: PositionCardProps) {
  const pnlPercent = ((position.currentPrice - position.avgEntryPrice) / position.avgEntryPrice) * 100
  const isProfit = position.unrealizedPnl >= 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-medium">
          {position.symbol}
        </CardTitle>
        <Badge variant={position.direction === "LONG" ? "default" : "destructive"}>
          {position.direction}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Entry</p>
            <p className="font-medium">${position.avgEntryPrice.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Current</p>
            <p className="font-medium">${position.currentPrice?.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Size</p>
            <p className="font-medium">{position.totalAmount} ({position.leverage}x)</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">PnL</p>
            <p className={cn(
              "font-medium",
              isProfit ? "text-green-500" : "text-red-500"
            )}>
              {isProfit ? "+" : ""}{position.unrealizedPnl.toFixed(2)} USDT
              <span className="text-xs ml-1">
                ({isProfit ? "+" : ""}{pnlPercent.toFixed(2)}%)
              </span>
            </p>
          </div>
        </div>

        {onClose && (
          <Button
            variant="destructive"
            className="w-full mt-4"
            onClick={onClose}
          >
            Close Position
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
```

---

## Конфигурация

### components.json

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

### CSS переменные

```css
/* src/app/globals.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}
```

---

## Лучшие практики

### 1. Используйте cn() для условных классов

```tsx
import { cn } from "@/lib/utils"

<Button
  className={cn(
    "base-classes",
    isActive && "active-classes",
    isDanger && "danger-classes"
  )}
>
```

### 2. Используйте asChild для композиции

```tsx
// ❌ Кнопка внутри кнопки
<Button>
  <Link href="/trading">Go</Link>
</Button>

// ✅ Правильно
<Button asChild>
  <Link href="/trading">Go</Link>
</Button>
```

### 3. Группируйте компоненты в формы

```tsx
// card.tsx
export { Card } from "./card"
export { CardHeader } from "./card-header"
export { CardContent } from "./card-content"
export { CardFooter } from "./card-footer"
```

### 4. Создавайте варианты для повторяющихся паттернов

```tsx
const statusVariants = cva("...", {
  variants: {
    status: {
      open: "bg-green-500/10 text-green-500",
      closed: "bg-gray-500/10 text-gray-500",
      pending: "bg-yellow-500/10 text-yellow-500",
    }
  }
})
```

---

## Решение проблем

### Компонент не стилизован

1. Проверьте импорт `cn` из `@/lib/utils`
2. Убедитесь, что Tailwind CSS настроен
3. Проверьте CSS переменные в globals.css

### Ошибка "Cannot find module '@/components/...'"

1. Проверьте `tsconfig.json` paths
2. Убедитесь, что файл существует

### Form валидация не работает

1. Проверьте схему zod
2. Убедитесь, что `zodResolver` подключён
3. Проверьте `FormField` names

---

## Связанные документы

- [Prisma ORM](./prisma.md) - Формы для работы с данными
- [NextAuth](./next-auth.md) - Формы аутентификации
