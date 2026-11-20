import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import type { Address, Hex } from "viem";
import { helloMessage } from "@/lib/nft/hello";
import { xpKey } from "@/lib/nft/use-wallet-xp";
import { xpPoints, type WalletScore } from "@/lib/nft/xp";

export function SayHello({ wallet, earned }: { wallet: Address; earned?: boolean | null }) {
  const cache = useQueryClient();
  const { signMessageAsync } = useSignMessage();
  const [signed, setSigned] = useState<Hex>();
  const claim = useMutation({
    mutationFn: async () => {
      let signature = signed;
      if (!signature) {
        try {
          signature = await signMessageAsync({ account: wallet, message: helloMessage(wallet) });
          setSigned(signature);
        } catch {
          throw Error("Your wallet did not sign the greeting. You can try again.");
        }
      }
      const response = await fetch("/api/xp/" + wallet.toLowerCase(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature }),
      });
      if (!response.ok) {
        if (response.status === 400) setSigned(undefined);
        throw Error("Your greeting could not be verified and saved. Please retry.");
      }
    },
    onSuccess: async () => {
      const queryKey = xpKey(wallet);
      await cache.cancelQueries({ queryKey });
      cache.setQueryData<WalletScore>(queryKey, (old) =>
        old && !old.hello ? { ...old, hello: true, xp: old.chainXp + xpPoints.hello } : old,
      );
      await cache.invalidateQueries({ queryKey });
    },
    retry: false,
  });
  const done = earned || claim.isSuccess;
  return (
    <li className={`quest-row ${done ? "done" : "ready"}`}>
      <div>
        <h2>Say hello</h2>
        <p>Sign a free message to earn 50 XP once per wallet. No gas required.</p>
        {claim.error && <p role="alert">{claim.error.message}</p>}
      </div>
      <span className="xp-chip">{xpPoints.hello} XP</span>
      {done ? (
        <span className="checkin-recorded">Earned</span>
      ) : (
        <button
          className="primary-action"
          disabled={claim.isPending}
          onClick={() => claim.mutate()}
        >
          {claim.isPending
            ? signed
              ? "Saving greeting…"
              : "Check your wallet…"
            : signed
              ? "Retry greeting"
              : "Sign greeting"}
        </button>
      )}
    </li>
  );
}
