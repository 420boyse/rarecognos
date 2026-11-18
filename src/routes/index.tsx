import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Eye, X } from "lucide-react";
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
import { isAddress, type Address } from "viem";
import { MarketplaceListingCard } from "@/components/marketplace-listing-card";
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
  const matchingListings = [...liveListings].sort((a,b) => marketSort === "price" ? (a.price < b.price ? -1 : a.price > b.price ? 1 : 0) : (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));
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
        {view === "Explore" && (
          <>
        <section className="rc-hero" aria-labelledby="hero-title">
          <div className="rc-hero-atmosphere" aria-hidden="true">
            <img className="rc-atmosphere-ribbon rc-atmosphere-ribbon-back" src="/art/hero-ribbon.webp" alt="" decoding="async" />
            <img className="rc-atmosphere-ribbon rc-atmosphere-ribbon-front" src="/art/hero-ribbon.webp" alt="" decoding="async" />
          </div>
          <div className="rc-hero-copy">
            <h1 id="hero-title">Discover.<br />Collect.<br />Trade.</h1>
            <p>Your NFT marketplace on LiteForge.</p>
            <div className="rc-actions">
              <a className="rc-button rc-button-light" href="#marketplace">Explore NFTs <ArrowRight size={17} /></a>
              <a className="rc-button rc-button-outline" href="/create">Create</a>
            </div>
          </div>
          <div className="rc-hero-visual" aria-label="RareCognos studio artwork previews">
            <div className="rc-float-card rc-float-left"><img src="/art/hero-wave.webp" alt="Cream sculptural wave artwork" loading="eager" decoding="async" /><span><Eye size={13} aria-hidden="true" /> Preview</span></div>
            <div className="rc-float-card rc-float-center"><img src="/art/hero-nocturne.webp" alt="Nocturne black chrome sculpture" loading="eager" decoding="async" /><span><Eye size={13} aria-hidden="true" /> Preview</span></div>
            <div className="rc-float-card rc-float-right"><img src="/art/hero-cubes.webp" alt="Blue crystal cube artwork" loading="eager" decoding="async" /><span><Eye size={13} aria-hidden="true" /> Preview</span></div>
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
            {(marketTab==="all"||marketTab==="listings") && matchingListings.map((listing)=><MarketplaceListingCard key={String(listing.id)} listing={listing} search={marketSearch} />)}
          </div>
          {(marketTab==="listings" || marketTab==="all") && listings.hasNextPage && (
            <button type="button" className="rc-load-more nft-button" disabled={listings.isFetchingNextPage} onClick={() => void listings.fetchNextPage()}>
              {listings.isFetchingNextPage ? "Loading…" : "Load more listings"}
            </button>
          )}
          {(marketTab==="listings" && !listings.isPending && !matchingListings.length && !listings.hasNextPage) && <div className="rc-empty">{listings.isError?"Listings are temporarily unavailable.":"No active listings yet."} <a href="/explore">Explore collections</a></div>}
          {marketTab==="listings" && listings.isPending && <p className="rc-empty">Checking active listings…</p>}
          {marketTab!=="listings" && !mintCards.length && !(marketTab==="all" && matchingListings.length) && <p className="rc-empty">No matching NFTs found.</p>}
        </section>
        <section className="rc-section rc-mint" aria-labelledby="rc-mint-title">
          <div className="rc-mint-copy"><h2 id="rc-mint-title">From the studio</h2><p>Explore our creative direction and artwork concepts.<br />These are previews, not sale listings.</p><a className="rc-button rc-button-light" href="/create">Create NFT <ArrowRight size={17}/></a></div>
          <div className="rc-mint-tiles">{works.filter((work)=>["nocturne","lit-mark","red-aperture"].includes(work.id)).map((work)=><button key={work.id} type="button" onClick={()=>setActive(work)} className="rc-mint-tile"><img src={work.image} alt="" loading="lazy"/><span>{work.title} · Preview <ArrowUpRight size={15}/></span></button>)}</div>
        </section>
        <section className="rc-create-banner" aria-labelledby="rc-create-title"><div><h2 id="rc-create-title">Create on RareCognos</h2><p>Mint your NFTs, reach collectors, and trade on LiteForge.</p><a className="rc-button rc-button-outline" href="/create">Start creating <ArrowRight size={17}/></a></div><div className="rc-banner-scene" aria-hidden="true"><img className="rc-banner-image" src="/art/create-chrome-banner.webp" alt="" loading="lazy" decoding="async" width={2172} height={724} /></div></section>
          </>
        )}
        {view !== "Explore" && (
        <div className="rc-subpage">
        {view.startsWith("Drop:") && <NFTDropMint address={view.slice(5) as Address} />}
        <NFTMarket
          tab={view}
          onAvailability={() => {}}
          onViewChange={(next) => {
            setView(next);
            location.hash = next === "My NFTs" ? "my-nfts" : "explore";
          }}
        />
        </div>
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
.rc-subpage{padding-top:var(--header-block);min-height:62vh}
.rc-hero,.rc-section,.rc-create-banner{max-width:1440px;margin:0 auto}.rc-hero{min-height:570px;display:grid;grid-template-columns:40% 60%;position:relative;overflow:hidden;border-bottom:1px solid #24262b;padding:64px 5% 46px;background:radial-gradient(ellipse at 72% 48%,#0b1730 0%,#08090d 48%,#050506 85%)}.rc-hero-copy{position:relative;z-index:3;align-self:center}.rc-hero h1{font-size:clamp(55px,6.3vw,108px);letter-spacing:-.07em;line-height:.94;font-weight:650;margin:0 0 22px}.rc-hero-copy p{color:#b9bbc3;font-size:17px;margin-bottom:28px}.rc-actions{display:flex;gap:13px;flex-wrap:wrap}.rc-button{display:inline-flex;align-items:center;justify-content:center;gap:13px;border-radius:999px;padding:13px 22px;text-decoration:none;font-size:13px;font-weight:600;min-height:45px}.rc-button-light{background:#f4f3ee;color:#0b0b0d}.rc-button-outline{border:1px solid #4a4d54;color:#f4f3ee;background:#0b0c10}.rc-hero-visual{position:relative;min-height:460px;perspective:900px}.rc-orbit{position:absolute;width:94%;height:68%;left:3%;top:15%;border:48px solid #141923;border-top-color:#555d6c;border-bottom-color:#0637b3;border-radius:50%;transform:rotate(-27deg);filter:drop-shadow(0 0 32px #174eff88);box-shadow:inset 0 0 15px #7196e3,0 0 42px #0a44ce55}.rc-float-card{position:absolute;top:14%;width:34%;height:76%;border:1px solid #616779;border-radius:17px;background:#101217;overflow:hidden;box-shadow:0 24px 70px #000a;transform-style:preserve-3d}.rc-float-card img{width:100%;height:100%;object-fit:cover}.rc-float-card span{position:absolute;top:13px;left:13px;background:#252936d9;border:1px solid #555a65;border-radius:30px;padding:5px 11px;font-size:11px;color:white}.rc-float-left{left:10%;transform:rotate(-10deg) translateY(19px);z-index:1}.rc-float-center{left:33%;width:36%;height:86%;top:8%;z-index:3;transform:rotate(4deg)}.rc-float-right{left:64%;transform:rotate(10deg) translateY(25px);z-index:2}.rc-section{padding:48px 5% 52px;border-bottom:1px solid #24262b}.rc-heading{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:24px}.rc-section h2,.rc-create-banner h2{font-size:clamp(32px,3.5vw,53px);line-height:1.05;letter-spacing:-.055em;font-weight:600;margin:0 0 12px}.rc-heading p,.rc-mint-copy p,.rc-create-banner p{color:#aeb0b8;font-size:14px;line-height:1.7}.rc-text-link{color:#dedee3;display:inline-flex;gap:8px;align-items:center;font-size:13px;text-decoration:none}.rc-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:25px}.rc-tabs{display:flex;border:1px solid #34363c;border-radius:999px;overflow:hidden}.rc-tabs button{border:0;color:#ddd;background:transparent;padding:10px 22px;cursor:pointer}.rc-tabs button.selected{background:#f4f3ee;color:#09090a;border-radius:999px}.rc-search{margin-left:auto}.rc-search input,.rc-toolbar select{background:#101115;border:1px solid #383b42;border-radius:30px;color:#f5f5f5;padding:11px 15px;min-height:43px}.rc-search input{width:230px}.rc-layout{display:flex;border:1px solid #383b42;border-radius:24px;overflow:hidden}.rc-layout button{padding:9px 12px;background:#101115;color:white;border:0;cursor:pointer}.rc-layout button[aria-pressed=true]{background:#30323b}.rc-nft-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.rc-nft-card{min-width:0;display:block;text-decoration:none;color:#f4f4f5;background:#101114;border:1px solid #30323a;border-radius:14px;overflow:hidden;transition:border-color .2s,transform .2s}.rc-nft-card:hover{border-color:#6478ad;transform:translateY(-3px)}.rc-nft-art{aspect-ratio:1/1;overflow:hidden;background:#0a0c12}.rc-nft-art img{width:100%;height:100%;object-fit:cover}.rc-nft-info{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:13px;font-size:13px}.rc-nft-info span{font-size:11px;color:#bcbfc8;border:1px solid #3b3e46;border-radius:25px;padding:5px 9px;text-align:right}.rc-token-art{display:grid;place-items:center;text-align:center;background:radial-gradient(circle at 65% 30%,#17294e,#07080d 70%);font-size:22px;letter-spacing:-.04em}.rc-nft-list{grid-template-columns:1fr}.rc-nft-list .rc-nft-card{display:flex;align-items:center}.rc-nft-list .rc-nft-art{width:100px;flex:none}.rc-nft-list .rc-nft-info{flex:1}.rc-empty{padding:25px;color:#aaa}.rc-empty a{color:white}.rc-mint{display:grid;grid-template-columns:34% 66%;align-items:center;gap:15px}.rc-mint-copy p{margin-bottom:26px}.rc-mint-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.rc-mint-tile{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:14px;border:1px solid #34373d;background:#111;cursor:pointer;color:white;text-align:left;padding:0}.rc-mint-tile img{width:100%;height:100%;object-fit:cover}.rc-mint-tile span{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;padding:14px;background:linear-gradient(transparent,#000c);font-size:12px}.rc-create-banner{margin:36px auto 55px;border:1px solid #283348;border-radius:18px;padding:45px 5%;min-height:240px;position:relative;isolation:isolate;overflow:hidden;background:radial-gradient(ellipse at 98% 84%,#10244b 0%,#080c16 43%,#050608 88%)}.rc-create-banner>div:first-child{position:relative;z-index:2}.rc-create-banner p{margin-bottom:22px}.rc-banner-art{position:absolute;width:68%;max-width:860px;height:auto;right:-12%;top:50%;object-fit:contain;transform:translateY(-50%) rotate(-8deg);opacity:.65;mix-blend-mode:screen;mask-image:linear-gradient(90deg,transparent 0%,#000 36%,#000 100%);pointer-events:none;user-select:none;filter:drop-shadow(0 0 20px #1048bf70)}@media(max-width:800px){.rc-hero{grid-template-columns:1fr;padding-top:42px;min-height:0}.rc-hero-visual{min-height:350px;margin-top:22px}.rc-hero h1{font-size:clamp(57px,12vw,90px)}.rc-nft-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.rc-mint{grid-template-columns:1fr}.rc-search{margin-left:0}.rc-create-banner{margin-left:5%;margin-right:5%}}@media(max-width:450px){.rc-hero-visual{min-height:260px}.rc-orbit{border-width:28px}.rc-float-card{border-radius:10px}.rc-float-card span{font-size:8px;padding:4px 6px}.rc-nft-info{align-items:flex-start;flex-direction:column}.rc-nft-info span{font-size:10px}.rc-mint-tiles{gap:6px}.rc-mint-tile span{font-size:10px;padding:7px}.rc-toolbar{gap:8px}.rc-search input{width:160px}.rc-hero{padding-left:5%;padding-right:5%}}@media(prefers-reduced-motion:reduce){.rc-nft-card{transition:none}}

/* Image-backed hero: four separate optimized artworks; responsive card layers */
.rc-hero{max-width:1440px;margin:0 auto;min-height:590px;display:grid;grid-template-columns:39% 61%;position:relative;overflow:hidden;border-bottom:1px solid #24262b;padding:62px 4.8% 46px;background:radial-gradient(ellipse at 78% 47%,#0a1933 0%,#05070d 47%,#050506 83%);isolation:isolate}
.rc-hero-copy{position:relative;z-index:5;align-self:center}.rc-kicker{font-size:11px;letter-spacing:.16em;color:#91a7dd}.rc-hero h1{font-size:clamp(52px,5.9vw,88px);letter-spacing:-.06em;line-height:.96;font-weight:640;margin:0 0 24px}.rc-hero-copy p{color:#bfc1c9;font-size:17px;line-height:1.48;margin-bottom:28px}.rc-actions{display:flex;gap:14px;flex-wrap:wrap}.rc-button{display:inline-flex;align-items:center;gap:14px;border-radius:999px;padding:15px 23px;text-decoration:none;font-size:14px;font-weight:600}.rc-button-light{background:#f4f3ee;color:#0b0b0d}.rc-button-outline{border:1px solid #4a4d54;color:#f4f3ee;background:#0b0c10}
.rc-hero-visual{position:relative;min-height:470px;isolation:isolate;perspective:1000px;clip-path:inset(-180px -280px -150px 0);transform:translateY(12px)}.rc-ribbon{position:absolute;display:block;pointer-events:none;mix-blend-mode:screen;max-width:none;user-select:none}.rc-ribbon-bottom{width:156%;left:-27%;top:34%;opacity:.98;filter:drop-shadow(0 0 20px #0349ee77);transform:rotate(-6deg);z-index:-2}.rc-ribbon-top{width:127%;left:14%;top:-16%;opacity:.8;transform:rotate(5deg) scaleY(-1);z-index:-3}
.rc-float-card{position:absolute;top:24%;width:31%;height:65%;border:1px solid #677594;border-radius:18px;background:#090b10;overflow:hidden;box-shadow:0 28px 75px #000b,0 0 18px #0c3c9655;transform-style:preserve-3d}.rc-float-card img{width:100%;height:100%;object-fit:cover}.rc-float-card span{position:absolute;top:15px;left:15px;display:inline-flex;align-items:center;gap:7px;background:#272e40e6;border:1px solid #536079;border-radius:30px;padding:7px 13px;font-size:12px;color:white;font-weight:600}.rc-float-left{left:9%;width:32%;transform:rotate(-8deg) translateY(15px);z-index:1}.rc-float-center{left:34%;top:14%;height:76%;width:36%;transform:rotate(3deg);z-index:3;box-shadow:0 40px 90px #000d,0 0 24px #1656d34d}.rc-float-right{left:70%;width:30%;transform:rotate(9deg) translateY(19px);z-index:2}

@media(max-width:900px){
.rc-hero{grid-template-columns:1fr;min-height:0;padding:48px 5% 32px}
.rc-hero-copy{max-width:680px}
.rc-hero h1{font-size:clamp(51px,9vw,80px);margin:0 0 23px}
.rc-hero-visual{width:100%;max-width:740px;min-height:clamp(320px,60vw,475px);margin:30px auto 0}
.rc-ribbon-bottom{width:138%;left:-20%;top:30%}
.rc-ribbon-top{width:126%;left:5%;top:-18%}
.rc-float-card{top:23%;height:65%}
.rc-float-center{top:13%;height:78%}
}
@media(max-width:540px){
.rc-hero{padding:34px 5% 28px}
.rc-hero h1{font-size:clamp(48px,11.5vw,66px);line-height:.96}
.rc-hero-copy p{font-size:15px;line-height:1.5;margin-bottom:22px}
.rc-actions{gap:10px}
.rc-button{font-size:13px;padding:12px 18px;min-height:44px}
.rc-hero-visual{min-height:clamp(240px,69vw,320px);margin-top:25px;transform:translateY(8px)}
.rc-ribbon-bottom{width:152%;left:-26%;top:30%}
.rc-ribbon-top{width:132%;left:3%;top:-12%}
.rc-float-card{border-radius:12px;top:24%;height:60%;box-shadow:0 16px 34px #000b,0 0 12px #134fbd55}
.rc-float-left{left:7%;width:34%;transform:rotate(-9deg) translateY(10px)}
.rc-float-center{left:32%;width:39%;height:77%;top:14%;transform:rotate(3deg)}
.rc-float-right{left:70%;width:32%;transform:rotate(10deg) translateY(15px)}
.rc-float-card span{top:8px;left:8px;gap:4px;padding:5px 8px;font-size:9px}
.rc-float-card span svg{width:11px;height:11px}
}
/* Keep the fixed header entirely above the landing page hero on narrow viewports. */
@media (max-width:900px){
.rc-hero{padding-top:calc(var(--header-block) + 16px)}
}
@media (max-width:540px){
.rc-hero{padding-top:calc(var(--header-block) - 4px)}
.rc-create-banner{margin-top:28px;margin-bottom:36px;padding:34px 6% 38px;background:radial-gradient(ellipse at 108% 100%,#10244b 0%,#090c16 40%,#050608 85%)}

.rc-create-banner h2{max-width:11ch;font-size:clamp(32px,8.5vw,46px);line-height:1.06}
.rc-create-banner p{max-width:33ch}
}
/* Full-bleed atmospheric ribbon: no hard edge at the card column boundary. */
.rc-hero{
  isolation:isolate;
  background:#050506;
}
.rc-hero::before{
  content:"";
  position:absolute;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(ellipse 68% 78% at 84% 60%,#0a1933 0%,rgba(7,13,29,.82) 40%,rgba(5,5,6,0) 80%);
}
.rc-hero::after{
  content:"";
  position:absolute;inset:0;z-index:2;pointer-events:none;
  background:linear-gradient(90deg,#050506 0%,rgba(5,5,6,.96) 24%,rgba(5,5,6,.74) 35%,rgba(5,5,6,.20) 51%,transparent 66%);
}
.rc-hero-atmosphere{position:absolute;inset:0;z-index:1;overflow:hidden;pointer-events:none}
.rc-atmosphere-ribbon{
  position:absolute;display:block;max-width:none;height:auto;
  opacity:.8;mix-blend-mode:screen;user-select:none;
  -webkit-mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.08) 15%,rgba(0,0,0,.66) 35%,#000 53%,#000 88%,transparent 100%);
  mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.08) 15%,rgba(0,0,0,.66) 35%,#000 53%,#000 88%,transparent 100%);
}
.rc-atmosphere-ribbon-front{
  width:102%;left:14%;top:44%;transform:rotate(-6deg);
  filter:drop-shadow(0 0 22px rgba(5,67,209,.35));
}
.rc-atmosphere-ribbon-back{
  width:85%;left:32%;top:10%;transform:rotate(5deg) scaleY(-1);opacity:.58;
}
.rc-hero-copy{z-index:5}
.rc-hero-visual{z-index:3;clip-path:none;isolation:auto}
.rc-create-banner{
  isolation:isolate;
  background:#060810;
}
.rc-create-banner::before{
  content:"";position:absolute;inset:-20%;z-index:0;pointer-events:none;
  background:radial-gradient(ellipse 52% 60% at 86% 58%,rgba(28,70,169,.29) 0%,rgba(12,30,74,.14) 46%,transparent 82%);
  filter:blur(16px);
}
.rc-banner-aurora{
  position:absolute;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(ellipse 52% 96% at 112% 92%,rgba(37,89,207,.23),rgba(12,26,70,.1) 48%,transparent 86%);
}

/* ImageGen CTA artwork: high-resolution 2172x724 image, no zoomed low-res ribbon. */
.rc-create-banner{
  position:relative;
  isolation:isolate;
  min-height:312px;
  display:flex;
  align-items:center;
  border-color:#2b3443;
  background:#050710;
}
.rc-create-banner::before{display:none}
.rc-banner-scene{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  overflow:hidden;
  pointer-events:none;
  z-index:1;
  mask-image:none;
  -webkit-mask-image:none;
}
.rc-banner-image{
  display:block;
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  max-width:none;
  object-fit:cover;
  object-position:center 54%;
}
.rc-create-banner::after{
  content:"";
  position:absolute;
  inset:0;
  z-index:2;
  pointer-events:none;
  background:linear-gradient(90deg,rgba(3,5,12,.66) 0%,rgba(3,5,12,.35) 30%,transparent 67%);
}
.rc-create-banner > div:first-child{
  position:relative;
  z-index:3;
  max-width:610px;
}
@media(max-width:900px){
  .rc-banner-image{object-position:62% center}
  .rc-create-banner::after{background:linear-gradient(90deg,rgba(3,5,12,.75),rgba(3,5,12,.35) 65%,transparent)}
}
@media(max-width:540px){
  .rc-create-banner{min-height:330px;align-items:flex-start}
  .rc-banner-scene{display:block}
  .rc-banner-image{object-position:67% center;opacity:.63}
  .rc-create-banner::after{background:linear-gradient(90deg,rgba(3,5,12,.80),rgba(3,5,12,.36) 100%)}
  .rc-create-banner > div:first-child{max-width:100%}
}
.rc-create-banner > div:first-child{position:relative;z-index:2}
@media(max-width:900px){
.rc-hero::after{background:linear-gradient(180deg,#050506 0%,rgba(5,5,6,.86) 37%,rgba(5,5,6,.18) 58%,transparent 82%)}
.rc-atmosphere-ribbon-front{width:150%;left:-25%;top:66%;transform:rotate(-5deg)}
.rc-atmosphere-ribbon-back{width:134%;left:0%;top:56%;opacity:.46}
}
@media(max-width:540px){
.rc-atmosphere-ribbon-front{width:165%;left:-32%;top:70%}
.rc-atmosphere-ribbon-back{width:146%;left:-3%;top:60%}
.rc-create-banner{background:#060810}
}
@media(prefers-reduced-motion:reduce){.rc-float-card{transition:none}}
`;
