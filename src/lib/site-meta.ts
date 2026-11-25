const configuredOrigin = import.meta.env.VITE_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
export const siteOrigin = !configuredOrigin || configuredOrigin === "https://rarecognos.vercel.app"
  ? "https://rarecognos.com"
  : configuredOrigin;

type ShareImage = { url: string; alt: string; width?: number; height?: number; type?: string };
const jpegCard = (url: string, alt: string): ShareImage => ({ url, alt, width: 1200, height: 630, type: "image/jpeg" });
const defaultShareImage = jpegCard("/og.jpg?v=2", "RareCognos marketplace with artwork from Eyed, Midnight Rogues and Halo");
const collectionNames = { "midnight-rogues": "Midnight Rogues", eyed: "Eyed", halo: "Halo" };

export function collectionShareImage(collection: keyof typeof collectionNames, piece?: { id: string; name: string }) {
  return jpegCard(
    `/social/${collection}${piece ? `-${piece.id}` : ""}.jpg`,
    piece ? `${piece.name} from ${collectionNames[collection]} on RareCognos` : `${collectionNames[collection]} collection artwork on RareCognos`,
  );
}

export function pageMeta(opts: { title: string; description: string; path: string; image?: ShareImage }) {
  const url = `${siteOrigin}${opts.path}`;
  const card = opts.image ?? defaultShareImage;
  const image = card.url.startsWith("http") ? card.url : `${siteOrigin}${card.url}`;
  return {
    meta: [
      { title: opts.title },
      { name: "description", content: opts.description },
      { property: "og:title", content: opts.title },
      { property: "og:description", content: opts.description },
      { property: "og:image", content: image },
      ...(card.type ? [{ property: "og:image:type", content: card.type }] : []),
      ...(card.width ? [{ property: "og:image:width", content: String(card.width) }] : []),
      ...(card.height ? [{ property: "og:image:height", content: String(card.height) }] : []),
      { property: "og:image:alt", content: card.alt },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: opts.title },
      { name: "twitter:description", content: opts.description },
      { name: "twitter:image", content: image },
      { name: "twitter:image:alt", content: card.alt },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
