/**
 * Default User Helper
 * 
 * Для личной платформы - обеспечивает наличие дефолтного пользователя
 */

import { db } from "@/lib/db";

const DEFAULT_USER_ID = "default-user";
const DEFAULT_USER_EMAIL = "user@citarion.local";

/**
 * Получить или создать дефолтного пользователя
 */
export async function getDefaultUserId(): Promise<string> {
  let user = await db.user.findUnique({
    where: { id: DEFAULT_USER_ID },
  });

  if (!user) {
    user = await db.user.create({
      data: {
        id: DEFAULT_USER_ID,
        email: DEFAULT_USER_EMAIL,
        name: "User",
        currentMode: "DEMO",
      },
    });
  }

  return user.id;
}

/**
 * Получить ID дефолтного пользователя (синхронно для использования в_known_ contexts)
 */
export function getDefaultUserIdSync(): string {
  return DEFAULT_USER_ID;
}
