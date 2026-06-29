// Simple, fixed play-money conversion. Not real money — just a feel for scale.
// 100 coins = $1  (so the default 1,000-coin stack ≈ $10).
export const COINS_PER_DOLLAR = 100;

export const fmt = (n) => Number(n || 0).toLocaleString();

export const usd = (coins) =>
  (Number(coins || 0) / COINS_PER_DOLLAR).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
