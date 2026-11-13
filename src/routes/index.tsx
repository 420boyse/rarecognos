import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { EyeMark } from "@/components/wordmark";
import { works, type Work } from "@/data/works";
import { NFTMarket } from "@/components/nft-market";
import { NFTDeploy } from "@/components/nft-deploy";
import { MarketHeader } from "@/components/market-header";
import { NFTDropMint } from "@/components/nft-drops";
import { FanStackNFT } from "@/components/fan-stack-nft";
import { SiteFooter } from "@/components/site-footer";
import { isAddress, type Address } from "viem";
export const Route = createFileRoute("/")({ component: Home });
function Home() {
  const [view, setView] = useState("Explore");
  const [active, setActive] = useState<Work | null>(null);
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
      <MarketHeader view={view} />
      <main>
        <section
          className={`market-hero ${view !== "Explore" ? "market-hero--compact" : ""}`}
          aria-labelledby="hero-title"
        >
          <img
            className="hero-art"
            src="/art/nocturne-hero.jpg"
            alt="Nocturne, a blackened-chrome sculpture"
            fetchPriority="high"
          />
          <div className="hero-content">
            <h1 id="hero-title" aria-label="An eye for the rare.">
              <span aria-hidden="true">
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "0ms" }}>A</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "35ms" }}>n</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "70ms" }}>&nbsp;</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "105ms" }}>e</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "140ms" }}>y</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "175ms" }}>e</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "210ms" }}>&nbsp;</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "245ms" }}>f</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "280ms" }}>o</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "315ms" }}>r</span></span>
                <br />
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "350ms" }}>t</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "385ms" }}>h</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "420ms" }}>e</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "455ms" }}>&nbsp;</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "490ms" }}>r</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "525ms" }}>a</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "560ms" }}>r</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "595ms" }}>e</span></span>
                <span className="letter-wrap"><span className="hero-letter-rise" style={{ animationDelay: "630ms" }}>.</span></span>
              </span>
            </h1>
            <p>
              Distinctive digital art.
              <br />
              Yours to discover, create, and collect.
            </p>
            <div className="hero-actions">
              <a
                className="primary-action"
                href="#collection"
              >
                Explore NFTs <ArrowRight size={18} />
              </a>
              <a className="secondary-action" href="/create">
                Create NFT
              </a>
            </div>
          </div>
          <div className="hero-caption">
            <span>Nocturne</span>
            <span>Blackened chrome, 2026</span>
          </div>
        </section>
        {view.startsWith("Drop:") && <NFTDropMint address={view.slice(5) as Address} />}
        <NFTMarket
          tab={view}
          onAvailability={() => {}}
          onViewChange={(next) => {
            setView(next);
            location.hash = next === "My NFTs" ? "my-nfts" : "explore";
          }}
        />
        {view === "Explore" && (
          <section id="collection" className="studio-section" aria-labelledby="collection-title">
            <div className="section-heading">
              <div>
                <h2 id="collection-title">Eyed</h2>
                <p>Nine original faces. A first look, not a listing wall.</p>
              </div>
            </div>
            <ul className="face-grid">
              {Array.from({ length: 9 }, (_, i) => {
                const n = String(i + 1).padStart(2, "0");
                return (
                  <li key={n}>
                    <img src={`/art/faces/${n}.png`} alt="" />
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {view === "Explore" && (
          <FanStackNFT
            items={works.map((w) => ({
              id: w.id,
              title: w.title,
              image: w.image,
              medium: w.medium,
              price: undefined,
            }))}
            onSelectWork={(id) => {
              const found = works.find((w) => w.id === id);
              if (found) setActive(found);
            }}
          />
        )}
        <section id="studio" className="studio-section" aria-labelledby="studio-title">
          <div className="section-heading">
            <div>
              <h2 id="studio-title">Studio Collection</h2>
              <p>Six works from the studio. A closer look, before you collect.</p>
            </div>
            <span className="studio-note">Studio previews · not sale listings</span>
          </div>
          <ul className="studio-grid">
            {works.map((work) => (
              <li key={work.id}>
                <WorkCard work={work} onOpen={() => setActive(work)} />
              </li>
            ))}
          </ul>
        </section>
        <NFTDeploy />
      </main>
      <SiteFooter exploreHref="#explore" />
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
