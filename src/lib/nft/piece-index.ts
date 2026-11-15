import { eyed } from "@/data/eyed";

/** Faces shown in the gallery. Vanta (01) stays piece 0 on the contract and is not featured. */
export const FEATURED_EYED_IDS = ["02", "03", "04", "05", "06", "07", "08", "09"] as const;

export function eyedContractIndex(id: string): number {
  return eyed.findIndex((item) => item.id === id);
}

export function featuredEyed() {
  return FEATURED_EYED_IDS.map((id) => {
    const face = eyed.find((item) => item.id === id);
    if (!face) throw Error(`Missing Eyed face ${id}`);
    return face;
  });
}

export function eyedVisible(piece: string | undefined) {
  const featured = featuredEyed();
  if (piece === "01") {
    const vanta = eyed.find((item) => item.id === "01");
    return vanta ? [vanta, ...featured] : featured;
  }
  return featured;
}
