export function listingProfit(price: number, cost: number): { profit: number; margin: number | null } {
  const selling = Number(price);
  const cogs = Number(cost);
  const safePrice = Number.isFinite(selling) ? selling : 0;
  const safeCost = Number.isFinite(cogs) ? cogs : 0;
  const profit = safePrice - safeCost;
  if (safePrice === 0) return { profit, margin: null };
  return { profit, margin: (profit / safePrice) * 100 };
}

export function formatMargin(margin: number | null): string {
  if (margin == null || !Number.isFinite(margin)) return '—';
  return `${margin.toFixed(0)}%`;
}
