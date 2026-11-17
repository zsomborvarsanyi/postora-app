# HANDOFF 2026-11-17 START HERE: Postora YouTube, Instagram (Standalone), mobil nézet

Ez az összefoglaló. A részletek: HANDOFF_2026-11-16_youtube-es-instagram-unified-login.md és HANDOFF_2026-11-17_lefagyas-vizsgalat-es-instagram-legacy.md (ugyanebben a mappában, a release/2026-11-16 ágon).
Repo: C:\dev\postora (GitHub: zsomborvarsanyi/postora-app, PUBLIKUS, ne tegyél bele titkot). Éles szerver: ssh postiz-vps (kulcsos), könyvtár /opt/postiz. Oldal: https://postora.zsomborvarsanyi.com
A fájlok az ügynök-worktree-ben is megvannak: C:\dev\postora\.claude\worktrees\agent-ad178b89ab79f784a (a release/2026-11-16 ág ki van checkoutolva).

## 1. Egy mondatban

Az Instagram (Standalone) legacy Instagram Login módban él és működik portfólió/Facebook-oldal nélküli fiókkal, a mobil nézet élesben van, a YouTube-hoz a Google Cloud Console-ban még egy redirect URI hiányzik.

## 2. Állapot-táblázat

| Téma | Állapot | Ellenőrizve? |
|---|---|---|
| Éles kép | ghcr.io/zsomborvarsanyi/postora-app:login-restore-1117 (ág: feat/instagram-login-restore, f827fd7) | igen, healthy, naptár betölt |
| Instagram (Standalone) csatlakoztatás | működik: zsombor.varsanyi fiók (BUSINESS), csatorna frissült, token 2027-01-14-ig | igen, végig kattintva |
| Instagram komment-webhook feliratkozás | él (graph.instagram.com/me/subscribed_apps = comments) | igen |
| Instagram poszt publikálás | nincs kipróbálva | NEM |
| Instagram komment-válasz, privát válasz | kód kész, élesben nincs kipróbálva | NEM |
| Instagram Unified Login (Business login) | kód megvan instagram-unified néven, elrejtve (HIDDEN_PROVIDERS) | csak a login oldalig |
| Mobil nézet | élesben, 390px-en betölt, alsó navigáció, Create Post egyoszlopos | igen (iframe-trükk) |
| YouTube csatlakoztatás | redirect_uri_mismatch: Cloud Console-ban hiányzik a redirect URI | NEM (a te teendőd) |
| YouTube feltöltés | nincs kipróbálva | NEM |
| Levente Administrator meghívó (Meta app) | Pending | nem fogadta el |

## 3. Teendők (sorrendben)

1. YouTube, Google Cloud Console, a YouTube-hoz használt `10213…` projekt, Google Auth Platform, Clients, a webes kliens: Authorized redirect URIs közé: https://postora.zsomborvarsanyi.com/integrations/social/youtube . Mentés (néhány perc). Utána a Postorában a meglévő YouTube-csatorna törlése és újracsatlakoztatása (Google "nem ellenőrzött alkalmazás" képernyő: Advanced, Go to ...). Majd privát tesztvideó. Ha a videó privátra zárul, YouTube API Services audit űrlap kell (2020 utáni nem auditált projekt).
2. Instagram élő teszt: privát/teszt tartalmú poszt ütemezése a "Zsombor Varsányi" (zsombor.varsanyi) csatornára, publikálás, ellenőrzés az Instagramon. Utána komment-szabály a csatornán, kommentelés egy másik fiókkal, megérkezik-e a publikus válasz és a privát üzenet. Ha a komment-válasz hibát ad: a /replies hívás a `message`-t query-ben küldi, a Meta doksi JSON törzset mutat, azt kell átírni (instagram.standalone.provider.ts, replyToComment).
3. Levente: fogadja el az Administrator meghívót a Facebookon (értesítés vagy Beállítások, Alkalmazások és webhelyek), és vedd fel őt a theluxuryof_nature üzleti portfólióba (Business Suite, Beállítások, Emberek). A "developers.facebook.com/requests" link NEM létezik, ne használd.
4. Az Instagram Tester meghívók (zsombor.varsanyi, varsanyi_levente, Pending) a Unified Login-hoz nem kellenek. A legacy Instagram Login-hoz más (nem admin) fiókoknál kellhetnek: a meghívó nem e-mailben jön, hanem instagram.com/accounts/manage_access/ (Tester Invites). A fióknak Business vagy Creator típusúnak kell lennie.
5. Meta app alapbeállítások (idegen felhasználók csatlakozása előtt): Terms of Service URL és adattörlési URL jelenleg https://www.facebook.com/ (placeholder), az app ikon hiányzik. Terms oldal létezik: https://postora.zsomborvarsanyi.com/terms. Adattörlési oldal nincs (a /data-deletion átirányít).
6. Mobil nézet finomítása: csatornalista kb. 200px magas, alsó navigáció utolsó eleme levágott (görgethető), Create Post szerkesztő jobb széle levágott, alsó gombok a chat-buborék alatt. Telefon-szélességen nincs megnézve: Add Channel ablak, komment-szabály szerkesztő, beállítások, média-választó.
7. Git rendbetétel: a feat/instagram-login-restore ág (ez fut) nincs a main-ben. Az origin/main augusztusi. A main-re vagy fix/** ágra tolt push felülírja a `:latest` képet (CI). Ha egyesíteni akarod, tudatosan, tag-elt build után.

## 4. Visszaállítás (ha valami elromlik)

A mai deploy előtti, ellenőrzött állapot a release-2026-11-16 kép (sha256:96af97387d60..., helyben megvan a szerveren).

    ssh postiz-vps
    cd /opt/postiz
    cp docker-compose.yaml.bak.20261117_204441_pre-final-restore docker-compose.yaml
    docker compose up -d postiz

Ez az INSTAGRAM env nélküli, release-2026-11-16 képes compose. Csak az Instagram elrejtésére (kép marad): a compose HIDDEN_PROVIDERS végére vissza `,instagram-standalone`, majd `docker compose up -d postiz`.
Adatbázis: /opt/postiz/backups/pre-final-restore_20261117_204441.sql.gz (és a korábbi pre-*.sql.gz). A séma egyetlen mai kiadásban sem változott, az adatbázis-visszaállítás normál esetben nem kell. Ha mégis: postiz konténer le, mentés psql-lel a postiz-postgres konténerbe.
A legrégebbi (november 9-i) kép: registry `:latest` (sha256:48863f929ea5...). A helyi rollback-másolatot lemezhely miatt töröltem.

## 5. Hogyan kell deployolni (a tapasztalatok alapján)

1. Build: `gh workflow run postora-image.yml --repo zsomborvarsanyi/postora-app --ref <ág> -f tag=<cimke>` (a `:latest`-et NEM írja felül, ha van tag). Az eredmény: `gh run view <id> --repo zsomborvarsanyi/postora-app --json conclusion -q .conclusion` (a `gh run watch --exit-status | tail` félrevezető, elnyeli a hibakódot, ma egy elbukott build "sikeresnek" látszott).
2. Lemez: kb. 86%, 5,2 GB szabad. Új kép előtt `docker rmi` a nem használt képre (a futót ne). Ha elfogy a hely a letöltésnél, a `journalctl --vacuum-size=200M` is segít.
3. Letöltés a szerveren: `docker pull ghcr.io/zsomborvarsanyi/postora-app:<cimke>`.
4. Mentés: a compose másolata és `pg_dump | gzip` (docker exec postiz-postgres), gzip -t ellenőrzéssel.
5. Compose image sor cseréje, `docker compose config -q`, `docker compose up -d postiz`, várni a healthy állapotra.
6. Ellenőrzés: a konténer újraindítása után az első /launches betöltés 15-25 másodperc (pörgő kör), a második 4 másodperc. Ez NEM fagyás, ne állíts vissza emiatt. Teszteléskor várj legalább 30 másodpercet.

## 6. Hol vannak a titkok (nincs a repóban)

- Instagram app ID: 1987164955328684. Az app secret: Meta, https://developers.facebook.com/apps/1087656143606522/use_cases/customize/API-Setup/?use_case_enum=INSTAGRAM_BUSINESS (Instagram app secret, Show) és a szerver compose-ában INSTAGRAM_APP_SECRET.
- Meta főapp: 1087656143606522 (Postidőzítő_VZS), FACEBOOK_APP_SECRET és FACEBOOK_WEBHOOK_VERIFY_TOKEN a szerver compose-ában. YOUTUBE_CLIENT_ID/SECRET is ott.
- Az app a theluxuryof_nature üzleti portfólióhoz tartozik (business_id 776981577561245).
- Unified Login config_id: 1619475772583514 (INSTAGRAM_UNIFIED_CONFIG_ID, a compose-ban nincs beállítva a végleges képen, csak a rejtett instagram-unified használná).

## 7. Mit érdemes tudni a holnapi beszélgetéshez

- Miért legacy és nem Unified: a Unified Login az Instagram-fiókot üzleti portfólióhoz köti, portfólió nélküli fióknál a csatlakoztatás hibát adott. A legacy nem kér portfóliót, és még működik (Meta: legacy, új funkciók már nem jönnek, lejárati dátumot nem adnak meg).
- Page-hez kötött Instagram-fiókok a régi, érintetlen `instagram` (Facebook Business) providerrel kapcsolódnak, ezeket nem kell újracsatlakoztatni.
- YouTube scope-ok (a kódban és a Console-ban egyeznie kell): userinfo.profile, userinfo.email, youtube.upload, youtube.readonly, youtube.force-ssl, yt-analytics.readonly. A minimum a feltöltéshez: youtube.upload, youtube.readonly, userinfo.profile. A force-ssl a komment-válaszhoz, az analytics a statisztikához kell. A scope-lista változtatásakor a Console-t is át kell állítani. A yt-analytics.readonly a Console picker-ben csak a YouTube Analytics API engedélyezése után jelenik meg, vagy kézzel adható hozzá.
- Böngészős tesztelés: a Claude in Chrome oldalpaneljét meg kell nyitni és bejelentkezni. A tabs_create_mcp által nyitott lap háttérben van, ott a képernyőkép elbukik: egyetlen előtérbeli lapot használj. Telefon-szélesség: iframe 390px (resize_window nem működik).
- Ügynök-worktree-k a C:\dev\postora\.claude\worktrees alatt maradtak (agent-*, ig-restore-only, handoff-*). Törölhetők, ha már nem kellenek. A feat/* ágak (mobile-layout, mobile-layout-fix, instagram-login-restore, -only, ig-legacy-provider-only) mind a GitHubon vannak.
