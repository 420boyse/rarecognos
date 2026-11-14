import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/referral")({
  component: ReferralPage,
});

function ReferralPage() {
  useEffect(() => {
    location.replace("/");
  }, []);
  return null;
}
