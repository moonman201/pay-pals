import type { ArrivalCheck } from "@pay-pals/contracts";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";

/** What the Buyer Pal found when it compared the arrival photos to the locked card. */
export function ArrivalResult({ check }: { check: ArrivalCheck }) {
  return (
    <Panel title="Arrival check" aside={<Badge tone={check.matches ? "go" : "stop"}>{check.matches ? "matches" : "does not match"}</Badge>}>
      <p className="text-sm leading-relaxed">{check.palMessage}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        {(["brand", "model", "serial"] as const).map((k) => (
          <div key={k}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Read: {k}</dt>
            <dd className={k === "serial" ? "font-mono" : ""}>{check.observed[k] ?? "not readable"}</dd>
          </div>
        ))}
      </dl>
      {check.mismatches.length > 0 ? (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              <th className="py-1 pr-2">Field</th>
              <th className="py-1 pr-2">Locked card</th>
              <th className="py-1">Arrived</th>
            </tr>
          </thead>
          <tbody>
            {check.mismatches.map((m) => (
              <tr key={m.field} className="border-t border-line">
                <td className="py-1.5 pr-2 font-semibold">{m.field}</td>
                <td className="py-1.5 pr-2">{m.expected}</td>
                <td className="py-1.5 text-stop">{m.observed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Panel>
  );
}
