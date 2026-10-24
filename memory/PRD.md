# LocalLoop — Spec-Abgleich 6/6 · Anmeldung (2026-10)
Done: Login-Screen neu: „Mit Apple fortfahren“ (nur iOS, offizieller Apple-Button), „Mit E-Mail fortfahren“, „Weiter mit Google“ (bleibt, bis E-Mail-Versand live ist), groß „Als Gast fortfahren“; Facebook entfernt. Nach Tippen auf eine Anmeldeart große Kontotyp-Karten (Persönliches Profil / Business Partner, Icons mit Verlauf, je 3 Vorteile) + „Ich habe schon ein Konto“; dieselben Karten im Onboarding (`src/components/AccountTypeCards.tsx`). Login-Hinweis für Gäste („Anmelden“) führt jetzt zum Login-Screen statt direkt zu Google. E-Mail-Code (Login = Registrierung): `POST /api/auth/email/start` (6-stelliger Code, 10 Min. gültig, gehasht gespeichert, max. 5 Codes/15 Min.), `POST /api/auth/email/verify` (max. 5 Versuche, Code einmalig) → Session 30 Tage; Versand über Resend (`RESEND_API_KEY`, `RESEND_FROM`, z. B. „LocalLoop <login@deine-domain.de>“, Domain bei Resend verifizieren). Ohne Resend nur im Vorschau-Modus (`ALLOW_DEV_LOGIN=true`): Code wird in der App angezeigt; sonst blendet die App den E-Mail-Button aus (`GET /api/auth/methods`). Apple: `POST /api/auth/apple` prüft das Identity-Token gegen Apples Schlüssel (PyJWT, `iss`, `aud` aus `APPLE_AUDIENCES`, Standard „host.exp.Exponent,com.emergent.mapeventshub.ywobzy“); gleiche E-Mail = gleiches Konto über alle Anmeldearten. Neue Abhängigkeit `expo-apple-authentication`, `app.json`: `ios.usesAppleSignIn` + Plugin. Demo-Lokale: Uhrzeiten werden jetzt als Karlsruher Ortszeit angelegt; alte Seeds werden einmalig korrigiert (vorher 20:00 als UTC gespeichert = 22:00 im Sommer). Veraltete Alt-Tests (Stories, alte Seed-Zahlen) sind mit Begründung übersprungen. Tests: backend/tests/test_email_login.py.
Offen/Hinweise: Impressum/Datenschutz/Nutzungsbedingungen sind Vorlagen mit [Platzhaltern]; Apple-Login + Kamera-Scan nur auf echtem iPhone testbar; Bilder als Data-URI in MongoDB (später Storage).


# LocalLoop — Spec-Abgleich 5/6 · Sonstiges, Designs, Bilder (2026-10)
Done: Kategorie „Sonstiges“ (`other`, ✨) mit eigenem Text: im Formular Feld „Welche Kategorie suchst du?“ (max. 30 Zeichen, optional); Backend `category_label` (getrimmt, Wortfilter, bei anderen Kategorien automatisch leer, > 30 → 400 `category_label_too_long`). Badges auf Karte/Liste/Detail zeigen den eigenen Text bzw. die übersetzten Kategorienamen (vorher englische Labels auch im deutschen UI); unbekannte Kategorien erscheinen als „Sonstiges“. Suche findet auch übersetzte Kategorienamen („Kulinarik“) und eigene Texte. Designs: vier zur Wahl in Einstellungen → Erscheinungsbild: „Dunkel (Standard)“ (bleibt Standard), „Gold & Weiß“, „Electric Sunset“ (Off-White + Koralle/Orange, Violett-Akzent, helle Karte), „Fresh Mint“ (dunkles Schiefer + Smaragdgrün, Mint-Akzent, dunkle Karte); `src/theme/theme.tsx` (`THEMES`, `isDark` je Design). Bilder: `expo-image-manipulator` (neue Abhängigkeit, `~57.0.19`) verkleinert vor dem Hochladen – Event-Banner 16:9 zuschneiden, max. 1280 px breit; Profilbilder quadratisch, max. 512 px; JPEG 0,7 (Test: 6,5 MB-Foto → 166 KB Banner / 40 KB Avatar). Hochgeladene Banner werden nur noch einmal gespeichert (`banner_url` leer statt Kopie des Bildes). Tests: backend/tests/test_category_label.py.
Hinweis: Bilder liegen weiterhin als Data-URI in MongoDB und kommen mit jeder Event-Liste mit – bei vielen eigenen Bannern wäre ein Bild-Endpoint/Storage der nächste Schritt.
Offen: 6/6 Anmeldung.


# LocalLoop — Spec-Abgleich 4/6 · Filter & Event-Ende (2026-10)
Done: Filter-Sheet für Karte + Entdecken (Button mit Zähler-Badge neben Suche/Glocke; Filter gelten auf beiden Screens, `src/filters/FilterContext.tsx`): Datum „Alle kommenden“ (Standard) / „Heute“ / „Morgen“ / „Wochenende“ (Sa+So) + Kalender (`react-native-calendars`, deutsch, Punkte an Tagen mit Events, 60 Tage), Umkreis (Slider aus Karte/Entdecken hierher verschoben; ohne Standort Hinweis + „Standort freigeben“), Veranstalter „Alle“ / „Nur Unternehmen“, Button „N Events anzeigen“. Schnellfilter jetzt „Jetzt live“, „Freier Eintritt“, „Mit Angebot“, „Draußen“ („Heute“/„In der Nähe“ stecken im Sheet). Leere Ergebnisse: „Keine Events für diesen Filter gefunden. Passe den Radius oder das Datum an.“ + „Filter zurücksetzen“. Event-Ende: optionales `end_time` (Formular: „Endzeit festlegen“, früher als Beginn = nächster Tag; ohne Ende 3 h); `backend/event_time.py` berechnet Phasen upcoming → live → ended (noch 2 h gelistet) → past (weg von Karte/Listen) bzw. cancelled. `GET /api/events` liefert `phase`, `is_live`, `ends_at`, bei Serien `occurrences` (60 Tage) und `next_occurrence` = laufender oder nächster Termin. Wiederkehrende Events rechnen jetzt in Karlsruher Ortszeit (Wochentag + Uhrzeit bleiben über die Zeitumstellung gleich; vorher UTC → nach der Umstellung 1 h verschoben, Events um Mitternacht am falschen Tag), „alle 2 Wochen“ und „monatlich“ (gleiche Woche im Monat wie der erste Termin, 5. → letzter) funktionieren wirklich, nie vor dem ersten Datum. Anlegen eines Events, das schon vorbei wäre → 400 `event_over`; Ende vor Beginn / > 7 Tage → 400. Check-in nur solange das Event läuft/kommt (409 „Event is over“); Auschecken geht immer (auch bei abgesagten Events, war vorher 409). Deals verfallen 2 h nach dem Ende (vorher 12 h nach Beginn), Dashboard zählt beendete Events als „vorbei“ + Live-Badge. Demo-Lokale (`seed_business`) rollen nach Ende um ganze Wochen weiter, damit die Demo-Karte nicht leer wird (`ROLL_DEMO_EVENTS=false` schaltet das ab). Chats-Tab neu (`GET /api/my/chats`): eigene + besuchte Events, aktive zuerst (letzte Nachricht, Zeit, ungelesen-Zähler, „Läuft gerade“, „Dein Event“), darunter „Archiv“ mit „Archiviert · Event beendet“ / „Event abgesagt“; archivierte Chats sind nur noch lesbar (Senden → 409 `chat_archived`) und lassen sich löschen (`POST /api/chats/{id}/hide`, nur für einen selbst), aktive verlassen (= Auschecken) – per Wischen oder langem Drücken, mit Bestätigung. Karte: Business-Pins mit Laden-Badge + farbigem Rand, laufende Events mit pulsierendem Ring (iOS: nur diese Pins werden live gezeichnet). Zeiten überall lokalisiert („Heute, 20:00“, „Noch bis 23:00“, „Seit 19:15“, „Fr., 24. Okt. · 21:00–02:00“, „Jede Woche · Mi, Do · 18:30“), Zeitrad auf Deutsch 24 h, Wochentage im Formular übersetzt, Kalender-Monatsnamen deutsch. Lint: 0 Fehler (vorher 29). Tests: backend/tests/test_event_lifecycle.py (+ alte Tests, die Events in der Vergangenheit anlegten, angepasst).
Offen: 5/6 Sonstiges/Designs/Bilder, 6/6 Anmeldung.


# LocalLoop — Spec-Abgleich 3/6 · Benachrichtigungen (2026-10)
Done: Benachrichtigungs-Center. Backend: Sammlung `notifications` + zentrale Funktion `notify()` in `server.py` – alle bisherigen Push-Aufrufe laufen jetzt darüber (In-App-Eintrag + Push in der Sprache des Kontos, `users.lang` de/en). Typen: `join_request` (an Host, → /dashboard), `request_approved`, `request_rejected` (nur wenn wirklich eine Anfrage gelöscht wurde), `event_cancelled` (Teilnehmer + offene Anfragen), `event_updated` (Zeit/Ort), `chat` (pro Event und Person zu EINEM Eintrag gebündelt, `count` zählt hoch; Host bekommt Chat-Meldungen auch ohne Check-in und darf den Event-Chat lesen/schreiben), `reminder` (Events, bei denen man eingecheckt ist oder die man gemerkt hat, die in ≤ 24 h starten; wird beim Abruf erzeugt, `dedupe_key` pro Termin, wiederkehrende Events über `compute_next_occurrence`). Nicht benachrichtigt: der Auslöser selbst, „system“ und Leute, die den Auslöser blockiert haben. Push-Schalter: `PATCH /profile {push_events, push_messages, lang}` – ausgeschaltet heißt nur kein Push, der In-App-Eintrag bleibt. Endpoints `GET /api/notifications` (`{unread, items}`, 50 neueste), `GET /api/notifications/unread-count`, `POST /api/notifications/read {ids?}` (ohne ids = alle); Chat öffnen markiert die Chat-Meldungen des Events als gelesen; Konto löschen entfernt sie. Systemnachrichten haben `system_key` (`cancelled`, `updated_time|place|time_place`) und werden in der App übersetzt. Frontend: `NotificationBell` (Glocke rechts oben auf Karte + Entdecken, roter Zähler bis „9+“, aktualisiert bei Fokus + jede Minute; Gäste → Login-Hinweis), Screen `app/notifications.tsx` (Icon je Typ, „vor 5 Min.“, tippen öffnet Ziel, beim Öffnen alles gelesen, Leerzustand, Pull-to-Refresh), Texte in `src/utils/notifications.ts`; Einstellungen speichern die Push-Schalter jetzt wirklich am Konto; App-Sprache wird ans Konto übertragen. Tests: backend/tests/test_notifications.py.
Offen: 4/6 Filter & Event-Ende, 5/6 Sonstiges/Designs/Bilder, 6/6 Anmeldung. Erinnerungen kommen bisher nur in der App (kein zeitgesteuerter Push ohne Hintergrund-Job).


# LocalLoop — Spec-Abgleich 2/6 · Moderation & Rechtliches (2026-10)
Plan erweitert auf 6 Etappen (Anmeldung kam als eigene Etappe dazu). Entscheidungen des Nutzers: Login = E-Mail + Apple + Google + Gast (Facebook raus); Designs = alle vier, Dunkel bleibt Standard.
Done: Wortfilter `backend/moderation.py` (DE/EN-Liste, erkennt Leetspeak/Umlaute/gestreckte Buchstaben, Wortgrenzen → „Marsch“, „Schlamperei“, „Arschbombe“ bleiben ok; milde Flüche wie „Scheiße“ bewusst nicht drin). Chat + Bewertungen werden zensiert („A********“, Feld `censored`), Event-Titel/-Beschreibung/Deal-Text/Lokalname und Profil-Name/Bio/Business-Name werden mit 400 `{code:"profanity", field, words}` abgelehnt. Melden: `POST /api/reports` (user|event|message, Gründe spam/harassment/hate/sexual/violence/fake/other, Notiz), eine Meldung pro Person+Ziel; Chat-Nachricht ab 3 Meldern für alle außer Autor ausgeblendet (`hidden`). `GET /api/admin/reports` nur für `ADMIN_EMAILS` (env, kommagetrennt). Blockieren: `POST /api/users/{id}/block` (Toggle), `GET /api/my/blocks`; Blockierte sind für den Blockierenden in Chat, Teilnehmerliste und Karte/Listen (`GET /events` mit optionalem Login) ausgeblendet; `GET /users/{id}` liefert `blocked`. Konto löschen entfernt Blocks (beide Richtungen) und eigene Meldungen. Registrierung: `PATCH /profile` mit `accept_terms`/`confirm_truth` → `terms_accepted_at`/`truth_confirmed_at`; Geburtsdatum nach `onboarded` gesperrt (anderer Wert → 409). Frontend: Onboarding mit zwei Pflicht-Häkchen + Bestätigungs-Modal fürs Geburtsdatum; Profil zeigt „Geburtsdatum · nicht änderbar“; Chat mit Avataren (tippen → Profil), langes Drücken → Profil anzeigen/Melden/Blockieren, Systemnachrichten als Info-Zeile, Community-Richtlinien-Modal für ältere Konten ohne `terms_accepted_at`; Profil: Melden (Gründe) + Blockieren mit Bestätigung; Event-Seite „…“: Event melden / Veranstalter blockieren; Einstellungen: „Blockierte Personen“ (aufheben) und Rechtliches als eigene Seiten `app/legal/[doc].tsx` (Impressum, Datenschutzerklärung, Nutzungsbedingungen; Texte in `src/legal/content.ts` als VORLAGE mit [Platzhaltern], Banner bis `LEGAL_IS_TEMPLATE=false`), Links auch auf dem Login-Screen und im Onboarding (Route ohne Login erreichbar). Tests: backend/tests/test_moderation.py.
Offen: 3/6 Benachrichtigungen, 4/6 Filter & Event-Ende, 5/6 Sonstiges/Designs/Bilder, 6/6 Anmeldung (E-Mail-Code, Apple, Kontotyp-Karten).


# LocalLoop — Spec-Abgleich 1/5 · Fehler & Layout (2026-10)
Abgleich mit der Emergent-Spec (11 Punkte), in 5 Etappen. Done hier: Tab-Leiste ist jetzt fest und im Layout (nicht mehr `position: absolute` + Blur) → Inhalte enden über der Leiste, „Event veröffentlichen“ war vorher verdeckt; Karten-Logos/Attribution per `mapPadding` über der Leiste. Fix: Radius-Filter auf der Karte wurde nicht angewendet (`radiusKm` fehlte in `filterEvents`). `GET /api/events` blendet abgesagte Events aus und liefert `host_name` + `host_is_business` (Suche findet Events jetzt auch über Lokal-/Firmennamen) sowie `trend_score` = echte Check-ins + Merklisten. Erster Kategorie-Chip „Trending now“ (Karte + Entdecken; Entdecken zeigt dann eine vertikale Liste der Top 20, ohne simulierte live_count); altes Trend-Karussell entfernt. Event-Seite: Teilen-Button, „Veranstaltet von …“ (→ Profil), Teilnehmer-Avatare, Host-Button „Event absagen“ mit Bestätigung + Abgesagt-Banner; Event-Sheet: „Event verwalten“ für Hosts. Standort: Erklär-Modal vor der System-Abfrage (nativ, `src/location/LocationPermission.tsx`, „Später“ gilt für die Sitzung). Leerer Kartenfilter → freundlicher Hinweis. Haptik bei Pin-Auswahl und Chat-Senden. Tests: backend/tests/test_event_list.py.
Offen (nächste Etappen): Moderation & Rechtliches, Benachrichtigungen, Filter & Event-Ende, Sonstiges/Designs/Bilder.


# LocalLoop — Etappe 2 · Deals / Angebote (2026-10)
Done: Business-Konten können beim Erstellen/Bearbeiten eines Events EIN Angebot anhängen (`offer_title`, max. 80 Zeichen, + `offer_limit` = Anzahl insgesamt, 0 = unbegrenzt); andere Konten → 403. Gäste sichern es sich nur, wenn sie eingecheckt sind, je Person und Event genau einmal (`POST /api/events/{id}/deal`, Limit atomar über `offer_claimed`, Unique-Index `deals(event_id,user_id)`; Host selbst ausgeschlossen; abgesagt/vorbei → 409). Check-out gibt einen ungenutzten Deal zurück in den Pool; eingelöste bleiben. `GET /api/my/deals` + `GET /api/events/{id}/deal`. Einlösen nur durch den Host: `POST /api/deals/redeem {code}` (QR enthält `LOCALLOOP-DEAL:<8-stelliger Code>`, Groß/Klein/Bindestriche egal; zweites Mal → 409 mit `reason: redeemed` + Zeitpunkt). Frontend: Deal-Abschnitt im Event-Formular (nur Business), `DealCard` im Event-Sheet und auf `app/event/[id]`, `app/deals.tsx` („Meine Deals“ mit QR-Code, Einstieg Einstellungen → Deals), Dashboard-Karte „Deals“ (vergeben/eingelöst) + `app/scan-deal.tsx` (Kamera-Scan mit expo-camera + manuelle Code-Eingabe). QR-Code per `src/components/QRCode.tsx` mit neuem reinen JS-Paket `qrcode-generator` (kein natives Modul). Konto löschen: ungenutzte Deals zurück in den Pool, eingelöste anonymisiert. iOS-Kamera-Text erwähnt jetzt das Scannen. Tests: backend/tests/test_deals.py.
Offen: mehrere Angebote pro Event; Deals gelten bei wiederkehrenden Events einmal pro Person für die ganze Serie.


# LocalLoop — Etappe 2 · Event bearbeiten (2026-10)
Done: `PATCH /api/events/{id}` (nur Host; alle Felder optional, Host/Status/Zähler nicht änderbar; abgesagt → 409; leerer Titel/ungültige Zeit/join_approval → 400; Kapazität unter bestehende Check-ins → 409). Ändert sich Zeit oder Ort (inkl. Wiederholung), gibt es eine Systemnachricht im Event-Chat + Push an Teilnehmer und offene Anfragen. Frontend: `CreateEventScreen` hat einen Bearbeiten-Modus (`initial`-Prop, vorbefüllt), Route `app/edit-event/[id].tsx` (Nicht-Hosts sehen Hinweis), Einstieg im Dashboard-Verwalten-Sheet und per Stift-Button auf `app/event/[id]` (lädt bei Fokus neu). Unveränderte Zeit wird mit dem gespeicherten Zeitstempel zurückgeschickt (kein falscher Hinweis). Fix `TimeWheel`: Spalten hatten keine feste Höhe → nicht scrollbar, zeigten immer die Listenmitte (z. B. 7:30 statt 20:00); jetzt wie `DateWheel` + Web-Fallback (Scroll-Pause = Auswahl). `LocationPicker` (nativ) startet zentriert auf dem gesetzten Ort. Tests: backend/tests/test_edit_event.py.
Offen: `DateWheel` (Geburtsdatum im Onboarding) übernimmt im Web per Mausrad gescrollte Werte ebenfalls nicht.


# LocalLoop — Etappe 2 · Business-Dashboard (2026-10)
Done: Neuer Screen `app/dashboard.tsx`, Einstieg über Karte im Profil (Business-Konten immer; normale Nutzer sobald sie eigene Events haben → „Meine Events"). Backend `GET /api/my/dashboard?tz_offset=<JS getTimezoneOffset>` liefert nur echte Zahlen (keine simulierte live_count): aktive Events, Check-ins gesamt + letzte 7 Tage (Tagesbalken in lokaler Zeit), Merklisten, Ø-Bewertung, offene Beitrittsanfragen (annehmen/ablehnen direkt im Dashboard), eigene Events nach Phase (upcoming → past → cancelled) mit Verwalten-Sheet (ansehen, Teilnehmer, absagen), neueste Bewertungen. Business-Profil im Profil-Tab editierbar (Name, Kategorie, Adresse, Webseite, Instagram, Beschreibung); öffentliches Profil `app/user/[id]` zeigt diese Angaben. Push „New join request" verlinkt jetzt `/dashboard` (vorher tote Route `/requests/{id}`). Approve auf abgesagtem Event → 409. `PATCH /api/profile`: leerer Business-Name → 400, Business-Felder getrimmt. `POST /api/auth/dev-session` akzeptiert optional `{"alias": "..."}` → eigener Demo-Nutzer `demo+<alias>@localloop.app` (Host/Gast-Tests). i18n: doppelte Keys `open_settings` entfernt (tsc wieder grün). Tests: backend/tests/test_business_dashboard.py.
Fix: `DELETE /api/profile` löschte Chat-Nachrichten über ein falsches Feld (`sender_id`) – Name, Bild und Nachrichten gelöschter Nutzer blieben sichtbar. Jetzt per `user_id`; entfernt zusätzlich Merklisten, Beitrittsanfragen und Crew-Stimmen, korrigiert Check-in-Zähler und Bewertungen. Test: backend/tests/test_account_deletion.py.
Offen: Angebote, lokale Push. Events gelöschter Konten bleiben bisher bestehen (Produktentscheidung nötig).


# LocalLoop — Etappe 2 · Gastmodus (2026-06)
Done: #5 Gastmodus "Weiter ohne Anmeldung" auf Welcome (`enterGuest` in AuthContext, persistiert via `localloop_guest`). Gäste sehen Map/Explore/Trends/Kategorien frei. Interaktivitäts-Wall (`promptLogin` + globales `LoginWall`-Bottom-Sheet in AuthContext) bei: Check-in/RSVP, Event speichern, Gruppenchat (EventSheet), Chat senden. `GuestGate`-Screen (src/components/GuestGate.tsx) auf Tabs Create/Profile/Chats. AuthGate lässt Gäste in `/(tabs)`; Login/Logout löschen Gast-Flag. i18n DE/EN Keys: guest_continue, wall_*, guest_chats/create/profile.
Offen in Etappe 2 (nächster Schritt): Business-Dashboard/Profil-Erweiterungen; danach Chat Community-Guidelines-Modal + Wortfilter. P0 pausiert: Zeitfilter [JETZT]/[HEUTE]/[DIESE WOCHE] auf Map.


# LocalLoop — Etappe 1 (Teil 1) (2026-06)
Done: #9 Moments/Stories entfernt (UI + API + Backend-Endpoints + Model). #2 Kategorien "restaurant" + "cafe" ergänzt; "Trending now"-Sektion auf Explore (Top 6 nach live_count, nur bei Default-Filter). #3 "Konto löschen" in Settings + Sicherheits-Modal + Backend `DELETE /api/profile` (löscht user + checkins/messages/reviews/crew-membership/sessions). #1 Chat-Header tippbar → `app/participants/[eventId]` (Event-Header → `app/event/[id]` Detailscreen; Teilnehmer → `app/user/[id]` Public Profile mit Report/Block). Neue Backend-Endpoints: `GET /api/users/{id}` (public), `DELETE /api/profile`. #7 Location-Fuzzing: `with_live_count` liefert deterministische `pin_latitude`/`pin_longitude` (~200–450m Versatz); MapCanvas (nativ+web) nutzt Pin-Koordinaten, echte Koordinaten bleiben für Radius/At-Venue.
Offen in Etappe 1 (nächster Schritt): #8 Community-Guidelines-Modal + Wortfilter im Chat (Report/Block ist schon da); #5 Gastmodus "Weiter ohne Anmeldung" + Login-Wall.
Etappe 2 (Integrationen, später): #4 Bildmoderation (übersprungen/vertagt), #5 E-Mail-Verifizierung via Resend + Blau/Gold-Badge, #6 Business-Dashboard/Angebote/lokale Push.


# LocalLoop — Expo SDK Upgrade (2026-06)
- Upgraded Expo SDK 54 → 57 (`yarn expo install expo@latest` + `--fix`); RN 0.81 → 0.86; expo-doctor 20/20 pass.
- app.json: removed `newArchEnabled` + android `edgeToEdgeEnabled` (54→55 change).
- Vector icons migrated: `@expo/vector-icons` → `@react-native-vector-icons/ionicons` across all 20 files (Ionicons default import). `use-icon-fonts.ts` now loads the bundled `Ionicons.ttf` (family "Ionicons") via expo-font.
- Fixed `StyleSheet.absoluteFillObject` typing (new RN types) in verify.tsx / SplashIntro.tsx / MapHome.tsx.
- PENDING (next): time filter [JETZT]/[HEUTE]/[DIESE WOCHE] on Map — not yet implemented.


# LocalLoop — Feature Round 5 (2026-06) — 5 new features
- Palette refined to matte charcoal/obsidian + ice-blue (#159AB8) primary + emerald mint accent (NO purple/violet/orange); categories recolored; theme defaults to dark.
- Welcome slogan set to German "Dein Stadtpuls. Live auf der Karte."; Email button labeled "Email OTP".
- Birthdate uses a scrollable WHEEL picker (Day/Month/Year) in onboarding; onboarding adds profile picture, bio, instagram fields.
- #1 Radius slider (1–30 km) + presets (1/5/15/All) floating glass panel on Map + Explore; geodesic filtering; translucent radius Circle on map. Uses `useUserLocation` hook.
- #2 Account-type chooser modal on Welcome (Personal vs Business) → stores `pending_account_role` → onboarding pre-selects role.
- #3 Self-serve selfie verification: `app/verify.tsx` (expo-camera front selfie) → PATCH profile `{identity_verified, selfie}` → "Verified Identity" badge on Profile + attendee list; entry in Settings. (Camera = build-only.)
- #4 Swipe-to-delete chat rows (Swipeable): event chat → leave (un-checkin), crew → `POST /api/crews/{id}/leave`.
- #5 Anonymous attendees: participants returns `{anonymous:true}` placeholders; EventSheet shows silhouette + "Anonymer Teilnehmer"; count still increments.
- Backend: checkin `{visibility, at_venue}` + capacity 409; participants privacy-aware + `live`/`identity_verified` flags; reviews; `identity_verified`/`selfie` profile fields; crew leave.


# LocalLoop — Product Requirements Document

## Original Problem Statement
An interactive, map-first regional event & community app (Google Maps × Nomadlist). Full-screen map with color-coded event pins (Purple=nightlife, Orange=food, Green=sports, Blue=culture), tap-to-preview bottom sheet, event detail with CTAs, organizer add-event form, and a live pulse / check-in social layer. Modern high-contrast minimalist UI, dark & light support.

## User Choices
- Demo events **+** user-added events
- Google social login (Emergent-managed)
- Live pulse: simulated counts **+** real check-ins
- Support both dark & light themes (toggle)
- Default map location: user GPS with San Francisco fallback

## Architecture
- **Backend**: FastAPI + MongoDB (motor). Routes under `/api`. Emergent Google OAuth session flow (`/api/auth/session`), events CRUD, check-in toggle, 8 seeded SF demo events, simulated `live_count` jitter + `is_hot`. Preview-only `dev-session` (env-guarded `ALLOW_DEV_LOGIN`).
- **Frontend**: Expo SDK 54, expo-router (stack). `react-native-maps` on native + web fallback canvas (`MapCanvas.web.tsx`) so full flow is testable on web. `@gorhom/bottom-sheet` (progressive disclosure), expo-blur glass header, expo-location, reanimated pulse pins, theme context (persisted), AuthContext.

## Personas
- **Explorer**: browses the map, filters by category, checks into events.
- **Organizer** (venue/club/sports club): publishes events via the Add Event form.

## Core Requirements (static)
1. Interactive map with clustered/color-coded pins + live pulse on hot pins.
2. Event preview → detail bottom sheet with Instagram/Website/Buy Tickets CTAs.
3. Organizer add-event form (title, category, date/time, location picker, description, links).
4. Live check-in count (real toggle + simulated base).
5. Google login, dark/light theme toggle.

## Implemented (2026-07-13)
- ✅ Google login screen + Emergent OAuth flow + preview demo login
- ✅ Map screen: color-coded pins, category filter chips, glass header, theme toggle, recenter, add FAB
- ✅ Event bottom sheet: hero image + scrim, meta, live count, check-in, CTAs
- ✅ Add Event form with category chips, date presets, map location picker, sticky publish
- ✅ Backend: events CRUD, check-in toggle + status, 8 seeded events, live jitter
- ✅ Tested: backend 14/14 pytest passed; frontend critical flows passed via Playwright

## Implemented — Feature Round 2 (2026-07-13)
- ✅ Scrollable time-wheel (hour/minute/AM-PM) in Add Event form
- ✅ Emoji map markers per category (🍹 🍕 🏋️ 🎭)
- ✅ Event Group Chat (polling, unlocked on check-in) — `/chat/[eventId]`
- ✅ User Profiles: photo upload, bio, Instagram — `/profile`
- ✅ "Surprise Me" gamified button (popular event within ~2h, zooms + opens)
- ✅ Map Stories/"Moments": photo upload, 24h TTL expiry, story viewer
- ✅ "Create a Crew": private groups, invite codes, suggest map events + custom ideas, vote — `/crews`, `/crew/[id]`
- ✅ Keyboard UX via react-native-keyboard-controller (chat + forms)
- ✅ Tested: backend 28/28 pytest passed; frontend 12/12 feature areas passed via Playwright

## Implemented — Feature Round 3: Final Build (2026-07-15)
- ✅ 5-tab bottom navigation: Map · Explore · Create · Chats · Profile
- ✅ Redesigned Welcome screen: blurred city bg + pulsating neon indigo/cyan gradient, white logo + DE/EN slogan, Google/Facebook/Email CTA stack, DE/EN toggle + "Business Login" bottom bar
- ✅ Karlsruhe default map center + GPS centering; location picker defaults to Karlsruhe
- ✅ Seeded 7 REAL Karlsruhe venues as verified business events (DECKZEHN, VENUS BAR, Mama's Café, drei&zwanzig, Wilma Wunder, Bistro Le Renard, Café Wohnzimmer), each with 3–6 mock attendees + seed chat messages
- ✅ Recurring events: toggle + freq + weekday selector; next-occurrence computed; recurring badge on sheet/cards (DECKZEHN Thu&Sat 18:00, VENUS BAR Fri 20:00)
- ✅ Explore tab: vertical rich cards + search + quick filters (Today/Free/Outdoor/Near Me)
- ✅ Event Save/Bookmark (+ /my/saved, /my/attending); Attendee avatars + first names on sheet
- ✅ Event banner image upload; interactive calendar date picker + scrollable time wheel
- ✅ Marker clustering + emoji markers with neon glow; chat keyboard back-button fix
- ✅ Push-notification relay wired (Emergent) — saved-event + new-message triggers
- ✅ Tested: backend 16/16 pytest; frontend ~all flows passed (save button + recurring badge fixed & verified)

## Implemented — Feature Round 4: UX Refresh + Design Overhaul (2026-06)
- ✅ Full-screen Map (removed in-app brand/header bar; only floating search + category chips overlay the map)
- ✅ Centralized Settings screen (`app/settings.tsx`) via gear icon in Profile: Language, Notifications, Location, Theme, Legal, Logout
- ✅ Complete DE/EN i18n across ALL screens via `src/i18n` (brand "LocalLoop" + slogan intentionally never translated)
- ✅ Premium Welcome screen redesign: Unsplash community photo bg + glassmorphic (expo-blur) card with logo/slogan/Google/Facebook/Email
- ✅ **Design overhaul**: removed all orange; new premium dark palette — primary electric violet (#7C5CFF) + emerald mint accent (#2EE6A6), glassmorphism. Added `accent`/`onAccent` theme keys.
- ✅ **Expanded to 10 categories** (Sports&Fitness 🏋️, Nightlife&Clubs 🪩, Rooftop&Bar 🍹, Food&Culinary 🍕, Arts&Culture 🎨, Networking 💼, Gaming&E-Sports 🎮, Outdoor&Nature 🪵, Workshops 📚, Music&Concerts 🎵) with embedded neon colors + age-restricted flag on nightlife/rooftop
- ✅ Interactive horizontal **carousel category picker** (`CategoryWheel.tsx`) in Create form
- ✅ Backend: 13 Karlsruhe venues re-seeded across all categories; added `capacity`, `rating`, `rating_count`, `reservation_url` to Event; `spots_taken` in live payload; seed-versioning (`db.meta.seed_version`) to force clean re-seed

## In Progress — Big Feature Program (user request, 4 phases; all defaults confirmed)
- Phase 1 (DONE): design overhaul + 10 categories + wheel picker
- Phase 2 (TODO): mandatory birthdate onboarding + dynamic age display + U18 nightlife restriction; Business role selection + forced business profile setup + verified blue badge + star rating on profile/sheet/cards + user review system (attendees only)
- Phase 3 (TODO): event capacity + live "X/Y spots" counter, RSVP privacy (Public/Friends/Anonymous), reservation link field, native share button, distance radius filter (1/5/15 km), calendar date-range picker (Explore + Map), live GPS "At Venue" check-in + green Live badge
- Phase 4 (TODO): chat delete/leave, "My Contacts" friends (search/request/1-on-1 DM), event-header → event details navigation

## Design decisions (confirmed by user)
- Business login = role choice on login (Visitor / Organizer-Business) → forced business profile; verified badge auto/admin-granted for demo
- Palette = electric violet primary + emerald mint accent (dark, glassmorphism, NO orange)
- Reviews allowed for checked-in attendees only
- Re-seed demo data allowed

## Backlog / Next (deferred)
- **P0**: Facebook OAuth login (needs Facebook integration); Email OTP login (needs email provider e.g. Resend/SendGrid)
- **P1**: Push delivery verification (requires google-services.json + native build)

