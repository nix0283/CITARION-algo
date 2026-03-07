# z-ai-web-dev-sdk

z-ai-web-dev-sdk - это SDK для интеграции AI возможностей в веб-приложения. Используется в CITARION для AI-ассистента, генерации изображений и веб-поиска.

## Обзор

### Возможности

- **Chat Completions** - диалоги с AI моделями
- **Image Generation** - генерация изображений из текста
- **Web Search** - поиск информации в интернете
- **Web Reader** - извлечение контента с веб-страниц
- **Vision (VLM)** - анализ изображений
- **TTS/ASR** - текст в речь и речь в текст

### Установка

```bash
bun add z-ai-web-dev-sdk
```

---

## Важно: Только Backend

SDK **НЕЛЬЗЯ** использовать на клиентской стороне (client components). Все вызовы должны быть в:

- API Routes (`src/app/api/...`)
- Server Components
- Server Actions

```typescript
// ❌ НЕПРАВИЛЬНО - Client Component
"use client"
import ZAI from 'z-ai-web-dev-sdk' // Ошибка!

// ✅ ПРАВИЛЬНО - API Route
// src/app/api/chat/route.ts
import ZAI from 'z-ai-web-dev-sdk'
```

---

## Chat Completions

### Базовый пример

```typescript
// src/app/api/chat/route.ts
import ZAI from 'z-ai-web-dev-sdk'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const zai = await ZAI.create()

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Ты - торговый ассистент на платформе CITARION. Отвечай кратко и по делу.'
        },
        {
          role: 'user',
          content: 'Какой сейчас тренд на рынке Bitcoin?'
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    })

    const messageContent = completion.choices[0]?.message?.content

    return NextResponse.json({
      success: true,
      message: messageContent
    })
  } catch (error: any) {
    console.error('Chat error:', error.message)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
```

### Мульти-тур диалог

```typescript
// src/app/api/chat/stream/route.ts
import ZAI from 'z-ai-web-dev-sdk'

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function POST(request: Request) {
  const { messages, userInput }: { messages: Message[], userInput: string } = await request.json()

  const zai = await ZAI.create()

  // Добавляем новое сообщение пользователя
  const allMessages = [
    ...messages,
    { role: 'user' as const, content: userInput }
  ]

  const completion = await zai.chat.completions.create({
    messages: allMessages,
    temperature: 0.7
  })

  const assistantMessage = completion.choices[0]?.message?.content

  // Возвращаем обновлённую историю
  return NextResponse.json({
    messages: [
      ...allMessages,
      { role: 'assistant', content: assistantMessage }
    ]
  })
}
```

### Системный промпт для трейдинга

```typescript
const TRADING_SYSTEM_PROMPT = `
Ты - AI ассистент криптовалютной торговой платформы CITARION.

Твои возможности:
1. Анализ торговых сигналов
2. Объяснение торговых стратегий
3. Помощь с настройкой ботов (Grid, DCA, BB)
4. Анализ рынка и трендов

Правила:
- Отвечай на русском языке
- Будь кратким, но информативным
- Не давай финансовых советов, только образовательную информацию
- Предупреждай о рисках трейдинга
- Используй markdown для форматирования

Формат ответа:
- Для анализа сигнала: используй таблицы
- Для объяснения стратегий: используй списки
- Для анализа рынка: используй bullet points
`
```

---

## Image Generation

### Генерация изображений

```typescript
// src/app/api/generate-image/route.ts
import ZAI from 'z-ai-web-dev-sdk'
import { NextResponse } from 'next/server'
import { writeFileSync } from 'fs'
import { join } from 'path'

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json()

    const zai = await ZAI.create()

    const response = await zai.images.generations.create({
      prompt: `Professional crypto trading chart, ${prompt}`,
      size: '1024x1024'
    })

    // response.data[0].base64 содержит изображение в base64
    const base64Image = response.data[0].base64

    // Сохранение изображения
    const filename = `image-${Date.now()}.png`
    const filepath = join(process.cwd(), 'download', filename)

    const buffer = Buffer.from(base64Image, 'base64')
    writeFileSync(filepath, buffer)

    return NextResponse.json({
      success: true,
      filename,
      url: `/download/${filename}`
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

### Доступные размеры

```typescript
const SIZES = [
  '1024x1024',  // Квадрат
  '768x1344',   // Портрет
  '864x1152',   // Портрет
  '1344x768',   // Ландшафт
  '1152x864',   // Ландшафт
  '1440x720',   // Широкий
  '720x1440'    // Высокий
] as const
```

### CLI Tool (для быстрых задач)

```bash
# Базовая генерация
z-ai-generate --prompt "A beautiful trading dashboard" --output "./image.png"

# С указанием размера
z-ai-generate -p "Crypto chart with indicators" -o "./chart.png" -s 1344x768
```

---

## Web Search

### Поиск информации

```typescript
// src/app/api/search/route.ts
import ZAI from 'z-ai-web-dev-sdk'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')

  if (!query) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 })
  }

  try {
    const zai = await ZAI.create()

    const searchResult = await zai.functions.invoke("web_search", {
      query,
      num: 10
    })

    // searchResult - массив SearchFunctionResultItem
    return NextResponse.json({
      results: searchResult
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

### Типы результатов

```typescript
interface SearchFunctionResultItem {
  url: string         // Ссылка на страницу
  name: string        // Заголовок
  snippet: string     // Краткое описание
  host_name: string   // Домен
  rank: number        // Ранг результата
  date: string        // Дата публикации
  favicon: string     // URL иконки сайта
}
```

### Пример использования

```typescript
// Поиск новостей о криптовалюте
const news = await zai.functions.invoke("web_search", {
  query: "Bitcoin price analysis today",
  num: 5
})

// Фильтрация по домену
const binanceNews = news.filter(
  (item: SearchFunctionResultItem) => item.host_name.includes('binance.com')
)
```

---

## Web Reader

### Извлечение контента

```typescript
// src/app/api/read-article/route.ts
import ZAI from 'z-ai-web-dev-sdk'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { url } = await request.json()

  try {
    const zai = await ZAI.create()

    const content = await zai.functions.invoke("web_reader", {
      url
    })

    return NextResponse.json({
      content
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

---

## Vision (VLM)

### Анализ изображений

```typescript
// src/app/api/analyze-image/route.ts
import ZAI from 'z-ai-web-dev-sdk'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { imageBase64, question } = await request.json()

  try {
    const zai = await ZAI.create()

    const result = await zai.vlm.chat({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imageBase64}`
              }
            },
            {
              type: 'text',
              text: question || 'Опиши это изображение'
            }
          ]
        }
      ]
    })

    return NextResponse.json({
      analysis: result.choices[0]?.message?.content
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

### Анализ торгового скриншота

```typescript
const TRADING_CHART_PROMPT = `
Проанализируй этот график криптовалюты.
Определи:
1. Текущий тренд (восходящий/нисходящий/боковик)
2. Ключевые уровни поддержки и сопротивления
3. Объём торгов
4. Потенциальные точки входа/выхода
5. Индикаторы, если видны (RSI, MACD, MA и т.д.)
`

const analysis = await zai.vlm.chat({
  messages: [{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}` } },
      { type: 'text', text: TRADING_CHART_PROMPT }
    ]
  }]
})
```

---

## TTS (Text-to-Speech)

```typescript
// src/app/api/tts/route.ts
import ZAI from 'z-ai-web-dev-sdk'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { text, voice } = await request.json()

  try {
    const zai = await ZAI.create()

    const audio = await zai.tts.generate({
      text,
      voice: voice || 'default',
      speed: 1.0
    })

    // audio содержит base64 закодированный аудио файл
    return NextResponse.json({
      audioBase64: audio.data
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

---

## ASR (Speech-to-Text)

```typescript
// src/app/api/transcribe/route.ts
import ZAI from 'z-ai-web-dev-sdk'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { audioBase64 } = await request.json()

  try {
    const zai = await ZAI.create()

    const transcription = await zai.asr.transcribe({
      audio: audioBase64,
      language: 'ru'
    })

    return NextResponse.json({
      text: transcription.text
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

---

## Практические примеры в CITARION

### AI Торговый Ассистент

```typescript
// src/app/api/chat/bot/route.ts
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { userId, message, context } = await request.json()

  // Получаем контекст пользователя
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      accounts: true,
      trades: {
        where: { status: 'OPEN' },
        include: { account: true }
      }
    }
  })

  const zai = await ZAI.create()

  const systemPrompt = `
Ты - персональный торговый ассистент пользователя ${user?.name || 'User'}.

Контекст:
- Режим: ${user?.currentMode || 'DEMO'}
- Открытые позиции: ${user?.trades?.length || 0}
- Подключённые биржи: ${user?.accounts?.map(a => a.exchangeName).join(', ') || 'нет'}

${context || ''}
`

  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ],
    temperature: 0.7
  })

  // Сохраняем в историю чата
  await db.chatMessage.create({
    data: {
      userId,
      role: 'assistant',
      content: completion.choices[0]?.message?.content || ''
    }
  })

  return NextResponse.json({
    response: completion.choices[0]?.message?.content
  })
}
```

### Анализ сигнала

```typescript
// src/app/api/analyze-signal/route.ts
import ZAI from 'z-ai-web-dev-sdk'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { signalText } = await request.json()

  const zai = await ZAI.create()

  const completion = await zai.chat.completions.create({
    messages: [{
      role: 'user',
      content: `
Проанализируй этот торговый сигнал и извлеки структурированные данные:

${signalText}

Верни JSON с полями:
- symbol: торговая пара
- direction: LONG или SHORT
- entryPrice: цена входа (или null если зона)
- entryZone: { min, max } если зона входа
- stopLoss: стоп-лосс цена
- takeProfits: массив { price, percentage }
- leverage: плечо
- riskLevel: LOW/MEDIUM/HIGH

Если это не торговый сигнал, верни { error: "Not a trading signal" }
`
    }],
    temperature: 0.3
  })

  const responseText = completion.choices[0]?.message?.content || '{}'

  try {
    const parsed = JSON.parse(responseText)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Failed to parse signal' }, { status: 400 })
  }
}
```

---

## Обработка ошибок

```typescript
import ZAI from 'z-ai-web-dev-sdk'

async function safeAI() {
  try {
    const zai = await ZAI.create()

    const completion = await zai.chat.completions.create({
      messages: [{ role: 'user', content: 'Hello' }]
    })

    return completion
  } catch (error: any) {
    // Типичные ошибки
    if (error.message?.includes('rate limit')) {
      console.error('Rate limit exceeded, retrying...')
      await new Promise(r => setTimeout(r, 1000))
      return safeAI() // Retry
    }

    if (error.message?.includes('invalid API key')) {
      console.error('Invalid API key configuration')
      throw new Error('AI service not configured')
    }

    console.error('AI Error:', error.message)
    throw error
  }
}
```

---

## Лучшие практики

### 1. Кэширование ответов

```typescript
import { cache } from 'react'

export const getAIResponse = cache(async (prompt: string) => {
  const zai = await ZAI.create()
  return zai.chat.completions.create({
    messages: [{ role: 'user', content: prompt }]
  })
})
```

### 2. Rate Limiting

```typescript
const rateLimiter = new Map<string, number[]>()

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 минута
  const maxRequests = 10

  const requests = rateLimiter.get(userId) || []
  const recentRequests = requests.filter(t => now - t < windowMs)

  if (recentRequests.length >= maxRequests) {
    return false
  }

  recentRequests.push(now)
  rateLimiter.set(userId, recentRequests)
  return true
}
```

### 3. Timeout

```typescript
const completion = await Promise.race([
  zai.chat.completions.create({ messages: [...] }),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), 30000)
  )
])
```

---

## Связанные документы

- [Prisma ORM](./prisma.md) - Сохранение чатов
- [API Routes](#) - Server-side интеграция
