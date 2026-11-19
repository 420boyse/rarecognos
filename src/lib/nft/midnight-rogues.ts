import { useRelease } from "./use-release";
import type { Address } from "viem";
import release from "../../../config/midnight-rogues.json";

export const roguesAddress = release.address as Address;
export const rogueImage = (id: string) => `/art/midnight-rogues/${id}.jpg`;
export const roguePage = (id: string) => `/midnight-rogues?piece=${id}`;
export const roguesStory = "In a world where the sun was stolen, ten raccoons rise to change the fate of the night.";

export function useRoguesRelease() {
  const query = useRelease(roguesAddress, release.runtimeHash);
  return { ...query, label: query.isError ? "Status unavailable" : query.data === true ? "Released" : query.data === false ? "Mint opens soon" : "Checking release…" };
}
