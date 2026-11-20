import { createPublicClient, formatEther, http } from "viem";
import { chain, explorer } from "./config";
import { mediaURL } from "./data";
import { assetLink, parseAsset, marketAbi, networkMarket, saleLink } from "./network-market";
import { pageMeta } from "../site-meta";

const client = createPublicClient({
  chain,
  transport: http(undefined, { timeout: 3500, retryCount: 0 }),
});

export async function marketPreview(assetKey?: string, sale?: string) {
  let asset = parseAsset(assetKey);
  const path = asset
    ? assetLink(asset)
    : sale
      ? saleLink(BigInt(sale.slice(1)))
      : "/network-market";
  let title = "LiteForge NFT market";
  let description = "Collect or list ERC-721 and ERC-1155 NFTs on the LiteForge testnet.";
  let image = "/og.jpg";
  if (!asset && sale) {
    title = "Listing " + sale;
    try {
      const [, collection, tokenId, price, multi, active] = await client.readContract({
        address: networkMarket,
        abi: marketAbi,
        functionName: "sales",
        args: [BigInt(sale.slice(1))],
      });
      if (price > 0n) {
        asset = { collection, id: String(tokenId), multi };
        description = `${active ? "Listed for" : "Closed listing at"} ${formatEther(price)} test zkLTC on the LiteForge NFT market.`;
      }
    } catch {
      /* Keep the listing link when RPC is unavailable. */
    }
  }
  if (asset) {
    title = "Token #" + asset.id;
    try {
      // Fetch only the configured explorer. Remote art is a link in the preview.
      const response = await fetch(
        `${explorer}/api/v2/tokens/${asset.collection}/instances/${asset.id}`,
        {
          redirect: "error",
          signal: AbortSignal.timeout(3500),
        },
      );
      if (response.ok) {
        const token = await response.json();
        const name = token.metadata?.name || token.token?.name;
        if (typeof name === "string" && name.trim()) title = name.trim().slice(0, 160);
        const art = token.image_url || token.metadata?.image;
        if (art) image = mediaURL(art);
      }
    } catch {
      /* A token without indexed art still has its own share URL. */
    }
  }
  return pageMeta({ title: title + " · RareCognos", description, path, image });
}
