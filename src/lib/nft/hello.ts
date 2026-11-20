import type { Address } from "viem";
import { xpPoints } from "./xp.ts";

export const helloQuest = "rarecognos.liteforge.4441.say-hello.v1";

export function helloMessage(wallet: Address) {
  return [
    "Say hello to RareCognos",
    "",
    `I claim the one-time ${xpPoints.hello} XP greeting for my wallet.`,
    `Wallet: ${wallet.toLowerCase()}`,
    "Site: https://rarecognos.com",
    `Quest: ${helloQuest}`,
    "This free signature records my greeting. It does not authorize a transaction.",
  ].join("\n");
}
