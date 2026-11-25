import { assetLink } from "@/lib/nft/network-market";
import { createFileRoute } from "@tanstack/react-router";
import { OpenRelease } from "@/components/open-release";
import { useState } from "react";
import { faucetUrl } from "@/lib/nft/network";
import { parseAbi, parseEther } from "viem";
import { useAccount, useBalance, useReadContract, useSwitchChain } from "wagmi";
import rogues from "@/data/midnight-rogues.json";
import { MarketHeader } from "@/components/market-header";
import { NetworkHelp } from "@/components/network-help";
import { SiteFooter } from "@/components/site-footer";
import { pageMeta } from "@/lib/site-meta";
import { chain, explorer } from "@/lib/nft/config";
import { rogueImage, roguePage, roguesAddress, roguesMintContracts, rogueEditions, roguesStory, useRoguesRelease } from "@/lib/nft/midnight-rogues";
import { useEditionMint } from "@/lib/nft/use-edition-mint";
import release from "../../config/midnight-rogues-expansion.json";

const mintedAbi = parseAbi(["function editionState(uint256) view returns (uint256 minted, address mintContract)"]);
export const Route = createFileRoute("/midnight-rogues")({
  validateSearch: (input: Record<string, unknown>) => ({
    piece: rogues.find((item) => item.id === input.piece)?.id,
    setup: String(input.setup) === "1" ? 1 : undefined,
  }),
  head: ({ match }) => {
    const item = rogues.find((r) => r.id === match.search.piece);
    return pageMeta({
      title: item ? `${item.name} · MIDNIGHT ROGUES · RareCognos` : "MIDNIGHT ROGUES · RareCognos",
      description: item?.story || roguesStory,
      path: item ? roguePage(item.id) : "/midnight-rogues",
      image: rogueImage(item?.id || "001"),
    });
  },
  component: Collection,
});

function Collection() {
  const { piece, setup } = Route.useSearch();
  const item = rogues.find((r) => r.id === piece);
  const state = useRoguesRelease();
  return <>
    <MarketHeader view="Explore" />
    <main className={item ? "market-section explore-page rogue-detail" : "market-section explore-page"}>
      <div className="section-heading"><div>
        {item && <a href="/midnight-rogues">← MIDNIGHT ROGUES</a>}
        <h1>{item ? `#${item.id} — ${item.name}` : "MIDNIGHT ROGUES"}</h1>
        <p>{item ? item.title + " " + item.icon : roguesStory}</p>
      </div></div>
      {setup && !state.data && <OpenRelease release={release} artifact="MidnightRoguesExpansion" title="Open the collection" action="Open public mint" explanation="One transaction opens all ten characters. Mint proceeds go to the creator after the 0.25% platform fee." ready={state.data === false && !state.isError} refresh={() => void state.refetch()} />}
      <p className="market-notice">{rogueEditions} editions per character · 1,000 total · 0.001 test zkLTC per edition · LiteForge testnet</p>
      {item ? <div className="creation-grid">
        <div className="art-preview"><img src={rogueImage(item.id)} alt={item.name + " · " + item.title} /></div>
        <div className="creation-form"><p>{item.story}</p>
          {state.data === true && !state.isError ? <Mint key={item.id} index={rogues.indexOf(item)} /> : <p role="status">{state.label}</p>}
        </div>
      </div> : <ul className="catalog-grid">{rogues.map((r, i) => <li key={r.id}>
        <a className="catalog-card" href={roguePage(r.id)}>
          <img src={rogueImage(r.id)} alt="" width="640" height="640" loading={i < 2 ? "eager" : "lazy"} />
          <strong>#{r.id} — {r.name}</strong><em>{r.title} {r.icon}</em>
        </a></li>)}</ul>}
      {state.isError && <button className="nft-button" onClick={() => void state.refetch()}>Check release again</button>}
    </main>
    <SiteFooter />
  </>;
}

const connect = () => window.dispatchEvent(new Event("rarecognos-login"));

function Mint({ index }: { index: number }) {
  const account = useAccount();
  const [copied, setCopied] = useState(false);
  const balance = useBalance({ address: account.address, chainId: chain.id,
    query: { enabled: account.isConnected && account.chainId === chain.id, refetchInterval: 15000 } });
  const needsFunds = balance.data !== undefined && balance.data.value <= parseEther("0.001");
  const switcher = useSwitchChain();
  const count = useReadContract({ chainId: chain.id, address: roguesAddress, abi: mintedAbi,
    functionName: "editionState", args: [BigInt(index)], query: { refetchInterval: 15000 } });
  const minted = count.data?.[0];
  const mint = useEditionMint(count.data?.[1], roguesMintContracts);
  const wrong = account.isConnected && account.chainId !== chain.id;
  const sold = minted !== undefined && minted >= BigInt(rogueEditions);
  return <>
    <p>{minted !== undefined ? `${minted} of ${rogueEditions} minted` : count.isError ? "Edition count unavailable" : "Checking editions…"}</p>
    {(!account.isConnected || wrong) && <NetworkHelp />}
    <div className="rogue-mint-action">
    <span className="rogue-mint-price">0.001 test zkLTC <small>+ network fee</small></span>
    {!account.isConnected ? <button className="primary-action" onClick={connect}>Connect wallet to mint</button>
      : wrong ? <button className="primary-action" onClick={() => switcher.switchChain({chainId: chain.id})}>Switch to LiteForge</button>
      : needsFunds && !mint.pending ? <a className="primary-action" href={faucetUrl} target="_blank" rel="noreferrer">Get test zkLTC</a>
      : <button className="primary-action" disabled={mint.busy || (!mint.pending && (sold || count.data === undefined || count.isError))} onClick={() => void mint.run(index)}>
        {mint.busy ? "Checking transaction…" : mint.pending ? "Recheck mint receipt" : sold ? "Sold out" : "Mint for 0.001 test zkLTC"}
      </button>}
    </div>
    {needsFunds && !wrong && <p role="status">Get test zkLTC from the faucet, then return here to mint.</p>}
    {balance.isError && account.isConnected && !wrong && <a href={faucetUrl} target="_blank" rel="noreferrer">Need test zkLTC? Open the faucet</a>}
    {mint.notice && <p role="status">{mint.notice}</p>}
    {mint.receipt && <p role="status">Mint confirmed. {mint.receipt.piece !== undefined && rogues[mint.receipt.piece]?.name} {mint.receipt.tokenId && `· Token #${mint.receipt.tokenId}`}</p>}
    {mint.receipt?.tokenId && <a className="primary-action" href={assetLink({ collection: mint.receipt.contract, id: mint.receipt.tokenId, multi: false })}>List this NFT</a>}
    {mint.receipt?.tokenId && mint.receipt.piece !== undefined && rogues[mint.receipt.piece] && <div className="mint-share">
      <a className="nft-button" href={"https://twitter.com/intent/tweet?" + new URLSearchParams({
        text: `I collected ${rogues[mint.receipt.piece].name} from MIDNIGHT ROGUES on the LiteForge testnet. Who brings back the sun?`,
        url: "https://rarecognos.com" + roguePage(rogues[mint.receipt.piece].id),
      })} target="_blank" rel="noopener noreferrer">Share my character on X</a>
      <button className="nft-button" onClick={async () => {
        try {
          await navigator.clipboard.writeText("https://rarecognos.com" + roguePage(rogues[mint.receipt!.piece!].id));
          setCopied(true);
        } catch { setCopied(false); }
      }}>{copied ? "Link copied" : "Copy character link"}</button>
    </div>}
    {(mint.receipt?.hash || mint.hash) && explorer && <a href={`${explorer}/tx/${mint.receipt?.hash || mint.hash}`}>View transaction</a>}
  </>;
}

