#!/usr/bin/env node
/**
 * TikTok Content Sharing UX Guidelines -- statikus ellenorzes.
 *
 * MIERT VAN EZ A FAJL. A TikTok 2026 majusaban azert utasitotta el ennek az
 * integracionak az auditjat, mert a szerkeszto fellulete nem felelt meg a
 * Content Sharing UX Guidelines-nak. A hibak apro alapertekek voltak
 * (`value: 'PUBLIC_TO_EVERYONE'`, `value: true`), amiket egy kesobbi
 * upstream-merge eszrevetlenul visszahozhat. Ez a szkript pontosan azokat a
 * pontokat meri, amiket a bíráló kifogasolt, hogy a regresszio a build-ban
 * bukjon el, ne az ujabb auditon -- ott ugyanis hetekbe kerul kideruoni.
 *
 * Futtatas:  node tools/tiktok-ux-guidelines-check.mjs
 * Kilepesi kod 1, ha barmelyik allitas bukik.
 */

import { readFileSync } from 'node:fs';

const FRONT =
  'apps/frontend/src/components/new-launch/providers/tiktok/tiktok.provider.tsx';
const BACK =
  'libraries/nestjs-libraries/src/integrations/social/tiktok.provider.ts';

const front = readFileSync(FRONT, 'utf8');
const back = readFileSync(BACK, 'utf8');

let pass = 0;
let fail = 0;

function allit(mit, ok, reszlet = '') {
  if (ok) {
    pass++;
    console.log(`  ok    ${mit}`);
  } else {
    fail++;
    console.log(`  BUKIK ${mit}${reszlet ? `  (${reszlet})` : ''}`);
  }
}

console.log('1. PRIVACY STATUS: nem lehet elore kivalasztott ertek');
// Ezt nevezte meg a TikTok a visszautasitasban: "Privacy Status must have no
// default value".
allit(
  'a privacy_level regisztracioja NEM ad alapertelmezett erteket',
  !/register\(\s*'privacy_level'\s*,/.test(front),
  'talalt egy register("privacy_level", {...}) alakot'
);
allit(
  'sehol nincs hardcode-olt PUBLIC_TO_EVERYONE alapertek',
  !/value:\s*'PUBLIC_TO_EVERYONE'/.test(front)
);
allit(
  'a legordulo a TikTok altal visszaadott listabol epul',
  /creator\?\.privacyLevelOptions/.test(front)
);
allit(
  'ures ertekű elso option letezik (nincs mit veletlenul kivalasztani)',
  /<option value="">/.test(front)
);

console.log('2. INTERAKCIOK: egyik sincs alapbol bepipalva');
for (const mezo of ['duet', 'stitch', 'comment']) {
  const re = new RegExp(`register\\('${mezo}',\\s*\\{\\s*value:\\s*(true|false)`);
  const m = front.match(re);
  allit(
    `a(z) ${mezo} alapertelmezese false`,
    !!m && m[1] === 'false',
    m ? `talalt: ${m[1]}` : 'nem talaltam a regisztraciot'
  );
}

console.log('3. INTERAKCIOK: a TikTokban letiltottat tiltjuk es szurkitjuk');
for (const [mezo, flag] of [
  ['duet', 'duetDisabled'],
  ['stitch', 'stitchDisabled'],
  ['comment', 'commentDisabled'],
]) {
  allit(
    `a(z) ${mezo} tiltva van, ha a creator letiltotta`,
    front.includes(`creator?.${flag}`)
  );
}
allit(
  'a letiltott allapot vizualisan is jelolve van',
  (front.match(/opacity-50/g) ?? []).length >= 3
);

console.log('4. ALKOTO AZONOSITASA a posztolo kepernyon');
allit('a creator nickname megjelenik', /creator\?\.nickname/.test(front));
allit('az avatar megjelenik', /creator\?\.avatarUrl/.test(front));
allit(
  'van szoveg arrol, MELYIK fiokba megy a poszt',
  /tiktok_posting_to/.test(front)
);

console.log('5. VIDEOHOSSZ es POSZTOLHATOSAG');
allit(
  'a maximalis videohossz megjelenik',
  /maxDurationSeconds/.test(front) && /tiktok_max_duration/.test(front)
);
allit(
  'a canPost=false indoka megjelenik a felhasznalonak',
  /creatorError/.test(front)
);

console.log('6. MUSIC USAGE CONFIRMATION: mindig lathato');
// A regi kod csak akkor mutatta, ha valamelyik marka-kapcsolo be volt kapcsolva.
const musicIndex = front.indexOf('music_usage_confirmation');
allit('a nyilatkozat benne van a felulten', musicIndex > -1);
allit(
  'a nyilatkozat NINCS marka-kapcsolohoz kotve',
  !/\{\(brand_organic_toggle \|\| brand_content_toggle\) && \(/.test(front)
);
allit(
  'a Branded Content Policy csak branded content eseten jelenik meg',
  /brand_content_toggle && \(/.test(front)
);

console.log('7. BACKEND: a creator_info tenylegesen le van kerdezve');
allit('van creatorInfo metodus', /async creatorInfo\(/.test(back));
allit(
  'a creator_info vegpontot hivja',
  back.includes('post/publish/creator_info/query')
);
for (const mezo of [
  'privacy_level_options',
  'comment_disabled',
  'duet_disabled',
  'stitch_disabled',
  'max_video_post_duration_sec',
  'creator_nickname',
]) {
  allit(`a ${mezo} mezot kiolvassa`, back.includes(mezo));
}
allit(
  'hiba eseten canPost:false-t ad vissza, nem dob kivetelt',
  /canPost:\s*false/.test(back)
);

console.log('\n8. NEGATIV KONTROLL: a mero kepes bukast is mutatni');
allit(
  'egy nem letezo minta NEM talalhato',
  !front.includes('ez-a-minta-sehol-nincs-a-fajlban')
);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
