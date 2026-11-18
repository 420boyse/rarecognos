import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { EyeMark } from "@/components/wordmark";
import { works, type Work } from "@/data/works";
import { NFTMarket } from "@/components/nft-market";
import { NFTDeploy } from "@/components/nft-deploy";
import { MarketHeader } from "@/components/market-header";
import { NFTDropMint } from "@/components/nft-drops";
import { SiteFooter } from "@/components/site-footer";
import { faucetUrl } from "@/lib/nft/network";
import { pageMeta } from "@/lib/site-meta";
import { useDropStatus } from "@/lib/nft/use-drop-status";
import eyedDeployment from "../../config/eyed.json";
import haloDeployment from "../../config/halo.json";
import { isAddress, formatEther, type Address } from "viem";
import { useListings } from "@/lib/nft/data";
export const Route = createFileRoute("/")({
  head: () =>
    pageMeta({
      title: "RareCognos",
      description: "An eye for the rare. Distinctive digital art on LiteForge.",
      path: "/",
      image: "/art/nocturne-hero.jpg",
    }),
  component: Home,
});
function Home() {
  const [view, setView] = useState("Explore");
  const [active, setActive] = useState<Work | null>(null);
  const eyedDrop = useDropStatus(eyedDeployment.address);
  const haloDrop = useDropStatus(haloDeployment.address || undefined);
  const listings = useListings();
  const [marketTab, setMarketTab] = useState<"all" | "mint" | "listings">("all");
  const [marketSearch, setMarketSearch] = useState("");
  const [marketSort, setMarketSort] = useState<"newest" | "price">("newest");
  const [marketLayout, setMarketLayout] = useState<"grid" | "list">("grid");
  const liveListings = listings.data?.pages.flatMap((page) => page.listings).filter((listing) => listing.valid) ?? [];
  const searchTerm = marketSearch.trim().toLowerCase();
  const matchingListings = [...liveListings].filter((listing) => !searchTerm || `token #${listing.tokenId}`.includes(searchTerm)).sort((a,b) => marketSort === "price" ? (a.price < b.price ? -1 : a.price > b.price ? 1 : 0) : (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));
  const mintCards = [{ name: "Eyed", href: "/eyed", image: "/art/eyed/04.jpg", status: eyedDrop.label }, { name: "Halo", href: "/halo", image: "/art/halo/01.png", status: haloDrop.label }].filter((card) => !searchTerm || card.name.toLowerCase().includes(searchTerm));
  useEffect(() => {
    const update = () => {
      if (location.hash === "#create" || location.hash === "#drops") {
        location.replace("/create");
        return;
      }
      setView(
        /^#token\/[1-9][0-9]{0,76}$/.test(location.hash)
          ? "Token:" + location.hash.slice(7)
          : /^#drop\/0x[0-9a-fA-F]{40}$/.test(location.hash) && isAddress(location.hash.slice(6))
            ? "Drop:" + location.hash.slice(6)
            : location.hash === "#my-nfts"
              ? "My NFTs"
              : "Explore",
      );
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (location.hash && location.hash !== "#top")
      document
        .getElementById(view.startsWith("Token:") ? "token-detail" : location.hash.slice(1))
        ?.scrollIntoView();
  }, [view]);
  return (
    <div id="top">
      <MarketHeader view={view === "Explore" || view.startsWith("Token:") || view.startsWith("Drop:") ? "Home" : view} />
      <main>
        <style>{homeVisualCSS}</style>
        <section className="rc-hero" aria-labelledby="hero-title">
          <div className="rc-hero-copy">
            <span className="rc-kicker">RARECOGNOS / LITEFORGE TESTNET</span>
            <h1 id="hero-title">Discover.<br />Collect.<br />Trade.</h1>
            <p>Your NFT marketplace on LiteForge.</p>
            <div className="rc-actions">
              <a className="rc-button rc-button-light" href="#marketplace">Explore NFTs <ArrowRight size={17} /></a>
              <a className="rc-button rc-button-outline" href="/create">Create</a>
            </div>
          </div>
          <div className="rc-hero-visual" aria-label="RareCognos studio artwork previews">
            <div className="rc-orbit" aria-hidden="true" /><div className="rc-orbit-shine" aria-hidden="true" />
            <div className="rc-float-card rc-float-left"><img src="/art/hero-wave.svg" alt="Cream sculptural wave artwork" /><span>Preview</span></div>
            <div className="rc-float-card rc-float-center"><img src="/art/nocturne.jpg" alt="Nocturne studio artwork" /><span>Preview</span></div>
            <div className="rc-float-card rc-float-right"><img src="/art/hero-cubes.svg" alt="Blue crystal cube artwork" /><span>Preview</span></div>
          </div>
        </section>
        <section id="marketplace" className="rc-section rc-market" aria-labelledby="rc-market-title">
          <div className="rc-heading"><div><h2 id="rc-market-title">Explore NFTs</h2><p>Discover new mints and active listings on LiteForge.</p></div><a className="rc-text-link" href="/explore">Full explore <ArrowUpRight size={16} /></a></div>
          <div className="rc-toolbar">
            <div className="rc-tabs" role="group" aria-label="NFT category">
              {(["all","mint","listings"] as const).map((tab) => <button key={tab} type="button" className={marketTab===tab?"selected":""} aria-pressed={marketTab===tab} onClick={()=>setMarketTab(tab)}>{tab==="all"?"All":tab==="mint"?"Mint":"Listings"}</button>)}
            </div>
            <label className="rc-search"><span className="sr-only">Search NFTs</span><input value={marketSearch} onChange={(event)=>setMarketSearch(event.target.value)} placeholder="Search NFTs..." /></label>
            <select aria-label="Sort listings" value={marketSort} onChange={(event)=>setMarketSort(event.target.value as "newest"|"price")}><option value="newest">Newest</option><option value="price">Price: low to high</option></select>
            <div className="rc-layout" role="group" aria-label="Display layout"><button aria-label="Grid layout" aria-pressed={marketLayout==="grid"} onClick={()=>setMarketLayout("grid")}>▦</button><button aria-label="List layout" aria-pressed={marketLayout==="list"} onClick={()=>setMarketLayout("list")}>☷</button></div>
          </div>
          <div className={`rc-nft-grid ${marketLayout==="list"?"rc-nft-list":""}`}>
            {(marketTab==="all"||marketTab==="mint") && mintCards.map((card)=><a className="rc-nft-card" key={card.name} href={card.href}><div className="rc-nft-art"><img src={card.image} alt="" loading="lazy" /></div><div className="rc-nft-info"><strong>{card.name}</strong><span>{card.status}</span></div></a>)}
            {(marketTab==="all"||marketTab==="listings") && matchingListings.map((listing)=><a className="rc-nft-card rc-listing-card" key={String(listing.id)} href={`/#token/${listing.tokenId}`}><div className="rc-nft-art rc-token-art"><span>RareCognos<br />NFT #{String(listing.tokenId)}</span></div><div className="rc-nft-info"><strong>Token #{String(listing.tokenId)}</strong><span>{formatEther(listing.price)} zkLTC · Listed</span></div></a>)}
          </div>
          {(marketTab==="listings" && !listings.isPending && !matchingListings.length) && <div className="rc-empty">{listings.isError?"Listings are temporarily unavailable.":"No active listings match your search yet."} <a href="/explore">Explore collections</a></div>}
          {marketTab==="listings" && listings.isPending && <p className="rc-empty">Checking active listings…</p>}
          {marketTab!=="listings" && !mintCards.length && !(marketTab==="all" && matchingListings.length) && <p className="rc-empty">No matching NFTs found.</p>}
        </section>
        <section className="rc-section rc-mint" aria-labelledby="rc-mint-title">
          <div className="rc-mint-copy"><h2 id="rc-mint-title">Mint now</h2><p>Turn your ideas into NFTs on LiteForge.<br />Create, mint, and list in a few simple steps.</p><a className="rc-button rc-button-light" href="/create">Create <ArrowRight size={17}/></a></div>
          <div className="rc-mint-tiles">{works.filter((work)=>["nocturne","lit-mark","red-aperture"].includes(work.id)).map((work)=><button key={work.id} type="button" onClick={()=>setActive(work)} className="rc-mint-tile"><img src={work.image} alt="" loading="lazy"/><span>{work.title} · Preview <ArrowUpRight size={15}/></span></button>)}</div>
        </section>
        <section className="rc-create-banner" aria-labelledby="rc-create-title"><div><h2 id="rc-create-title">Create on RareCognos</h2><p>Mint your NFTs, reach collectors, and trade on LiteForge.</p><a className="rc-button rc-button-outline" href="/create">Start creating <ArrowRight size={17}/></a></div><div className="rc-banner-art" aria-hidden="true" /></section>
        {view !== "Explore" && (
        <>
        {view.startsWith("Drop:") && <NFTDropMint address={view.slice(5) as Address} />}
        <NFTMarket
          tab={view}
          onAvailability={() => {}}
          onViewChange={(next) => {
            setView(next);
            location.hash = next === "My NFTs" ? "my-nfts" : "explore";
          }}
        />
        </>
        )}
        <NFTDeploy />
      </main>
      <SiteFooter exploreHref="/explore" />
      {active && <WorkDialog work={active} onClose={() => setActive(null)} />}
    </div>
  );
}
function WorkCard({ work, onOpen }: { work: Work; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex h-full min-h-80 w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left md:min-h-[28rem]"
    >
        <img
        src={work.image}
        alt=""
        width="1200"
        height="1500"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      <span className="absolute top-4 left-4 rounded-full border border-line bg-bg/70 px-3 py-1 text-xs tracking-wide text-fg backdrop-blur-sm">
        Studio work
      </span>
      <span className="absolute top-4 right-4 grid size-10 place-items-center rounded-full border border-line bg-bg/70 text-fg opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </span>
      <span className="relative mt-auto flex items-end justify-between gap-4 bg-gradient-to-t from-bg via-bg/80 to-transparent p-5 pt-24">
        <span>
          <span className="block text-lg font-medium tracking-tight">{work.title}</span>
          <span className="mt-1 block font-serif text-base text-fg/75 italic">{work.medium}</span>
        </span>
      </span>
    </button>
  );
}

function WorkDialog({ work, onClose }: { work: Work; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="overflow-hidden rounded-2xl"
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="grid md:grid-cols-2">
        <img src={work.image} alt="" className="h-72 w-full object-cover md:h-full" />
        <div className="flex flex-col gap-4 p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs tracking-widest text-fg/50 uppercase">Studio work</p>
              <h2 id={titleId} className="mt-2 text-3xl font-medium tracking-tight">
                {work.title}
              </h2>
              <p className="mt-1 font-serif text-lg text-fg/75 italic">
                {work.medium}, {work.year}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-11 shrink-0 place-items-center rounded-full border border-line"
              aria-label="Close details"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <p className="text-sm leading-relaxed text-pretty text-fg/75">{work.description}</p>
          <p className="mt-auto text-xs text-fg/45">
            Studio preview. Not a sale listing.
          </p>
          <div className="flex items-center gap-3 pt-2">
            <EyeMark className="h-4 w-7 object-contain opacity-50" />
            <span className="text-xs tracking-wide text-fg/50">RareCognos</span>
          </div>
        </div>
      </div>
    </dialog>
  );
}

const homeVisualCSS = `
.rc-hero,.rc-section,.rc-create-banner{max-width:1440px;margin:0 auto}.rc-hero{min-height:570px;display:grid;grid-template-columns:40% 60%;position:relative;overflow:hidden;border-bottom:1px solid #24262b;padding:64px 5% 46px;background:radial-gradient(ellipse at 72% 48%,#0b1730 0%,#08090d 48%,#050506 85%)}.rc-hero-copy{position:relative;z-index:3;align-self:center}.rc-kicker{font-size:10px;letter-spacing:.17em;color:#6d83bd}.rc-hero h1{font-size:clamp(55px,6.3vw,108px);letter-spacing:-.07em;line-height:.94;font-weight:650;margin:26px 0 22px}.rc-hero-copy p{color:#b9bbc3;font-size:17px;margin-bottom:28px}.rc-actions{display:flex;gap:13px;flex-wrap:wrap}.rc-button{display:inline-flex;align-items:center;justify-content:center;gap:13px;border-radius:999px;padding:13px 22px;text-decoration:none;font-size:13px;font-weight:600;min-height:45px}.rc-button-light{background:#f4f3ee;color:#0b0b0d}.rc-button-outline{border:1px solid #4a4d54;color:#f4f3ee;background:#0b0c10}.rc-hero-visual{position:relative;min-height:460px;perspective:900px}.rc-orbit{position:absolute;width:94%;height:68%;left:3%;top:15%;border:48px solid #141923;border-top-color:#555d6c;border-bottom-color:#0637b3;border-radius:50%;transform:rotate(-27deg);filter:drop-shadow(0 0 32px #174eff88);box-shadow:inset 0 0 15px #7196e3,0 0 42px #0a44ce55}.rc-float-card{position:absolute;top:14%;width:34%;height:76%;border:1px solid #616779;border-radius:17px;background:#101217;overflow:hidden;box-shadow:0 24px 70px #000a;transform-style:preserve-3d}.rc-float-card img{width:100%;height:100%;object-fit:cover}.rc-float-card span{position:absolute;top:13px;left:13px;background:#252936d9;border:1px solid #555a65;border-radius:30px;padding:5px 11px;font-size:11px;color:white}.rc-float-left{left:10%;transform:rotate(-10deg) translateY(19px);z-index:1}.rc-float-center{left:33%;width:36%;height:86%;top:8%;z-index:3;transform:rotate(4deg)}.rc-float-right{left:64%;transform:rotate(10deg) translateY(25px);z-index:2}.rc-section{padding:48px 5% 52px;border-bottom:1px solid #24262b}.rc-heading{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:24px}.rc-section h2,.rc-create-banner h2{font-size:clamp(32px,3.5vw,53px);line-height:1.05;letter-spacing:-.055em;font-weight:600;margin:0 0 12px}.rc-heading p,.rc-mint-copy p,.rc-create-banner p{color:#aeb0b8;font-size:14px;line-height:1.7}.rc-text-link{color:#dedee3;display:inline-flex;gap:8px;align-items:center;font-size:13px;text-decoration:none}.rc-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:25px}.rc-tabs{display:flex;border:1px solid #34363c;border-radius:999px;overflow:hidden}.rc-tabs button{border:0;color:#ddd;background:transparent;padding:10px 22px;cursor:pointer}.rc-tabs button.selected{background:#f4f3ee;color:#09090a;border-radius:999px}.rc-search{margin-left:auto}.rc-search input,.rc-toolbar select{background:#101115;border:1px solid #383b42;border-radius:30px;color:#f5f5f5;padding:11px 15px;min-height:43px}.rc-search input{width:230px}.rc-layout{display:flex;border:1px solid #383b42;border-radius:24px;overflow:hidden}.rc-layout button{padding:9px 12px;background:#101115;color:white;border:0;cursor:pointer}.rc-layout button[aria-pressed=true]{background:#30323b}.rc-nft-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.rc-nft-card{min-width:0;display:block;text-decoration:none;color:#f4f4f5;background:#101114;border:1px solid #30323a;border-radius:14px;overflow:hidden;transition:border-color .2s,transform .2s}.rc-nft-card:hover{border-color:#6478ad;transform:translateY(-3px)}.rc-nft-art{aspect-ratio:1/1;overflow:hidden;background:#0a0c12}.rc-nft-art img{width:100%;height:100%;object-fit:cover}.rc-nft-info{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:13px;font-size:13px}.rc-nft-info span{font-size:11px;color:#bcbfc8;border:1px solid #3b3e46;border-radius:25px;padding:5px 9px;text-align:right}.rc-token-art{display:grid;place-items:center;text-align:center;background:radial-gradient(circle at 65% 30%,#17294e,#07080d 70%);font-size:22px;letter-spacing:-.04em}.rc-nft-list{grid-template-columns:1fr}.rc-nft-list .rc-nft-card{display:flex;align-items:center}.rc-nft-list .rc-nft-art{width:100px;flex:none}.rc-nft-list .rc-nft-info{flex:1}.rc-empty{padding:25px;color:#aaa}.rc-empty a{color:white}.rc-mint{display:grid;grid-template-columns:34% 66%;align-items:center;gap:15px}.rc-mint-copy p{margin-bottom:26px}.rc-mint-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.rc-mint-tile{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:14px;border:1px solid #34373d;background:#111;cursor:pointer;color:white;text-align:left;padding:0}.rc-mint-tile img{width:100%;height:100%;object-fit:cover}.rc-mint-tile span{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;padding:14px;background:linear-gradient(transparent,#000c);font-size:12px}.rc-create-banner{margin:36px auto 55px;border:1px solid #333944;border-radius:18px;padding:45px 5%;min-height:240px;position:relative;overflow:hidden;background:radial-gradient(ellipse at 85% 100%,#15358e 0%,#06090f 48%,#050506 80%)}.rc-create-banner>div:first-child{position:relative;z-index:2}.rc-create-banner p{margin-bottom:22px}.rc-banner-art{position:absolute;width:54%;height:210%;right:-5%;top:-45%;border:44px solid #1c2539;border-top-color:#c2c8d3;border-bottom-color:#0047d4;border-radius:50%;transform:rotate(-33deg);filter:drop-shadow(0 0 25px #1357d7)}@media(max-width:800px){.rc-hero{grid-template-columns:1fr;padding-top:42px;min-height:0}.rc-hero-visual{min-height:350px;margin-top:22px}.rc-hero h1{font-size:clamp(57px,12vw,90px)}.rc-nft-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.rc-mint{grid-template-columns:1fr}.rc-search{margin-left:0}.rc-create-banner{margin-left:5%;margin-right:5%}}@media(max-width:450px){.rc-hero-visual{min-height:260px}.rc-orbit{border-width:28px}.rc-float-card{border-radius:10px}.rc-float-card span{font-size:8px;padding:4px 6px}.rc-nft-info{align-items:flex-start;flex-direction:column}.rc-nft-info span{font-size:10px}.rc-mint-tiles{gap:6px}.rc-mint-tile span{font-size:10px;padding:7px}.rc-toolbar{gap:8px}.rc-search input{width:160px}.rc-hero{padding-left:5%;padding-right:5%}}@media(prefers-reduced-motion:reduce){.rc-nft-card{transition:none}}

/* Hero cinematic revision: metallic arc, richer layering and mobile sizing */
.rc-hero{background:radial-gradient(ellipse at 77% 57%,#0a1a3b 0%,#05070c 46%,#050506 83%);min-height:590px;isolation:isolate}.rc-hero-visual{isolation:isolate}.rc-orbit{z-index:-2;left:4%;top:8%;width:105%;height:84%;border-width:clamp(34px,5vw,83px);border-style:solid;border-color:#141923;border-top-color:#9ca6b7;border-right-color:#0a101d;border-bottom-color:#073bc7;border-left-color:#090d17;transform:rotate(-27deg);background:transparent;box-shadow:inset 0 0 12px #b2c3e066,0 0 2px #dae4ff,0 0 45px #0656ff99;filter:drop-shadow(0 0 20px #074bd5)}.rc-orbit-shine{z-index:-1;position:absolute;left:4%;right:-8%;top:50%;height:32%;border-bottom:4px solid #1164ff;border-radius:50%;transform:rotate(-24deg);filter:drop-shadow(0 0 13px #0568ff) drop-shadow(0 0 29px #1254ff);pointer-events:none}.rc-float-card{top:18%;height:68%;border-color:#56617d;background:#0b0e16;box-shadow:0 25px 65px #000c,0 0 0 1px #0e1e42}.rc-float-card img{object-fit:cover}.rc-float-left{left:8%;width:34%;transform:rotate(-8deg) translateY(16px)}.rc-float-center{left:32%;top:7%;height:85%;width:38%;transform:rotate(3deg);box-shadow:0 35px 90px #000d,0 0 22px #0a4cff33}.rc-float-right{left:66%;width:33%;transform:rotate(9deg) translateY(22px)}.rc-hero h1{letter-spacing:-.065em}.rc-float-card span{font-weight:600;background:#252b3cdd;box-shadow:inset 0 1px 0 #ffffff22}@media(max-width:800px){.rc-hero{min-height:0}.rc-hero-visual{min-height:390px}.rc-orbit{border-width:46px}.rc-float-left{left:10%}.rc-float-center{left:33%}.rc-float-right{left:67%}}@media(max-width:450px){.rc-hero-visual{min-height:275px;margin-top:28px}.rc-orbit{border-width:29px;left:2%;top:13%;height:72%}.rc-orbit-shine{top:53%}.rc-float-card{top:19%;height:64%}.rc-float-center{top:9%;height:81%}.rc-hero h1{font-size:clamp(56px,13vw,74px)}}
`;
