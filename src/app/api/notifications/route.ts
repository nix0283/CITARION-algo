/**
 * Real-time Notifications API
 * 
 * Server-Sent Events (SSE) endpoint для UI
 * Получает уведомления о событиях в реальном времени:
 * - Открытие/закрытие позиций
 * - Исполнение ордеров
 * - TP/SL события
 * - Предупреждения
 */

import { NextRequest } from "next/server";
import { subscribeToNotifications, type NotificationEvent } from "@/lib/notification-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  // Создаем ReadableStream для SSE
  const stream = new ReadableStream({
    start(controller) {
      // Отправляем начальное сообщение
      const sendEvent = (event: NotificationEvent) => {
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch (error) {
          console.error("[SSE] Error sending event:", error);
        }
      };
      
      // Отправляем heartbeat каждые 30 секунд
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);
      
      // Подписываемся на уведомления
      const unsubscribe = subscribeToNotifications(
        `sse-${Date.now()}`,
        sendEvent
      );
      
      // Обработка закрытия соединения
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
      
      // Отправляем начальное сообщение о подключении
      sendEvent({
        type: "POSITION_OPENED",
        title: "Connected",
        message: "Real-time notifications active",
        priority: "low",
      });
    },
  });
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
