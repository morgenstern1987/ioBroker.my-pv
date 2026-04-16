# ioBroker.my-pv

Dieser Adapter verbindet ioBroker mit der **my-PV Cloud API** und ermöglicht den Datenabruf für folgende Geräte:

- AC ELWA 2
- AC·THOR
- AC·THOR 9s
- (zukünftig: SOL·THOR)

---

## Voraussetzungen

1. **my-PV Cloud Account** – Registrierung unter [my-pv.com](https://www.my-pv.com)
2. **API-Token generieren** – In den erweiterten Einstellungen der my-PV Cloud
   > Hinweis: Die Aktivierung des Tokens kann bis zu 10 Minuten dauern.
3. **Seriennummer** des Geräts (steht auf dem Gerät und im Cloud-Dashboard)

---

## Installation

1. Adapter in ioBroker über die GitHub-URL installieren:
   ```
   https://github.com/<dein-repo>/ioBroker.my-pv
   ```
2. Instanz anlegen und konfigurieren.

---

## Konfiguration

| Feld | Beschreibung |
|------|-------------|
| **API-Token** | Generierter Token aus der my-PV Cloud |
| **Seriennummer** | Seriennummer des Geräts |
| **Abfrageintervall** | Wie oft Daten abgerufen werden (Sekunden, min. 10) |
| **Gerätestatus abrufen** | Endpoint `/device/{sn}/status` |
| **Leistungsdaten abrufen** | Endpoint `/device/{sn}/power` |

---

## Datenpunkte

Die Datenpunkte werden automatisch aus der API-Antwort erzeugt:

```
my-pv.0
├── info
│   └── connection          ← Verbindungsstatus (true/false)
└── <Seriennummer>
    ├── status
    │   ├── temp_water       ← Wassertemperatur (°C)
    │   ├── mode             ← Betriebsmodus
    │   └── ...
    └── power
        ├── power_act        ← Aktuelle Leistung (W)
        ├── energy_total     ← Gesamtenergie (kWh)
        └── ...
```

---

## API-Dokumentation

Die vollständige API-Dokumentation: [api.my-pv.com/api-docs](https://api.my-pv.com/api-docs)

---

## Lizenz

MIT
