# HANDOFF 2026-11-16 YouTube és Instagram (Unified Login)

Repo: C:\dev\postora, ág: release/2026-11-16 (origin-re feltöltve).
Éles szerver: ssh postiz-vps, könyvtár /opt/postiz, oldal https://postora.zsomborvarsanyi.com

## 1. Mi van most élesben

- Image: ghcr.io/zsomborvarsanyi/postora-app:release-2026-11-16 (sha256:96af97387d60...). Ez a `:latest`-től külön címke. A `:latest` változatlan, ez a november 9-i állapot (sha256:48863f929ea5...).
- A kiadás az ágak egyesítése: fix/tiktok-content-sharing-ux-guidelines (4b5e6ef, eddig ez futott) + fix/comment-hook-fb-feed-id-accentfold (feed post id kötés, ékezetfüggetlen egyezés) + az Instagram standalone Unified Login átírás.
- Nincs Prisma-séma vagy migráció változás a 4b5e6ef-hez képest.
- A szerveren a compose három változást kapott: az image a release címkére mutat, új env az INSTAGRAM_UNIFIED_CONFIG_ID=1619475772583514, és az `instagram-standalone` kikerült a HIDDEN_PROVIDERS listából (enélkül nem jelent meg az Add Channel ablakban).
- Ellenőrizve: a konténer healthy, a főoldal 200. A Meta webhook GET-ellenőrzés a jó verify tokennel visszaadja a challenge-et, rossz tokennel 403. Az Add Channel ablakban megjelenik az "Instagram (Standalone)". A kattintás a helyes Meta belépési oldalra visz (client_id 1087656143606522, config_id 1619475772583514).

## 2. Visszaállítás (ha valami nem jó)

Minden a szerveren, /opt/postiz alatt.

Gyors visszaállítás a régi (november 9-i) állapotra, az adatbázis érintése nélkül:

    cd /opt/postiz
    cp docker-compose.yaml.bak.20261116_194958_pre-unified-instagram docker-compose.yaml
    docker compose up -d postiz

Ez a compose az eredeti `:latest` címkére mutat, ami a régi képet adja. Tartalék, ha a `:latest` valamiért megváltozott: a régi kép helyben megvan `postora-app:rollback-20261109-20261116_194958` néven (sha256:48863f929ea5...). Ekkor a compose `image:` sorát erre kell írni.

Részleges visszalépés, csak az Instagram-standalone elrejtésére: a compose-ban a HIDDEN_PROVIDERS végére vissza `,instagram-standalone`, majd `docker compose up -d postiz`.

Adatbázis-mentések (pg_dump, gzip): /opt/postiz/backups/pre-unified-instagram_20261116_194958.sql.gz és /opt/postiz/backups/pre-release-deploy_20261116_203140.sql.gz. A séma nem változott, ezért az adatbázis visszaállítása normál esetben nem kell. Ha mégis: a postiz konténert le kell állítani, a mentést a postiz-postgres konténerbe psql-lel visszatölteni.

További compose-mentések: docker-compose.yaml.bak.20261116_203140_pre-release-deploy és docker-compose.yaml.bak.20261116_203440_pre-unhide-standalone.

FIGYELEM a CI-re: a .github/workflows/postora-image.yml a main és a fix/** ágakra tolt push esetén mindig felülírja a `:latest` címkét. A release-ágból a címkézett build kézzel indul:

    gh workflow run postora-image.yml --repo zsomborvarsanyi/postora-app --ref release/2026-11-16 -f tag=<uj-cimke>

Ilyenkor a `:latest` nem íródik felül.

## 3. Mit változtatott a kód (release/2026-11-16)

- Komment-automatizmus általánosítva: SocialProvider.supportsCommentAutomation jelző (facebook, instagram, instagram-standalone), IntegrationManager.getCommentAutomationIdentifiers(). A /integrations/list visszaadja a commentAutomation mezőt, a frontend fül ezt használja.
- Webhook aláírás: verifyMetaWebhookSignature több secretet fogad (FACEBOOK_APP_SECRET, és ha be van állítva, INSTAGRAM_APP_SECRET).
- libraries/nestjs-libraries/src/integrations/social/instagram.standalone.provider.ts átírva Unified Loginra: facebook.com/dialog/oauth config_id-vel, kód-csere graph.facebook.com-on a FACEBOOK_APP_ID és FACEBOOK_APP_SECRET értékekkel, fiókok a /me/assigned_instagram_accounts-ból (isBetweenSteps, kiválasztó lépés), webhook-feliratkozás POST /<ig-id>/subscribed_apps?subscribed_fields=comments, publikus és privát komment-válasz graph.facebook.com-on, refreshCron=false.
- .github/workflows/postora-image.yml: workflow_dispatch `tag` bemenet.
- A scope-ok a youtube.provider.ts-ben változatlanok: userinfo.profile, userinfo.email, youtube.upload, youtube.readonly, youtube.force-ssl, yt-analytics.readonly.

## 4. Ami NINCS kipróbálva (holnap erre kell figyelni)

1. Instagram (Standalone) csatlakoztatás vége-végig. A folyamat a Meta jóváhagyó oldalig működik. Ott az üzleti portfólió és az Instagram-fiók kiválasztása a felhasználó döntése, ezért megálltam és "Mégsem"-mel kiléptem. Semmilyen hozzáférés nem lett megadva. A portfólió-lista: Horsearchery Memes, theluxuryof_nature, varsanyiarchery, Zsombor Varsányi, zsombor.varsanyi.business. A kért jogosultságok: instagram_basic, instagram_content_publish, instagram_manage_comments, instagram_manage_messages.
2. Tesztelő: a használt Instagram-fióknak Instagram Tester szerepben kell lennie (https://developers.facebook.com/apps/1087656143606522/roles/roles/), a meghívót el kell fogadni, a fiók Business vagy Creator típusú legyen.
3. A SUAT token lejárata: a Meta dokumentációja szerint a konfiguráció állítja, nem garantált, hogy sosem jár le. A provider nem tud frissíteni, lejáratkor újra kell csatlakoztatni.
4. Webhook: az Instagram objektum callbackje https://postora.zsomborvarsanyi.com/api/meta/comments-webhook, a comments mezőre feliratkozva. Valódi kommenttel nem próbáltam, a standalone fiók webhook-payload leképezése élesben nincs tesztelve.
5. DM-automatizmus standalone fiókra nincs (nincs sendDirectMessage).
6. YouTube: a Google Cloud Console beállítását a felhasználó elvégezte (Production, a hat scope). A Postorában eddig 1 YouTube csatorna van csatlakoztatva, annak tokenje még a Testing időszakból való, lejárhatott. Újra kell csatlakoztatni (Google "nem ellenőrzött alkalmazás" képernyő, Advanced, Go to ...). Utána videófeltöltés próba privát láthatósággal. Ha a feltöltött videó privátra zárul, a YouTube API Services audit űrlapot kell kitölteni.
7. A tesztek: WSL-ben 6 jest-suite, 77 teszt zöld. A lint nem futott (eslint 8.57 és eslint-config-next 16 körkörös JSON hiba a gyökér konfigban, nem ellenőriztük, hogy a bázison is hibás-e). A tsc 7 hibát mutat a backendben, mind olyan fájlokban, amelyekhez nem nyúltunk. A CI Docker-build lefutott.

## 5. Holnapi tesztlépések (sorrendben)

1. A Postora naptár betölt, a meglévő csatornák látszanak (az adatbázisban: instagram 3, youtube 1, threads 1, facebook 3, tiktok 5).
2. Add Channel, Instagram (Standalone), a Meta oldalon a kívánt portfólió és fiók kiválasztása, Tovább, jóváhagyás. Siker esetén a csatorna megjelenik. Hiba esetén a szerveren: `docker logs postiz --since 10m`.
3. Poszt ütemezése az új csatornára (kép), publikálás, ellenőrzés az Instagramon.
4. Komment-szabály létrehozása az új csatornán, kommentelés a poszt alá egy másik fiókkal, megérkezik-e a válasz és a privát üzenet.
5. YouTube újracsatlakoztatás és privát tesztvideó.
6. Ha bármelyik lépés hibás és nincs gyors javítás, a 2. pont szerinti visszaállítás. A régi állapot működött.

## 6. Hasznos adatok

- Meta app: 1087656143606522 (Postidőzítő_VZS). Unified Login config_id: 1619475772583514. Redirect URI: https://postora.zsomborvarsanyi.com/integrations/social/instagram-standalone.
- Meta beállítási oldalak: https://developers.facebook.com/apps/1087656143606522/instagram-business/Unified-Login-API-Setup/ és https://developers.facebook.com/apps/1087656143606522/webhooks/
- A webhook verify token a szerver compose-ában van, FACEBOOK_WEBHOOK_VERIFY_TOKEN néven.
- Az origin/main augusztusi, nem tartalmazza a komment-automatizmust. A munka ágakon él, a release/2026-11-16 a legfrissebb. A main-be egyesítést nem csináltam, mert a main-re tolt push felülírná a `:latest` címkét. Ezt külön, tudatos lépésben kell megtenni.
- Régi worktree-k: C:\dev\postora-accentfold, C:\dev\postora-hookfix, C:\dev\postora-accentfold-deploy. A hookfix és az accentfold-deploy állapotát nem sikerült ellenőrizni, lehet bennük nem commitolt fájl.
