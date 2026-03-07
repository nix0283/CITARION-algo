/**
 * ML WebSocket Integration
 * 
 * Real-time WebSocket updates for ML signals and statistics.
 * Replaces polling with instant updates.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * WebSocket message types
 */
export type MLWebSocketMessageType =
  | 'ml:signal:filtered'
  | 'ml:signal:aggregated'
  | 'ml:stats:updated'
  | 'ml:training:progress'
  | 'ml:model:updated'
  | 'ml:alert'

/**
 * WebSocket message
 */
export interface MLWebSocketMessage<T = unknown> {
  type: MLWebSocketMessageType
  payload: T
  timestamp: number
}

/**
 * Filtered signal payload
 */
export interface FilteredSignalPayload {
  signalId: string
  botCode: string
  symbol: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  originalConfidence: number
  adjustedConfidence: number
  mlScore: number
  qualityScore: number
  recommendation: 'APPROVE' | 'REJECT' | 'ADJUST' | 'MONITOR'
  passed: boolean
}

/**
 * Aggregated signal payload
 */
export interface AggregatedSignalPayload {
  signalId: string
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  consensus: number
  participatingBots: string[]
  mlScore: number
  qualityAssessment: string
}

/**
 * Stats updated payload
 */
export interface StatsUpdatedPayload {
  filterStats: {
    totalSignals: number
    passedSignals: number
    rejectedSignals: number
    avgQualityScore: number
  }
  classifierStats: {
    totalSamples: number
    winRate: number
  }
}

/**
 * Training progress payload
 */
export interface TrainingProgressPayload {
  status: 'started' | 'progress' | 'completed' | 'failed'
  samplesProcessed: number
  totalSamples: number
  accuracy?: number
  progress: number // 0-100
}

/**
 * Alert payload
 */
export interface AlertPayload {
  level: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  data?: Record<string, unknown>
}

// ============================================================================
// ML WEBSOCKET CLIENT
// ============================================================================

/**
 * ML WebSocket Client
 * 
 * Manages WebSocket connection for ML real-time updates
 */
export class MLWebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private listeners: Map<MLWebSocketMessageType, Set<(payload: unknown) => void>> = new Map()
  private isConnected = false
  private heartbeatInterval: NodeJS.Timeout | null = null
  
  constructor(url: string = '/api/ws/ml') {
    this.url = url
  }
  
  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // In browser environment
        if (typeof window !== 'undefined') {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
          const wsUrl = `${protocol}//${window.location.host}${this.url}`
          
          this.ws = new WebSocket(wsUrl)
          
          this.ws.onopen = () => {
            console.log('[ML WebSocket] Connected')
            this.isConnected = true
            this.reconnectAttempts = 0
            this.startHeartbeat()
            resolve()
          }
          
          this.ws.onmessage = (event) => {
            this.handleMessage(event.data)
          }
          
          this.ws.onclose = () => {
            console.log('[ML WebSocket] Disconnected')
            this.isConnected = false
            this.stopHeartbeat()
            this.attemptReconnect()
          }
          
          this.ws.onerror = (error) => {
            console.error('[ML WebSocket] Error:', error)
            reject(error)
          }
        } else {
          // Server environment - resolve immediately
          resolve()
        }
      } catch (error) {
        reject(error)
      }
    })
  }
  
  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
  
  /**
   * Subscribe to message type
   */
  subscribe<T>(
    type: MLWebSocketMessageType,
    callback: (payload: T) => void
  ): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    
    this.listeners.get(type)!.add(callback as (payload: unknown) => void)
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(callback as (payload: unknown) => void)
    }
  }
  
  /**
   * Send message to server
   */
  send<T>(type: MLWebSocketMessageType, payload: T): void {
    if (this.ws && this.isConnected) {
      const message: MLWebSocketMessage<T> = {
        type,
        payload,
        timestamp: Date.now(),
      }
      
      this.ws.send(JSON.stringify(message))
    }
  }
  
  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const message: MLWebSocketMessage = JSON.parse(data)
      
      const callbacks = this.listeners.get(message.type)
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(message.payload)
          } catch (error) {
            console.error('[ML WebSocket] Callback error:', error)
          }
        })
      }
    } catch (error) {
      console.error('[ML WebSocket] Parse error:', error)
    }
  }
  
  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[ML WebSocket] Max reconnect attempts reached')
      return
    }
    
    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    
    console.log(`[ML WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    
    setTimeout(() => {
      this.connect().catch(console.error)
    }, delay)
  }
  
  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.isConnected) {
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
      }
    }, 30000) // Every 30 seconds
  }
  
  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }
  
  /**
   * Check if connected
   */
  getConnectionStatus(): boolean {
    return this.isConnected
  }
}

// ============================================================================
// REACT HOOKS
// ============================================================================

/**
 * Hook for using ML WebSocket in React components
 * 
 * Usage:
 * ```tsx
 * const { subscribe, isConnected, send } = useMLWebSocket()
 * 
 * useEffect(() => {
 *   return subscribe('ml:signal:filtered', (payload) => {
 *     console.log('Signal filtered:', payload)
 *   })
 * }, [subscribe])
 * ```
 */
export function useMLWebSocket() {
  // This would be a React hook in a client component
  // For now, we return the client directly
  
  const getClient = (): MLWebSocketClient => {
    // Singleton pattern
    let client = (globalThis as any).__mlWebSocketClient
    if (!client) {
      client = new MLWebSocketClient()
      ;(globalThis as any).__mlWebSocketClient = client
    }
    return client
  }
  
  return {
    connect: () => getClient().connect(),
    disconnect: () => getClient().disconnect(),
    subscribe: <T>(type: MLWebSocketMessageType, callback: (payload: T) => void) => 
      getClient().subscribe(type, callback),
    send: <T>(type: MLWebSocketMessageType, payload: T) => 
      getClient().send(type, payload),
    isConnected: () => getClient().getConnectionStatus(),
  }
}

// ============================================================================
// WEBSOCKET SERVER (for Next.js API route)
// ============================================================================

/**
 * Create ML WebSocket message
 */
export function createMLMessage<T>(
  type: MLWebSocketMessageType,
  payload: T
): string {
  return JSON.stringify({
    type,
    payload,
    timestamp: Date.now(),
  })
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let wsClientInstance: MLWebSocketClient | null = null

/**
 * Get ML WebSocket Client instance
 */
export function getMLWebSocketClient(): MLWebSocketClient {
  if (!wsClientInstance) {
    wsClientInstance = new MLWebSocketClient()
  }
  return wsClientInstance
}

/**
 * Reset the singleton instance
 */
export function resetMLWebSocketClient(): void {
  wsClientInstance?.disconnect()
  wsClientInstance = null
}

export default MLWebSocketClient
