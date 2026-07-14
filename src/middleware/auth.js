/** Auth middleware */
import { isUserAllowed } from "../config.js";

export function checkUser(config, from) {
  const userId = from?.id;
  const username = from?.username || "";
  const allowed = isUserAllowed(config, userId);
  return { allowed, userId, username };
}
