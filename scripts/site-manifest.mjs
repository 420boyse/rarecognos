import { writeFileSync } from "node:fs";
import { renderWebManifest } from "./grok-pwa-shared.mjs";

const manifest = JSON.parse(renderWebManifest());
manifest.name = "RareCognos";
manifest.short_name = manifest.name;
writeFileSync("dist/client/__grok/manifest.webmanifest", JSON.stringify(manifest, null, 2));
