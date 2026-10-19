import React from "react";

interface ChecInLogoProps {
  className?: string;
  size?: number;
  textColor?: string;
  markColor?: string;
  /** The scan dot. Defaults to lime on a light background and white on a dark one. */
  accentColor?: string;
  showText?: boolean;
}

const LIME = "#C0FD9B";

/**
 * The ChecIN mark: an open C (the entrance) with a dot in the opening (the scan).
 * The same artwork is in public/favicon.svg and public/logo.svg, and the app icons are drawn from it.
 */
export function ChecInLogo({
  className = "",
  size = 28,
  textColor = "#0E2322",
  markColor = "#0E2322",
  accentColor,
  showText = true,
}: ChecInLogoProps) {
  // On a dark background the C is lime, so the dot turns white to stay visible.
  const dot = accentColor ?? (markColor.toUpperCase() === LIME ? "#FFFFFF" : LIME);
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="6 6 52 52"
        fill="none"
        className="shrink-0"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path d="M47 18A19 19 0 1 0 47 46" stroke={markColor} strokeWidth="9" strokeLinecap="round" />
        <circle cx="46" cy="32" r="6.5" fill={dot} stroke={markColor} strokeWidth="3.5" />
      </svg>
      {showText && (
        <span
          className="font-medium tracking-tight leading-none text-[26px]"
          style={{ color: textColor }}
        >
          ChecIN
        </span>
      )}
    </div>
  );
}
