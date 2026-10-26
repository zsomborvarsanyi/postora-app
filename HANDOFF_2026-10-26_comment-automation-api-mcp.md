# Handoff, 2026-10-26 — Komment-automatizmus API-kulcsos + MCP elérése, vízkő-szabály poszthoz kötése

## 0. Kiinduló kérés

Zsombor két dolgot kért a komment/DM-automatizmushoz:

1. Egy rendes felület, ahol posztonkénti (nem csak csatorna-szintű)
   szabályt és csatornát lehet választani — mert a vízkő-link egyszer lett
   generálva, és az nem jó a következő videóra is.
2. Teljes API-kulcsos bekötés, hogy egy saját Cloud Agent, ha megvan neki
   az API-kulcs, dokumentáció nélkül is "tudja", hogy ezek a funkciók
   elérhetők és tudja is irányítani őket.

## 1. Mi derült ki vizsgálat közben — a poszthoz kötés már megvolt

A `fix/tiktok-content-sharing-ux-guidelines` ág (ami éles) már tartalmazta
a per-poszt szabály-felülbírálást commit `4dc4564`
(`feat(comment-automation): posztonkenti szabaly-felulbiralas es elo
LON-link segedpanel`) óta:

- A szabály-szerkesztő formon van egy "Scope to one specific post"
  legördülő (`CommentAutomationRules` komponens,
  `apps/frontend/src/components/comment-automation/comment-automation-rules.tsx`).
- A csatornaválasztó a bal oldali sávban már megvolt
  (`apps/frontend/src/components/comment-automation/comment-automation.tsx`).
- A backend (`providerPostId` mező a `CommentAutomationRule` modellen,
  `comment-automation.repository.ts` `getActiveRulesForIntegration`)
  helyesen preferálja a poszt-specifikus szabályt a csatorna-szintű felett.

**Ami valóban hiányzott, és ami 2026-10-23-án a vízkő-szabályt
csatorna-szintűvé tette**: a "Scope to one specific post" legördülő a
`GET /comment-automation/:integrationId/posts` végponton keresztül csak a
Postorán BELÜL ütemezett posztokat listázza (`Post` tábla,
`integrationId`+`organizationId` szerint). A vízkő-videó viszont közvetlenül
Instagramra/Facebookra ment ki, Postora-ütemezés nélkül — a felületen ezért
soha nem is lehetett volna kiválasztani, pedig a backend (`providerPostId`
szabad string) tökéletesen tudná kezelni, ha valaki kézzel beírná a
valódi média/poszt-azonosítót. Erre jelenleg nincs beviteli mező a
felületen, csak a dropdown.

## 2. Megépült: API-kulcsos REST + MCP elérés

Commit `e904644` a `fix/tiktok-content-sharing-ux-guidelines` ágon,
push-olva és deployolva.

### REST: `/public/v1/comment-automation`

Új `PublicCommentAutomationController`
(`apps/backend/src/public-api/routes/v1/public.comment-automation.controller.ts`),
1:1 tükrözve a session-authos `CommentAutomationController` végpontjait,
regisztrálva a `public.api.module.ts` `authenticatedController` tömbjében
(`PublicAuthMiddleware`, tehát `Authorization: Bearer <API-kulcs>` fejjel
hívható, pontosan ugyanúgy, mint a meglévő `/public/v1/*` végpontok):

- `GET /public/v1/comment-automation/lon/options`
- `POST /public/v1/comment-automation/lon/generate-link`
- `GET /public/v1/comment-automation/:integrationId/posts`
- `GET /public/v1/comment-automation/:integrationId/rules`
- `POST /public/v1/comment-automation/:integrationId/rules`
- `PUT /public/v1/comment-automation/:integrationId/rules/:ruleId`
- `DELETE /public/v1/comment-automation/:integrationId/rules/:ruleId`
- `PUT /public/v1/comment-automation/:integrationId/rules/reorder`
- `POST /public/v1/comment-automation/:integrationId/rules/copy-to`

Kívülről mindig `/api/` prefixszel hívandó
(`https://postora.zsomborvarsanyi.com/api/public/v1/comment-automation/...`),
lásd a korábbi memória a `/api` prefix buktatóról.

### MCP: 8 új eszköz

Postora saját, beépített MCP-szerverébe (`libraries/nestjs-libraries/src/chat/`)
8 új eszköz, regisztrálva a `tool.list.ts`-ben:

| fájl | MCP-eszköz id |
|---|---|
| `comment.automation.posts.list.tool.ts` | `commentAutomationPostsList` |
| `comment.automation.rules.list.tool.ts` | `commentAutomationRulesList` |
| `comment.automation.rule.upsert.tool.ts` | `commentAutomationRuleUpsert` |
| `comment.automation.rule.delete.tool.ts` | `commentAutomationRuleDelete` |
| `comment.automation.rule.reorder.tool.ts` | `commentAutomationRuleReorder` |
| `comment.automation.rule.copy.tool.ts` | `commentAutomationRuleCopy` |
| `lon.link.options.tool.ts` | `lonLinkOptions` |
| `lon.link.generate.tool.ts` | `lonLinkGenerate` |

Ez pontosan az a mechanizmus, amit Zsombor kért: egy API-kulccsal
csatlakoztatott MCP-kliens (`claude mcp add postiz --transport http ...
--header "Authorization: Bearer <kulcs>"`, ugyanaz, mint a Fejlesztők
oldalon már meglévő eszközökhöz) automatikusan látja ezeket eszközként,
leírással, külön dokumentáció nélkül is.

Mindkét réteg (REST + MCP) a már meglévő, globálisan regisztrált
`CommentAutomationService`/`LonLinkService`-t hívja (`DatabaseModule`,
`@Global()`), nem duplikál logikát.

### Build-ellenőrzés

`pnpm --filter ./apps/backend run build` és
`pnpm --filter ./apps/orchestrator run build` zöld. Az eslint a repo egy,
ettől a változástól független konfig-hibája miatt nem futtatható
(`Converting circular structure to JSON` a flat config betöltésekor) —
ezt nem ez a munkamenet okozta, nem is javította.

## 3. Deploy — a megszokott staggered-start minta megint lefutott

Push → GitHub Actions "Postora image" build (~6 perc, zöld) → `ssh
postiz-vps` → `cd /opt/postiz && docker compose pull postiz && docker
compose up -d postiz`.

Az első felállás a healthcheck szerint `unhealthy`-re futott ki
(`http://localhost:3002/health/status` — az orchestrator — `ECONNREFUSED`
volt, a backend `/api/` 200-at adott). Az `autoheal` konténer ezt
észlelte és saját magától újraindította a teljes `postiz` konténert, ami
egy új, normális staggered-start ciklust indított (`pm2-staggered`:
backend → 15s várás → orchestrator → 10s várás → frontend). A második
kör healthy lett, mindhárom PM2-folyamat (`backend`, `orchestrator`,
`frontend`) online. **Ez megegyezik a 10-23-i handoffban már leírt
mintázattal, nem új hiba** — ha legközelebb megint `unhealthy`-re fut ki
az első kör, érdemes csak várni egy autoheal-ciklusnyit, mielőtt kézzel
beavatkoznál.

Külső smoke-teszt: `curl .../api/public/v1/comment-automation/lon/options`
hibás API-kulccsal `401`-et adott (nem `404`), ami megerősíti, hogy az
új végpont létezik és az auth-middleware helyesen véd.

## 4. Vízkő-szabály poszthoz kötése — csak az Instagram-oldalon

Az élő DB-t közvetlenül lekérdezve (`docker exec postiz-postgres psql -U
postiz-user -d postiz-db-local`) kiderült: a vízkő-szabály két sorban él,
LON Instagram (`cmvldyfin0003lq64dtc9dh1a`) és LON Facebook
(`cmvldxxds0001lq64n4rjzmc6`) integráción, mindkettő `providerPostId =
NULL` (csatorna-szintű) volt. A `Post` táblában NEM volt hozzájuk tartozó,
már publikált sor (csak egy 2026-10-30-ra ütemezett, más tartalmú poszt
mindkét integráción, `releaseId` még üres) — megerősítve az 1. pontban
leírt felületi hiányosságot.

A 10-23-i handoffból ismert a vízkő-videó valódi Instagram média-id-je
(`17871968217646868`, a "Rászáradt a vízkő..." poszt). Ezt közvetlen SQL
UPDATE-tel rávezettem az Instagram-oldali szabályra:

```sql
UPDATE "CommentAutomationRule"
SET "providerPostId" = '17871968217646868'
WHERE id = '351c868a-0801-4dee-bcdf-b1720d2de527';
```

A Facebook-oldali szabályt (`d64b393f-ea75-437e-994c-2eb745c8be66`)
**szándékosan nem** érintettem — nincs hozzá megbízható Facebook
poszt-azonosítóm (a cross-post, ha volt, saját, az Instagram-médiától
független id-t kap Facebookon, ezt találgatni egy éles DM-et is küldő
szabálynál kockázatos lett volna). Zsombor jóváhagyta, hogy ez maradjon
csatorna-szintű, amíg nincs konkrét poszt-link hozzá.

## 5. Nyitott pontok a következő sessionre

1. **LON Facebook vízkő-szabály poszt-azonosítója**: ha Zsombor ad egy
   konkrét Facebook poszt-URL-t/id-t a vízkő-tartalomhoz, ugyanígy
   rávezethető SQL-lel vagy már az új public API-n/MCP-n keresztül is
   (`commentAutomationRuleUpsert` a `providerPostId` mezővel).
2. **2026-10-30-ra ütemezett "csapvíz"-poszt** (Post id
   `cmvp4ok2b0008lq64dsrv5g6i` Facebook, `cmvp4okaq0009lq644aw953df`
   Instagram, mindkettő ugyanazon két integráción): ehhez saját,
   poszt-specifikus szabály és friss LON-link kell majd — a jelenlegi
   vízkő-szabály nem fogja lefedni. Zsombor kérése szerint ezt közelebb a
   publikáláshoz kell elővenni, nem most. Publikálás után a `releaseId`
   megjelenik a `Post` táblában, és onnantól a felületi "Scope to one
   specific post" dropdown is mutatja (nem kell hozzá kézi SQL).
3. **A "Scope to one specific post" dropdown vakfoltja** (1. pont) —
   ha ez gyakran előjön (közvetlenül Instagramra/Facebookra posztolt,
   Postora-ütemezés nélküli videók), érdemes lehet egy szabad szöveges
   "vagy írd be kézzel a poszt/média-azonosítót" mezőt tenni a dropdown
   mellé a `comment-automation-rules.tsx`-ben — ez még NINCS megépítve,
   csak most derült ki, hogy hiányzik.
4. **Az új REST/MCP végpontokat még nem tesztelte senki valódi
   API-kulccsal vagy MCP-kliensből** — a build és a külső 401-es
   smoke-teszt megerősíti, hogy léteznek és az auth működik, de egy
   valódi szabály-CRUD kört (létrehozás, listázás, törlés) API-kulccsal
   vagy egy rákötött MCP-klienssel még senki nem futtatott le.
