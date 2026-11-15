export type MintPhase =
  | "idle"
  | "awaiting-wallet"
  | "submitted"
  | "confirming"
  | "success"
  | "rejected"
  | "failed"
  | "unknown";

export function phaseLabel(phase: MintPhase): string {
  switch (phase) {
    case "awaiting-wallet":
      return "Waiting for wallet approval.";
    case "submitted":
      return "Transaction sent.";
    case "confirming":
      return "Waiting for chain confirmation.";
    case "success":
      return "Mint confirmed.";
    case "rejected":
      return "Transaction rejected.";
    case "failed":
      return "Transaction failed.";
    case "unknown":
      return "Confirmation is still unknown. It was not sent again.";
    default:
      return "";
  }
}

export function txFailure(error: unknown): "rejected" | "failed" {
  const msg = error instanceof Error ? error.message : String(error);
  if (/user rejected|user denied|rejected the request|denied transaction/i.test(msg)) return "rejected";
  return "failed";
}

export function isTimeout(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /timed out|timeout|took too long/i.test(msg);
}
