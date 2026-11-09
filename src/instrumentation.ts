/** Starts the background market price refresh (only when eBay keys are configured). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startMarketScheduler } = await import("./server/market");
  startMarketScheduler();
}
