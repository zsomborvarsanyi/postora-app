# Handoff, 2026-10-28 — Komment-szabály aktiválása publikáláskor (Variant A), élesítve és éles poszton bizonyítva

## 0. Kiinduló kérés

Zsombor egy brief-et adott (Variant A, Facebook+Instagram, TikTok kizárva):
ma a komment-automatizmus szabály csak publikálás UTÁN köthető egy konkrét
poszthoz, mert egy nálunk futó külső figyelő-szkript csinálja ezt. A cél,
hogy ez natívan, a Postorán belül történjen: ütemezéskor a felhasználó
rácsatol egy `commentRule`-t a posztra (FB/IG settings), publikáláskor a
Postora saját kódja aktiválja a valós poszt-id-vel, nincs schema-migráció,
nincs új Temporal workflow-verzió.

## 1. Mit épített meg a worker-ágens

Branch: `feat/comment-rule-activate-on-publish` (a `fix/tiktok-content-sharing-ux-guidelines`
HEAD-jéről indult, hogy a már ott élő comment-automation funkcióra tudjon
épülni), PR #1, squash-mergelve vissza a `fix/tiktok-content-sharing-ux-guidelines`
ágra (commit `16d6010`). **Szándékosan nem `main` a base** — a `main` ekkor
34 commit-tal le volt maradva és a teljes comment-automation funkciót sem
tartalmazta, `main` base esetén az egész backlog bekerült volna a diffbe.
**A `fix/tiktok-content-sharing-ux-guidelines` ág tehát továbbra sincs
`main`-be mergelve** — ez egy korábbról (10-26) is nyitva álló pont.

### Backend

- `CommentRuleOnPublishDto` (`comment-automation.dto.ts`) — a
  `CommentAutomationRuleDto` mezői `id`/`order`/`active`/`providerPostId`
  nélkül (ezeket a horog tölti ki futásidőben): `triggerSource`,
  `matchType`, `triggers`, `publicReply`, `privateReply`.
- Opcionális `commentRule?: CommentRuleOnPublishDto` mező a
  `FacebookDto`-n és `InstagramDto`-n (`providers-settings/`).
- A valós horog **`PostsService.updatePost(id, postId, releaseURL)`**-ben
  van (NEM `updateReleaseId`-ben — ez utóbbi csak a ritkábban használt
  `/release-id` public/internal API végponthoz tartozik). Ezt hívja az
  orchestrator `PostActivity.updatePost` activity-je a fő publikálási
  ciklusból minden postsList-elemre. A horog a `PostsRepository.updatePost`
  Prisma-update visszatérési értékéből olvas (settings/integrationId/
  parentPostId/organizationId mind benne van), nincs szükség extra
  lekérdezésre vagy az activity-paraméterek bővítésére.
- "Csak fő poszt" feltétel: a visszakapott sor `parentPostId` mezője
  falsy — ugyanaz a minta, mint a `PostActivity.getPostsList`-ben.
- **Idempotencia**: a meglévő `CommentAutomationRepository.upsertRule`
  NEM valódi upsert (ha nincs `body.id`, mindig `create`-et csinál) — ezt a
  `updatePost`-ot hordozó Temporal activity max 3x újrafuthatná hibára, ami
  id nélküli hívással duplikált szabályt eredményezne. A horog ezért előbb
  megkeresi a meglévő szabályt `(integrationId, providerPostId)` párra
  (`findRuleByProviderPost`, új repository-metódus, az
  `@@index([integrationId, providerPostId, active, order])` indexet
  használja), és csak akkor hív id nélkül (create), ha nincs találat.
- try/catch a teljes aktiváció körül — hiba csak logolva (`console.error`,
  `[comment-automation:activate-on-publish]` prefix), sosem buktatja a
  publikálást.

### Frontend

Új `CommentRuleOnPublishEditor` komponens
(`comment-automation/comment-rule-on-publish.tsx`), bekötve a
`facebook.provider.tsx`-be és a valódi Instagram-fájlba
(`instagram.collaborators.tsx` — a brief-ben feltételezett
`instagram.provider.tsx` nem is létezik). Nem az `AddOrEditRule` modal
lett változatlanul beágyazva, hanem a poszt-szerkesztő saját
settings-form mintáját követő, kontrollált komponens (hasonlóan az
`instagram.audio.tsx`-hez).

### Tesztek

Új `posts.service.comment-automation.spec.ts`: idempotencia, hibanyelés,
gyerek-poszt kihagyása, `commentRule` hiánya esetén nincs extra hívás —
mind zöld, build (`backend`, `orchestrator`, frontend `next build`)
hibátlan.

## 2. Deploy

1. DB-backup a szerveren: `/root/backups/postiz-db-20261028-151356.sql.gz`.
2. `cd /opt/postiz && docker compose pull postiz && docker compose up -d postiz`
   — elsőre tiszta staggered-start, `healthy` lett, nem kellett autoheal.
3. Publikálás előtti 12 QUEUE-ban lévő poszt nem akadt el (0 hiba).

## 3. Éles bizonyíték — valódi LON Facebook+Instagram Story poszton

A Postora UI-n keresztül létrehoztam egy valódi, ütemezett teszt-posztot
(LON Facebook + Instagram, Story típus, egy korábban már publikált
"Napi száz guggolás" c. termékes story-videó újrafelhasználásával),
`commentRule`-lal (`triggers: ["postoratesztszo"]`). A böngésző
Chrome-bővítmény képernyőkép-rögzítése a session alatt instabil lett (CDP
timeout, több lapon is), ezért a tényleges azonnali publikálást NEM a
törékeny UI-dropdownon keresztül, hanem a Postora saját, session-cookie-val
authentikált `/api/posts` végpontján keresztül váltottam ki
(`type: "now"`, a `GET /api/posts/group/:group` válaszából
visszaépített, pontos payload-dal — **buktató**: a `fetch()`-hívásnak
explicit `Content-Type: application/json` fejléc kell, enélkül a backend
üres body-t lát és `"All posts must have an integration id"` hibát ad,
még akkor is, ha a JSON string helyesen van összerakva).

**Eredmény:**

- FB valós `releaseId`: `1687183899785810`
- IG valós `releaseId`: `18127332268867714`
- Mindkét platformon azonnal létrejött a `CommentAutomationRule`,
  `active=true`, a helyes triggerrel, **duplikáció nélkül** (a publikálás
  első próbálkozásra sikerült, az idempotencia-ágat nem volt módom élesben
  retry-val is kiváltani, de a unit tesztek lefedik).

Ez teljesíti a brief fő elfogadási kritériumát: *"A post scheduled... publishes
normally, and immediately after publication a comment-automation rule
exists for that exact published post id, with active=true."*

### Felfedezett platform-korlát (nem hiba, hanem Meta API-sajátosság)

**Story poszthoz nincs értelme `COMMENT`-triggerű szabálynak.** A
Facebook/Instagram Story-khoz nincs klasszikus "komment" objektum a Meta
API-ban — a story-ra adott reakció DM-ként (reply to story) landol, nem
publikus kommentként. Egy Story poszthoz csatolt `commentRule` csak akkor
fog ténylegesen tüzelni, ha `triggerSource: DIRECT_MESSAGE`. A mostani
teszt-szabály (`COMMENT`) emiatt sosem fog lefutni — ez a
rule-létrehozás bizonyítását nem rontja el, de a teljes "valaki kommentel,
kap automata választ" végpontig-tesztet nem lehetett ugyanezen a poszton
elvégezni. Sima feed-posztnál (nem Story) ez a megkötés nem áll fenn.

A teszt-poszt és a hozzá tartozó szabályok élnek — a story-tartalom 24 óra
után magától eltűnik a Meta oldalán, a `CommentAutomationRule` sorok
(`79e90ab2-...`, `82737e2b-...`) viszont a DB-ben maradnak, amíg valaki
nem törli őket a Comment automation felületen.

## 4. Nyitott pontok a következő sessionre

1. **A `fix/tiktok-content-sharing-ux-guidelines` ág még mindig nincs
   `main`-be mergelve** (ez már a 10-26-i handoffból is nyitott pont volt,
   most ezzel a munkával együtt még nagyobb a lemaradás). Ha eljön az
   ideje, érdemes lesz átgondolni, hogyan kerüljön vissza `main`-be
   (valószínűleg egy nagy, egyben mergelt PR, mert a kommit-történet már
   túl sok réteget tartalmaz az egyenkénti cherry-pickhez).
2. **A külső figyelő-szkriptet (Zsombor szerint WSL-ben fut) NEM kapcsoltam
   le** — a user explicit kérte, hogy ha nem találom gyorsan, ne
   foglalkozzak vele most. A natív út és a külső szkript tehát egy darabig
   párhuzamosan fut. Az idempotens `(integrationId, providerPostId)`
   lookup miatt ez elvileg nem duplikál szabályt, de a tényleges
   cutover-koordináció (a szkript tényleges megtalálása és leállítása)
   még hátravan.
3. **Teljes DM-trigger végpontig-teszt még nincs lefuttatva éles
   Meta-fiókon** — a mostani teszt a rule-létrehozást bizonyította, nem a
   tényleges automata-választ. Ha ezt is látni akarjuk, egy `DIRECT_MESSAGE`
   triggerű `commentRule`-lal kötött Story-posztra (vagy `COMMENT`-tel egy
   sima feed-posztra) kellene egy valódi DM-et/kommentet küldeni, és
   ellenőrizni, hogy megjön-e az automata válasz.
4. **A teszt-adat takarítása**: a mostani `commentRule` (`postoratesztszo`
   trigger) és a hozzá tartozó két `CommentAutomationRule` sor élesben
   maradt — ha nem kell, törlendő a Comment automation felületen.
