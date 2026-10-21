# Handoff, 2026-10-21 — TikTok nagy videó feltöltés hibája

## Mi volt a kiinduló probléma

Egy nagy (~105-180 MB-os) TikTok videó rendszeresen elbukott feltöltés
közben "Unrecognized TikTok upload response (status 503)" CloudFront
hibával, de egy kézzel tömörített (64 MB alá csökkentett) változat
mindig azonnal átment. A cél: megtalálni és javítani, hogy tömörítés
nélkül is menjen fel.

## Mi derült ki — három réteg

### 1. Ami NEM volt hiba (eltévedtem itt)

A `tiktokChunkPlan` korábban `Math.floor()`-t használt a chunkok
számának kiszámításához. Feltételeztem, hogy ez hiba (az utolsó chunk
így nagyobb lehet a bejelentett `chunk_size`-nál), és `Math.ceil()`-re
javítottam (commit `24768d9`).

**Ez rossz volt.** TikTok saját Content Posting API dokumentációja
(developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide)
kifejezetten leírja: `total_chunk_count = floor(video_size /
chunk_size)`, és az UTOLSÓ chunk szándékosan túlléphet a chunk_size-on,
egészen 128 MB-ig. A saját példájuk is ezt mutatja (50 000 123 B videó,
10 000 000 B chunk_size → total_chunk_count=5, utolsó chunk 10 000 123
B). A `Math.ceil()` élesben konkrét TikTok hibát dobott: `{"code":
"invalid_params","message":"The total chunk count is invalid"}`.

**Visszavonva: commit `0943301`.** A `Math.floor()` az eredeti, helyes
kód volt, nem kellett hozzányúlni.

### 2. A valódi ok

Az eredeti 503-as CloudFront hiba TikTok saját feltöltő-infrastruktúrájának
instabilitása: a chunk PUT kérésre időnként egy hibás CloudFront
edge-function válaszoldalt ad vissza ("The CloudFront function
associated with the CloudFront distribution is invalid or could not
run"), AMI FÉLREVEZETŐ — a bájtokat valójában megkapja és rögzíti.

Ezt éles teszttel bizonyítottam: egy chunk-szintű újraküldést próbáltam
(commit `4bc8ee3`, ugyanazt a byte-tartományt újraküldeni erre a
válaszra), és **minden egyes alkalommal** 416-os "Range Not
Satisfiable" hibát kaptam a megismételt kérésre — ezt TikTok csak egy
MÁR rögzített tartományra adja. Tehát a chunk már megvolt, csak a
válasz esett szét útközben (CDN-szintű, nem TikTok-origin-szintű hiba).

**Ez a próbálkozás is hibás volt**, mert az újraküldés okozta a 416-ot
— visszavonva: commit `a0d8718`.

### 3. A végső, bevált javítás

**Commit `a010f80`.** Az `uploadTikTokVideoChunk` mostantól felismeri
ezt a konkrét CloudFront-hibaszöveget, és **sikerként kezeli** (nem
küldi újra, nem bukik el rajta, folytatja a következő chunkkal).

```ts
if (text.includes(TiktokProvider.TIKTOK_EDGE_FUNCTION_CRASH_MARKER)) {
  return;
}
```

Fájl: `libraries/nestjs-libraries/src/integrations/social/tiktok.provider.ts`

## Hogyan lett leellenőrizve

Nem várakoztam ütemezett posztra — egy MÁR élesben elbukott, valódi
posztot (`cmvgpz3sj000epi72wrn8nxyx`, egy 180 MB-os videó a
`@theluxuryofnature` TikTok fiókra) manuálisan újraindítottam a Temporal
workerén keresztül (`tctl workflow start ... postNow:true`), hogy
azonnal, valós feltöltéssel teszteljek a szerkesztő UI-n keresztüli
várakozás helyett. Négy ilyen manuális teszt futott
(`-manualtest` .. `-manualtest4`), az utolsó, `a010f80`-cal, sikerrel:

```
PUBLISHED | https://www.tiktok.com/@theluxuryofnature | 2026-10-21 18:34:21
```

## Nyitott / figyelendő pontok

1. **A javítás empirikus, nem garantált.** 5 megfigyelt eset mind
   "hamis negatívnak" bizonyult (a bájtok mindig megvoltak). Nincs
   TikTok-oldali API, amivel visszaellenőrizhető lenne, hogy egy adott
   chunk tényleg megérkezett-e, mielőtt a `finalize`/`checkPostStatus`
   lépésig eljutnánk. Ha valaha ELŐFORDULNA, hogy ez a konkrét
   hibaoldal MOST tényleg elveszett bájtokat jelent, a publish
   valószínűleg hibásan "sikeresnek" fog látszani, és a videó
   TikTok-oldalon törötten/hiányosan végződhet. Érdemes figyelni a
   `checkPostStatus` végeredményeit a következő pár nagy (>64 MB)
   feltöltésnél.

2. **A konténer indulás közben véletlenszerűen lefagy.** Ezen a
   session-ön belül HÁROMSZOR is megtörtént, hogy a `postiz`
   konténer újraindítása (`docker compose up -d postiz`) után a
   `backend` VAGY az `orchestrator` PM2-folyamat "online" státuszban
   maradt, de valójában soha nem fejezte be a Nest-bootstrapet (nem
   figyelt a sajat portján: 3000 ill. 3002). Mindháromszor kézi
   `pm2 restart <folyamat>` oldotta meg. **Ennek a gyökér-okát NEM
   találtam meg** — csak a tünetet kezeltem minden deploy után. Ha
   legközelebb is lefagy, érdemes megnézni mi akad el a NestJS modulok
   betöltésekor hidegindításkor (DB connection pool warmup? Prisma
   migrate lock? valami race a két folyamat között?).

3. **A VPS diszkje 97%-on volt**, ami miatt egy korábbi image-pull
   némán elhasalt (`no space left on device`, csak a log mélyén
   látszott). `docker image prune -f`-fel ~12.6 GB szabadult fel.
   Mivel minden egyes push új image-et épít és a szerver lehúzza,
   érdemes lenne egy cron-os `docker image prune -f`-et beállítani,
   különben ez visszatér.

4. **4 manuális teszt-workflow maradt a Temporal historyban**
   (`post_cmvgpz3sj000epi72wrn8nxyx-manualtest` .. `-manualtest4`),
   mind a valódi `cmvgpz3sj000epi72wrn8nxyx` posztra mutatva. Nem
   ártanak, de ha valaki a Temporal UI-ban nézi a historyt, ott vannak.

5. **A `fix/tiktok-content-sharing-ux-guidelines` ág még nincs
   mergelve a `main`-be**, és az upstream Postiz-projekt saját
   TikTok-guideline PR-je (#1563) sincs lezárva — a saját image-build
   (`.github/workflows/postora-image.yml`) ezért még szükséges.

6. Két régi, tegnap (10-20) törölt poszt ma "No Post" hibával tért
   vissza, amikor a hozzájuk tartozó, már alvó workflow felébredt a
   publikálási időpontjukban (`cmvb8qwv5001kmq7nl8dtx30k`,
   `cmvgw0llq000lpi72lpapmr2m`). Ez helyes viselkedés (nem lehet egy
   törölt posztot kiküldeni), csak megzavarta a mai hibakeresést — ha
   ismét látsz "No Post" hibát egy TikTok posztnál, először nézd meg a
   `deletedAt` mezőt, mielőtt a feltöltési logikát hibáznád.
