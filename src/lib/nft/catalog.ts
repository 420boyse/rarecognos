import rogues from "@/data/midnight-rogues.json";
import { halo } from "@/data/halo";
import { works } from "@/data/works";
import { featuredEyed } from "./piece-index";

export function searchCatalog(query: string) {
  const q = query.trim().toLowerCase();
  const collection = (name: string) => name.toLowerCase().includes(q);
  return {
    rogues: rogues.filter(
      (r) =>
        collection("MIDNIGHT ROGUES") ||
        `midnight rogues #${r.id} ${r.name} ${r.title}`.toLowerCase().includes(q),
    ),
    faces: featuredEyed().filter(
      (r) => collection("Eyed") || `eyed ${r.name}`.toLowerCase().includes(q),
    ),
    figures: halo.filter((r) => collection("Halo") || `halo ${r.name}`.toLowerCase().includes(q)),
    studio: works.filter((r) => r.title.toLowerCase().includes(q)),
  };
}

export const searchParams = (input: Record<string, unknown>) => ({
  q: typeof input.q === "string" && input.q ? input.q.slice(0, 120) : undefined,
});
