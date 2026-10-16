import type { ReactNode } from "react";
import { Panel } from "../../ui/Panel";

/** A step form in the deal room, with an anchor the action bar can scroll to. */
export function StepPanel({ id, title, intro, children }: { id: string; title: string; intro?: string | null; children: ReactNode }) {
  return (
    <div id={`step-${id}`}>
      <Panel title={title} accent>
        {intro ? <p className="mb-4 text-sm leading-relaxed">{intro}</p> : null}
        {children}
      </Panel>
    </div>
  );
}

export function StepError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-stop">
      {error}
    </p>
  );
}
