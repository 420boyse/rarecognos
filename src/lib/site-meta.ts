const configuredOrigin = import.meta.env.VITE_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
export const siteOrigin = !configuredOrigin || configuredOrigin === "https://rarecognos.vercel.app"
  ? "https://rarecognos.com"
  : configuredOrigin;


export function pageMeta(opts: { title: string; description: string; path: string; image: string }) {
  const url = `${siteOrigin}${opts.path}`;
  const image = opts.image.startsWith("http") ? opts.image : `${siteOrigin}${opts.image}`;
  return {
    meta: [
      { title: opts.title },
      { name: "description", content: opts.description },
      { property: "og:title", content: opts.title },
      { property: "og:description", content: opts.description },
      { property: "og:image", content: image },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: opts.title },
      { name: "twitter:description", content: opts.description },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
