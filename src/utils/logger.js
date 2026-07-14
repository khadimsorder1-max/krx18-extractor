/** Logger */
let counter = 0;
export function newReqId() { return ++counter; }

export function info(msg, meta = {}, reqId) {
  console.log(`[INFO${reqId ? ` #${reqId}` : ""}] ${msg}`, meta);
}
export function warn(msg, meta = {}, reqId) {
  console.warn(`[WARN${reqId ? ` #${reqId}` : ""}] ${msg}`, meta);
}
export function error(msg, meta = {}, reqId) {
  console.error(`[ERROR${reqId ? ` #${reqId}` : ""}] ${msg}`, meta);
}
