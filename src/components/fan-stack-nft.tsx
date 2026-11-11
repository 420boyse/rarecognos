import { useEffect, useRef, useState, useCallback } from "react";

type NFTCard = {
  id: string;
  origId?: string;
  title: string;
  image: string;
  price?: string;
  medium?: string;
};

const N = 8;
const CARD_SIZE_BASE = 280;
const CARD_ASPECT = 1.25;
const CARD_RADIUS = 20;
const FAN_ROTATION = 4.5;
const FAN_SPREAD = 0.38;
const SCALE_STEP = 0.2;
const EDGE_SLOT = 2;
const GHOST_RANGE = 1.2;

const FRICTION = 0.91;
const SNAP_SPRING = 0.09;
const SNAP_DAMPING = 0.72;
const DRAG_SENSITIVITY = 0.0035;

function getCardSize() {
  if (typeof window === "undefined") return CARD_SIZE_BASE;
  const vw = window.innerWidth;
  if (vw < 480) return 180;
  if (vw < 640) return 200;
  if (vw < 768) return 230;
  if (vw < 1024) return 250;
  return CARD_SIZE_BASE;
}

function wrapIndex(i: number, n: number) {
  return ((i % n) + n) % n;
}

export function FanStackNFT({
  items,
  onSelectWork,
}: {
  items: NFTCard[];
  onSelectWork?: (id: string) => void;
}) {
  const source: NFTCard[] =
    items.length > 0
      ? items
      : [
          {
            id: "placeholder",
            title: "RareCognos",
            image: "/art/nocturne.jpg",
            medium: "Studio",
          },
        ];

  const cards: NFTCard[] = Array.from({ length: N }, (_, i) => {
    const base = source[i % source.length];
    return {
      ...base,
      id: `${base.id}-${i}`,
      origId: base.origId ?? base.id,
    };
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const slotLeftRef = useRef<HTMLDivElement>(null);
  const slotRightRef = useRef<HTMLDivElement>(null);
  const leftImgRef = useRef<HTMLImageElement>(null);
  const rightImgRef = useRef<HTMLImageElement>(null);

  const scrollPos = useRef(0);
  const velocity = useRef(0);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, lastX: 0, lastTime: 0 });
  const axisLocked = useRef<"h" | "v" | null>(null);

  const [cardSize, setCardSize] = useState(CARD_SIZE_BASE);
  const [centered, setCentered] = useState(0);

  const updateCards = useCallback(() => {
    const size = cardSize;
    const height = size * CARD_ASPECT;
    const spread = size * FAN_SPREAD;

    cards.forEach((_, i) => {
      const el = cardRefs.current[i];
      if (!el) return;

      let offset = i - scrollPos.current;
      while (offset > N / 2) offset -= N;
      while (offset < -N / 2) offset += N;
      const abs = Math.abs(offset);

      const isGhost = abs >= EDGE_SLOT;
      const ghostOpacity = isGhost ? Math.max(0, 1 - (abs - EDGE_SLOT) / GHOST_RANGE) : 1;

      const tx = offset * spread;
      const rot = offset * FAN_ROTATION;
      const scale = Math.max(0.45, 1 - abs * SCALE_STEP);

      el.style.transform = `translate3d(${tx}px, 0, 0) rotate(${rot}deg) scale(${scale})`;
      el.style.opacity = `${ghostOpacity}`;
      el.style.zIndex = isGhost ? "0" : String(Math.round((EDGE_SLOT + 1 - abs) * 10));

      const imageLayer = el.querySelector("[data-image]") as HTMLElement;
      const ghostLayer = el.querySelector("[data-ghost]") as HTMLElement;
      const borderLayer = el.querySelector("[data-border]") as HTMLElement;
      const overlay = el.querySelector("[data-overlay]") as HTMLElement;

      if (imageLayer) imageLayer.style.opacity = isGhost ? "0" : "1";
      if (ghostLayer) ghostLayer.style.opacity = isGhost ? "1" : "0";
      if (borderLayer) borderLayer.style.opacity = isGhost ? "0" : String(Math.max(0, 1 - abs * 2.2));
      if (overlay) overlay.style.opacity = isGhost ? "0" : String(Math.min(0.4, (abs / EDGE_SLOT) * 0.4));
    });

    // Static slots
    const edgeScale = Math.max(0.5, 1 - EDGE_SLOT * SCALE_STEP);
    const edgeW = size * edgeScale;
    const edgeH = height * edgeScale;
    const edgeRot = FAN_ROTATION * EDGE_SLOT;
    const edgeTx = EDGE_SLOT * spread;

    [slotLeftRef, slotRightRef].forEach((ref, idx) => {
      const el = ref.current;
      if (!el) return;
      const sign = idx === 0 ? -1 : 1;
      el.style.width = `${edgeW}px`;
      el.style.height = `${edgeH}px`;
      el.style.borderRadius = `${CARD_RADIUS * edgeScale}px`;
      el.style.transform = `translate3d(${sign * edgeTx}px, 0, 0) rotate(${sign * edgeRot}deg)`;
    });

    // Slot images
    const leftIdx = wrapIndex(Math.floor(scrollPos.current) - EDGE_SLOT, N);
    const rightIdx = wrapIndex(Math.ceil(scrollPos.current) + EDGE_SLOT, N);
    if (leftImgRef.current) leftImgRef.current.src = cards[leftIdx]?.image || "";
    if (rightImgRef.current) rightImgRef.current.src = cards[rightIdx]?.image || "";

    const nextCentered = wrapIndex(Math.round(scrollPos.current), N);
    if (nextCentered !== centered) setCentered(nextCentered);
  }, [cardSize, cards, centered]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (!isDragging.current) {
        scrollPos.current += velocity.current;
        velocity.current *= FRICTION;

        if (Math.abs(velocity.current) < 0.12) {
          const nearest = Math.round(scrollPos.current);
          const diff = nearest - scrollPos.current;
          velocity.current += diff * SNAP_SPRING;
          velocity.current *= SNAP_DAMPING;
        }

        if (Math.abs(velocity.current) < 0.0008) {
          velocity.current = 0;
          scrollPos.current = Math.round(scrollPos.current);
        }
      }
      updateCards();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [updateCards]);

  useEffect(() => {
    const onResize = () => setCardSize(getCardSize());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    axisLocked.current = null;
    velocity.current = 0;
    dragStart.current = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastTime: performance.now() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.lastX;
    const adx = Math.abs(e.clientX - dragStart.current.x);
    const ady = Math.abs(e.clientY - dragStart.current.y);

    if (!axisLocked.current && (adx > 8 || ady > 8)) {
      axisLocked.current = adx > ady * 1.2 ? "h" : "v";
    }
    if (axisLocked.current === "v") return;

    const now = performance.now();
    const dt = Math.max(8, now - dragStart.current.lastTime);
    scrollPos.current -= dx * DRAG_SENSITIVITY;
    velocity.current = (-dx * DRAG_SENSITIVITY / dt) * 16 * 1.15;
    dragStart.current.lastX = e.clientX;
    dragStart.current.lastTime = now;
  };

  const onPointerUp = () => {
    isDragging.current = false;
    axisLocked.current = null;
  };

  const current = cards[centered] || cards[0];

  return (
    <section className="fan-section">
      <div
        ref={containerRef}
        className="fan-container"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ height: cardSize * CARD_ASPECT + 60 }}
      >
        {/* Static edge slots */}
        <div ref={slotLeftRef} className="fan-slot">
          <img ref={leftImgRef} alt="" />
          <div className="fan-slot-overlay" />
        </div>
        <div ref={slotRightRef} className="fan-slot">
          <img ref={rightImgRef} alt="" />
          <div className="fan-slot-overlay" />
        </div>

        {/* Animated cards */}
        {cards.map((card, i) => (
          <div
            key={card.id}
            ref={(el) => { cardRefs.current[i] = el; }}
            className="fan-card"
            style={{
              width: cardSize,
              height: cardSize * CARD_ASPECT,
              marginLeft: -cardSize / 2,
              marginTop: -(cardSize * CARD_ASPECT) / 2,
            }}
          >
            <div data-image className="fan-card-image">
              <img src={card.image} alt={card.title} />
              <div data-overlay className="fan-card-overlay" />
            </div>
            <div data-ghost className="fan-card-ghost" />
            <div data-border className="fan-card-border" />
          </div>
        ))}
      </div>

      <div className="fan-detail">
        <div className="fan-meta">{current?.medium || "Digital Art"} · RareCognos</div>
        <h3 className="fan-title">{current?.title || "Untitled"}</h3>
        {current?.price && <div className="fan-price">{current.price}</div>}
        <div className="fan-actions">
          <button
            type="button"
            className="fan-primary"
            onClick={() => {
              if (current) onSelectWork?.(current.origId || current.id);
            }}
          >
            View Details
          </button>
          <button
            type="button"
            className="fan-secondary"
            onClick={() => {
              const el = document.getElementById("collection");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Collect
          </button>
        </div>
      </div>

      <style>{`
        .fan-section {
          min-height: 80vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px 80px;
          background: radial-gradient(ellipse at center, rgba(59,91,255,0.08) 0%, transparent 60%), #050505;
          overflow-x: clip;
        }
        .fan-container {
          position: relative;
          width: 100%;
          max-width: 1100px;
          touch-action: none;
          cursor: grab;
          user-select: none;
        }
        .fan-container:active { cursor: grabbing; }
        .fan-slot, .fan-card {
          position: absolute;
          left: 50%;
          top: 50%;
          border-radius: ${CARD_RADIUS}px;
          overflow: hidden;
          will-change: transform;
        }
        .fan-slot {
          z-index: 1;
          pointer-events: none;
        }
        .fan-slot img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .fan-slot-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.42);
        }
        .fan-card-image {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          overflow: hidden;
        }
        .fan-card-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .fan-card-overlay {
          position: absolute;
          inset: 0;
          background: #000;
          pointer-events: none;
        }
        .fan-card-ghost {
          position: absolute;
          inset: 0;
          border: 1px solid rgba(245,244,239,0.35);
          border-radius: inherit;
          opacity: 0;
          pointer-events: none;
        }
        .fan-card-border {
          position: absolute;
          inset: 0;
          border: 2.5px solid #3b5bff;
          border-radius: inherit;
          opacity: 0;
          pointer-events: none;
        }
        .fan-detail {
          margin-top: 48px;
          text-align: center;
          max-width: 420px;
        }
        .fan-meta {
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(245,244,239,0.45);
          margin-bottom: 8px;
        }
        .fan-title {
          font-size: 28px;
          font-weight: 500;
          letter-spacing: -0.02em;
          margin: 0 0 12px;
        }
        .fan-price {
          font-size: 20px;
          margin-bottom: 20px;
          color: #f5f4ef;
        }
        .fan-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }
        .fan-primary, .fan-secondary {
          min-height: 44px;
          padding: 0 22px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .fan-primary {
          background: #f5f4ef;
          color: #050505;
          border: none;
        }
        .fan-primary:hover { background: white; }
        .fan-secondary {
          background: transparent;
          color: #f5f4ef;
          border: 1px solid rgba(245,244,239,0.2);
        }
        .fan-secondary:hover { border-color: rgba(245,244,239,0.4); }
      `}</style>
    </section>
  );
}
