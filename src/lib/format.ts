/**
 * Format a number with thousand separators and fixed decimals
 */
export function formatNumber(num: number, decimals: number = 2): string {
  if (num === undefined || num === null || isNaN(num)) return "0"
  
  if (Math.abs(num) >= 1000000) {
    return (num / 1000000).toFixed(2) + "M"
  }
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(2) + "K"
  }
  
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Format a number as percentage with + or - sign
 */
export function formatPercent(num: number, decimals: number = 2): string {
  if (num === undefined || num === null || isNaN(num)) return "0.00%"
  return `${num >= 0 ? "+" : ""}${num.toFixed(decimals)}%`
}

/**
 * Format currency value
 */
export function formatCurrency(value: number, currency: string = "USDT"): string {
  if (value === undefined || value === null || isNaN(value)) return `0.00 ${currency}`
  
  if (Math.abs(value) >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M ${currency}`
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(2)}K ${currency}`
  }
  
  return `${value.toFixed(2)} ${currency}`
}

/**
 * Format price based on value
 */
export function formatPrice(price: number): string {
  if (price === undefined || price === null || isNaN(price)) return "0"
  
  if (price >= 1000) {
    return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  if (price >= 1) {
    return price.toFixed(4)
  }
  if (price >= 0.01) {
    return price.toFixed(6)
  }
  return price.toFixed(8)
}

/**
 * Format date to relative time
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date()
  const then = typeof date === "string" ? new Date(date) : date
  const diffMs = now.getTime() - then.getTime()
  
  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return `${seconds}s ago`
}

/**
 * Format date to locale string
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
