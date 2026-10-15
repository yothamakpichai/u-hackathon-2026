// Run metrics for Learning Path missions (BRIEF §14): store.lab[tier].metrics. Pure, no DOM.
// `final` is session.getState() at close; `quiz` is [{ id, correct }] from the Lab's event questions.

export const PANIC_WINDOW_TICKS = 100; // 10 s of market time after a negative event (BRIEF §6 composure)

export function runMetrics(final, quiz = []) {
  const p = final.portfolio;
  const negatives = final.events.filter((e) => e.negative).map((e) => e.t);
  // A panic sell sells a whole position within 10 s after a negative event.
  const panicSellsAfterNegativeEvents = p.trades.filter(
    (tr) =>
      tr.side === 'sell' &&
      tr.holdingAfter <= tr.holdingBefore * 1e-9 &&
      negatives.some((t) => tr.t >= t && tr.t <= t + PANIC_WINDOW_TICKS),
  ).length;
  const mine = Object.values(final.coins).find((c) => c.user);
  const round1 = (x) => Math.round(x * 10) / 10;
  return {
    maxSingleExposurePct: round1(p.risk.maxShare * 100),
    minCashPct: round1(p.risk.minCashShare * 100),
    panicSellsAfterNegativeEvents,
    heldBloopAtRug: final.events.some((e) => e.id === 'rug_pull' && e.playerCoins > 0),
    coinLaunched: mine
      ? {
          lpLocked: mine.launch.lpLocked,
          // 'graduated' (moved to a real pool), else whether it ended above or below its launch price.
          outcome: mine.graduatedAt != null ? 'graduated' : mine.price >= mine.launch.price0 ? 'rose' : 'fell',
        }
      : null,
    quizCorrect: quiz.filter((a) => a.correct).length,
    quizTotal: quiz.length,
    finalValue: Math.round(p.value * 100) / 100,
  };
}
