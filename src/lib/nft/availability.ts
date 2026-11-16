export type DropStatus = "soon" | "checking" | "unavailable" | "open" | "sold-out";

export function dropStatus(input: {
  live: boolean;
  price?: bigint;
  supply?: bigint;
  minted?: bigint;
  priceError?: boolean;
  supplyError?: boolean;
  mintedError?: boolean;
  trackMinted?: boolean;
}): DropStatus {
  if (!input.live) return "soon";
  const priceMissing = input.price === undefined;
  const supplyMissing = input.supply === undefined;
  const mintedMissing = Boolean(input.trackMinted) && input.minted === undefined;
  const failed =
    (Boolean(input.priceError) && priceMissing) ||
    (Boolean(input.supplyError) && supplyMissing) ||
    (Boolean(input.trackMinted) && Boolean(input.mintedError) && mintedMissing);
  if (failed) return "unavailable";
  if (priceMissing || supplyMissing || mintedMissing) return "checking";
  if (input.trackMinted && input.minted !== undefined && input.supply !== undefined && input.minted >= input.supply) {
    return "sold-out";
  }
  return "open";
}

export function availabilityLabel(status: DropStatus): string {
  switch (status) {
    case "checking":
      return "Checking availability";
    case "unavailable":
      return "Status unavailable";
    case "open":
      return "Mint open";
    case "sold-out":
      return "Sold out";
    default:
      return "Coming soon";
  }
}
