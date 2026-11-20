import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import type { WalletScore } from "./xp";

export const xpKey = (wallet?: Address) => ["wallet-xp", 4441, wallet?.toLowerCase()] as const;

export function useWalletXp(wallet?: Address, enabled = true) {
  return useQuery({
    queryKey: xpKey(wallet),
    enabled: enabled && !!wallet,
    queryFn: async ({ signal }): Promise<WalletScore> => {
      const response = await fetch("/api/xp/" + wallet!.toLowerCase(), { signal });
      if (!response.ok) throw Error("Could not read wallet XP.");
      return response.json();
    },
    staleTime: 15000,
    refetchInterval: enabled ? 30000 : false,
    retry: 1,
  });
}
