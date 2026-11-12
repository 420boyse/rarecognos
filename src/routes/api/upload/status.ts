import { createFileRoute } from "@tanstack/react-router";
import { uploadOptions, uploadStatus } from "@/lib/nft/upload-http.server";

export const Route = createFileRoute("/api/upload/status")({
  server: {
    handlers: {
      GET: async ({ request }) => uploadStatus(request),
      OPTIONS: async ({ request }) => uploadOptions(request),
    },
  },
});
