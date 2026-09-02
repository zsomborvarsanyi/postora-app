import React from 'react';

/*
 * A Postora szo-jel: ugyanaz a kartya, mellette a nev.
 *
 * A nev <text> elemkent all es nem gorbekent, hogy a szinet a korulotte levo
 * szoveg adja (currentColor). Ez a komponens sotet hatteren (bejelentkezes)
 * es vilagoson (szamlazas) is megjelenik, gorbekbe egetett szinnel az egyiken
 * olvashatatlan lenne.
 */
export const LogoTextComponent = () => {
  return (
    <svg
      width="150"
      height="33"
      viewBox="0 0 150 33"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Postora"
    >
      <defs>
        <clipPath id="postora-logo-text-card">
          <rect x="1" y="3" width="20" height="27" rx="3" ry="3" />
        </clipPath>
      </defs>
      <g clipPath="url(#postora-logo-text-card)">
        <rect x="1" y="3" width="20" height="27" fill="#2F4FC0" />
        <rect x="1" y="3" width="20" height="9.2" fill="#D9A227" />
      </g>
      <text
        x="31"
        y="24"
        fill="currentColor"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontSize="24"
        fontWeight="700"
        letterSpacing="-0.5"
      >
        Postora
      </text>
    </svg>
  );
};
