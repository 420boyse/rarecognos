import { liteforge } from "./config";

export const faucetUrl = "https://faucet.testnet.liteforge.zeeve.net/";

export async function addLiteForge() {
  const provider = (window as Window & { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum;
  if (!provider) throw Error("No browser wallet found.");
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: "0x1159",
        chainName: liteforge.name,
        nativeCurrency: liteforge.nativeCurrency,
        rpcUrls: [...liteforge.rpcUrls.default.http],
        blockExplorerUrls: [liteforge.blockExplorers.default.url],
      },
    ],
  });
}
