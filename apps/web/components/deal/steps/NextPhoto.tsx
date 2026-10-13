import type { Photo } from "@pay-pals/contracts";
import { PhotoFrame } from "../../photos/PhotoFrame";
import { Button } from "../../ui/Button";

/**
 * The Seller Pal's next step for a seller: the photo the deal needs.
 *
 * With a demo photo it is one tap. Without one it says so and sends the
 * seller to take the photo, which is what a real seller would do.
 */
export function NextPhoto({ lead, photo, actionLabel, busy = false, onAdd }: { lead: string; photo: Photo | null; actionLabel: string; busy?: boolean; onAdd: (photo: Photo) => void }) {
  return (
    <div className="mb-4 rounded-lg border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3" data-testid="next-photo">
      <p className="text-sm font-semibold text-[var(--accent-ink)]">Your Seller Pal&apos;s next step</p>
      <p className="mt-1 text-sm leading-relaxed">{lead}</p>
      {photo ? (
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <div className="w-40 max-w-full">
            <PhotoFrame photo={photo} size="sm" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Demo photo: {photo.whatItShows}</p>
            <Button className="mt-2" disabled={busy} onClick={() => onAdd(photo)}>
              {actionLabel}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">The demo has no photo for this one. Take it, add it below and say what it shows.</p>
      )}
    </div>
  );
}
