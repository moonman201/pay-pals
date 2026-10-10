import type { DealState } from "@pay-pals/contracts";
import { offPlatformNotice } from "@/lib/deal/off-platform";
import { Panel } from "../ui/Panel";

/**
 * What the room says once the buyer has chosen to pay another way. States
 * what happened and stops; there is nothing for Pay Pals to do on this deal
 * and nothing to tell the buyer off about. Named as a landmark rather than a
 * heading, for the same reason as the control it replaces.
 */
export function OffPlatformNotice({ state }: { state: DealState }) {
  return (
    <Panel title="Paying another way" labelAs="region">
      <p className="text-sm leading-relaxed" data-testid="off-platform-notice">
        {offPlatformNotice(state)}
      </p>
    </Panel>
  );
}
