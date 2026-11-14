import { isAddress, type Address } from "viem";
import deployment from "../../../config/eyed.json";

const key = "rarecognos.eyed";

export const eyedTreasury = deployment.treasury as Address;

export function eyedUris() {
  return Array.from({ length: 9 }, (_, i) => `https://rarecognos.vercel.app/meta/eyed/${String(i + 1).padStart(2, "0")}.json`) as [
    string, string, string, string, string, string, string, string, string,
  ];
}

export function readEyedAddress(): Address | undefined {
  if (deployment.address && isAddress(deployment.address)) return deployment.address;
  if (typeof localStorage === "undefined") return;
  const saved = localStorage.getItem(key);
  return saved && isAddress(saved) ? saved : undefined;
}

export function saveEyedAddress(address: Address) {
  localStorage.setItem(key, address);
}
