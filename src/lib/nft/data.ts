import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { type Address, zeroAddress } from "viem";
import { abi as nft } from "./RareCognos";
import { abi as market } from "./RareCognosMarket";
import { chain, contracts, configured } from "./config";
export const nftCall = { address: contracts.collection!, abi: nft },
  marketCall = { address: contracts.market!, abi: market };
export const PAGE = 12;
export const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
export function mediaURL(uri: string) {
  if (typeof uri !== "string") throw Error("Missing media URL");
  if (uri.startsWith("ipfs://")) {
    const path = uri.slice(7);
    if (!/^[a-zA-Z0-9]+(?:\/[a-zA-Z0-9._-]+)*$/.test(path)) throw Error("Invalid IPFS URI");
    return (
      (import.meta.env.VITE_IPFS_GATEWAY || "https://ipfs.io/ipfs/").replace(/\/?$/, "/") + path
    );
  }
  const u = new URL(uri);
  if (
    u.protocol !== "https:" &&
    !(
      chain.id === 31337 &&
      u.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(u.hostname)
    )
  )
    throw Error("Unsafe media URL");
  if (u.username || u.password) throw Error("Invalid media URL");
  return u.href;
}
export async function metadata(uri: string) {
  const r = await fetch(mediaURL(uri), {
    signal: AbortSignal.timeout(12000),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!r.ok) throw Error("Metadata unavailable");
  if (Number(r.headers.get("content-length")) > 128000) throw Error("Metadata too large");
  const reader = r.body!.getReader();
  let size = 0;
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 128000) {
      await reader.cancel();
      throw Error("Metadata too large");
    }
    parts.push(value);
  }
  const b = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) {
    b.set(p, offset);
    offset += p.length;
  }
  const d = JSON.parse(new TextDecoder().decode(b));
  if (typeof d.name !== "string" || typeof d.image !== "string") throw Error("Malformed metadata");
  return {
    name: d.name.slice(0, 120),
    description: typeof d.description === "string" ? d.description.slice(0, 2000) : "",
    image: mediaURL(d.image),
  };
}
export function useListings() {
  const client = usePublicClient({ chainId: chain.id });
  return useInfiniteQuery({
    queryKey: ["nft", "listings", chain.id, contracts.market],
    enabled: configured && !!client,
    initialPageParam: undefined as bigint | undefined,
    staleTime: 15000,
    queryFn: async ({ pageParam }) => {
      const count =
        pageParam ?? (await client!.readContract({ ...marketCall, functionName: "count" }));
      const end = count > BigInt(PAGE) ? count - BigInt(PAGE) : 0n;
      const ids = Array.from({ length: Number(count - end) }, (_, i) => count - BigInt(i));
      const listings = await Promise.all(
        ids.map(async (id) => {
          const [seller, tokenId, price, active, nonce] = await client!.readContract({
            ...marketCall,
            functionName: "listings",
            args: [id],
          });
          if (!active) return null;
          const [owner, approval, version] = await Promise.all([
            client!.readContract({ ...nftCall, functionName: "ownerOf", args: [tokenId] }),
            client!.readContract({
              ...marketCall,
              functionName: "approved",
              args: [tokenId, seller],
            }),
            client!.readContract({ ...nftCall, functionName: "transferVersion", args: [tokenId] }),
          ]);
          return {
            id,
            seller,
            tokenId,
            price,
            valid: owner.toLowerCase() === seller.toLowerCase() && approval && version === nonce,
          };
        }),
      );
      return { listings: listings.filter((x) => x !== null), next: end > 0n ? end : undefined };
    },
    getNextPageParam: (p) => p.next,
  });
}
export function useOwned(address?: Address) {
  const client = usePublicClient({ chainId: chain.id });
  return useInfiniteQuery({
    queryKey: ["nft", "owned", chain.id, contracts.collection, address],
    enabled: configured && !!address && !!client,
    initialPageParam: 0n,
    queryFn: async ({ pageParam }) => {
      const count = await client!.readContract({
        ...nftCall,
        functionName: "balanceOf",
        args: [address!],
      });
      const length = Number(count - pageParam > BigInt(PAGE) ? BigInt(PAGE) : count - pageParam);
      const ids = await Promise.all(
        Array.from({ length: Math.max(0, length) }, (_, i) =>
          client!.readContract({
            ...nftCall,
            functionName: "tokenOfOwnerByIndex",
            args: [address!, pageParam + BigInt(i)],
          }),
        ),
      );
      return {
        ids,
        next: pageParam + BigInt(length) < count ? pageParam + BigInt(length) : undefined,
      };
    },
    getNextPageParam: (p) => p.next,
  });
}
export function useToken(id: bigint) {
  const client = usePublicClient({ chainId: chain.id });
  return useQuery({
    queryKey: ["nft", "token", chain.id, contracts.collection, String(id)],
    enabled: configured && id > 0n,
    staleTime: 10000,
    queryFn: async () => {
      const [owner, uri, tokenApproval, listingId] = await Promise.all([
        client!.readContract({ ...nftCall, functionName: "ownerOf", args: [id] }),
        client!.readContract({ ...nftCall, functionName: "tokenURI", args: [id] }),
        client!.readContract({ ...nftCall, functionName: "getApproved", args: [id] }),
        client!.readContract({ ...marketCall, functionName: "activeListing", args: [id] }),
      ]);
      const [allApproval, creator, listing, version] = await Promise.all([
        client!.readContract({
          ...nftCall,
          functionName: "isApprovedForAll",
          args: [owner, contracts.market!],
        }),
        client!
          .readContract({ ...nftCall, functionName: "creator", args: [id] })
          .catch(() => zeroAddress),
        listingId
          ? client!.readContract({ ...marketCall, functionName: "listings", args: [listingId] })
          : null,
        client!.readContract({ ...nftCall, functionName: "transferVersion", args: [id] }),
      ]);
      const tokenApproved = tokenApproval.toLowerCase() === contracts.market!.toLowerCase();
      const active =
        !!listing &&
        listing[3] &&
        listing[0].toLowerCase() === owner.toLowerCase() &&
        listing[4] === version &&
        (allApproval || tokenApproved);
      return { id, owner, uri, creator, tokenApproved, allApproval, listingId, listing, active };
    },
  });
}
export function useMetadata(uri?: string) {
  return useQuery({
    queryKey: ["metadata", uri],
    enabled: !!uri,
    queryFn: () => metadata(uri!),
    staleTime: Infinity,
    retry: 1,
  });
}
