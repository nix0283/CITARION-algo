/**
 * CITARION IndexedDB Manager
 * 
 * Provides offline data storage for:
 * - Cached prices
 * - Pending orders
 * - Position snapshots
 * - Trade history
 * - User preferences
 */

// ============================================================================
// TYPES
// ============================================================================

export interface OfflinePrice {
  symbol: string;
  exchange: string;
  price: number;
  bidPrice?: number;
  askPrice?: number;
  timestamp: number;
}

export interface PendingOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  exchange: string;
  accountId: string;
  createdAt: number;
  retryCount: number;
  lastError?: string;
}

export interface PositionSnapshot {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  amount: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  leverage: number;
  timestamp: number;
}

export interface OfflineTrade {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice?: number;
  amount: number;
  pnl?: number;
  status: 'PENDING' | 'OPEN' | 'CLOSED';
  openedAt: number;
  closedAt?: number;
}

// ============================================================================
// DATABASE SCHEMA
// ============================================================================

const DB_NAME = 'citarion-offline';
const DB_VERSION = 1;

interface DBSchema {
  prices: OfflinePrice;
  pendingOrders: PendingOrder;
  positionSnapshots: PositionSnapshot;
  offlineTrades: OfflineTrade;
  syncQueue: { id: string; action: string; data: unknown; timestamp: number };
}

// ============================================================================
// INDEXEDDB MANAGER
// ============================================================================

class IndexedDBManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initialize the database
   */
  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[IndexedDB] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDB] Database opened successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Prices store
        if (!db.objectStoreNames.contains('prices')) {
          const priceStore = db.createObjectStore('prices', { keyPath: ['exchange', 'symbol'] });
          priceStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Pending orders store
        if (!db.objectStoreNames.contains('pendingOrders')) {
          const orderStore = db.createObjectStore('pendingOrders', { keyPath: 'id' });
          orderStore.createIndex('accountId', 'accountId', { unique: false });
          orderStore.createIndex('symbol', 'symbol', { unique: false });
          orderStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Position snapshots store
        if (!db.objectStoreNames.contains('positionSnapshots')) {
          const positionStore = db.createObjectStore('positionSnapshots', { keyPath: 'id' });
          positionStore.createIndex('symbol', 'symbol', { unique: false });
          positionStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Offline trades store
        if (!db.objectStoreNames.contains('offlineTrades')) {
          const tradeStore = db.createObjectStore('offlineTrades', { keyPath: 'id' });
          tradeStore.createIndex('status', 'status', { unique: false });
          tradeStore.createIndex('symbol', 'symbol', { unique: false });
        }

        // Sync queue store
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        console.log('[IndexedDB] Database schema created');
      };
    });

    return this.initPromise;
  }

  // ============================================================================
  // GENERIC CRUD OPERATIONS
  // ============================================================================

  private async withStore<K extends keyof DBSchema>(
    storeName: K,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest
  ): Promise<unknown> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // PRICES
  // ============================================================================

  async savePrice(price: OfflinePrice): Promise<void> {
    await this.withStore('prices', 'readwrite', (store) => 
      store.put(price)
    );
  }

  async savePrices(prices: OfflinePrice[]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('prices', 'readwrite');
      const store = transaction.objectStore('prices');

      for (const price of prices) {
        store.put(price);
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getPrice(exchange: string, symbol: string): Promise<OfflinePrice | undefined> {
    return this.withStore('prices', 'readonly', (store) => 
      store.get([exchange, symbol])
    ) as Promise<OfflinePrice | undefined>;
  }

  async getAllPrices(): Promise<OfflinePrice[]> {
    return this.withStore('prices', 'readonly', (store) => 
      store.getAll()
    ) as Promise<OfflinePrice[]>;
  }

  async getPricesByExchange(exchange: string): Promise<OfflinePrice[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('prices', 'readonly');
      const store = transaction.objectStore('prices');
      const request = store.openCursor();
      const results: OfflinePrice[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const price = cursor.value as OfflinePrice;
          if (price.exchange === exchange) {
            results.push(price);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // PENDING ORDERS
  // ============================================================================

  async savePendingOrder(order: PendingOrder): Promise<void> {
    await this.withStore('pendingOrders', 'readwrite', (store) => 
      store.put(order)
    );
  }

  async getPendingOrder(id: string): Promise<PendingOrder | undefined> {
    return this.withStore('pendingOrders', 'readonly', (store) => 
      store.get(id)
    ) as Promise<PendingOrder | undefined>;
  }

  async getAllPendingOrders(): Promise<PendingOrder[]> {
    return this.withStore('pendingOrders', 'readonly', (store) => 
      store.getAll()
    ) as Promise<PendingOrder[]>;
  }

  async getPendingOrdersByAccount(accountId: string): Promise<PendingOrder[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('pendingOrders', 'readonly');
      const store = transaction.objectStore('pendingOrders');
      const index = store.index('accountId');
      const request = index.getAll(accountId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deletePendingOrder(id: string): Promise<void> {
    await this.withStore('pendingOrders', 'readwrite', (store) => 
      store.delete(id)
    );
  }

  async updatePendingOrderRetry(id: string, error?: string): Promise<void> {
    const order = await this.getPendingOrder(id);
    if (order) {
      order.retryCount++;
      order.lastError = error;
      await this.savePendingOrder(order);
    }
  }

  // ============================================================================
  // POSITION SNAPSHOTS
  // ============================================================================

  async savePositionSnapshot(snapshot: PositionSnapshot): Promise<void> {
    await this.withStore('positionSnapshots', 'readwrite', (store) => 
      store.put(snapshot)
    );
  }

  async getPositionSnapshot(id: string): Promise<PositionSnapshot | undefined> {
    return this.withStore('positionSnapshots', 'readonly', (store) => 
      store.get(id)
    ) as Promise<PositionSnapshot | undefined>;
  }

  async getAllPositionSnapshots(): Promise<PositionSnapshot[]> {
    return this.withStore('positionSnapshots', 'readonly', (store) => 
      store.getAll()
    ) as Promise<PositionSnapshot[]>;
  }

  async deletePositionSnapshot(id: string): Promise<void> {
    await this.withStore('positionSnapshots', 'readwrite', (store) => 
      store.delete(id)
    );
  }

  // ============================================================================
  // OFFLINE TRADES
  // ============================================================================

  async saveOfflineTrade(trade: OfflineTrade): Promise<void> {
    await this.withStore('offlineTrades', 'readwrite', (store) => 
      store.put(trade)
    );
  }

  async getOfflineTrade(id: string): Promise<OfflineTrade | undefined> {
    return this.withStore('offlineTrades', 'readonly', (store) => 
      store.get(id)
    ) as Promise<OfflineTrade | undefined>;
  }

  async getAllOfflineTrades(): Promise<OfflineTrade[]> {
    return this.withStore('offlineTrades', 'readonly', (store) => 
      store.getAll()
    ) as Promise<OfflineTrade[]>;
  }

  async getOpenTrades(): Promise<OfflineTrade[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offlineTrades', 'readonly');
      const store = transaction.objectStore('offlineTrades');
      const index = store.index('status');
      const request = index.getAll('OPEN');

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // SYNC QUEUE
  // ============================================================================

  async addToSyncQueue(action: string, data: unknown): Promise<string> {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await this.withStore('syncQueue', 'readwrite', (store) => 
      store.put({ id, action, data, timestamp: Date.now() })
    );
    return id;
  }

  async getSyncQueue(): Promise<Array<{ id: string; action: string; data: unknown; timestamp: number }>> {
    return this.withStore('syncQueue', 'readonly', (store) => 
      store.getAll()
    ) as Promise<Array<{ id: string; action: string; data: unknown; timestamp: number }>>;
  }

  async removeFromSyncQueue(id: string): Promise<void> {
    await this.withStore('syncQueue', 'readwrite', (store) => 
      store.delete(id)
    );
  }

  async clearSyncQueue(): Promise<void> {
    await this.withStore('syncQueue', 'readwrite', (store) => 
      store.clear()
    );
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async clearAll(): Promise<void> {
    const db = await this.init();
    const storeNames = Array.from(db.objectStoreNames);
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeNames, 'readwrite');
      
      for (const name of storeNames) {
        transaction.objectStore(name).clear();
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getStorageStats(): Promise<Record<string, number>> {
    const db = await this.init();
    const storeNames = Array.from(db.objectStoreNames);
    const stats: Record<string, number> = {};

    for (const name of storeNames) {
      const count = await this.withStore(name, 'readonly', (store) => 
        store.count()
      ) as number;
      stats[name] = count;
    }

    return stats;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const indexedDBManager = new IndexedDBManager();
export default indexedDBManager;
