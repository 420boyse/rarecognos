import { useEffect, useMemo, useRef, useState } from "react";

type NFTCard = {
  id: string;
  origId?: string;
  title: string;
  image: string;
  price?: string;
  medium?: string;
  network?: string;
};

const CARD_SIZE_BASE = 280;
const CARD_ASPECT = 1.25;
const CARD_RADIUS = 20;
const FAN_ROTATION = 4.5;
const FAN_SPREAD = 0.42;
const SCALE_STEP = 0.16;

const FRICTION = 0.94;
const SNAP_SPRING = 0.18;
const SNAP_DAMPING = 0.78;

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

const placeholder: NFTCard = {
  id: "placeholder",
  title: "RareCognos",
  image: "/art/nocturne.jpg",
  medium: "Studio",
};

export function FanStackNFT({
  items,
  onSelectWork,
  initialId,
  onCenter,
}: {
  items: NFTCard[];
  onSelectWork?: (id: string) => void;
  initialId?: string;
  onCenter?: (id: string) => void;
}) {
  const cards = useMemo(() => {
    const source = items.length > 0 ? items : [placeholder];
    return source.map((base, i) => ({
      ...base,
      id: `${base.id}-${i}`,
      origId: base.origId ?? base.id,
    }));
  }, [items]);

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollPos = useRef(0);
  const velocity = useRef(0);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, lastX: 0, lastTime: 0 });
  const axisLocked = useRef<"h" | "v" | null>(null);
  const sizeRef = useRef(CARD_SIZE_BASE);
  const countRef = useRef(cards.length);
  const centeredRef = useRef(0);
  const started = useRef(false);

  const [cardSize, setCardSize] = useState(CARD_SIZE_BASE);
  const [centered, setCentered] = useState(0);

  const onCenterRef = useRef(onCenter);
  onCenterRef.current = onCenter;
  sizeRef.current = cardSize;
  countRef.current = cards.length;

  useEffect(() => {
    const paint = () => {
      const n = countRef.current;
      const size = sizeRef.current;
      const spread = size * FAN_SPREAD;
      const half = n / 2;
      for (let i = 0; i < n; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        let offset = i - scrollPos.current;
        offset = ((offset + half) % n + n) % n - half;
        const abs = Math.abs(offset);
        if (abs > 2.15) {
          el.style.opacity = "0";
          el.style.visibility = "hidden";
          el.style.zIndex = "0";
          continue;
        }
        const fade = abs < 0.35 ? 1 : Math.max(0, 1 - (abs - 0.35) / 1.8);
        const scale = Math.max(0.72, 1 - abs * SCALE_STEP);
        el.style.transform = `translate3d(${offset * spread}px, 0, 0) rotate(${offset * FAN_ROTATION}deg) scale(${scale})`;
        el.style.opacity = `${fade}`;
        el.style.visibility = fade < 0.02 ? "hidden" : "visible";
        el.style.zIndex = String(Math.round((half - abs) * 10));
        const borderLayer = el.querySelector("[data-border]") as HTMLElement | null;
        const overlay = el.querySelector("[data-overlay]") as HTMLElement | null;
        const ghostLayer = el.querySelector("[data-ghost]") as HTMLElement | null;
        if (ghostLayer) ghostLayer.style.opacity = "0";
        if (borderLayer) borderLayer.style.opacity = String(fade * Math.max(0, 1 - abs * 1.4));
        if (overlay) overlay.style.opacity = String(Math.min(0.45, abs * 0.2));
      }
      const next = wrapIndex(Math.round(scrollPos.current), Math.max(1, n));
      if (next !== centeredRef.current) {
        centeredRef.current = next;
        setCentered(next);
        const id = cards[next]?.origId || cards[next]?.id;
        if (id) onCenterRef.current?.(id);
      }
    };

    let raf = 0;
    const loop = () => {
      if (!isDragging.current) {
        scrollPos.current += velocity.current;
        velocity.current *= FRICTION;
        if (Math.abs(velocity.current) < 0.08) {
          const nearest = Math.round(scrollPos.current);
          velocity.current += (nearest - scrollPos.current) * SNAP_SPRING;
          velocity.current *= SNAP_DAMPING;
        }
        if (
          Math.abs(velocity.current) < 0.001 &&
          Math.abs(scrollPos.current - Math.round(scrollPos.current)) < 0.001
        ) {
          velocity.current = 0;
          scrollPos.current = Math.round(scrollPos.current);
        }
      }
      paint();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cards]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const spread = Math.max(1, sizeRef.current * FAN_SPREAD);
      scrollPos.current += event.deltaX / spread;
      velocity.current = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (started.current || !initialId) return;
    const index = cards.findIndex((card) => (card.origId || card.id) === initialId);
    if (index >= 0) {
      scrollPos.current = index;
      started.current = true;
    }
  }, [cards, initialId]);

  useEffect(() => {
    const onResize = () => setCardSize(getCardSize());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (countRef.current < 2) return;
    if ((e.target as HTMLElement).closest("button")) return;
    isDragging.current = true;
    axisLocked.current = null;
    velocity.current = 0;
    dragStart.current = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastTime: performance.now() };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.lastX;
    const adx = Math.abs(e.clientX - dragStart.current.x);
    const ady = Math.abs(e.clientY - dragStart.current.y);

    if (!axisLocked.current) {
      if (adx < 8 && ady < 8) return;
      if (adx > ady * 1.15) {
        axisLocked.current = "h";
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else {
        axisLocked.current = "v";
        isDragging.current = false;
        return;
      }
    }
    if (axisLocked.current !== "h") return;

    const now = performance.now();
    const dt = Math.max(8, now - dragStart.current.lastTime);
    const spread = Math.max(1, sizeRef.current * FAN_SPREAD);
    const step = dx / spread;
    scrollPos.current -= step;
    const nextVelocity = (-step * 16) / dt;
    velocity.current = Math.max(-0.55, Math.min(0.55, nextVelocity));
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
        style={{ height: cardSize * CARD_ASPECT + 48 }}
      >
        {cards.map((card, i) => (
          <div
            key={card.id}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className="fan-card"
            style={{
              width: cardSize,
              height: cardSize * CARD_ASPECT,
              marginLeft: -cardSize / 2,
              marginTop: -(cardSize * CARD_ASPECT) / 2,
            }}
          >
            <div data-image className="fan-card-image">
              <img src={card.image} alt={card.title} draggable={false} />
              <div className="fan-card-label">
                <strong>{card.title}</strong>
                <span>{card.price || "—"}</span>
                <span>{card.network || "LiteForge"}</span>
              </div>
              <div data-overlay className="fan-card-overlay" />
            </div>
            <div data-ghost className="fan-card-ghost" />
            <div data-border className="fan-card-border" />
          </div>
        ))}
      </div>

      <div className="fan-detail">
        <div className="fan-meta">{current?.network || "LiteForge"} · {current?.medium || "Eyed"}</div>
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
              window.location.href = "/";
            }}
          >
            Back
          </button>
        </div>
      </div>

      <style>{`
        .fan-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 28px 20px 64px;
          background: radial-gradient(ellipse at center, rgba(59,91,255,0.08) 0%, transparent 60%), #050505;
          overflow-x: clip;
        }
        .fan-container {
          position: relative;
          width: 100%;
          max-width: 1100px;
          touch-action: pan-y;
          cursor: grab;
          user-select: none;
        }
        .fan-container:active { cursor: grabbing; }
        .fan-card {
          position: absolute;
          left: 50%;
          top: 50%;
          border-radius: ${CARD_RADIUS}px;
          overflow: hidden;
          will-change: transform;
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
          object-fit: contain;
          background: #f3eee4;
          image-rendering: pixelated;
          pointer-events: none;
        }
        .fan-card-label {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          display: grid;
          gap: 2px;
          padding: 28px 14px 12px;
          background: linear-gradient(to top, rgba(5,5,5,0.92), transparent);
          color: #f5f4ef;
          text-align: left;
          pointer-events: none;
        }
        .fan-card-label strong {
          font-size: 16px;
          font-weight: 560;
        }
        .fan-card-label span {
          font-size: 12px;
          letter-spacing: 0.04em;
          color: rgba(245,244,239,0.78);
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
          margin-top: 28px;
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
