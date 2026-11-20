import { decodeFunctionData, parseAbi, type Address } from "viem";
import type { Pending } from "./transaction";

const abi = parseAbi([
  "function list(address,uint256,bool,uint256)",
  "function buy(uint256)",
  "function cancel(uint256)",
  "function approve(address,uint256)",
  "function setApprovalForAll(address,bool)",
]);
type Scope = { collection: Address; id: string; multi: boolean; saleId?: bigint };

export function matchesMarketPending(record: Pending, market: Address, asset: Scope): boolean {
  try {
    const { functionName, args } = decodeFunctionData({ abi, data: record.data });
    const atMarket = record.contract.toLowerCase() === market.toLowerCase();
    const atCollection = record.contract.toLowerCase() === asset.collection.toLowerCase();
    if (functionName === "list")
      return atMarket && !asset.saleId && args[0].toLowerCase() === asset.collection.toLowerCase() &&
        args[1] === BigInt(asset.id) && args[2] === asset.multi;
    if (functionName === "buy" || functionName === "cancel")
      return atMarket && args[0] === asset.saleId;
    if (functionName === "approve")
      return atCollection && !asset.saleId && !asset.multi &&
        args[0].toLowerCase() === market.toLowerCase() && args[1] === BigInt(asset.id);
    return atCollection && !asset.saleId && asset.multi &&
      args[0].toLowerCase() === market.toLowerCase() && args[1] === true;
  } catch {
    return false;
  }
}
