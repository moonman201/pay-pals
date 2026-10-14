"use client";

import { useId, useState } from "react";
import { Button } from "../ui/Button";
import { ProtectionPanel } from "./ProtectionPanel";

/**
 * The way in for a buyer with a real listing, folded to one button. The form opens in place, under the
 * button, so the demo cards stay right under the hero until someone says they have a listing of their own.
 */
export function StartProtected() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-4 text-left">
      <Button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)} variant={open ? "secondary" : "primary"} data-testid="start-protected">
        Start a protected deal
      </Button>
      <div id={id} hidden={!open} className="mt-4">
        {open ? <ProtectionPanel /> : null}
      </div>
    </div>
  );
}
