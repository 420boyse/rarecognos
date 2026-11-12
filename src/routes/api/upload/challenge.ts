import { createFileRoute } from "@tanstack/react-router";
import { uploadChallenge, uploadOptions } from "@/lib/nft/upload-http.server";

export const Route = createFileRoute("/api/upload/challenge")({
  server: {
    handlers: {
      POST: async ({ request }) => uploadChallenge(request),
      OPTIONS: async ({ request }) => uploadOptions(request),
    },
  },
});
