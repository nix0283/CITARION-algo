# react-hook-form + zod

react-hook-form - это библиотека для управления формами в React. zod - это TypeScript-first библиотека для валидации схем. Вместе они обеспечивают типобезопасную валидацию форм.

## Обзор

### Преимущества react-hook-form

- Минимальные ре-рендеры
- Встроенная валидация
- Интеграция с UI библиотеками
- Поддержка сложных форм
- Управление ошибками

### Преимущества zod

- TypeScript-first подход
- Автоматический вывод типов
- Композиция схем
- Подробные сообщения об ошибках

### Установка

```bash
bun add react-hook-form zod @hookform/resolvers
```

---

## Базовая интеграция

### Пример формы

```tsx
"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

// 1. Определяем схему валидации
const positionSchema = z.object({
  symbol: z.string().min(1, "Символ обязателен"),
  direction: z.enum(["LONG", "SHORT"]),
  amount: z.number().positive("Сумма должна быть положительной"),
  leverage: z.number().min(1).max(125),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
})

// 2. Выводим тип из схемы
type PositionFormValues = z.infer<typeof positionSchema>

export function PositionForm() {
  // 3. Инициализируем форму
  const form = useForm<PositionFormValues>({
    resolver: zodResolver(positionSchema),
    defaultValues: {
      symbol: "BTCUSDT",
      direction: "LONG",
      amount: 0.01,
      leverage: 10,
    },
  })

  // 4. Обработчик отправки
  const onSubmit = (data: PositionFormValues) => {
    console.log("Form data:", data)
    // Отправка на сервер...
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="symbol"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Символ</FormLabel>
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
              <FormLabel>Количество</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit">Открыть позицию</Button>
      </form>
    </Form>
  )
}
```

---

## Zod схемы

### Примитивные типы

```typescript
import { z } from "zod"

// Строки
const stringSchema = z.string()
  .min(1, "Обязательно")
  .max(100, "Максимум 100 символов")
  .email("Неверный email")
  .url("Неверный URL")

// Числа
const numberSchema = z.number()
  .positive("Должно быть положительным")
  .min(0, "Минимум 0")
  .max(100, "Максимум 100")
  .int("Должно быть целым")

// Булевы
const boolSchema = z.boolean()

// Даты
const dateSchema = z.date()
  .min(new Date(), "Дата в будущем")
  .max(new Date("2025-12-31"), "Не позже 2025")
```

### Опциональные и nullable

```typescript
const schema = z.object({
  required: z.string(),                    // Обязательно
  optional: z.string().optional(),         // string | undefined
  nullable: z.string().nullable(),         // string | null
  nullish: z.string().nullish(),           // string | null | undefined
  withDefault: z.string().default("N/A"),  // string с дефолтом
})
```

### Объекты

```typescript
const positionSchema = z.object({
  symbol: z.string(),
  direction: z.enum(["LONG", "SHORT"]),
  amount: z.number(),
  leverage: z.number().default(1),
})

// Расширение схемы
const extendedSchema = positionSchema.extend({
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
})

// Выборка полей (pick)
const simpleSchema = positionSchema.pick({ symbol: true, amount: true })

// Исключение полей (omit)
const withoutLeverage = positionSchema.omit({ leverage: true })

// Partial (все поля optional)
const partialSchema = positionSchema.partial()
```

### Массивы

```typescript
const schema = z.object({
  // Массив строк
  tags: z.array(z.string()).min(1, "Минимум 1 тег"),

  // Массив чисел
  prices: z.array(z.number()).max(10, "Максимум 10 цен"),

  // Непустой массив
  items: z.array(z.string()).nonempty("Массив не должен быть пустым"),
})
```

### Условная валидация

```typescript
const schema = z.object({
  type: z.enum(["MARKET", "LIMIT"]),
  price: z.number().optional(),
}).refine(
  (data) => {
    // Если LIMIT, то цена обязательна
    if (data.type === "LIMIT") {
      return data.price !== undefined && data.price > 0
    }
    return true
  },
  {
    message: "Цена обязательна для LIMIT ордеров",
    path: ["price"], // Где показать ошибку
  }
)
```

### Кастомные сообщения

```typescript
const schema = z.object({
  password: z.string()
    .min(8, "Пароль минимум 8 символов")
    .regex(/[A-Z]/, "Минимум одна заглавная буква")
    .regex(/[0-9]/, "Минимум одна цифра")
    .regex(/[^A-Za-z0-9]/, "Минимум один спецсимвол"),

  confirmPassword: z.string(),
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  }
)
```

### Трансформации

```typescript
const schema = z.object({
  // Преобразование строки в число
  amount: z.string().transform((val) => parseFloat(val)),

  // Преобразование с валидацией
  price: z.string()
    .transform((val) => parseFloat(val))
    .refine((val) => val > 0, "Цена должна быть больше 0"),

  // Очистка строки
  symbol: z.string()
    .transform((val) => val.toUpperCase().trim()),
})
```

---

## React Hook Form

### useFieldArray (динамические поля)

```tsx
import { useFieldArray } from "react-hook-form"

const formSchema = z.object({
  entries: z.array(z.object({
    price: z.number().positive(),
    percentage: z.number().min(0).max(100),
  })),
})

function EntryForm() {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      entries: [{ price: 0, percentage: 100 }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "entries",
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {fields.map((field, index) => (
          <div key={field.id} className="flex gap-2">
            <FormField
              control={form.control}
              name={`entries.${index}.price`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`entries.${index}.percentage`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button type="button" variant="destructive" onClick={() => remove(index)}>
              Удалить
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={() => append({ price: 0, percentage: 0 })}
        >
          Добавить
        </Button>

        <Button type="submit">Сохранить</Button>
      </form>
    </Form>
  )
}
```

### useFormState (состояние формы)

```tsx
import { useFormState } from "react-hook-form"

function FormStatus() {
  const { isDirty, isValid, isSubmitting, errors } = useFormState()

  return (
    <div>
      <p>Изменено: {isDirty ? "Да" : "Нет"}</p>
      <p>Валидно: {isValid ? "Да" : "Нет"}</p>
      <p>Отправка: {isSubmitting ? "Да" : "Нет"}</p>
      {Object.keys(errors).length > 0 && (
        <p className="text-red-500">Ошибки: {Object.keys(errors).join(", ")}</p>
      )}
    </div>
  )
}
```

### Controller (альернатива FormField)

```tsx
import { Controller } from "react-hook-form"

<Controller
  control={form.control}
  name="direction"
  render={({ field, fieldState }) => (
    <Select value={field.value} onValueChange={field.onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="LONG">Long</SelectItem>
        <SelectItem value="SHORT">Short</SelectItem>
      </SelectContent>
      {fieldState.error && (
        <p className="text-red-500 text-sm">{fieldState.error.message}</p>
      )}
    </Select>
  )}
/>
```

---

## Полный пример: Форма позиции

```tsx
"use client"

import { useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"

// Схема валидации
const positionSchema = z.object({
  symbol: z.string().min(1, "Символ обязателен"),
  direction: z.enum(["LONG", "SHORT"]),
  amount: z.number().positive("Сумма должна быть положительной"),
  leverage: z.number().min(1).max(125),
  marginMode: z.enum(["ISOLATED", "CROSSED"]),
  
  // Опциональные поля
  stopLoss: z.number().positive().optional(),
  trailingStop: z.boolean().default(false),
  trailingPercent: z.number().min(0.1).max(50).optional(),
  
  // Множественные TP
  takeProfits: z.array(z.object({
    price: z.number().positive(),
    percentage: z.number().min(1).max(100),
  })).min(1).max(5),
}).refine(
  (data) => {
    if (data.trailingStop && !data.trailingPercent) {
      return false
    }
    return true
  },
  {
    message: "Укажите процент для трейлинга",
    path: ["trailingPercent"],
  }
).refine(
  (data) => {
    const totalPercent = data.takeProfits.reduce((sum, tp) => sum + tp.percentage, 0)
    return totalPercent === 100
  },
  {
    message: "Сумма процентов должна равняться 100%",
    path: ["takeProfits"],
  }
)

type PositionFormValues = z.infer<typeof positionSchema>

export function AdvancedPositionForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<PositionFormValues>({
    resolver: zodResolver(positionSchema),
    defaultValues: {
      symbol: "BTCUSDT",
      direction: "LONG",
      amount: 0.01,
      leverage: 10,
      marginMode: "ISOLATED",
      trailingStop: false,
      takeProfits: [
        { price: 0, percentage: 100 },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "takeProfits",
  })

  const onSubmit = async (data: PositionFormValues) => {
    setIsSubmitting(true)
    try {
      // Отправка на сервер
      console.log("Position data:", data)
      toast.success("Позиция открыта успешно")
      form.reset()
    } catch (error) {
      toast.error("Ошибка при открытии позиции")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Symbol */}
        <FormField
          control={form.control}
          name="symbol"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Торговая пара</FormLabel>
              <FormControl>
                <Input {...field} placeholder="BTCUSDT" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Direction */}
        <FormField
          control={form.control}
          name="direction"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Направление</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="LONG">Long</SelectItem>
                  <SelectItem value="SHORT">Short</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Amount & Leverage */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Количество</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.001"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="leverage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Плечо</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={125}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Stop Loss */}
        <FormField
          control={form.control}
          name="stopLoss"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Stop Loss (опционально)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Автоматически если пусто"
                  {...field}
                  onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Trailing Stop */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="trailingStop"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <div>
                  <FormLabel>Trailing Stop</FormLabel>
                  <FormDescription>
                    Автоматическое перемещение стоп-лосса
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          {form.watch("trailingStop") && (
            <FormField
              control={form.control}
              name="trailingPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trailing %</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min={0.1}
                      max={50}
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {/* Take Profits */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <FormLabel>Take Profit уровни</FormLabel>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ price: 0, percentage: 0 })}
              disabled={fields.length >= 5}
            >
              Добавить TP
            </Button>
          </div>

          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2 items-start">
              <FormField
                control={form.control}
                name={`takeProfits.${index}.price`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Цена"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`takeProfits.${index}.percentage`}
                render={({ field }) => (
                  <FormItem className="w-24">
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="%"
                        min={1}
                        max={100}
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={() => remove(index)}
                >
                  ✕
                </Button>
              )}
            </div>
          ))}

          {/* Ошибка валидации суммы процентов */}
          {form.formState.errors.takeProfits?.root && (
            <p className="text-red-500 text-sm">
              {form.formState.errors.takeProfits.root.message}
            </p>
          )}
        </div>

        {/* Submit */}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Открытие..." : "Открыть позицию"}
        </Button>
      </form>
    </Form>
  )
}
```

---

## Лучшие практики

### 1. Всегда типизируйте форму

```tsx
// ✅ Правильно - тип из схемы
type FormValues = z.infer<typeof schema>
const form = useForm<FormValues>({ resolver: zodResolver(schema) })

// ❌ Неправильно - тип отдельно
interface FormValues { ... }
const form = useForm<FormValues>({ resolver: zodResolver(schema) })
```

### 2. Используйте form.watch осторожно

```tsx
// ❌ Вызывает ре-рендер при каждом изменении
const symbol = form.watch("symbol")

// ✅ Используйте debounce или useEffect
const [debouncedSymbol, setDebouncedSymbol] = useState("")
const symbol = form.watch("symbol")

useEffect(() => {
  const timer = setTimeout(() => setDebouncedSymbol(symbol), 300)
  return () => clearTimeout(timer)
}, [symbol])
```

### 3. Группируйте связанные поля

```tsx
// ✅ Используйте объекты для групп
const schema = z.object({
  entry: z.object({
    price: z.number(),
    amount: z.number(),
  }),
  exit: z.object({
    stopLoss: z.number(),
    takeProfit: z.number(),
  }),
})
```

### 4. Обработка ошибок сервера

```tsx
const onSubmit = async (data: FormValues) => {
  try {
    await submitForm(data)
  } catch (error) {
    if (error.code === "SYMBOL_NOT_FOUND") {
      form.setError("symbol", { message: "Символ не найден на бирже" })
    } else if (error.code === "INSUFFICIENT_BALANCE") {
      form.setError("amount", { message: "Недостаточно баланса" })
    }
  }
}
```

---

## Решение проблем

### Ошибка: "Cannot read property 'value' of undefined"

```tsx
// Проверьте, что FormControl обёрнут в FormField
<FormField
  control={form.control}
  name="field"
  render={({ field }) => (
    <FormItem>
      <FormControl>
        <Input {...field} />
      </FormControl>
    </FormItem>
  )}
/>
```

### Валидация не срабатывает

```tsx
// Убедитесь, что resolver подключён
const form = useForm({
  resolver: zodResolver(schema),  // ✅ Обязательно!
  defaultValues: { ... }
})
```

### Ошибки не отображаются

```tsx
// Добавьте FormMessage в FormItem
<FormItem>
  <FormLabel>Поле</FormLabel>
  <FormControl><Input {...field} /></FormControl>
  <FormMessage />  {/* ✅ Важно! */}
</FormItem>
```

---

## Связанные документы

- [shadcn/ui](./shadcn-ui.md) - UI компоненты
- [Prisma](./prisma.md) - Типы данных из БД
