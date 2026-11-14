import { isAddress, type Address } from "viem";
import deployment from "../../../config/halo.json";

const key = "rarecognos.halo";

export const haloTreasury = deployment.treasury as Address;

export function haloUris() {
  return Array.from({ length: 6 }, (_, i) => `https://rarecognos.vercel.app/meta/halo/${String(i + 1).padStart(2, "0")}.json`) as [
    string, string, string, string, string, string,
  ];
}

export function readHaloAddress(): Address | undefined {
  if (deployment.address && isAddress(deployment.address)) return deployment.address;
  if (typeof localStorage === "undefined") return;
  const saved = localStorage.getItem(key);
  return saved && isAddress(saved) ? saved : undefined;
}

export function saveHaloAddress(address: Address) {
  localStorage.setItem(key, address);
}
