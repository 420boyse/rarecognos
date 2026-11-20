import { assetLink } from "@/lib/nft/network-market";
import { createFileRoute } from "@tanstack/react-router";
import { OpenRelease } from "@/components/open-release";
import { parseAbi } from "viem";
import { useAccount, useReadContract, useSwitchChain } from "wagmi";
import rogues from "@/data/midnight-rogues.json";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { pageMeta } from "@/lib/site-meta";
import { chain, explorer } from "@/lib/nft/config";
import { rogueImage, roguePage, roguesAddress, roguesStory, useRoguesRelease } from "@/lib/nft/midnight-rogues";
import { useEditionMint } from "@/lib/nft/use-edition-mint";
import release from "../../config/midnight-rogues.json";

const mintedAbi = parseAbi(["function mintedOf(uint256) view returns (uint256)"]);
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
    <main className="market-section explore-page">
      <div className="section-heading"><div>
        {item && <a href="/midnight-rogues">← MIDNIGHT ROGUES</a>}
        <h1>{item ? `#${item.id} — ${item.name}` : "MIDNIGHT ROGUES"}</h1>
        <p>{item ? item.title + " " + item.icon : roguesStory}</p>
      </div></div>
      {setup && !state.data && <OpenRelease release={release} artifact="MidnightRogues" title="Open the collection" action="Open public mint" explanation="One transaction opens all ten characters. Mint proceeds go to the creator after the 0.25% platform fee." ready={state.data === false && !state.isError} refresh={() => void state.refetch()} />}
      <p className="market-notice">10 editions per character · 0.001 test zkLTC per edition · LiteForge testnet</p>
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
  const switcher = useSwitchChain();
  const mint = useEditionMint(roguesAddress);
  const count = useReadContract({ chainId: chain.id, address: roguesAddress, abi: mintedAbi,
    functionName: "mintedOf", args: [BigInt(index)], query: { refetchInterval: 15000 } });
  const wrong = account.isConnected && account.chainId !== chain.id;
  const sold = count.data !== undefined && count.data >= 10n;
  return <>
    <p>{count.data !== undefined ? `${count.data} of 10 minted` : count.isError ? "Edition count unavailable" : "Checking editions…"}</p>
    {!account.isConnected ? <button className="primary-action" onClick={connect}>Connect wallet to mint</button>
      : wrong ? <button className="primary-action" onClick={() => switcher.switchChain({chainId: chain.id})}>Switch to LiteForge</button>
      : <button className="primary-action" disabled={mint.busy || (!mint.pending && (sold || count.data === undefined || count.isError))} onClick={() => void mint.run(index)}>
        {mint.busy ? "Checking transaction…" : mint.pending ? "Recheck mint receipt" : sold ? "Sold out" : "Mint for 0.001 test zkLTC"}
      </button>}
    {mint.notice && <p role="status">{mint.notice}</p>}
    {mint.receipt && <p role="status">Mint confirmed. {mint.receipt.piece !== undefined && rogues[mint.receipt.piece]?.name} {mint.receipt.tokenId && `· Token #${mint.receipt.tokenId}`}</p>}
    {mint.receipt?.tokenId && <a className="primary-action" href={assetLink({ collection: mint.receipt.contract, id: mint.receipt.tokenId, multi: false })}>List this NFT</a>}
    {(mint.receipt?.hash || mint.hash) && explorer && <a href={`${explorer}/tx/${mint.receipt?.hash || mint.hash}`}>View transaction</a>}
  </>;
}

