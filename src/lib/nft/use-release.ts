import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { keccak256, type Address } from "viem";
import { chain } from "./config";

export function useRelease(address: Address, runtimeHash?: string, enabled = true) {
  const client = usePublicClient({ chainId: chain.id });
  const query = useQuery({
    queryKey: ["release-code", chain.id, address, runtimeHash],
    enabled: enabled && !!client,
    staleTime: 15000,
    refetchInterval: 30000,
    queryFn: async () => {
      const code = await client!.getCode({ address });
      if (!code || code === "0x") return false;
      if (runtimeHash && keccak256(code) !== runtimeHash) throw Error("Unexpected contract bytecode");
      return true;
    },
  });
  return query;
}
