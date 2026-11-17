# HANDOFF 2026-11-17 Instagram legacy élesítés, mobil nézet, YouTube

Folytatása a HANDOFF_2026-11-16_youtube-es-instagram-unified-login.md fájlnak. Repo: C:\dev\postora. Éles szerver: ssh postiz-vps, /opt/postiz, oldal https://postora.zsomborvarsanyi.com

## 1. Mi fut most élesben (ellenőrizve)

- Kép: ghcr.io/zsomborvarsanyi/postora-app:login-restore-1117 (a feat/instagram-login-restore ág f827fd7 commitjából épült, ami a release/2026-11-16 + mobil nézet + legacy Instagram Login).
- A szerveren a compose három változást kapott: az image a login-restore-1117 címkére mutat, új env INSTAGRAM_APP_ID=1987164955328684 és INSTAGRAM_APP_SECRET (az Instagram app secret, a Meta felületen az "API setup with Instagram login" oldalon, Show gomb), és az `instagram-unified` bekerült a HIDDEN_PROVIDERS listába.
- Ellenőrzött tények:
  - A /launches naptár asztali szélességen betölt, a csatornalista látszik.
  - Az Add Channel ablakban az "Instagram (Standalone)" látszik, az "Instagram (Business login)" el van rejtve.
  - Az Instagram (Standalone) kattintás a jó Instagram jóváhagyó oldalra visz (client_id 1987164955328684, redirect https://postora.zsomborvarsanyi.com/integrations/social/instagram-standalone, scope-ok: instagram_business_basic, manage_comments, content_publish, manage_insights).
  - A zsombor.varsanyi fiókkal végigmentem: "Channel Updated", a csatorna (`Zsombor Varsányi`, instagram-standalone, belső id 17841401977111319) frissült, token lejárat 2027-01-14, refreshNeeded=false. A fiók típusa BUSINESS, Facebook-oldal és üzleti portfólió nélkül is működött.
  - A webhook-feliratkozás él: graph.instagram.com/me/subscribed_apps a `comments` mezőt mutatja.
  - A webhook GET-ellenőrzés jó tokennel visszaadja a challenge-et.
  - Mobil nézet 390 pixel szélességen (iframe-trükkel): a felső sáv befér, az alsó navigációs sáv oldalirányban görgethető, a csatornalista és a naptár egymás alatt van, alapból napi nézet. A Create Post ablak egyoszlopos és használható.
- Mobil nézet ismert hiányosságai: a csatornalista csak kb. 200 pixel magas, az alsó navigáció utolsó eleme (Integrations) levágva (görgethető), a Create Post szerkesztő jobb széle kicsit levágott, az alsó gombok egy része a chat-buborék alatt. Nincs átalakítva: komment-automatizmus szabályszerkesztő, plugs, beállítások, analitika, média-választó, Add Channel ablak (nincs megnézve telefon szélességen).
- Nem próbáltam ki: tényleges poszt publikálása az Instagram-csatornára, komment-válasz és privát válasz valódi kommenttel. A webhook payload leképezése a standalone fiókra élesben nincs tesztelve. A `/replies` hívás a `message` paramétert query-ben küldi, a Meta dokumentációja JSON törzset mutat: ha a komment-válasz hibát ad, azt kell átírni.

## 2. FONTOS tanulság: a "lefagyás" valójában lassú első betöltés

Ma több képnél azt hittem, hogy a /launches oldal lefagy. Ez tévedés volt: minden konténer-újraindítás után az első betöltés kb. 15-25 másodpercig tart (pörgő kör), közben a képernyőkép-készítés időtúllépéssel elbukik. A második betöltés 4 másodperc. Bizonyíték: a release ág forrásából újraépített kép (release-rebuild-1117) ugyanígy viselkedett, és a végleges kép is. Teszteléskor deploy után várj legalább 30 másodpercet, és egyetlen előtérben lévő böngészőlapot használj (a tabs_create_mcp háttérben nyitja a lapot, ott a képernyőkép mindig elbukik).

## 3. Visszaállítás

A mai deploy előtti, ellenőrzött állapot: ghcr.io/zsomborvarsanyi/postora-app:release-2026-11-16 (sha256:96af97387d60..., helyben megvan).

    cd /opt/postiz
    cp docker-compose.yaml.bak.20261117_204441_pre-final-restore docker-compose.yaml
    docker compose up -d postiz

Ez az INSTAGRAM env nélküli, release-2026-11-16 képes állapot. Utána az első betöltés lassú, ez normális.
Adatbázis-mentések (pg_dump, gzip): /opt/postiz/backups/pre-final-restore_20261117_204441.sql.gz és a korábbiak (pre-*.sql.gz). A séma egyik kiadásban sem változott, az adatbázis visszaállítása normál esetben nem kell.
A legrégebbi (november 9-i) kép a registryben `:latest` címkén van (sha256:48863f929ea5...). FIGYELEM: main-re vagy fix/** ágra tolt push felülírja a `:latest` címkét (CI). A címkézett build kézzel indul: gh workflow run postora-image.yml --repo zsomborvarsanyi/postora-app --ref <ág> -f tag=<uj-cimke>. Az eredményt `gh run view <id> --json conclusion` mutassa (a `gh run watch --exit-status | tail` félrevezető, mert a kilépési kódot elnyeli).
Lemez: kb. 86% (5,2 GB szabad). Új kép letöltése előtt töröld a nem használt képet (docker rmi), különben elfogyhat a hely. A rendszernaplót 200 MB-ra szorítottam (journalctl --vacuum-size).

## 4. Ágak állapota (git)

- origin/release/2026-11-16 (6f465a2f): a kiadás alapja + két handoff. Ebből a mobil és a legacy Instagram módosítás hiányzik.
- origin/feat/instagram-login-restore (f827fd7): ez fut élesben. Tartalmazza a mobil nézetet (9516132) és a legacy Instagram-t (instagram-standalone) + a Unified Login kód átnevezve instagram-unified névre.
- feat/mobile-layout-fix (c9084855): a mobil ág változata a calendar.context.tsx módosítás nélkül, nincs telepítve, nem szükséges.
- Az origin/main augusztusi, nem tartalmazza a komment-automatizmust. A main-be egyesítést nem csináltam, mert a main-re tolt push felülírná a `:latest` címkét. Ha tudatosan egyesíteni akarod: először a feat/instagram-login-restore ágat kell a release-hez igazítani, majd main-re PR, és a push után az új `:latest` képet kell használni a compose-ban.

## 5. Teendők

1. YouTube: a Cloud Console-ban a YouTube OAuth-kliens Authorized redirect URI-k közé kell venni a https://postora.zsomborvarsanyi.com/integrations/social/youtube címet (redirect_uri_mismatch hiba). Utána a YouTube-csatorna újracsatlakoztatása, privát tesztvideó. Ha a videó privátra zárul, a YouTube API Services audit űrlap kell.
2. Instagram (Standalone): élő teszt poszt (privát/teszt tartalom), majd komment-szabály létrehozása a csatornán, kommentelés egy másik fiókkal, megérkezik-e a válasz és a privát üzenet.
3. Levente Administrator meghívója a Meta appon (Postidőzítő_VZS) Pending volt. Az Instagram Tester meghívók a legacy Instagram Login-hoz kellhetnek más fiókoknál (instagram.com/accounts/manage_access/, Tester Invites).
4. A mobil nézet finomítása a fenti hiányosságok szerint.
5. A Meta app alapbeállításai: a Terms of Service és az adattörlési URL jelenleg https://www.facebook.com/ (placeholder), az app ikon nincs feltöltve. Idegen felhasználók csatlakozása előtt pótolni kell (Terms: https://postora.zsomborvarsanyi.com/terms).
