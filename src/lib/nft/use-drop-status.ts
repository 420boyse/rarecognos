import { useReadContract } from "wagmi";
import { isAddress, type Address } from "viem";
import { availabilityLabel, dropStatus, type DropStatus } from "./availability";

const abi = [
  { type: "function", name: "MINT_PRICE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "PIECE_SUPPLY", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "mintedOf",
    stateMutability: "view",
    inputs: [{ name: "piece", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export function useDropStatus(address?: string, piece?: number): { status: DropStatus; label: string } {
  const live = Boolean(address && isAddress(address));
  const contract = live ? (address as Address) : undefined;
  const trackMinted = piece !== undefined && piece >= 0;
  const price = useReadContract({
    address: contract,
    abi,
    functionName: "MINT_PRICE",
    query: { enabled: live },
  });
  const supply = useReadContract({
    address: contract,
    abi,
    functionName: "PIECE_SUPPLY",
    query: { enabled: live },
  });
  const minted = useReadContract({
    address: contract,
    abi,
    functionName: "mintedOf",
    args: [BigInt(Math.max(0, piece ?? 0))],
    query: { enabled: live && trackMinted },
  });
  const status = dropStatus({
    live,
    price: price.data,
    supply: supply.data,
    minted: minted.data,
    priceError: price.isError,
    supplyError: supply.isError,
    mintedError: minted.isError,
    trackMinted,
  });
  return { status, label: availabilityLabel(status) };
}
