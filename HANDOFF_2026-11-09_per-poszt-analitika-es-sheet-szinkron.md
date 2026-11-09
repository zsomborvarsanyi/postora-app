# Handoff, 2026-11-09 — Per-poszt analitika javítás (TikTok, Facebook) és automatikus Sheet-szinkron

## 0. Kiinduló kérés

Zsombor megnézte a legutóbbi Postora handoffot (10-28, komment-szabály
aktiválás publikáláskor), majd egy új kérdést hozott: egy külső agent azt
jelezte, hogy a bekötött API-kkal posztonként csak Instagramról tud
teljesítmény-adatot (nézettség, like, komment, megosztás) lekérni, a
többi platformról nem. A cél egyrészt kideríteni, miért, másrészt
megépíteni egy rendszert, ami minden videóhoz automatikusan összegyűjti
a dátumot, a captiont és a platformonkénti analitikát a már létező
Tartalom-naplo Google Sheetbe.

## 1. Diagnózis — miért nem jött vissza adat TikTokról és Facebookról

A `/public/v1/analytics/post/:postId` végpont (és a mögötte álló
`postAnalytics()` minden provider-nél) már korábban is létezett és
helyesen volt megírva elvben, de két külön, valós kódhibán futott el
némán, mindkettőt élesben, a futó konténeren belül reprodukáltam és
bizonyítottam, mielőtt javítottam:

### TikTok — két egymásra rakódó hiba

- `tiktok.provider.ts` és `tiktok.business.provider.ts` `postAnalytics()`-e
  csak akkor próbálta feloldani a nyers `publish_id`-t valódi videó-id-re,
  ha az `v_pub_url~...` (URL-ből húzott feltöltés) formátumú volt. A
  Postora viszont mindig fájlfeltöltéssel posztol, ami `v_pub_file~...`
  formátumot ad — ezt a feltétel sosem fogta meg, ezért az analitika
  mindig `[]`-t adott vissza.
- Még ha a feloldás meg is történt volna: a TikTok `publicaly_available_post_id`-je
  egy snowflake-id, szélesebb mint `Number.MAX_SAFE_INTEGER`. A `.json()`
  hívás ezt csendben lekerekíti (`...086305` → `...086000`), ami egy
  olyan id-t eredményez, amire a `/v2/video/query/` sosem ad vissza
  találatot. **Ez nem csak az analitika-olvasásnál van jelen, hanem a
  `checkPostStatus()`-ban is**, ami a publikáláskor menti a `releaseId`-t
  az adatbázisba — tehát ez a bug élesben korrumpálhatott már publikált
  TikTok-posztok tárolt azonosítóját is, nem csak az analitika-lekérést.

Mindkét helyen (`tiktok.provider.ts`, `tiktok.business.provider.ts`)
javítva: a feloldás-feltétel most bármilyen fel nem oldott `publish_id`-t
elkap (a `~` karakter jelenléte alapján, mert valódi videó-id sosem
tartalmazza), és a végleges id-t a nyers válaszszövegből reguláris
kifejezéssel olvassuk ki, nem `.json()`-on át.

### Facebook — Reels-posztok rossz id-t tárolnak

A `postNonStory()` Reels-ágában (`facebook.provider.ts`) a kód a
feltöltött videó nyers `video_id`-jét menti posztazonosítóként
(`finalId = video_id`), és **sosem olvassa ki a tényleges `post_id`-t** a
`video_reels?upload_phase=finish` válaszából — pedig a Story-ág felette
(`checkPostStatus`) pontosan ezt csinálja helyesen (`post_id: storyPostId`).
A Graph API `/insights` (és egy sima GET is) `"object does not exist,
cannot be loaded due to missing permissions"` hibát ad egy bare
`video_id`-re, még akkor is, ha a token jogosultságai teljesen
rendben vannak — ez egy id-alak probléma, nem jogosultsági.

Javítás a `postAnalytics()`-ben (nem a publikálási kódban, lásd lentebb
nyitott pont): ha a bejövő `postId` nem tartalmaz `_`-t (azaz nem
oldalhoz-kötött `{pageId}_{storyId}` formátumú), előbb lekérjük a videó
objektum saját `post_id` mezőjét (`GET /{video_id}?fields=post_id`), és
abból építjük fel a helyes, oldalhoz-kötött azonosítót az insights
híváshoz.

### Élesben bizonyítva

- TikTok: egy valódi mai videón végig, 349→355 megtekintés, like,
  komment, megosztás helyesen jött vissza a feloldás után.
- Facebook: egy 11-03-i LON Reel-en a feloldás és az insights is helyesen
  visszajött (148 megtekintés, 1 reakció).

## 2. Kód és deploy

- Branch: `fix/tiktok-content-sharing-ux-guidelines` (ugyanaz, amin a
  10-28-i komment-szabály munka is van — **ez továbbra sincs `main`-be
  mergelve**, ez már a korábbi handoffokból is nyitott pont).
- Commit `4e376ba` — `facebook.provider.ts`, `tiktok.provider.ts`,
  `tiktok.business.provider.ts`.
- Build zöld (`backend`, `orchestrator`).
- Deploy a napi publikálási ablak (17:00 UTC) lezárása **után** történt,
  Zsombor kérésére. Az akkori 8 posztból 5 ment ki rendben, 3
  (Facebook+Instagram+TikTok, "The Luxury of Nature" csoport) `"No Post"`
  hibával elhasalt — **ez egy külön, a mai javítástól független hiba,
  nincs kivizsgálva, a generikus hibaüzenet miatt a konkrét ok sem
  ismert.**
- DB-backup (`/root/backups/postiz-db-20261109-173706.sql.gz`) → image
  pull → `postiz` restart → `health: healthy`.
- Élesen újra tesztelve a `/public/v1/analytics/post/:id` végponton,
  mindkét platform helyes számot ad.

## 3. Google Sheets automatikus szinkron

### Az eredeti terv és miért nem működött

Az első próbálkozás a Tartalom-naplo sheet meglévő "Script / VO-link"
oszlopát próbálta párosítani a Postora `releaseURL`-jével. Kiderült,
hogy ez a mezo **csak a legkorábbi, augusztusi, Postora előtti kézi
posztolásnál van kitöltve valódi linkkel** — azóta, hogy Postorán át megy
az ütemezés, ez az oszlop sosem kapta vissza a tényleges élő linket (ott
Drive-link vagy "Munka-mappa" szöveg van). A két rendszer között emiatt
nem volt közös, megbízható kulcs. Dátum+platform+brand alapú közelítő
párosítást megmértem és elvetettem — egy napon belül gyakran megy ki
2-4 poszt is ugyanarra a platformra ugyanannak a brandnek, ez félre
tudta volna azonosítani a sorokat.

### A megoldás — koordinátorral (Patrik) egyeztetve

Kiderült, hogy az időzítést jelenleg egy agent csinálja a Postora
public API-n keresztül. A koordinátor (Patrik) bekötötte, hogy
posztolás után az agent **minden platformra külön** beírja a kapott
Postora poszt-id-t (nem a group id-t — egy videó/sor 2-4 platformra megy,
mindegyik platform **külön** Postora-poszt, külön id-vel és group-pal) a
Tartalom-naplo három új oszlopába:

- `V` — IG poszt-id
- `W` — FB poszt-id
- `X` — TikTok poszt-id

Ez a megbízható, egyértelmű kulcs, amire a napi szinkron-szkript
rácsatlakozik, dátum vagy platform tippelés helyett.

### Megépített infrastruktúra

- Google Cloud service account, projekt `postingvzs`, email
  `postora-sheets-sync@postingvzs.iam.gserviceaccount.com`. Megosztva a
  Tartalom-naplo sheeten szerkesztőként (`writer`). A Sheets API
  engedélyezve ugyanebben a projektben.
- A JSON kulcs a szerveren: `/opt/postiz/analytics-sync/key.json`,
  `chmod 600`, csak root olvashatja. **A felhasználó lokális Letöltések
  mappájában is megvan még egy másolat** (`postingvzs-78c6aa297a46.json`)
  — érdemes lenne onnan eltávolítani vagy biztonságosabb helyre tenni,
  mert az egy élő hitelesítő adat.
- Szinkron-szkript: `/opt/postiz/analytics-sync/sync.js`. Nulla npm
  függőség — a Google OAuth JWT-t kézzel írjuk alá (`crypto.sign`), a
  Sheets API-t és a Postora public API-t sima `fetch`-csel hívjuk, egy
  `docker run --rm -v ... node:22-alpine node sync.js` konténerben fut.
- Cron a szerveren, naponta 05:00 UTC
  (`0 5 * * * docker run --rm -v /opt/postiz/analytics-sync:/app -w /app node:22-alpine node sync.js >> /var/log/postora-analytics-sync.log 2>&1`).
- A szkript minden futáskor felülírja a `Y1:AL1` fejsort (idempotens), és
  csak azokat a sorokat frissíti, ahol van kitöltött platform-poszt-id.
  Az első próbafutásban véletlenül létrejött, mára felesleges generikus
  `K1:U1` fejsort a szkript törli minden futáskor.
- A sheet oszlopszáma (grid `columnCount`) 27-ről 38-ra bővítve
  automatikusan (`ensureColumnCount()`), mert az `AL` oszlop ezen túl volt.

### Oszlop-elrendezés (platformonként külön blokk, nem egy közös)

| Oszlop | Tartalom | Oszlop | Tartalom |
|---|---|---|---|
| V | IG poszt-id | AE | FB Impressions |
| W | FB poszt-id | AF | FB Reactions |
| X | TikTok poszt-id | AG | FB Clicks |
| Y | IG Views | AH | TikTok Views |
| Z | IG Reach | AI | TikTok Likes |
| AA | IG Saves | AJ | TikTok Comments |
| AB | IG Likes | AK | TikTok Shares |
| AC | IG Comments | AL | Analitika frissitve |
| AD | IG Shares | | |

### Élesben bizonyítva

Az 53. sor (mai, 2026-11-09-i LON videó) mindhárom platform poszt-id-jét
tartalmazza, és a szinkron lefuttatása után valódi számokat írt bele
(IG 26 megtekintés/16 elérés/2 like, FB 1 reakció, TikTok 355
megtekintés/10 like/4 komment/2 megosztás).

## 4. Nyitott pontok a következő sessionre

1. **A `fix/tiktok-content-sharing-ux-guidelines` ág még mindig nincs
   `main`-be mergelve** — ez már a 10-26-i és 10-28-i handoffokból is
   nyitott pont, a mai munkával tovább nőtt a lemaradás.
2. **A mai 3 posztolási hiba ("No Post", FB+IG+TikTok egy csoporton)
   nincs kivizsgálva.** Független a mai javítástól, a generikus
   hibaüzenet miatt a konkrét okot még nem ismerjük.
3. **A Facebook Reels publikálási kódja (`postNonStory()`) továbbra is a
   nyers `video_id`-t menti `releaseId`-ként.** Csak az olvasó oldalon
   (`postAnalytics()`) javítottam, a feloldással. A publikálási útvonal
   módosítása (hogy rögtön a helyes `post_id`-t mentse) tisztább
   megoldás lenne hosszú távon, de ez már az éles publikálási kódot
   érintené, ezért szándékosan nem nyúltam hozzá emiatt a ténynek
   minden jövőbeli olvasó tudnia kell.
4. **Két konkrét LON Facebook Reel (11-04, 11-05)** nem jelenik meg sem a
   Page saját `/posts`, sem a `/video_reels` listájában, miközben a
   Postora adatbázisában `PUBLISHED` állapotban vannak. Ez arra utalhat,
   hogy ezek valójában nem jutottak el teljes publikus állapotba
   Facebookon — külön vizsgálatot igényelne (pl. a Temporal workflow
   futási logja), nem ehhez a session-höz tartozó hiba, csak felfedeztem
   útközben.
5. **A legkorábbi, augusztusi sheet-sorok (az első 18) sosem fognak
   számot kapni**, mert kézzel lettek posztolva, Postora poszt-id nélkül
   — ez a tervnek megfelelő, nem hiba.
6. **A sync-szkript hibakezelése minimális.** Egy hiba csak a cron
   logba kerül (`/var/log/postora-analytics-sync.log`), nincs
   értesítés, ha egy nap nem sikerül a futás.
7. **A legújabb, "Sára kézi posztolás (IG/FB/TikTok)" típusú sheet-sorok**
   (1 videó, 3 platformra összevontan, Drive-linkkel, de poszt-id-k
   nélkül) jelenleg nem kapnak analitikát, mert nincs Postora poszt-id-jük
   — ha ezeket is automatizálni kell, azt külön kell megbeszélni Patrikkal.
