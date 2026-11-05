# Der Strommarkt – Day-Ahead-Auktion

Ein synchrones Lehrspiel für eine Lieferstunde und fünf Auktionsrunden. Eine Spielleitung startet jede Runde; Studierende handeln pseudonym, jeweils höchstens 1 MWh pro Runde. Kaufnutzen und Verkaufskosten sind privat, zufällig und bleiben innerhalb einer Sitzung gleich.

## Ablauf

1. Die Spielleitung öffnet ihren persönlichen Leitungslink, erstellt eine Sitzung und teilt den Raumlink.
2. Studierende treten über den Raumlink bei. Mindestens zwei Personen sind nötig; Rollen werden zum Start möglichst gleichmäßig verteilt.
3. Jede Person gibt je Runde ein verdecktes ganzzahliges Gebot in €/MWh ab und darf es bis zum Rundenschluss ändern.
4. Die Spielleitung beendet jede Runde per Klick. Die nächste Runde wird von der Spielleitung gestartet.
5. Nach fünf Runden zeigt das Spiel die Kurven aus privaten Werten und die Kurven der abgegebenen Gebote jeder Runde.

Der Browser speichert einen zufälligen Zugangsschlüssel zur Wiederaufnahme auf demselben Gerät. Die Spielleitung kann über „Sitzung fortsetzen“ eine dort erstellte Sitzung wieder öffnen. Studierende können einen begonnenen Markt nur mit ihrem bereits gespeicherten Schlüssel wieder betreten. Browserdaten nicht während der Sitzung löschen.

## Auktion

Kaufgebote werden absteigend, Verkaufsangebote aufsteigend gereiht. Gleiche Grenzgebote werden durch eine sitzungs- und rundenspezifische zufällige Reihenfolge gerankt. Die Anzahl der Abschlüsse ist das größte `k`, für das das `k`-te Kaufgebot mindestens dem `k`-ten Verkaufsangebot entspricht. Alle erhalten denselben Preis. Sein gültiges Intervall reicht von `max(letztes angenommenes Verkaufsangebot, höchstes abgelehntes Kaufgebot)` bis `min(letztes angenommenes Kaufgebot, niedrigstes abgelehntes Verkaufsangebot)`. Fehlende abgelehnte Gebote werden ausgelassen. Der Preis ist die auf ganze Euro abgerundete Mitte dieses Intervalls. Bei Preisgleichheit kann eine Rationierung per Los nötig sein. Bei keinem überschneidenden Paar gibt es keinen Handel und keinen Preis.

Käufer erhalten `Nutzen − Marktpreis`, Verkäufer `Marktpreis − Kosten`. Ein nicht zustande gekommener Handel gibt null Punkte. Gebote jenseits des eigenen Werts sind möglich und können zu Verlusten führen. Pro MWh entspricht ein Punkt einem Euro der Differenz; die Punkte sind keine echten Zahlungen.

## Eigene Google-Tabelle und Backend

Das statische Frontend braucht ein eigenes, an eine Google-Tabelle gebundenes Apps-Script-Web-App-Deployment. Es verwendet weder das Sheet noch den Endpunkt des Bandit-Spiels.

1. Eine neue Google-Tabelle erstellen, **Erweiterungen → Apps Script** öffnen und `backend/Code.gs` in `Code.gs` einfügen.
2. In den Projekteinstellungen die Manifestdatei einblenden und `backend/appsscript.json` als `appsscript.json` übernehmen. Google verlangt für die Web-App den Google-Tabellen-Zugriff `spreadsheets`: Diese Berechtigung erlaubt dem Script-Konto technisch den Zugriff auf alle seine Google-Tabellen. Der Code öffnet ausschließlich die unter `SPREADSHEET_ID` eingetragene Tabelle.
3. In den Projekteinstellungen unter **Skripteigenschaften** `SPREADSHEET_ID` mit der ID der neuen Tabelle und `INSTRUCTOR_KEY_HASH` mit dem SHA-256-Hash eines zufälligen 48-stelligen Hexadezimal-Schlüssels eintragen. Der persönliche Leitungslink lautet `?leitung=1#key=SCHLÜSSEL`; der Schlüssel darf nicht veröffentlicht werden. Wer ihn kennt, kann Sitzungen erstellen.
4. Als Web-App bereitstellen: **Ausführen als: ich**; **Zugriff: alle, auch ohne Anmeldung**. Der Lehrende muss die von Google angezeigten Rechte ausdrücklich autorisieren. Das Spiel braucht diese Freigabe, damit Studierende ohne Google-Anmeldung Gebote senden können. Die Tabelle selbst bleibt privat.
5. Die erzeugte `/exec`-URL in `config.js` als `window.STROMMARKT_ENDPOINT` eintragen und das Frontend auf einem öffentlich erreichbaren HTTPS-Host bereitstellen, z. B. über GitHub Pages.

Die Tabelle erhält die Blätter `Sitzungen`, `Teilnehmende`, `Gebote`, `Runden` und `Ergebnisse` automatisch beim Anlegen der ersten Sitzung. `Runden` enthält tatsächlichen und maximal möglichen Gesamtnutzen; `Ergebnisse` enthält die Einzelwerte und Punkte. In Google Tabellen kann die Auswertung über **Datei → Herunterladen → Microsoft Excel (.xlsx)** exportiert werden.

Die Spielleitung sollte die Tabelle nicht mit Studierenden teilen: Sie enthält private Werte. Teilnehmer- und Leitungszugänge sind zufällige Browser-Schlüssel und werden serverseitig nur als Hash gespeichert. Der öffentliche Apps-Script-Endpunkt ist für den Unterricht gedacht, hat aber keine zentrale Nutzerverwaltung oder eingebaute Zugriffsratenbegrenzung. Er sollte nicht für vertrauliche personenbezogene Daten oder rechtsverbindliche Transaktionen genutzt werden. Gebote und Zugangsschlüssel laufen bei der Google-Apps-Script-JSONP-Anbindung als URL-Parameter über HTTPS und können in Browser- oder Serverprotokollen erscheinen.

## Lokale Prüfung

Der Testserver verwendet nur eine lokale, flüchtige Nachbildung von Google Tabellen; er schreibt keine Daten in Google. Mit Node.js:

```sh
node test/auction.cjs
node test/server.cjs
```

Danach `http://127.0.0.1:4187/?leitung=1#key=ffffffffffffffffffffffffffffffffffffffffffffffff` öffnen (lokaler Testschlüssel). In der Praxis müssen Spielleitung und Teilnehmende verschiedene Browserprofile bzw. Geräte verwenden, damit sie unterschiedliche Teilnehmer-Schlüssel erhalten. Die Tests prüfen unter anderem Preisintervall, Losreihung, Privatsphäre der Werte und den Ablauf über fünf Runden.
