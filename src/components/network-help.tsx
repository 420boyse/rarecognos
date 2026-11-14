import { useState } from "react";
import { addLiteForge, faucetUrl } from "@/lib/nft/network";

export function NetworkHelp({ add = true }: { add?: boolean }) {
  const [error, setError] = useState("");
  return (
    <p className="network-help">
      {add && (
        <button
          type="button"
          onClick={() => {
            setError("");
            void addLiteForge().catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not add the network."));
          }}
        >
          Add LiteForge
        </button>
      )}
      <a href={faucetUrl} target="_blank" rel="noreferrer">
        Get zkLTC
      </a>
      {error && <span role="alert">{error}</span>}
    </p>
  );
}
