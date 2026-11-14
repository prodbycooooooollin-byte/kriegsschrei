# Kriegsschrei

Facecam-Filter für Streamer. Sobald du laut wirst, schießen dir Laser aus den Augen, hinter dir baut sich ein Schlachtfeld auf, deine Nase wächst, und ein selbst gemalter Bart erscheint. Bei vollem Rage rollt ein Panzer rein.

## Download

**[Kriegsschrei-Setup herunterladen](../../releases/latest)** (Windows). Doppelklick installiert und startet die App in Sekunden, ohne Admin-Rechte. Danach aktualisiert sich Kriegsschrei von selbst.

Windows zeigt eventuell „Der Computer wurde durch Windows geschützt“, weil das Setup nicht signiert ist. Dann auf **Weitere Informationen → Trotzdem ausführen** klicken.

## Rage-Stufen

1. **Laser** aus den Augen, sobald du laut wirst
2. **Nase wächst**, wenn du länger ragest. Look und gemalter Bart erscheinen.
3. **Kopf klappt auf**, eine Sirene fährt raus, und das Schlachtfeld baut sich auf. Der Helm fliegt weg.

Ab wann welche Stufe kommt, ist im Tab Effekte einstellbar.

## Features

- **Laser-Augen** mit Einschlägen: Feuerball, Schockwellen, Funken, flüssiges Metall, Brandflecken, Blitze. Farbe, Dicke und Stärke einstellbar.
- **Schlachtfeld** im Hintergrund, das sich mit dem Rage aufbaut. Du wirst automatisch freigestellt, ein Greenscreen ist nicht nötig.
- **Wachsende Nase** beim Rage
- **Bart und Haare malen:** direkt auf dein Gesicht, mit Haar-Pinsel und Vorlagen. Die Zeichnung klebt am Gesicht und erscheint beim Rage.
- **Veteranen-Look:** Helm, Dreck, Orden und ein Abzeichen mit eigenem Text
- **Kamera drehen** (nur dein Bild, Hintergrund und Laser bleiben gerade), dazu Zoom, Position und Bildregler
- **Mikrofon:** automatische Kalibrierung, Schwelle, Rauschsperre, Reaktions- und Abklingzeit
- Synthetisierte Sounds: Schüsse, MG-Salven, Explosionen, Panzer, Laser

## In OBS einbauen

1. In OBS: **Werkzeuge → WebSocket-Servereinstellungen → „WebSocket-Server aktivieren“**
2. In Kriegsschrei: **Start → „Automatisch zu OBS hinzufügen“**

Fertig. Kriegsschrei legt die Quellen „Kriegsschrei Cam“ und „Kriegsschrei Sound“ in deiner aktuellen Szene an. Das Fenster kannst du schließen, dann läuft Kriegsschrei im Infobereich weiter.

Wichtig: Deine alte Kamera-Quelle in OBS ausblenden, sonst ist die Kamera besetzt.

Von Hand geht es auch: Browser-Quelle mit `http://127.0.0.1:7777/obs`.

## Selbst bauen

```bash
npm install
npm run dist
```

Das Setup landet in `dist/`. Für ein Update `version` in `package.json` erhöhen und `Kriegsschrei-Setup-x.y.z.exe`, `.blockmap` und `latest.yml` an ein GitHub-Release hängen, dann holen sich installierte Apps die neue Version automatisch. Gesichtserkennung und Freistellung laufen über [MediaPipe](https://github.com/google-ai-edge/mediapipe), komplett offline.
