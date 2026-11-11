# Hangar online stellen (PC + Handy, immer synchron)

Hangar läuft danach unter einer eigenen Adresse (z. B. `https://hangar-xyz.vercel.app`), am PC im Browser und am Handy als App auf dem Homescreen. Alle Dienste haben einen kostenlosen Tarif, der für eine private Sammlung reicht.

| Dienst | Wofür | Kostenlos bis |
|---|---|---|
| **GitHub** | Code-Ablage, aus der Vercel baut | privates Repository |
| **Neon** (neon.tech) | Datenbank (PostgreSQL) | 0,5 GB, reicht für zehntausende Modelle |
| **Vercel** (vercel.com) | Die App selbst | Hobby-Tarif |
| **Vercel Blob** | Fotos (privater Speicher in Vercel) | 1 GB |

Neon und Vercel lassen sich mit **„Continue with GitHub“** anmelden, ein eigenes Passwort ist dort nicht nötig.

---

## 1. Code auf GitHub

Das Projekt ist bereits ein Git-Repository (`main`). `.env*` (außer `.env.example`), die lokale Datenbank, Backups und `node_modules` sind ausgeschlossen.

1. Auf **github.com** ein **privates** Repository `hangar` anlegen (ohne README, ohne .gitignore).
2. In PowerShell in `D:\hangar`:

```powershell
git remote add origin https://github.com/<dein-name>/hangar.git
git push -u origin main
```

## 2. Datenbank: Neon

1. Auf **neon.tech** mit GitHub anmelden → **Create project**.
2. Name `hangar`, Region **AWS Europe Central 1 (Frankfurt)**.
3. Auf der Projektseite **Connect** → Schalter **Connection pooling** einschalten → die Adresse kopieren:
   `postgresql://neondb_owner:…@ep-…-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`
   Das ist die **DATABASE_URL**. Sie enthält das Passwort.

## 3. App und Fotospeicher: Vercel

1. Auf **vercel.com** mit GitHub anmelden → **Add New → Project** → Repository `hangar` → **Import**.
2. Unter **Environment Variables** eintragen:

| Name | Wert |
|---|---|
| `DATABASE_URL` | Neon-Adresse aus Schritt 2 |
| `HANGAR_AUTH` | `on` |
| `HANGAR_SIGNUP` | `off` (niemand außer dir kann ein Konto anlegen) |
| `BETTER_AUTH_SECRET` | langer Zufallswert, siehe unten |
| optional `PLANESPOTTERS_CONTACT`, `SERPER_API_KEY` | wie in `.env.local` |

   Zufallswert erzeugen (PowerShell): `[Convert]::ToBase64String((1..32 | % { Get-Random -Max 256 }))`

3. **Deploy**. Nach 2–3 Minuten zeigt Vercel die Adresse, z. B. `https://hangar-xyz.vercel.app`.
4. **Storage → Create → Blob** → Name `hangar-photos`, Zugriff **Private**, Region **Frankfurt** → mit dem Projekt verbinden. Vercel setzt `BLOB_READ_WRITE_TOKEN` dabei selbst. Den Wert unter **Settings → Environment Variables** kopieren, er wird für Schritt 4 gebraucht.
5. **Settings → Environment Variables** → `BETTER_AUTH_URL` = die Adresse aus 3. (mit `https://`, ohne `/` am Ende).
6. **Settings → Functions → Function Region** → **Frankfurt (fra1)**.
7. **Deployments** → oberster Eintrag **⋯ → Redeploy**, damit alles greift.

Die Fotos bleiben privat: Nur der Server kann sie lesen, und die App liefert sie erst nach der Besitzerprüfung aus.

## 4. Bestehende Sammlung umziehen

Kopiert alle Modelle, Wertverläufe, Fotos und Einstellungen vom PC in die Cloud und legt deinen Login an. Die lokalen Daten bleiben unverändert erhalten.

1. **Hangar.exe und `npm run dev` beenden** (die lokale Datenbank erlaubt nur ein Programm gleichzeitig).
2. PowerShell in `D:\hangar`:

```powershell
$env:TARGET_DATABASE_URL   = "postgresql://…-pooler…/neondb?sslmode=require"
$env:BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_…"
$env:OWNER_EMAIL           = "deine@email.de"
$env:OWNER_PASSWORD        = "ein-gutes-passwort"
npx tsx scripts/migrate-to-cloud.ts
```

Am Ende steht `✔ Done.` und eine Tabelle, was kopiert wurde. Bricht etwas ab, einfach mit `--force` am Ende erneut starten: Vorhandenes wird übersprungen.

Danach die Vercel-Adresse öffnen und mit E-Mail und Passwort anmelden.

## 5. Aufs Handy

- **iPhone (Safari):** Adresse öffnen → anmelden → Teilen-Symbol → **Zum Home-Bildschirm**.
- **Android (Chrome):** Adresse öffnen → anmelden → Menü ⋮ → **App installieren**.

Hangar startet dann im Vollbild wie eine App. Langes Drücken auf das Symbol (Android) bietet „Add Aircraft“ direkt an.

**Offline:** Die App speichert den zuletzt geladenen Stand auf dem Gerät. Ohne Netz kannst du die Sammlung ansehen und durchsuchen. Ändern geht erst wieder mit Verbindung, ein Hinweis oben zeigt das an.

**Barcode:** Im Hinzufügen-Dialog und in der Sammlungssuche gibt es ein Scan-Symbol. Kennt Hangar den Barcode schon, kommt sofort die Duplikat-Meldung. Sonst öffnet sich das Formular mit der eingetragenen Nummer. Die Kamera funktioniert nur über `https://`.

## Updates

Änderungen am Code: `git add . ; git commit -m "…" ; git push`. Vercel baut und veröffentlicht automatisch, Datenbank-Änderungen laufen beim Start von selbst. Die Handy-App holt sich die neue Version beim nächsten Öffnen.

## Lokal weiterarbeiten?

Hangar.exe und `npm run dev` nutzen weiter die **lokale** Datenbank. Das ist ab jetzt eine getrennte Kopie. Arbeite nach dem Umzug nur noch mit der Online-Version, sonst laufen die Daten auseinander.
