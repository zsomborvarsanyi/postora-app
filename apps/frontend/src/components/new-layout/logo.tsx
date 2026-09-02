'use client';

/*
 * A Postora jele: allo kartya, a felso harmadan okker savval.
 *
 * Ugyanaz az alakzat, ami a public/logo.svg-ben es a termekoldal fejleceben
 * all. Azert van beagyazva es nem <img>-kent hivatkozva, mert az upstream is
 * inline SVG-t tett ide, es igy a menu megjelenesekor nincs kulon keres a
 * jelre.
 */
export const Logo = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="60"
      height="60"
      viewBox="0 0 60 60"
      fill="none"
      className="mt-[8px] min-w-[60px] min-h-[60px]"
      role="img"
      aria-label="Postora"
    >
      <defs>
        <clipPath id="postora-logo-card">
          <rect x="13" y="7" width="34" height="46" rx="5" ry="5" />
        </clipPath>
      </defs>
      <g clipPath="url(#postora-logo-card)">
        <rect x="13" y="7" width="34" height="46" fill="#2F4FC0" />
        {/* A sav a magassag 34%-a, egyezoen a weboldal fejlecenek jelevel. */}
        <rect x="13" y="7" width="34" height="15.6" fill="#D9A227" />
      </g>
    </svg>
  );
};
