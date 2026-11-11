export type WorkKind = "sculpture" | "study";

export type Work = {
  id: string;
  title: string;
  medium: string;
  kind: WorkKind;
  year: string;
  image: string;
  caption: string;
  description: string;
};

export const works: Work[] = [
  {
    id: "nocturne",
    title: "Nocturne",
    medium: "Blackened chrome",
    kind: "sculpture",
    year: "2026",
    image: "/art/nocturne.jpg",
    caption: "Opening study",
    description:
      "An interwoven metal form held in a dark field. Brushed gunmetal, precise silver edges, and enough space around the object that it reads as a single gesture.",
  },
  {
    id: "blue-index",
    title: "Blue Index",
    medium: "Chromatic study",
    kind: "study",
    year: "2026",
    image: "/art/blue-index.jpg",
    caption: "Color measure",
    description:
      "A cobalt aperture scored by one silver index. The work measures a color rather than depicting a subject. Sample record only — not a live listing.",
  },
  {
    id: "red-aperture",
    title: "Red Aperture",
    medium: "Pigment and metal",
    kind: "sculpture",
    year: "2026",
    image: "/art/red-aperture.jpg",
    caption: "Opening",
    description:
      "A crimson opening cut into matte black metal. The rim carries a single highlight. The rest of the field stays quiet.",
  },
  {
    id: "second-sight",
    title: "Second Sight",
    medium: "Blackened chrome",
    kind: "study",
    year: "2026",
    image: "/art/second-sight.jpg",
    caption: "Closed lid",
    description:
      "A narrow slit of warm light inside brushed metal folds. The piece suggests looking without depicting an eye.",
  },
];

export const filters = [
  { id: "all", label: "All" },
  { id: "sculpture", label: "Sculpture" },
  { id: "study", label: "Study" },
] as const;

export type FilterId = (typeof filters)[number]["id"];
