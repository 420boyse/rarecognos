import { parseAbiItem, parseEventLogs, type Address, type TransactionReceipt } from "viem";

const pieceMinted = parseAbiItem("event PieceMinted(address indexed collector, uint256 indexed piece, uint256 indexed tokenId)");

export function editionReceipt(receipt: TransactionReceipt, contract: Address, wallet: Address) {
  if (receipt.status !== "success") throw Error("The mint reverted on-chain.");
  const event = parseEventLogs({ abi: [pieceMinted], logs: receipt.logs }).find(
    (log) => log.address.toLowerCase() === contract.toLowerCase() &&
      log.args.collector.toLowerCase() === wallet.toLowerCase(),
  );
  return {
    hash: receipt.transactionHash,
    contract,
    wallet,
    piece: event ? Number(event.args.piece) : undefined,
    tokenId: event?.args.tokenId.toString(),
  };
}
