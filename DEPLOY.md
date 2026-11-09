# Hangar online stellen (PC + Handy, immer synchron)

Hangar läuft danach unter einer eigenen Adresse (z. B. `https://hangar-xyz.vercel.app`), am PC im Browser und am Handy als App auf dem Homescreen. Alle drei Dienste haben einen kostenlosen Tarif, der für eine private Sammlung reicht.

| Dienst | Wofür | Kostenlos bis |
|---|---|---|
| **Neon** (neon.tech) | Datenbank (PostgreSQL) | 0,5 GB, reicht für zehntausende Modelle |
| **Cloudflare R2** | Fotos | 10 GB |
| **Vercel** (vercel.com) | Die App selbst | Hobby-Tarif |
| **GitHub** | Code-Ablage, aus der Vercel baut | privates Repository |

Dauer: etwa 30 Minuten.

---

## 1. Datenbank: Neon

1. Auf **neon.tech** registrieren → **Create project**.
2. Name `hangar`, Region **AWS Europe Central 1 (Frankfurt)**.
3. Auf der Projektseite **Connect** → Schalter **Connection pooling** einschalten → die Adresse kopieren. Sie sieht so aus:
   `postgresql://neondb_owner:…@ep-…-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`
   Das ist deine **DATABASE_URL**. Gut aufheben, sie enthält das Passwort.

## 2. Fotos: Cloudflare R2

1. Auf **dash.cloudflare.com** registrieren → links **R2 Object Storage** → R2 aktivieren (verlangt eine Zahlungsmethode, der Gratis-Tarif kostet nichts).
2. **Create bucket** → Name `hangar` → Standort **Europe** → anlegen.
3. Zurück zur R2-Übersicht → **Manage API tokens** → **Create API token**:
   - Berechtigung: **Object Read & Write**
   - Bucket: nur `hangar`
4. Nach dem Erstellen notieren:
   - **Access Key ID** → `S3_ACCESS_KEY_ID`
   - **Secret Access Key** → `S3_SECRET_ACCESS_KEY`
   - **Endpoint** für S3 Clients, z. B. `https://<account-id>.r2.cloudflarestorage.com` → `S3_ENDPOINT` (ohne `/hangar` am Ende)
   - `S3_BUCKET` = `hangar`, `S3_REGION` = `auto`

Der Bucket bleibt privat. Die App liefert die Fotos selbst aus und prüft dabei, wem sie gehören.

## 3. Bestehende Sammlung umziehen

Kopiert alle Modelle, Wertverläufe, Fotos und Einstellungen von deinem PC in die Cloud und legt deinen Login an. Die lokalen Daten bleiben unverändert erhalten.

1. **Hangar.exe und `npm run dev` beenden** (die lokale Datenbank erlaubt nur ein Programm gleichzeitig).
2. PowerShell im Ordner `D:\hangar` öffnen und ausführen (Werte einsetzen):

```powershell
$env:TARGET_DATABASE_URL = "postgresql://…-pooler…/neondb?sslmode=require"
$env:OWNER_EMAIL         = "deine@email.de"
$env:OWNER_PASSWORD      = "ein-gutes-passwort"
$env:S3_ENDPOINT         = "https://<account-id>.r2.cloudflarestorage.com"
$env:S3_BUCKET           = "hangar"
$env:S3_ACCESS_KEY_ID    = "…"
$env:S3_SECRET_ACCESS_KEY= "…"
npx tsx scripts/migrate-to-cloud.ts
```

Am Ende steht `✔ Done.` und eine Tabelle, was kopiert wurde. Bricht etwas ab (z. B. Internet weg), einfach erneut starten, dann mit `--force` am Ende: Vorhandenes wird übersprungen.

## 4. Code auf GitHub

1. Auf **github.com** ein **privates** Repository `hangar` anlegen (ohne README).
2. In PowerShell in `D:\hangar`:

```powershell
git init
git add .
git commit -m "Hangar"
git branch -M main
git remote add origin https://github.com/<dein-name>/hangar.git
git push -u origin main
```

`.env.local`, die lokale Datenbank und die Fotos werden dabei **nicht** hochgeladen (`.gitignore`).

## 5. App: Vercel

1. Auf **vercel.com** mit dem GitHub-Konto anmelden → **Add New → Project** → Repository `hangar` → **Import**.
2. Vor dem ersten Deploy unter **Environment Variables** eintragen:

| Name | Wert |
|---|---|
| `DATABASE_URL` | Neon-Adresse aus Schritt 1 |
| `HANGAR_AUTH` | `on` |
| `HANGAR_SIGNUP` | `off` (niemand außer dir kann ein Konto anlegen) |
| `BETTER_AUTH_SECRET` | langer Zufallswert, siehe unten |
| `BETTER_AUTH_URL` | erst einmal leer lassen, nach Schritt 3 nachtragen |
| `CRON_SECRET` | langer Zufallswert, siehe unten |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | aus Schritt 2 |
| optional `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_MARKETPLACE`, `PLANESPOTTERS_CONTACT`, `SERPER_API_KEY` | wie in `.env.local` |

   Zufallswert erzeugen (PowerShell): `[Convert]::ToBase64String((1..32 | % { Get-Random -Max 256 }))`

3. **Deploy** klicken. Nach 2–3 Minuten zeigt Vercel die Adresse, z. B. `https://hangar-xyz.vercel.app`.
4. **Settings → Environment Variables** → `BETTER_AUTH_URL` = genau diese Adresse (mit `https://`, ohne `/` am Ende) → speichern.
5. **Settings → Functions → Function Region** → **Frankfurt (fra1)** (nah an der Datenbank, deutlich schneller).
6. **Deployments** → beim obersten Eintrag **⋯ → Redeploy**, damit beide Einstellungen greifen.

Jetzt die Adresse öffnen und mit E-Mail und Passwort aus Schritt 3 anmelden.

## 6. Aufs Handy

- **iPhone (Safari):** Adresse öffnen → anmelden → Teilen-Symbol → **Zum Home-Bildschirm**.
- **Android (Chrome):** Adresse öffnen → anmelden → Menü ⋮ → **App installieren**.

Hangar startet dann im Vollbild wie eine App. Langes Drücken auf das Symbol (Android) bietet „Add Aircraft“ direkt an.

**Offline:** Die App speichert den zuletzt geladenen Stand auf dem Gerät. Ohne Netz kannst du die Sammlung ansehen und durchsuchen. Ändern geht erst wieder mit Verbindung, ein Hinweis oben zeigt das an.

**Barcode:** Im Hinzufügen-Dialog und in der Sammlungssuche gibt es ein Scan-Symbol. Kennt Hangar den Barcode schon, kommt sofort die Duplikat-Meldung. Sonst öffnet sich das Formular mit der eingetragenen Nummer. Die Kamera funktioniert nur über `https://`, also über die Vercel-Adresse.

## 7. eBay-Marktpreise (optional)

Ohne Server im Dauerbetrieb übernimmt ein Zeitplan das Aktualisieren:

- **Automatisch:** Vercel ruft `/api/cron/market` einmal täglich auf (in `vercel.json`). Jeder Aufruf schafft etwa 15 Modelle.
- **Schneller:** Damit alle Modelle wöchentlich frisch sind, bei **cron-job.org** (kostenlos) einen Job anlegen:
  - URL: `https://<deine-adresse>/api/cron/market`
  - Zeitplan: alle 30 Minuten
  - Unter **Advanced → Headers**: `Authorization` = `Bearer <dein CRON_SECRET>`

## Updates

Änderungen am Code: `git add . ; git commit -m "…" ; git push`. Vercel baut und veröffentlicht automatisch, Datenbank-Änderungen laufen beim Start von selbst. Die Handy-App holt sich die neue Version beim nächsten Öffnen.

## Lokal weiterarbeiten?

Hangar.exe und `npm run dev` nutzen weiter die **lokale** Datenbank. Das ist ab jetzt eine getrennte Kopie. Arbeite nach dem Umzug nur noch mit der Online-Version, sonst laufen die Daten auseinander.
