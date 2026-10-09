"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dealApi, postJson } from "@/lib/client/api";
import type { Role } from "@/lib/role";
import { Button } from "../ui/Button";

export function BuildEvidenceButton({ dealId, role }: { dealId: string; role: Role }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-5">
      <Button
        className="w-full sm:w-auto"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await postJson(dealApi(dealId, "evidence"), { by: role });
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not build the pack.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Building" : "Build the evidence pack"}
      </Button>
      {error ? <p className="mt-2 text-sm text-stop">{error}</p> : null}
    </div>
  );
}
