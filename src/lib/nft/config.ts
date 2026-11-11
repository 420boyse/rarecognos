import { createConfig, http, injected } from "wagmi";
import { walletConnect } from "wagmi/connectors";
import { defineChain, isAddress, type Address, type EIP1193Provider } from "viem";
import deployment from "../../../config/liteforge.json";
export const liteforge = defineChain({
  id: 4441,
  name: "LitVM LiteForge",
  nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.liteforge.zeeve.net"] } },
  blockExplorers: {
    default: { name: "LiteForge Explorer", url: "https://explorer.testnet.liteforge.zeeve.net" },
  },
  testnet: true,
});
export const local = defineChain({
  id: 31337,
  name: "RareCognos Local",
  nativeCurrency: { name: "Test currency", symbol: "zkLTC", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});
export const chain = import.meta.env.VITE_NFT_LOCAL === "true" ? local : liteforge;
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim();
const publicAppUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim() ||
  "https://rarecognos-marketplace.efe793462.chatgpt.site";
export const config = createConfig({
  chains: [chain],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    injected({ target: { id: "okx-legacy", name: "OKX Wallet (injected)", provider: (window) => (window as typeof window & { okxwallet?: EIP1193Provider })?.okxwallet } }),
    ...(walletConnectProjectId
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            showQrModal: true,
            metadata: {
              name: "RareCognos",
              description: "Digital art on LiteForge",
              url: publicAppUrl,
              icons: [new URL("/brand/eye-mark.svg", publicAppUrl).href],
            },
          }),
        ]
      : []),
  ],
  transports: {
    4441: http(liteforge.rpcUrls.default.http[0], { batch: true }),
    31337: http(local.rpcUrls.default.http[0], { batch: true }),
  },
  ssr: true,
});
const collection = chain.id === 31337 ? import.meta.env.VITE_NFT_COLLECTION : deployment.collection;
const market = chain.id === 31337 ? import.meta.env.VITE_NFT_MARKET : deployment.market;
export const contracts = {
  collection: collection as Address | undefined,
  market: market as Address | undefined,
  factory: (chain.id === 31337 ? import.meta.env.VITE_DROP_FACTORY : import.meta.env.VITE_DROP_FACTORY) as Address | undefined,
};
export const dropsConfigured = !!contracts.factory && isAddress(contracts.factory);
export const configured =
  !!collection &&
  isAddress(collection) &&
  !!market &&
  isAddress(market) &&
  (chain.id === 31337 || deployment.verified);
export const explorer = chain.id === 4441 ? liteforge.blockExplorers.default.url : undefined;
