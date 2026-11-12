import { createFileRoute } from "@tanstack/react-router";
import { uploadOptions, uploadPrepare } from "@/lib/nft/upload-http.server";

export const Route = createFileRoute("/api/upload/prepare")({
  server: {
    handlers: {
      POST: async ({ request }) => uploadPrepare(request),
      OPTIONS: async ({ request }) => uploadOptions(request),
    },
  },
});
