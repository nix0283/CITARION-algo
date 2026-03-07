# NextAuth.js

NextAuth.js - это полноценное решение для аутентификации в Next.js приложениях. В проекте CITARION используется для управления сессиями пользователей.

## Обзор

### Возможности

- Аутентификация по email/password
- OAuth провайдеры (Google, GitHub и др.)
- JWT и Database сессии
- Защита API routes
- Управление сессиями

### Установка

```bash
bun add next-auth
```

---

## Конфигурация

### Базовая настройка

```typescript
// src/lib/auth.ts
import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { db } from "./db"
import { compare } from "bcrypt"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email as string }
        })

        if (!user || !user.password) {
          return null
        }

        const passwordMatch = await compare(
          credentials.password as string,
          user.password
        )

        if (!passwordMatch) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name
        }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login"
  }
})
```

### API Route Handler

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth"

export const { GET, POST } = handlers
```

---

## Использование в Server Components

### Защита страниц

```typescript
// src/app/dashboard/page.tsx
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  return (
    <div>
      <h1>Добро пожаловать, {session.user?.name}</h1>
    </div>
  )
}
```

### Получение пользователя

```typescript
// src/app/api/user/route.ts
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: {
      accounts: {
        where: { isActive: true }
      }
    }
  })

  return NextResponse.json({ user })
}
```

---

## Использование в Client Components

### Provider Setup

```typescript
// src/components/providers/session-provider.tsx
"use client"

import { SessionProvider } from "next-auth/react"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  )
}
```

```typescript
// src/app/layout.tsx
import { Providers } from "@/components/providers/session-provider"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
```

### Хуки

```typescript
"use client"

import { useSession, signIn, signOut } from "next-auth/react"

export function AuthButton() {
  const { data: session, status } = useSession()

  if (status === "loading") {
    return <div>Загрузка...</div>
  }

  if (session) {
    return (
      <div>
        <span>{session.user?.email}</span>
        <button onClick={() => signOut()}>Выйти</button>
      </div>
    )
  }

  return (
    <button onClick={() => signIn()}>Войти</button>
  )
}
```

---

## Middleware

### Защита routes

```typescript
// src/middleware.ts
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { nextUrl, auth: session } = req

  // Защищённые routes
  const protectedPaths = ["/dashboard", "/trading", "/settings"]
  const isProtected = protectedPaths.some(path =>
    nextUrl.pathname.startsWith(path)
  )

  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/login", nextUrl))
  }

  // Редирект авторизованных с login страницы
  if (nextUrl.pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
}
```

---

## Кастомная модель Session

### Интеграция с Prisma

```prisma
// prisma/schema.prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  password     String?
  image        String?
  currentMode  String   @default("DEMO")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  accounts     Account[]
  sessions     Session[]
}

model Session {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token        String   @unique
  expiresAt    DateTime
  createdAt    DateTime @default(now())
}
```

### Database Session Strategy

```typescript
// src/lib/auth.ts
import { PrismaAdapter } from "@auth/prisma-adapter"
import { db } from "./db"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [...],
  session: {
    strategy: "database" // Использовать БД для сессий
  }
})
```

---

## Регистрация пользователей

### API Route

```typescript
// src/app/api/auth/register/route.ts
import { db } from "@/lib/db"
import { hash } from "bcrypt"
import { NextResponse } from "next/server"
import { z } from "zod"

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional()
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, name } = registerSchema.parse(body)

    // Проверка существующего пользователя
    const existingUser = await db.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: "Пользователь уже существует" },
        { status: 400 }
      )
    }

    // Хеширование пароля
    const hashedPassword = await hash(password, 12)

    // Создание пользователя
    const user = await db.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || email.split("@")[0],
        currentMode: "DEMO"
      }
    })

    // Создание демо-аккаунта
    await db.account.create({
      data: {
        userId: user.id,
        accountType: "DEMO",
        exchangeId: "binance",
        exchangeType: "futures",
        virtualBalance: JSON.stringify({
          USDT: 10000,
          BTC: 0,
          ETH: 0
        })
      }
    })

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name }
    })
  } catch (error) {
    console.error("Registration error:", error)
    return NextResponse.json(
      { error: "Ошибка регистрации" },
      { status: 500 }
    )
  }
}
```

---

## Расширение сессии

### Добавление custom данных

```typescript
// src/lib/auth.ts
import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      currentMode: string
    }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  callbacks: {
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.currentMode = token.currentMode as string
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      // Получаем currentMode из БД
      const dbUser = await db.user.findUnique({
        where: { id: token.id as string }
      })
      if (dbUser) {
        token.currentMode = dbUser.currentMode
      }
      return token
    }
  }
})
```

---

## OAuth Провайдеры

### Google

```typescript
import GoogleProvider from "next-auth/providers/google"

export const { handlers, auth } = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
    })
  ]
})
```

### GitHub

```typescript
import GitHubProvider from "next-auth/providers/github"

export const { handlers, auth } = NextAuth({
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!
    })
  ]
})
```

### Telegram

```typescript
import TelegramProvider from "next-auth/providers/telegram"

export const { handlers, auth } = NextAuth({
  providers: [
    TelegramProvider({
      botToken: process.env.TELEGRAM_BOT_TOKEN!
    })
  ]
})
```

---

## Безопасность

### Переменные окружения

```env
# .env
NEXTAUTH_SECRET=your-super-secret-key-here
NEXTAUTH_URL=http://localhost:3000

# OAuth провайдеры (опционально)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

### Генерация секрета

```bash
# Генерация NEXTAUTH_SECRET
openssl rand -base64 32
# Или
bun -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Лучшие практики

### 1. Всегда проверяйте сессию в API routes

```typescript
// ✅ Правильно
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // ...
}

// ❌ Неправильно - нет проверки
export async function GET() {
  const data = await db.user.findMany()
  return NextResponse.json({ data })
}
```

### 2. Используйте middleware для защиты routes

```typescript
// Не проверяйте сессию в каждом компоненте
// Используйте middleware для автоматической защиты
```

### 3. Храните чувствительные данные в серверных компонентах

```typescript
// ✅ Server Component - безопасно
export default async function UserPage() {
  const session = await auth()
  const user = await db.user.findUnique({
    where: { id: session?.user?.id }
  })
  return <UserCard user={user} />
}

// ❌ Client Component - API exposed
"use client"
export function UserPage() {
  const { data } = useSession()
  // API ключи могут быть скомпрометированы
}
```

### 4. Ротация токенов

```typescript
// Настройка времени жизни сессии
export const { handlers, auth } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 дней
    updateAge: 24 * 60 * 60    // Обновлять каждые 24 часа
  }
})
```

---

## Решение проблем

### Ошибка: "NEXTAUTH_SECRET is missing"

```bash
# Добавьте в .env
NEXTAUTH_SECRET=your-secret-key
```

### Ошибка: "JWT malformed"

1. Очистите cookies браузера
2. Перезапустите dev сервер
3. Проверьте NEXTAUTH_SECRET

### Session не обновляется

```typescript
// Принудительное обновление сессии
import { unstable_update } from "next-auth/react"

const updateSession = async () => {
  await unstable_update({
    /* новые данные */
  })
}
```

### Middleware бесконечный редирект

```typescript
// Исключите login страницу из matcher
export const config = {
  matcher: [
    "/((?!login|register|api/auth|_next/static|_next/image|favicon.ico).*)"
  ]
}
```

---

## Связанные документы

- [Prisma ORM](./prisma.md) - База данных
- [API Routes](#) - API документация
