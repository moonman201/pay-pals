import type { Shipment } from "@pay-pals/contracts";
import { formatTime } from "@/lib/format";
import { PhotoGrid } from "../photos/PhotoGrid";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";
import { ShipmentFlags } from "./ShipmentFlags";

/** Carrier, tracking, packing photos and the checklist as the seller left it. */
export function ShipmentSummary({ shipment }: { shipment: Shipment }) {
  const undone = shipment.checklist.filter((c) => c.required && !c.done);
  return (
    <Panel title="Shipment" fold={{}} aside={<Badge tone={shipment.deliveredAt ? "go" : "accent"}>{shipment.deliveredAt ? "delivered" : "in transit"}</Badge>}>
      <p className="text-sm">
        {shipment.carrier}, tracking <span className="font-mono">{shipment.trackingNumber}</span>. Shipped {formatTime(shipment.shippedAt)}.
        {shipment.deliveredAt ? ` Delivered ${formatTime(shipment.deliveredAt)}.` : ""}
      </p>
      <div className="mt-3">
        <PhotoGrid photos={shipment.packingPhotos} empty="No packing photos." />
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {shipment.checklist.map((c) => (
          <li key={c.id} className={c.done ? "text-ink" : "text-caution"}>
            {c.done ? "Done: " : "Not done: "}
            {c.label}
          </li>
        ))}
      </ul>
      {undone.length > 0 ? <p className="mt-2 text-xs text-caution">{undone.length} required step{undone.length === 1 ? "" : "s"} left undone. This is on the timeline.</p> : null}
      {shipment.flags && shipment.flags.length > 0 ? <ShipmentFlags flags={shipment.flags} /> : null}
    </Panel>
  );
}
