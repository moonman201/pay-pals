"use client";

import { useEffect, useState } from "react";
import { stageAt, STAGE_MS } from "@/lib/deal/working-stages";

/**
 * The line under a button while a pal works. It names the stage the pal is
 * on and moves to the next one every few seconds, so a long wait does not
 * look frozen. The ring spins; with reduced motion it is a still dot.
 */
export function WorkingStatus({ stages, className = "" }: { stages: readonly string[]; className?: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => clearInterval(id);
  }, [stages]);

  return (
    <p role="status" aria-live="polite" className={`mt-3 flex items-center gap-2 text-sm text-[var(--accent-ink)] ${className}`} data-testid="working-status">
      <span aria-hidden className="motion-spin h-4 w-4 shrink-0 rounded-full border-2 border-[var(--accent-line)] border-t-[var(--accent)]" />
      {stageAt(stages, elapsed, STAGE_MS)}
    </p>
  );
}
