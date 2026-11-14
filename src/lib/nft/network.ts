import { liteforge } from "./config";

export const faucetUrl = "https://faucet.testnet.liteforge.zeeve.net/";

type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isPhantom?: boolean;
  providers?: WalletProvider[];
};

function installed(): WalletProvider[] {
  const ethereum = (window as Window & { ethereum?: WalletProvider }).ethereum;
  if (ethereum?.providers?.length) return ethereum.providers;
  return ethereum ? [ethereum] : [];
}

function preferMetaMask(): WalletProvider | undefined {
  const list = installed();
  return list.find((provider) => provider.isMetaMask && !provider.isPhantom) || list.find((provider) => !provider.isPhantom) || list[0];
}

export async function addLiteForge(preferred?: WalletProvider | null) {
  const provider = preferred ?? preferMetaMask();
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
