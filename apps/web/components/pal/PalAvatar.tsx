import Image from "next/image";
import type { Role } from "@/lib/role";
import { palName } from "@/lib/role";

/**
 * A Pal's head, cropped from the hero picture (public/pals), in a round
 * frame with the side's colour: blue for the Buyer Pal, gold for the Seller
 * Pal. Decorative by default because the pal's name is almost always
 * written next to it; pass `labelled` when it stands alone.
 */
export function PalAvatar({ pal, size = 32, labelled = false, className = "" }: { pal: Role; size?: number; labelled?: boolean; className?: string }) {
  const ring = pal === "buyer" ? "ring-[var(--buyer)]" : "ring-[var(--seller)]";
  return (
    <Image
      src={`/pals/${pal}-pal.webp`}
      alt={labelled ? palName(pal) : ""}
      width={size}
      height={size}
      data-pal={pal}
      className={`shrink-0 rounded-full bg-[var(--hero-bg)] ring-2 ${ring} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
