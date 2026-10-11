/**
 * The app's icon set: one stroke weight, round caps, currentColor. Each icon
 * is decorative; the text beside it carries the meaning.
 */
type IconProps = { size?: number; className?: string; strokeWidth?: number };

function Svg({ size = 20, className = "", strokeWidth = 2, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
      {children}
    </svg>
  );
}

/** A padlock, closed. */
export function LockIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

/** A shield with a bar across it: the deal was stopped. */
export function ShieldStopIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12h6" />
    </Svg>
  );
}

/** A shield with a check: the deal went through. */
export function ShieldCheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

/** An octagon with a bar: stop. */
export function StopIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8.5 3h7l5.5 5.5v7L15.5 21h-7L3 15.5v-7L8.5 3z" />
      <path d="M8.5 12h7" />
    </Svg>
  );
}

/** A triangle with a mark: caution. */
export function CautionIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4l9 16H3l9-16z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.8" fill="currentColor" />
    </Svg>
  );
}

/** A circle with a mark: an open issue. */
export function IssueIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <circle cx="12" cy="16.5" r="0.8" fill="currentColor" />
    </Svg>
  );
}

/** A link in a chain: an invite. */
export function LinkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </Svg>
  );
}

/** A parcel: shipping. */
export function BoxIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </Svg>
  );
}

/** A hand-drawn style arrow for "next". */
export function ArrowIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

/** A crescent moon, for the switch to night mode. */
export function MoonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20.5 14.3A8.8 8.8 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8z" />
    </Svg>
  );
}

/** A sun, for the switch to day mode. */
export function SunIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </Svg>
  );
}
