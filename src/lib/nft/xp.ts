export const xpPoints = { hello: 50, hold: 150, mint: 100, sale: 200, day: 10 } as const;

export function walletScore(
  checkInDays: number[],
  held: boolean,
  minted: boolean,
  sold: boolean,
  today: number,
) {
  const days = new Set(checkInDays);
  const checkedToday = days.has(today);
  let streak = 0;
  for (let day = checkedToday ? today : today - 1; days.has(day); day--) streak++;
  // A qualifying activity is a durable welcome record for this wallet.
  const hello = days.size > 0 || held || minted || sold;
  const xp =
    (hello ? xpPoints.hello : 0) +
    (held ? xpPoints.hold : 0) +
    (minted ? xpPoints.mint : 0) +
    (sold ? xpPoints.sale : 0) +
    days.size * xpPoints.day;
  return { xp, hello, held, minted, sold, days: days.size, checkedToday, streak, today };
}

export type WalletScore = ReturnType<typeof walletScore>;
