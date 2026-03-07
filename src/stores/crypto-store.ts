import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { 
  TradingMode, 
  MarketPrice, 
  Position, 
  Trade, 
  Account, 
  VirtualBalance,
  Signal,
  ChatMessage
} from "@/types"

// ==================== INITIAL STATE ====================

const INITIAL_VIRTUAL_BALANCE: VirtualBalance = {
  USDT: 10000,
  BTC: 0,
  ETH: 0,
  BNB: 0,
  SOL: 0,
}

const DEMO_PRICES: Record<string, MarketPrice> = {
  BTCUSDT: { symbol: "BTCUSDT", price: 67432.50, change24h: 2.45, high24h: 68100, low24h: 65800, volume24h: 28500000000 },
  ETHUSDT: { symbol: "ETHUSDT", price: 3521.80, change24h: -0.82, high24h: 3600, low24h: 3450, volume24h: 15200000000 },
  BNBUSDT: { symbol: "BNBUSDT", price: 598.45, change24h: 1.23, high24h: 610, low24h: 585, volume24h: 1850000000 },
  SOLUSDT: { symbol: "SOLUSDT", price: 172.30, change24h: 4.56, high24h: 178, low24h: 162, volume24h: 3200000000 },
  XRPUSDT: { symbol: "XRPUSDT", price: 0.5234, change24h: -1.15, high24h: 0.54, low24h: 0.51, volume24h: 1250000000 },
  DOGEUSDT: { symbol: "DOGEUSDT", price: 0.1542, change24h: 3.28, high24h: 0.16, low24h: 0.148, volume24h: 890000000 },
  ADAUSDT: { symbol: "ADAUSDT", price: 0.4521, change24h: -0.45, high24h: 0.47, low24h: 0.44, volume24h: 450000000 },
  AVAXUSDT: { symbol: "AVAXUSDT", price: 35.82, change24h: 1.89, high24h: 37, low24h: 34.5, volume24h: 380000000 },
}

// ==================== STORE INTERFACE ====================

interface CryptoStore {
  // Navigation
  activeTab: string
  setActiveTab: (tab: string) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  
  // Account
  account: Account
  setTradingMode: (mode: TradingMode) => void
  updateVirtualBalance: (balance: Partial<VirtualBalance>) => void
  resetDemoBalance: () => void
  
  // Market Data
  marketPrices: Record<string, MarketPrice>
  setMarketPrices: (prices: Record<string, MarketPrice>) => void
  updateMarketPrice: (symbol: string, price: MarketPrice) => void
  
  // Positions
  positions: Position[]
  setPositions: (positions: Position[]) => void
  addPosition: (position: Position) => void
  updatePosition: (id: string, updates: Partial<Position>) => void
  removePosition: (id: string) => void
  
  // Trades
  trades: Trade[]
  setTrades: (trades: Trade[]) => void
  addTrade: (trade: Trade) => void
  updateTrade: (id: string, updates: Partial<Trade>) => void
  
  // Signals
  signals: Signal[]
  setSignals: (signals: Signal[]) => void
  addSignal: (signal: Signal) => void
  updateSignal: (id: string, updates: Partial<Signal>) => void
  
  // Chat
  chatMessages: ChatMessage[]
  addChatMessage: (message: ChatMessage) => void
  clearChat: () => void
  
  // Computed helpers
  getTotalBalance: () => number
  getTotalPnL: () => { value: number; percent: number }
  getOpenPositionsCount: () => number
  getWinRate: () => number
}

// ==================== STORE ====================

export const useCryptoStore = create<CryptoStore>()(
  persist(
    (set, get) => ({
      // ==================== NAVIGATION ====================
      activeTab: "dashboard",
      setActiveTab: (tab) => set({ activeTab: tab }),
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      
      // ==================== ACCOUNT ====================
      account: {
        id: "demo-account",
        accountType: "DEMO",
        exchangeId: "binance",
        exchangeType: "futures",
        exchangeName: "Binance",
        virtualBalance: INITIAL_VIRTUAL_BALANCE,
        isActive: true,
        isTestnet: false,
      },
      
      setTradingMode: (mode) => set((state) => ({
        account: { ...state.account, accountType: mode }
      })),
      
      updateVirtualBalance: (balance) => set((state) => ({
        account: {
          ...state.account,
          virtualBalance: { ...state.account.virtualBalance, ...balance } as VirtualBalance
        }
      })),
      
      resetDemoBalance: () => set((state) => ({
        account: {
          ...state.account,
          virtualBalance: INITIAL_VIRTUAL_BALANCE
        },
        positions: [],
        trades: [],
      })),
      
      // ==================== MARKET DATA ====================
      marketPrices: DEMO_PRICES,
      
      setMarketPrices: (prices) => set({ marketPrices: prices }),
      
      updateMarketPrice: (symbol, price) => set((state) => ({
        marketPrices: { ...state.marketPrices, [symbol]: price }
      })),
      
      // ==================== POSITIONS ====================
      positions: [],
      
      setPositions: (positions) => set({ positions }),
      
      addPosition: (position) => set((state) => ({
        positions: [...state.positions, position]
      })),
      
      updatePosition: (id, updates) => set((state) => ({
        positions: state.positions.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        )
      })),
      
      removePosition: (id) => set((state) => ({
        positions: state.positions.filter((p) => p.id !== id)
      })),
      
      // ==================== TRADES ====================
      trades: [],
      
      setTrades: (trades) => set({ trades }),
      
      addTrade: (trade) => set((state) => ({
        trades: [trade, ...state.trades].slice(0, 100) // Keep last 100 trades
      })),
      
      updateTrade: (id, updates) => set((state) => ({
        trades: state.trades.map((t) =>
          t.id === id ? { ...t, ...updates } : t
        )
      })),
      
      // ==================== SIGNALS ====================
      signals: [],
      
      setSignals: (signals) => set({ signals }),
      
      addSignal: (signal) => set((state) => ({
        signals: [signal, ...state.signals].slice(0, 50)
      })),
      
      updateSignal: (id, updates) => set((state) => ({
        signals: state.signals.map((s) =>
          s.id === id ? { ...s, ...updates } : s
        )
      })),
      
      // ==================== CHAT ====================
      chatMessages: [],
      
      addChatMessage: (message) => set((state) => ({
        chatMessages: [...state.chatMessages, message].slice(-50)
      })),
      
      clearChat: () => set({ chatMessages: [] }),
      
      // ==================== COMPUTED ====================
      getTotalBalance: () => {
        const state = get()
        const balance = state.account.virtualBalance
        if (!balance) return 0
        
        let total = balance.USDT || 0
        
        // Convert crypto holdings to USDT
        const prices = state.marketPrices
        if (balance.BTC && prices.BTCUSDT) total += balance.BTC * prices.BTCUSDT.price
        if (balance.ETH && prices.ETHUSDT) total += balance.ETH * prices.ETHUSDT.price
        if (balance.BNB && prices.BNBUSDT) total += balance.BNB * prices.BNBUSDT.price
        if (balance.SOL && prices.SOLUSDT) total += balance.SOL * prices.SOLUSDT.price
        
        return total
      },
      
      getTotalPnL: () => {
        const state = get()
        const closedTrades = state.trades.filter(t => t.status === "CLOSED")
        
        if (closedTrades.length === 0) {
          return { value: 0, percent: 0 }
        }
        
        const totalPnL = closedTrades.reduce((sum, t) => sum + t.pnl, 0)
        const totalInvested = closedTrades.reduce((sum, t) => sum + (t.entryPrice || 0) * t.amount, 0)
        const percent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0
        
        return { value: totalPnL, percent }
      },
      
      getOpenPositionsCount: () => {
        return get().positions.filter(p => p.direction).length
      },
      
      getWinRate: () => {
        const state = get()
        const closedTrades = state.trades.filter(t => t.status === "CLOSED")
        
        if (closedTrades.length === 0) return 0
        
        const wins = closedTrades.filter(t => t.pnl > 0).length
        return (wins / closedTrades.length) * 100
      },
    }),
    {
      name: "crypto-store",
      partialize: (state) => ({
        account: state.account,
        positions: state.positions,
        trades: state.trades,
        signals: state.signals,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
)

// ==================== EXPORTS ====================

export type { TradingMode, MarketPrice, Position, Trade, Account, VirtualBalance, Signal, ChatMessage }
