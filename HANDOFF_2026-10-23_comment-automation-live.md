# Handoff, 2026-10-23 — Komment-automatizmus éles bevezetése (VZS + LON)

## Kiinduló helyzet

A komment/DM-automatizmus funkció (webhook, szabály-CRUD UI, LON-link
integráció) korábbi sessionökben megépült, de még sosem futott éles
forgalommal. A mai nap célja: élesre állítani VZS és LON Instagram/Facebook
csatornáira, és a felmerülő hibákat kijavítani. Minden élesen bevetett
javítás a `fix/tiktok-content-sharing-ux-guidelines` branch-re ment
(ugyanaz, mint a korábbi munka), és ki is lett deployolva.

## 1. Első éles teszt: csend — a webhook-feliratkozás hiánya

Az első teszt-komment (VZS Instagram) nem kapott választ. Kiderült: az
Instagram-fiók **soha nem iratkozott fel** a Meta webhookjára, mert ez a
csatlakozás a `189c3bc` (automatikus feliratkoztatás) commit ELŐTT történt.
Kézzel feliratkoztattam (`POST /{ig-id}/subscribed_apps`) — ez önmagában
megoldotta volna, DE egy második, mélyebb hiba is kiderült vele együtt.

### A gyökér-ok: hiányzó `pages_manage_metadata` jogosultság

A Facebook oldal saját feliratkoztatása (`POST /{page-id}/subscribed_apps`)
mindig csendben elbukott: `"Requires pages_manage_metadata permission"`. Ez a
jogosultság sosem volt benne a Facebook provider scope-listájában, és a
hívást egy `.catch(() => undefined)` nyelte el nyom nélkül.

**Javítás, commit `37a7f97`:**
- `pages_manage_metadata` felvéve `facebook.provider.ts` scope-jai közé.
- A csendes `.catch(() => undefined)` lecserélve `console.error`-ra mindkét
  provider mindkét feliratkoztató hívásánál (`facebook.provider.ts`,
  `instagram.provider.ts`) — legközelebb a docker log azonnal mutatja, ha
  egy fiók nem iratkozott fel.

**Minden már bekötött Facebook oldalt újra kellett csatlakoztatni**, hogy a
tokenjük megkapja az új scope-ot (VZS Facebook oldal, LON Facebook oldal —
mindkettőt a felhasználó csinálta újra a postora felületén).

## 2. Második éles teszt: rossz Instagram-végpont a publikus válaszra

A komment helyesen illeszkedett a szabályra, de a publikus válasz elbukott:
`"Something is wrong with your connected user, please re-authenticate"`.
Közvetlen Graph API hívással reprodukálva a VALÓDI hiba: code 100 / subcode
33, `"Unsupported post request... does not support this operation"`.

**Ok:** `processIncomingComment()` a már meglévő, POSZTRA ÚJ kommentet író
`comment()` metódust hívta újra egy KOMMENTRE adott válasz kiküldésére is,
`postId` helyére a komment-azonosítót adva. Ez Facebooknál véletlenül
működik (`POST /{comment-id}/comments` ott beágyazott válaszra is jó), de
Instagramnál NEM — ott külön `/{comment-id}/replies` végpont kell.

**Javítás, commit `680e0b9`** (a CLAUDE.md genericitás-szabálya szerint):
új, opcionális `replyToComment()` metódus a provider interfészen (a már
meglévő `privateReply`/`sendDirectMessage` mintájára), platform-specifikus
implementációval mindkét providerben, és a generikus
`comment-automation.service.ts` ezt hívja a `comment()` újrahasznosítása
helyett.

## 3. Üzemeltetési mellékhatás: tárhely + konténer-hang

A deploy közben a szerver tárhelye megint csordultig volt (ugyanaz a
visszatérő probléma, mint korábban — a napi `docker image prune -f` csak a
dangling rétegeket törli, a lecserélt, de még tagelt image-eket nem).
**A cron mostantól `docker image prune -af --filter "until=24h"`**, ami
minden fel nem használt image-et töröl, nem csak a dangling-eket.

A deploy után a backend egyszer elakadt induláskor (PM2 "online", de a
3000-es port sosem nyílt meg, 0% CPU — valódi hang, nem lassú indulás).
Egy `pm2 restart backend` megoldotta; ezután az `autoheal` konténer saját
magától is újraindította a teljes konténert a korábbi unhealthy állapot
miatt, ami egy újabb, normális staggered-start ciklust futtatott le. Végül
stabilan healthy lett. **Ha ez megint előfordul**, a diagnózis sorrendje:
`docker compose ps` → `pm2 list` a konténerben → `tail
/root/.pm2/logs/backend-out.log` (ha a npm-banner után semmi nincs, a
folyamat hangon van, nem csak lassú).

## 4. A reconnect ÚJ integrációs sort hoz létre, nem frissíti a régit

Tévesen azt mondtam a felhasználónak, hogy egy csatorna újracsatlakoztatása
a MEGLÉVŐ `Integration` sort frissíti helyben (mert az `upsert` kulcsa az
`internalId`, ami állandó Meta-azonosító). **Ez téves volt.** A valóságban
a postora reconnect-folyamata a RÉGI sort előbb **soft-deletel** (az
`internalId`-ját egy véletlen `makeId(10)` értékre cseréli, hogy
felszabadítsa — lásd `checkForDeletedOnceAndUpdate` az
`integration.repository.ts`-ben), és egy ÚJ sort hoz létre az eredeti
`internalId`-val, ÚJ adatbázis-`id`-vel.

**Következmény:** minden `CommentAutomationRule` sor, ami a régi
integrációs `id`-re mutatott, "elárvult" (törölt csatornára mutat).
Mindhárom VZS-újracsatlakoztatás és a LON-újracsatlakoztatás után kézzel
át kellett írni a szabályok `integrationId`-ját az új sorra (egyszerű
`UPDATE`, az Auto Mode ezt "Modify Shared Resources" címkével blokkolta,
a felhasználó kilépett Auto Mode-ból, utána ment).

**Ha legközelebb bárki újracsatlakoztat egy csatornát, amihez már vannak
komment-automatizmus szabályok: ellenőrizni kell, hogy a szabályok még a
helyes (friss) integrációs `id`-re mutatnak-e.**

## 5. A DM-szabály CONTAINS egyezése túl laza volt — valódi visszacsatolási hurok

A LON vízkő-szabály helyesen elküldte a privát választ (`"Halihó\nKöszi a
kommentet..."`) a kommentelőnek. Mivel a tesztelő a saját VZS-fiókjával
kommentelt, ez az üzenet megérkezett a VZS Instagram postafiókba — ami egy
ÖNÁLLÓ, saját DM-szabállyal rendelkező postora-fiók. A "**Halihó**" szó
TARTALMAZZA a "hali" szórészletet, ami a VZS DM-szabály egyik kulcsszava
(köszönés-variáns) — a CONTAINS egyezés erre is illeszkedett, és a VZS
automatizmus visszaküldte a saját business-DM üzenetét a LON-fióknak.

**Ez nem hibás összekeveredés volt a rendszerben** — mindkét fiók a saját,
helyes szabályát futtatta le helyesen. A valódi probléma: a CONTAINS
egyezés szórészletre is illeszkedik, nem csak egész szóra.

**A kért javítás** (nem szóhatár-matching, hanem két külön egyezési mód):
a VZS DM-automatizmus most **két szabályra** van bontva, ugyanazzal a
válasszal:
- EXACT ("pontos egyezés", `matchType=EXACT`): `szia, hello, hali, helló,
  sziasztok, hey, hi` — csak akkor talál, ha az üzenet KIZÁRÓLAG ez a szó.
- CONTAINS: `érdekel, erdekel, érdekle, erdekle, érdeke, édekel` — bárhol
  szerepelhet a szövegben.

Ez kódmódosítás nélkül, pusztán a felületen megoldható volt (a `matchType`
már eddig is szabályonkénti, nem kulcsszavankénti mező).

## 6. Végső élő szabály-állapot (2026-10-23 21:31 UTC)

| Csatorna | Trigger | Egyezés | Kulcsszavak |
|---|---|---|---|
| LON Facebook ("The Luxury of Nature") | Comment | CONTAINS | vízkő-variánsok (8 db) |
| LON Instagram ("Zsombor Varsányi", internalId `17841461982138324`) | Comment | CONTAINS | vízkő-variánsok (8 db) |
| VZS Instagram ("Zsombor Varsányi", internalId `17841401977111319`) | Comment | CONTAINS | érdekel-variánsok (6 db) |
| VZS Instagram | DM | EXACT | köszönés-szavak (7 db) |
| VZS Instagram | DM | CONTAINS | érdekel-variánsok (6 db) |

**Fontos csapda:** a felületen a sidebar-ban KÉT csatorna is "Zsombor
Varsányi" néven jelenik meg (a VZS személyes fiók ÉS a LON Instagram-fiók,
mert a mögöttes `theluxuryof_nature` IG-fiók is Zsombor nevére van kötve
Facebookon). Vizuálisan nem lehet megkülönböztetni őket — a kép (avatar)
összevetése a `picture` DB-oszloppal, vagy a `providerIdentifier`+`profile`
mezők közvetlen DB-lekérdezése a megbízható módszer.

A LON-oldali linkeket (landing + vásárlási) a `postora-generate-link.php`
éles hívásával generáltam, Sára szponzorral, `privat_uzenet` UTM-mediummal:
- Landing (lochome): `https://theluxuryofnatureofficial.com/l/N6yJgu`
- Vásárlási (fürdőszoba-tisztító L.O.C., sku 117078):
  `https://theluxuryofnatureofficial.com/l/5K88A8`

A privát üzenet szövege az `admin/links.php` valódi, termékfüggetlen
"Összetett üzenet" sablonjából (`buildCompositeMessage` JS-függvény) lett
kimásolva, egyetlen sor módosítva ("Köszi hogy írtál" → "Köszi a
kommentet", mivel itt komment-eredetű a válasz, nem a felhasználó írt be
elsőként).

## 7. Backlog-feldolgozás: 7 régi LON-komment manuális lereagálása

A vízkő-poszton ("Rászáradt a vízkő...", media id `17871968217646868`) 7
valódi kommentelő írt a szabály élesítése ELŐTT, ezért sosem futott le
rájuk webhook. Mivel a `ProcessedComment` dedup-tábla egy duplikált valódi
webhookot amúgy is csendben elnyelt volna (nincs retroaktív feldolgozás),
**szintetikus, valódi HMAC-aláírású Meta-webhook-eseményeket küldtem a
saját `/api/meta/comments-webhook` végpontunknak**, pontosan a Meta formátumát
utánozva (`entry[].changes[].field=comments`, `value.id`, `value.text`,
`value.from.username`, `value.media.id`). Ez 100%-ban ugyanazon a kódúton
futott le, mint egy valódi élő esemény (aláírás-ellenőrzés, dedup,
szabály-illesztés, válasz-küldés) — nem egy párhuzamos, kézzel írt
megoldás.

Mind a 7 kommentelő (`micsinaijanosne`, `littlefero`, `adrienngemesi`,
`erzsebetbandur`, `cs_szandiii`, `krisztinaszita`, `yvettetorok`) megkapta
a publikus választ ÉS a privát DM-et, hiba nélkül — ellenőrizve a
`ProcessedComment` táblában (`publicReplySentAt`/`privateReplySentAt`
mindkettő kitöltve). A szkriptet (ami tartalmazta a `FACEBOOK_APP_SECRET`-et)
a futtatás után töröltem a szerverről.

**Ha a jövőben megint lesz hasonló backlog** (szabály később jön létre,
mint a kommentek), ugyanez a módszer megismételhető — a mintát lásd a git
historyban nem, mert a szkript nem lett commitolva (szándékosan, egyszeri
művelet volt, titkot tartalmazott).

## 8. Auto Mode — blokkolt műveletek mintázata (megismétlődött)

Ma kétszer blokkolt az Auto Mode klasszifikátor: egyszer egy élő
adatbázis-írást (szabályok `integrationId`-jának átírása törölt
csatornáról az újra), egyszer egy, a szerverre szkriptet író és éles
webhookot küldő műveletet. Mindkétszer a felhasználó Auto Mode-ból való
kilépése oldotta meg — ugyanaz a mintázat, mint a korábbi sessionökben
(`.env.php` írás, SSH jelszóval). Workaround-ot egyik esetben sem
próbáltam, a szabály szerint jártam el.

## Nyitott pontok a következő sessionre

- **A `cmvldyfin0003lq64dtc9dh1a` és `cmvlcmbbe0003po5xxv6o3ab8` integrációs
  azonosítók ÚJAK a mai reconnectek óta** — ha ismét reconnect történik
  bármelyik csatornán, a szabályokat megint át kell írni az új `id`-re
  (lásd 4. pont).
- **A VZS Facebook oldalra és a Koczka Sára csatornákra még nincs semmilyen
  komment-automatizmus szabály beállítva** — csak VZS Instagram és LON
  (Facebook+Instagram) van élesben.
- **A LON Facebook oldalra másolt vízkő-szabály még nem lett valódi
  Facebook-kommenttel tesztelve** (csak az, hogy a webhook megérkezik —
  tényleges válasz-kiküldés Facebookon még nincs megerősítve).
- Érdemes megfontolni egy API-kulcsos, nem-UI-alapú szabály-kezelő
  végpontot a komment-automatizmushoz (a felhasználó kétszer is felvetette
  ma, amikor a böngésző-automatizálás erőforrás-hiány miatt akadozott) —
  a LON-link-generáláshoz hasonló mintával (API-kulcs, nem session-auth),
  de ez még nincs megépítve, csak felvetés.
