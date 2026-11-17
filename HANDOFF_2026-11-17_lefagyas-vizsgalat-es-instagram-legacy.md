# HANDOFF 2026-11-17 Naptár-lefagyás vizsgálat, Instagram legacy, mobil nézet

Folytatása a HANDOFF_2026-11-16_youtube-es-instagram-unified-login.md fájlnak. Repo: C:\dev\postora. Éles szerver: ssh postiz-vps, /opt/postiz.

## 1. Mi fut most élesben

- Az éles kép: ghcr.io/zsomborvarsanyi/postora-app:release-2026-11-16 (sha256:96af97387d60...). Egészséges, a naptár (/launches) ezzel betölt. Ez az utolsó ellenőrzötten működő állapot.
- A compose a szerveren nem tartalmaz INSTAGRAM_APP_ID és INSTAGRAM_APP_SECRET változót, és az instagram-unified nincs elrejtve. Az "Instagram (Standalone)" ezen a képen a Unified Login (Business login) kódot futtatja, ami portfólió nélküli Instagram-fióknál hibát ad.
- A korábbi ellenőrzött compose-mentések: /opt/postiz/docker-compose.yaml.bak.20261117_191058_pre-login-restore és a docker-compose.yaml.bak.pre-* fájlok. Adatbázis-mentések: /opt/postiz/backups/pre-*.sql.gz (a legutóbbi pre-ig-restore-only_20261117_193500). Séma nem változott egyik kiadásban sem.
- Lemez: kb. 86% (5,4 GB szabad). A rendszernaplót 200 MB-ra szorítottam. Új kép letöltése előtt töröld az előző, nem használt képet (docker rmi), különben elfogyhat a hely.
- A helyi `postora-app:rollback-...` másolatot töröltem. A régi (november 9-i) kép a registryben `:latest` címkén van (sha256:48863f929ea5...), onnan visszatölthető. FIGYELEM: main-re vagy fix/** ágra tolt push felülírja a `:latest` címkét.

## 2. Mi történt ma (rövid)

1. A Google YouTube csatlakoztatás redirect_uri_mismatch hibát adott. Teendő a Cloud Console-ban: a YouTube OAuth-kliens Authorized redirect URI-k közé kell venni a https://postora.zsomborvarsanyi.com/integrations/social/youtube címet. Ezt a felhasználónak kell megcsinálnia.
2. Az Instagram (Standalone) hibát ad, ha az Instagram-fiók nincs üzleti portfólióban. Ez a Unified Login korlátja. A legacy Instagram Login (instagram.com/oauth/authorize, graph.instagram.com) nem kér portfóliót, és a Meta appban elérhető. A Meta oldalon megcsináltam: az Instagram business login átirányítási címe https://postora.zsomborvarsanyi.com/integrations/social/instagram-standalone (mentve, zöld pipa). Az Instagram app ID: 1987164955328684, az app secretet a Meta felületen az "API setup with Instagram login" oldalon lehet előhozni (Show gomb).
3. Kód: a feat/instagram-login-restore ág (f827fd7) a legacy providert visszaállítja instagram-standalone néven, a Unified Login kódot instagram-unified néven megtartja. Két provider-spec zöld. A feat/instagram-login-restore-only és a feat/ig-legacy-provider-only ágak ugyanezt szűkebben tartalmazzák (release alapon).
4. Mobil nézet: a feat/mobile-layout ág (9516132) és a feat/mobile-layout-fix ág (c9084855). Csak Tailwind-osztályok.

## 3. A megoldatlan probléma: /launches lefagyás

Minden új kép (mobile-layout, login-restore, ig-restore-only, és valószínűleg az ig-legacy-only) telepítése után a böngészőben a /launches (naptár) oldal nem töltődött be: a naptár helyén pörgő kör, a lap nem reagált, a képernyőkép-készítés CDP időtúllépéssel elbukott. A működő release-2026-11-16 képpel ugyanez az oldal gond nélkül betölt. Ellenőrzött tények:
- A háttérhívások (api/posts, api/integrations/list, api/user/self, api/sets) mindegyike gyors és 200-at ad, tehát a backend rendben van.
- A böngésző-konzolon nincs hibaüzenet, a DOM felépül (kb. 2000 elem, nem nő).
- A mobil-nézet nélkül is lefagyott (ig-restore-only kép), és a környezeti változók nélkül is (csak képcsere).
- A kódkülönbség a release-hez képest az Instagram-képeknél csak: két provider-fájl, regisztrációs listák (integration.manager.ts, all.providers.settings.ts, show.all.providers.tsx, platform.analytics.tsx).
- Utolsó lépés: ugyanabból a release ág forrásból új kép épült (release-rebuild-1117, a futó release-2026-11-16-tal azonos forrás). Ezt telepítettem, de a böngészőbővítmény nem volt csatlakoztatva, ezért NEM tudtam megnézni, lefagy-e. Visszaállítottam a release-2026-11-16 képre. HA a release-rebuild-1117 is lefagyasztja a naptárat, a hiba a build/környezet oldali (nem a forráskód), és ez minden további kiadást érint.

Gyanús, ellenőrizendő: a böngésző állapota (süti, cache, 25 nyitott lap, háttérlapok képernyőkép-hibája). A tabs_create_mcp által nyitott lapok háttérben nyílnak, ott a képernyőkép mindig elbukik, ez félrevezethet. A tiszta teszt: egyetlen előtérben lévő lap, friss betöltés.

## 4. Holnapi következő lépések (sorrendben)

1. A Chrome-ban a Claude in Chrome bővítmény oldalpaneljét kell megnyitni és bejelentkezni, hogy a böngészős ellenőrzés működjön (ma újraindulás után nem csatlakozott).
2. A/B teszt a naptárra, egyetlen előtérbeli lappal: telepítsd a release-rebuild-1117 képet (docker pull, compose image sor cseréje, docker compose up -d postiz), nyisd meg a /launches oldalt. Ha betölt: a hiba kódhoz kötött, és a feat/ig-legacy-provider-only képet (ig-legacy-only-1117 címke, újraépítendő) kell ugyanígy kipróbálni, utána a regisztrációs módosításokat. Ha lefagy: build/környezeti ok, a release-2026-11-16-ra vissza.
3. Ha a naptár rendben van a legacy-only képpel: a compose-ba be kell tenni az INSTAGRAM_APP_ID és INSTAGRAM_APP_SECRET változókat, utána az "Instagram (Standalone)" csatlakoztatás kipróbálható egy portfólió nélküli Instagram-fiókkal.
4. A YouTube redirect URI javítás a Cloud Console-ban (lásd 2/1), utána újracsatlakoztatás.
5. Levente Administrator meghívója a Meta appon még Pending volt. Az Instagram Tester meghívók nem szükségesek a Unified Login-hoz, a legacy Instagram Login-hoz viszont igen lehetnek (Instagram: instagram.com/accounts/manage_access/, Tester Invites).

## 5. Visszaállítás

A jelenlegi állapot a biztonságos alap. Ha bármi elromlik egy újabb deploy után:

    cd /opt/postiz
    sed -i "s#postora-app:[^ ]*#postora-app:release-2026-11-16#" docker-compose.yaml
    docker compose up -d postiz

(a sed csak az image sorra vonatkozik, a környezeti változókat nem érinti, ezért ha INSTAGRAM_APP_ID/SECRET is bekerült, az a változatlan kép mellett is ártalmatlan). A release-2026-11-16 kép helyben megvan.
