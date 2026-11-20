import { createFileRoute } from "@tanstack/react-router";
import { isAddress, zeroAddress } from "viem";
import { readWalletScore } from "@/lib/nft/xp-index.server";
import { claimHello } from "@/lib/nft/hello.server";

export const Route = createFileRoute("/api/xp/$wallet")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        if (!request.headers.get("content-type")?.startsWith("application/json"))
          return Response.json({ error: "Expected JSON." }, { status: 415 });
        const raw = await request.text();
        if (raw.length > 8500)
          return Response.json({ error: "Request too large." }, { status: 413 });
        let signature: unknown;
        try {
          signature = JSON.parse(raw)?.signature;
        } catch {
          return Response.json({ error: "Invalid request." }, { status: 400 });
        }
        try {
          if (!(await claimHello(params.wallet, signature)))
            return Response.json(
              { error: "The greeting signature does not match this wallet." },
              { status: 400 },
            );
          return Response.json({ hello: true }, { headers: { "Cache-Control": "no-store" } });
        } catch {
          return Response.json(
            { error: "Could not save your greeting. Please retry." },
            { status: 503 },
          );
        }
      },
      GET: async ({ params, request }) => {
        const wallet = params.wallet.toLowerCase();
        if (!isAddress(wallet) || wallet === zeroAddress)
          return Response.json({ error: "Invalid wallet" }, { status: 400 });
        try {
          const result = await readWalletScore(wallet, request.signal);
          return Response.json(result, {
            headers: { "Cache-Control": "no-store" },
          });
        } catch {
          return Response.json(
            { error: "Wallet XP is temporarily unavailable." },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
