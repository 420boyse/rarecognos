import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { type Address, getAddress } from "viem";
import { abi as factoryABI } from "./RareCognosDropFactory";
import { abi as dropABI } from "./RareCognosDrop";
import { chain, contracts, dropsConfigured } from "./config";
import { metadata } from "./data";

export const dropCall = (address: Address) => ({ address, abi: dropABI });
export const factoryCall = { address: contracts.factory!, abi: factoryABI };
export const feeFor = (total: bigint) => (total * 25n) / 10000n;
export const dropURL = (address: Address) => `${location.origin}${location.pathname}#drop/${getAddress(address)}`;

export function useDrop(address?: Address) {
  const client = usePublicClient({ chainId: chain.id });
  return useQuery({
    queryKey: ["drop", chain.id, address],
    enabled: !!address && !!client,
    queryFn: async () => {
      const call = dropCall(address!);
      const [name, symbol, description, uri, creator, treasury, maxSupply, mintPrice, maxPerWallet, start, end, total, active, open] = await Promise.all([
        client!.readContract({ ...call, functionName: "name" }),
        client!.readContract({ ...call, functionName: "symbol" }),
        client!.readContract({ ...call, functionName: "description" }),
        client!.readContract({ ...call, functionName: "metadataURI" }),
        client!.readContract({ ...call, functionName: "owner" }),
        client!.readContract({ ...call, functionName: "treasury" }),
        client!.readContract({ ...call, functionName: "maxSupply" }),
        client!.readContract({ ...call, functionName: "mintPrice" }),
        client!.readContract({ ...call, functionName: "maxMintsPerWallet" }),
        client!.readContract({ ...call, functionName: "mintStart" }),
        client!.readContract({ ...call, functionName: "mintEnd" }),
        client!.readContract({ ...call, functionName: "totalMinted" }),
        client!.readContract({ ...call, functionName: "mintingActive" }),
        client!.readContract({ ...call, functionName: "mintingOpen" }),
      ]);
      return { address: address!, name, symbol, description, uri, creator, treasury, maxSupply, mintPrice, maxPerWallet, start, end, total, active, open };
    },
  });
}

export function useCreatorDrops(creator?: Address) {
  const client = usePublicClient({ chainId: chain.id });
  return useQuery({
    queryKey: ["creator-drops", chain.id, contracts.factory, creator],
    enabled: dropsConfigured && !!creator && !!client,
    queryFn: async () => {
      const count = await client!.readContract({ ...factoryCall, functionName: "creatorDropCount", args: [creator!] });
      return Promise.all(Array.from({ length: Number(count) }, (_, i) => client!.readContract({ ...factoryCall, functionName: "creatorDropAt", args: [creator!, BigInt(i)] })));
    },
  });
}

export function useDropMetadata(uri?: string) {
  return useQuery({ queryKey: ["drop-metadata", uri], queryFn: () => metadata(uri!), enabled: !!uri, staleTime: Infinity, retry: 1 });
}
