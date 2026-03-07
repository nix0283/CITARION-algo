import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.NODE_ENV || "development";

export function initSentry() {
  if (!SENTRY_DSN) {
    console.warn("Sentry DSN not configured. Error monitoring disabled.");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    
    // Performance monitoring
    tracesSampleRate: SENTRY_ENVIRONMENT === "production" ? 0.1 : 1.0,
    
    // Session replay (optional, can be disabled)
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    
    // Release tracking
    release: process.env.npm_package_version || "1.0.0",
    
    // Ignore specific errors
    ignoreErrors: [
      // Browser extensions
      "top.GLOBALS",
      "Can't find variable: ZiteReader",
      "jigsaw is not defined",
      "ComboSearch is not defined",
      "atomicFindClose",
      "fb_xd_fragment",
      // Random network errors
      "NetworkError",
      "Network request failed",
      "Failed to fetch",
      "Load failed",
      "ChunkLoadError",
      // Cancelled requests
      "cancelled",
      "canceled",
      // Ignored routes
      "/api/health",
    ],
    
    // Filter sensitive data
    beforeSend(event, hint) {
      // Filter out sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers["x-api-key"];
        delete event.request.headers["x-session-token"];
      }
      
      // Filter sensitive data from request body
      if (event.request?.data && typeof event.request.data === "string") {
        try {
          const data = JSON.parse(event.request.data);
          if (data.apiKey) data.apiKey = "[REDACTED]";
          if (data.apiSecret) data.apiSecret = "[REDACTED]";
          if (data.password) data.password = "[REDACTED]";
          if (data.token) data.token = "[REDACTED]";
          event.request.data = JSON.stringify(data);
        } catch {
          // Not JSON, leave as is
        }
      }
      
      // Filter sensitive URL parameters
      if (event.request?.url) {
        const url = new URL(event.request.url);
        const sensitiveParams = ["apiKey", "apiSecret", "token", "password", "secret"];
        sensitiveParams.forEach((param) => {
          if (url.searchParams.has(param)) {
            url.searchParams.set(param, "[REDACTED]");
          }
        });
        event.request.url = url.toString();
      }
      
      return event;
    },
    
    // Integrations
    integrations: [
      Sentry.browserTracingIntegration({
        // Trace these routes
        tracePropagationTargets: [
          "localhost",
          /^\/api\//,
          process.env.NEXT_PUBLIC_APP_URL,
        ].filter(Boolean) as string[],
      }),
      Sentry.replayIntegration({
        // Mask sensitive elements
        maskAllText: true,
        blockAllMedia: true,
        mask: [
          'input[type="password"]',
          'input[type="email"]',
          'input[name*="api"]',
          'input[name*="secret"]',
          'input[name*="key"]',
          '[data-sensitive]',
        ],
      }),
    ],
    
    // Tag default data
    initialScope: {
      tags: {
        component: "citarion-trading",
      },
    },
  });
}

// Helper functions for manual error reporting
export function captureTradeError(
  error: Error,
  context: {
    symbol?: string;
    side?: string;
    type?: string;
    orderId?: string;
  }
) {
  Sentry.withScope((scope) => {
    scope.setTag("error_type", "trade_error");
    scope.setContext("trade", {
      symbol: context.symbol,
      side: context.side,
      type: context.type,
      orderId: context.orderId,
    });
    Sentry.captureException(error);
  });
}

export function captureBotError(
  error: Error,
  context: {
    botId?: string;
    botType?: string;
    strategy?: string;
  }
) {
  Sentry.withScope((scope) => {
    scope.setTag("error_type", "bot_error");
    scope.setContext("bot", {
      botId: context.botId,
      botType: context.botType,
      strategy: context.strategy,
    });
    Sentry.captureException(error);
  });
}

export function captureAPIError(
  error: Error,
  context: {
    endpoint?: string;
    method?: string;
    statusCode?: number;
    exchange?: string;
  }
) {
  Sentry.withScope((scope) => {
    scope.setTag("error_type", "api_error");
    scope.setContext("api", {
      endpoint: context.endpoint,
      method: context.method,
      statusCode: context.statusCode,
      exchange: context.exchange,
    });
    Sentry.captureException(error);
  });
}

// User context for tracking
export function setSentryUserContext(user: {
  id: string;
  email?: string;
  username?: string;
}) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username,
  });
}

export function clearSentryUserContext() {
  Sentry.setUser(null);
}

// Performance monitoring helpers
export function startTransaction(name: string, op: string) {
  return Sentry.startTransaction({ name, op });
}

export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: Record<string, unknown>
) {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    Sentry.captureMessage(message, level);
  });
}

export { Sentry };
