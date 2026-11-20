import { createFileRoute } from "@tanstack/react-router";
import { isAddress, zeroAddress } from "viem";
import { readWalletScore } from "@/lib/nft/xp-index.server";

export const Route = createFileRoute("/api/xp/$wallet")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const wallet = params.wallet.toLowerCase();
        if (!isAddress(wallet) || wallet === zeroAddress)
          return Response.json({ error: "Invalid wallet" }, { status: 400 });
        try {
          const result = await readWalletScore(wallet, request.signal);
          return Response.json(result, {
            headers: { "Cache-Control": "public, max-age=0, s-maxage=10" },
          });
        } catch {
          return Response.json(
            { error: "LiteForge history is temporarily unavailable." },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
