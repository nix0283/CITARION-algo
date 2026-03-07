"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  HelpCircle,
  BookOpen,
  MessageSquare,
  ExternalLink,
  Bot,
  ChartLine,
  Shield,
  Settings,
  Zap,
  Users,
  Send,
  Mail,
  FileText,
  Video,
  Code,
  Lightbulb,
  Rocket,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Search,
} from "lucide-react";

// ============================================
// FAQ Data
// ============================================

const faqCategories = [
  {
    category: "Начало работы",
    icon: Rocket,
    questions: [
      {
        q: "Как подключить биржу?",
        a: "Перейдите в раздел 'Биржи' → 'Подключить аккаунт'. Выберите биржу, введите API Key и Secret. Убедитесь, что API ключ имеет права на чтение и торговлю. После подключения статус изменится на 'Connected'.",
      },
      {
        q: "Что такое Demo режим?",
        a: "Demo режим позволяет тестировать все функции платформы без риска потери реальных средств. Все ордера симулируются, а баланс виртуальный. Переключиться можно в настройках аккаунта.",
      },
      {
        q: "Как создать первого бота?",
        a: "В боковом меню выберите тип бота (Grid, DCA, BB и т.д.), нажмите 'Create Bot', настройте параметры и нажмите 'Start'. Бот начнёт торговлю по заданной стратегии.",
      },
    ],
  },
  {
    category: "Торговые боты",
    icon: Bot,
    questions: [
      {
        q: "В чём разница между Grid и DCA ботами?",
        a: "Grid Bot размещает сетку ордеров в заданном диапазоне и зарабатывает на колебаниях цены. DCA (Dollar Cost Averaging) усредняет позицию при падении цены, снижая среднюю цену входа.",
      },
      {
        q: "Как настроить Argus Bot?",
        a: "Argus Bot использует ML-анализ рынка. Настройте: период анализа, чувствительность сигналов, размер позиции и стоп-лосс. Бот автоматически анализирует паттерны и принимает решения.",
      },
      {
        q: "Можно ли запускать несколько ботов одновременно?",
        a: "Да, можно запускать неограниченное количество ботов. Рекомендуется использовать разные пары и стратегии для диверсификации. Следите за общей маржой на аккаунте.",
      },
      {
        q: "Что такое WolfBot?",
        a: "WolfBot — это продвинутый бот с алгоритмами распознавания паттернов и технического анализа. Использует свечные паттерны, индикаторы (RSI, MACD, BB) и самообучающиеся алгоритмы.",
      },
    ],
  },
  {
    category: "Copy Trading",
    icon: Users,
    questions: [
      {
        q: "Как стать Master Trader?",
        a: "Перейдите в Copy Trading → Master Trader. Подайте заявку, предоставив статистику торговли. После одобрения ваш профиль будет доступен для подписчиков.",
      },
      {
        q: "Как копировать сделки?",
        a: "Выберите Master Trader из списка, нажмите 'Follow'. Настройте размер позиции и процент копирования. Все сделки мастера будут автоматически скопированы.",
      },
      {
        q: "Какие биржи поддерживают Copy Trading?",
        a: "Полная поддержка: OKX, Bitget. Ограниченная: Binance, Bybit (только следование). BingX — в разработке.",
      },
    ],
  },
  {
    category: "Риск-менеджмент",
    icon: Shield,
    questions: [
      {
        q: "Как настроить Stop Loss?",
        a: "В настройках бота укажите процент Stop Loss от цены входа. Также можно использовать Trailing Stop для фиксации прибыли при движении цены в вашу сторону.",
      },
      {
        q: "Что такое Kill Switch?",
        a: "Kill Switch — аварийное отключение всех ботов при достижении критических условий: максимальная просадка, резкое падение рынка, достижение дневного лимита убытков.",
      },
      {
        q: "Как работает Drawdown Monitor?",
        a: "Монитор отслеживает просадку портфеля в реальном времени. При достижении пороговых значений отправляет уведомления и может автоматически остановить торговлю.",
      },
    ],
  },
  {
    category: "Уведомления",
    icon: MessageSquare,
    questions: [
      {
        q: "Как подключить Telegram уведомления?",
        a: "Перейдите в Настройки → Telegram. Найдите бота @CITARION_Bot, нажмите Start, получите код авторизации и введите его в настройках.",
      },
      {
        q: "Какие типы уведомлений доступны?",
        a: "Сигналы ботов, исполнение ордеров, изменение P&L,警报ы риска, новости рынка, отчёты по портфелю. Каждый тип можно настроить отдельно.",
      },
    ],
  },
  {
    category: "Оракул (AI Ассистент)",
    icon: Lightbulb,
    questions: [
      {
        q: "Что умеет Оракул?",
        a: "Оракул — AI-ассистент на базе LLM. Анализирует рынок, отвечает на вопросы по торговле, помогает с настройками, объясняет стратегии и индикаторы.",
      },
      {
        q: "Как использовать Оракул?",
        a: "Откройте раздел 'Оракул' в боковом меню. Задайте вопрос на естественном языке. Оракул проанализирует контекст и даст развёрнутый ответ.",
      },
    ],
  },
];

// ============================================
// Documentation Links
// ============================================

const docSections = [
  {
    title: "Торговые боты",
    icon: Bot,
    items: [
      { name: "Grid Bot", href: "#grid-bot" },
      { name: "DCA Bot", href: "#dca-bot" },
      { name: "BB Bot", href: "#bb-bot" },
      { name: "Argus Bot", href: "#argus-bot" },
      { name: "Vision Bot", href: "#vision-bot" },
      { name: "WolfBot", href: "#wolfbot" },
    ],
  },
  {
    title: "Аналитика",
    icon: ChartLine,
    items: [
      { name: "Multi Chart", href: "#multi-chart" },
      { name: "Volatility Analysis", href: "#volatility" },
      { name: "Signal Scorer", href: "#signal-scorer" },
      { name: "Hyperopt", href: "#hyperopt" },
    ],
  },
  {
    title: "Риск-менеджмент",
    icon: Shield,
    items: [
      { name: "Risk Dashboard", href: "#risk-dashboard" },
      { name: "Position Limiter", href: "#position-limiter" },
      { name: "VaR Calculator", href: "#var-calculator" },
      { name: "Kill Switch", href: "#kill-switch" },
    ],
  },
  {
    title: "Продвинутые функции",
    icon: Zap,
    items: [
      { name: "Strategy Lab", href: "#strategy-lab" },
      { name: "ML Filtering", href: "#ml-filter" },
      { name: "Self-Learning", href: "#self-learning" },
      { name: "Copy Trading", href: "#copy-trading" },
    ],
  },
];

// ============================================
// Quick Start Guide
// ============================================

const quickStartSteps = [
  {
    step: 1,
    title: "Подключите биржу",
    description: "Добавьте API ключи от Binance, Bybit, OKX или других поддерживаемых бирж",
    icon: Settings,
  },
  {
    step: 2,
    title: "Выберите стратегию",
    description: "Определите подходящий тип бота: Grid для флета, DCA для усреднения, Argus для ML-анализа",
    icon: Lightbulb,
  },
  {
    step: 3,
    title: "Настройте параметры",
    description: "Укажите торговую пару, размер позиции, стоп-лосс и тейк-профит уровни",
    icon: Settings,
  },
  {
    step: 4,
    title: "Запустите и мониторьте",
    description: "Активируйте бота и отслеживайте результаты в реальном времени",
    icon: Rocket,
  },
];

// ============================================
// Support Contacts
// ============================================

const supportChannels = [
  {
    name: "Telegram",
    icon: Send,
    description: "Быстрая поддержка и сообщество",
    link: "https://t.me/CITARION_Support",
    available: "24/7",
  },
  {
    name: "Email",
    icon: Mail,
    description: "Для детальных запросов",
    link: "mailto:support@citarion.io",
    available: "Ответ в течение 24ч",
  },
  {
    name: "Документация",
    icon: FileText,
    description: "Полное руководство пользователя",
    link: "/docs",
    available: "Всегда доступно",
  },
  {
    name: "Видеоуроки",
    icon: Video,
    description: "Обучающие видео",
    link: "/tutorials",
    available: "Всегда доступно",
  },
];

// ============================================
// Main Component
// ============================================

export function HelpPanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("faq");

  // Filter FAQ based on search
  const filteredFAQ = faqCategories.map((cat) => ({
    ...cat,
    questions: cat.questions.filter(
      (q) =>
        q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.a.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((cat) => cat.questions.length > 0);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HelpCircle className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Помощь</h2>
            <p className="text-sm text-muted-foreground">Документация и поддержка</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Поиск по FAQ..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="faq" className="text-xs md:text-sm">FAQ</TabsTrigger>
          <TabsTrigger value="docs" className="text-xs md:text-sm">Документация</TabsTrigger>
          <TabsTrigger value="quickstart" className="text-xs md:text-sm">Быстрый старт</TabsTrigger>
          <TabsTrigger value="support" className="text-xs md:text-sm">Поддержка</TabsTrigger>
        </TabsList>

        <TabsContent value="faq" className="flex-1 mt-4 overflow-hidden">
          <ScrollArea className="h-full pr-4">
            <Accordion type="single" collapsible className="space-y-4">
              {filteredFAQ.map((category, idx) => (
                <Card key={idx}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <category.icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{category.category}</CardTitle>
                      <Badge variant="outline" className="ml-auto">
                        {category.questions.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Accordion type="single" collapsible>
                      {category.questions.map((item, qIdx) => (
                        <AccordionItem key={qIdx} value={`${idx}-${qIdx}`} className="border-b last:border-b-0">
                          <AccordionTrigger className="px-4 py-3 text-sm hover:no-underline">
                            <div className="flex items-center gap-2">
                              <HelpCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="text-left">{item.q}</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-4 pb-4">
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {item.a}
                            </p>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </Accordion>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="docs" className="flex-1 mt-4 overflow-hidden">
          <ScrollArea className="h-full pr-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {docSections.map((section, idx) => (
                <Card key={idx} className="hover:border-primary/30 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <section.icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{section.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {section.items.map((item, iIdx) => (
                        <a
                          key={iIdx}
                          href={item.href}
                          className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-sm group"
                        >
                          <span>{item.name}</span>
                          <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* API Documentation */}
            <Card className="mt-4">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Code className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">API Documentation</CardTitle>
                </div>
                <CardDescription>Интеграция с внешними системами</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">REST API</p>
                      <p className="text-xs text-muted-foreground">Полный доступ к функциям платформы</p>
                    </div>
                    <Button variant="outline" size="sm">
                      Документация <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">WebSocket API</p>
                      <p className="text-xs text-muted-foreground">Real-time данные и события</p>
                    </div>
                    <Button variant="outline" size="sm">
                      Документация <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="quickstart" className="flex-1 mt-4 overflow-hidden">
          <ScrollArea className="h-full pr-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-primary" />
                  Быстрый старт
                </CardTitle>
                <CardDescription>
                  Начните торговать за 4 простых шага
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {quickStartSteps.map((step, idx) => (
                    <div key={idx} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <step.icon className="h-5 w-5 text-primary" />
                        </div>
                        {idx < quickStartSteps.length - 1 && (
                          <div className="w-0.5 flex-1 bg-border my-2" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-primary">Шаг {step.step}</span>
                        </div>
                        <h4 className="font-medium mb-1">{step.title}</h4>
                        <p className="text-sm text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tips */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  Советы для начинающих
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">Рекомендуется</p>
                      <p className="text-xs text-muted-foreground">Начните с Demo режима для тестирования стратегий без риска</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Внимание</p>
                      <p className="text-xs text-muted-foreground">Всегда устанавливайте Stop Loss для ограничения убытков</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Lightbulb className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Подсказка</p>
                      <p className="text-xs text-muted-foreground">Используйте Оракул для получения помощи в реальном времени</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="support" className="flex-1 mt-4 overflow-hidden">
          <ScrollArea className="h-full pr-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {supportChannels.map((channel, idx) => (
                <Card key={idx} className="hover:border-primary/30 transition-colors cursor-pointer group">
                  <CardContent className="p-4">
                    <a href={channel.link} className="block">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                          <channel.icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-medium">{channel.name}</h4>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{channel.description}</p>
                          <Badge variant="outline" className="text-xs">{channel.available}</Badge>
                        </div>
                      </div>
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* System Status */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-5 w-5 text-green-500" />
                  Статус системы
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">API Gateway</span>
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
                      Operational
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Trading Engine</span>
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
                      Operational
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Data Feeds</span>
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
                      Operational
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Notifications</span>
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />
                      Degraded
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Version Info */}
            <Card className="mt-4">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">CITARION Version</span>
                  <span className="font-mono">v2.0.0</span>
                </div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span>2025-01-15</span>
                </div>
              </CardContent>
            </Card>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default HelpPanel;
