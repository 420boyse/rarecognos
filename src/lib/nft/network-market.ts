import { useInfiniteQuery, useQuery, useQueries } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { isAddress, parseAbi, type Address } from "viem";
import { chain, explorer, contracts } from "./config";
import { mediaURL, metadata } from "./data";
import release from "../../../config/liteforge-market.json";
import { useRelease } from "./use-release";

export const networkMarket = release.address as Address;
export const marketAbi = parseAbi([
  "function count() view returns (uint256)",
  "function sales(uint256) view returns (address seller,address collection,uint256 tokenId,uint256 price,bool multi,bool active)",
  "function list(address collection,uint256 tokenId,bool multi,uint256 price)",
  "function buy(uint256 id) payable",
  "function cancel(uint256 id)",
]);
export const assetAbi = parseAbi([
  "function ownerOf(uint256) view returns (address)",
  "function balanceOf(address,uint256) view returns (uint256)",
  "function getApproved(uint256) view returns (address)",
  "function isApprovedForAll(address,address) view returns (bool)",
  "function approve(address,uint256)",
  "function setApprovalForAll(address,bool)",
  "function tokenURI(uint256) view returns (string)",
  "function uri(uint256) view returns (string)",
]);
export type Asset = { collection: Address; id: string; multi: boolean };
export const assetKey = (a: Asset) =>
  `${a.collection.toLowerCase()}-${a.id}-${a.multi ? "1155" : "721"}`;
export const assetLink = (a: Asset) => "/network-market?asset=" + assetKey(a);
export const saleLink = (id: bigint) => "/network-market?sale=L" + id;
export function parseAsset(s: unknown): Asset | undefined {
  if (typeof s !== "string") return;
  const [collection, id, standard, extra] = s.split("-");
  if (
    extra !== undefined ||
    !isAddress(collection) ||
    !/^(0|[1-9]\d{0,77})$/.test(id) ||
    BigInt(id) >= 2n ** 256n ||
    !["721", "1155"].includes(standard)
  )
    return;
  return { collection, id, multi: standard === "1155" };
}
export function useMarketRelease() {
  return useRelease(networkMarket, release.runtimeHash);
}
type Instance = {
  id: string;
  token_type?: string;
  token?: { address_hash?: string; type?: string; name?: string };
  image_url?: string;
  metadata?: { name?: string; image?: string };
};

function art(row?: Instance) {
  let image: string | undefined;
  try {
    image = mediaURL(row?.image_url || row?.metadata?.image || "");
  } catch {
    /* Metadata is optional. */
  }
  return { image, title: row?.metadata?.name || row?.token?.name };
}

export function useNetworkOwned(owner?: Address) {
  return useInfiniteQuery({
    queryKey: ["network-assets", chain.id, owner],
    enabled: !!owner && !!explorer,
    initialPageParam: undefined as Record<string, string> | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const url = new URL(`${explorer}/api/v2/addresses/${owner}/nft`);
      url.search = new URLSearchParams({ ...pageParam, type: "ERC-721,ERC-1155" }).toString();
      const response = await fetch(url, { signal, credentials: "omit" });
      if (!response.ok) throw Error("Wallet index unavailable.");
      const page = (await response.json()) as {
        items: Instance[];
        next_page_params: Record<string, string> | null;
      };
      const rows = page.items.flatMap((row) => {
        const asset = parseAsset(
          `${row.token?.address_hash}-${row.id}-${(row.token_type || row.token?.type)?.replace("ERC-", "")}`,
        );
        if (!asset || asset.collection.toLowerCase() === contracts.collection?.toLowerCase())
          return [];
        return [{ ...asset, ...art(row) }];
      });
      return { rows, next: page.next_page_params || undefined };
    },
    getNextPageParam: (page) => page.next,
  });
}
export function useNetworkSales(live: boolean) {
  const client = usePublicClient({ chainId: chain.id });
  return useInfiniteQuery({
    queryKey: ["network-sales", chain.id, networkMarket],
    enabled: live && !!client,
    refetchInterval: 20000,
    initialPageParam: undefined as bigint | undefined,
    queryFn: async ({ pageParam }) => {
      const call = { address: networkMarket, abi: marketAbi };
      const count = pageParam ?? (await client!.readContract({ ...call, functionName: "count" }));
      const length = Number(count < 12n ? count : 12n);
      const rows = await Promise.all(
        Array.from({ length }, async (_, i) => {
          const saleId = count - BigInt(i);
          const [seller, collection, id, price, multi, active] = await client!.readContract({
            ...call,
            functionName: "sales",
            args: [saleId],
          });
          return { saleId, seller, collection, id: id.toString(), price, multi, active };
        }),
      );
      return { rows: rows.filter((s) => s.active), next: count > 12n ? count - 12n : undefined };
    },
    getNextPageParam: (p) => p.next,
  });
}
type Client = NonNullable<ReturnType<typeof usePublicClient>>;
function artOptions(asset: Asset, client?: Client) {
  return {
    queryKey: ["network-art", chain.id, assetKey(asset)],
    staleTime: 300000,
    queryFn: async () => {
      let indexed: ReturnType<typeof art> | undefined;
      if (explorer)
        try {
          const response = await fetch(
            `${explorer}/api/v2/tokens/${asset.collection}/instances/${asset.id}`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (response.ok) indexed = art(await response.json());
          if (indexed?.image && indexed.title) return indexed;
        } catch {
          /* Read the token directly when the index is delayed. */
        }
      if (client)
        try {
          const uri = await client.readContract({
            address: asset.collection,
            abi: assetAbi,
            functionName: asset.multi ? "uri" : "tokenURI",
            args: [BigInt(asset.id)],
          });
          const details = await metadata(
            uri.replaceAll("{id}", BigInt(asset.id).toString(16).padStart(64, "0")),
          );
          return { title: details.name, image: details.image };
        } catch {
          /* Listing remains available even with missing artwork. */
        }
      return indexed || {};
    },
  };
}
export function useNetworkArt(assets: Asset[]) {
  const client = usePublicClient({ chainId: chain.id });
  return useQueries({ queries: assets.map((a) => artOptions(a, client)) });
}
export function useAssetAccess(asset: Asset, owner?: Address) {
  const client = usePublicClient({ chainId: chain.id });
  return useQuery({
    queryKey: ["network-access", chain.id, assetKey(asset), owner],
    enabled: !!owner && !!client,
    refetchInterval: 15000,
    queryFn: async () => {
      const call = { address: asset.collection, abi: assetAbi };
      const id = BigInt(asset.id);
      const owns = asset.multi
        ? (await client!.readContract({ ...call, functionName: "balanceOf", args: [owner!, id] })) >
          0n
        : (
            await client!.readContract({ ...call, functionName: "ownerOf", args: [id] })
          ).toLowerCase() === owner!.toLowerCase();
      if (!owns) return { owns, approved: false };
      const operator = await client!.readContract({
        ...call,
        functionName: "isApprovedForAll",
        args: [owner!, networkMarket],
      });
      const approved =
        operator ||
        (!asset.multi &&
          (
            await client!.readContract({ ...call, functionName: "getApproved", args: [id] })
          ).toLowerCase() === networkMarket.toLowerCase());
      return { owns, approved };
    },
  });
}

export function useMarketResults(query: string) {
  const release = useMarketRelease();
  const sales = useNetworkSales(release.data === true);
  const rows = sales.data?.pages.flatMap((p) => p.rows) ?? [];
  const art = useNetworkArt(rows);
  const matches = rows.flatMap((s, i) => {
    const title = art[i]?.data?.title || `Token #${s.id}`;
    if (
      ![title, `#${s.id}`, s.seller, s.collection].some((v) =>
        v.toLowerCase().includes(query.toLowerCase()),
      )
    )
      return [];
    return [
      {
        listing: {
          id: s.saleId,
          seller: s.seller,
          price: s.price,
          tokenId: BigInt(s.id),
          valid: true,
        },
        href: saleLink(s.saleId),
        title,
        image: art[i].data?.image,
        loading: art[i].isPending,
      },
    ];
  });
  return {
    matches,
    sales,
    settled:
      release.data === false ||
      (sales.isSuccess && !art.some((a) => a.isPending) && !sales.hasNextPage),
    error: release.isError || sales.isError,
  };
}
