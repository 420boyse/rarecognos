import { isAddress, type Address } from "viem";
import deployment from "../../../config/checkin.json";

const key = "rarecognos.checkin";

export const checkInTreasury = deployment.treasury as Address;

export function readCheckInAddress(): Address | undefined {
  if (deployment.address && isAddress(deployment.address)) return deployment.address;
  if (typeof localStorage === "undefined") return;
  const saved = localStorage.getItem(key);
  return saved && isAddress(saved) ? saved : undefined;
}

export function saveCheckInAddress(address: Address) {
  localStorage.setItem(key, address);
}
