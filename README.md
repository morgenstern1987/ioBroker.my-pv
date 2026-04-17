# ioBroker Adapter: my-PV Cloud

<p align="center">
  <img src="admin/my-pv.png" width="120" alt="my-PV Logo" />
</p>

<p align="center">
  <a href="https://github.com/morgenstern1987/ioBroker.my-pv/releases"><img src="https://img.shields.io/github/v/release/morgenstern1987/ioBroker.my-pv" alt="Release" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js" />
</p>

Verbindet ioBroker mit der **my-PV Cloud API** und stellt alle Gerätedaten als ioBroker-Datenpunkte bereit. Unterstützt werden alle IoT-fähigen my-PV Geräte:

| Gerät | Unterstützt |
|-------|------------|
| AC ELWA 2 | ✓ |
| AC·THOR | ✓ |
| AC·THOR 9s | ✓ |
| SOL·THOR | geplant |

---

## Voraussetzungen

1. **my-PV Cloud Account** – kostenlose Registrierung unter [my-pv.com](https://www.my-pv.com)
2. **API-Token** – in den erweiterten Einstellungen der my-PV Cloud generieren
   > Die Aktivierung des Tokens kann bis zu 10 Minuten dauern.
3. **Seriennummer** des Geräts (steht auf dem Gerät und im Cloud-Dashboard)
4. **Firmware-Update** – das Gerät muss mit einer API-kompatiblen Firmware laufen

---

## Installation

Im ioBroker Admin unter **Adapter → Eigene URL** folgende Adresse eingeben:

```
https://github.com/morgenstern1987/ioBroker.my-pv
```

---

## Konfiguration

| Feld | Beschreibung |
|------|-------------|
| **API-Token** | Token aus den erweiterten Einstellungen der my-PV Cloud |
| **Seriennummer** | Seriennummer des Geräts (z.B. `2001001234567890`) |
| **Abfrageintervall** | Polling-Intervall in Sekunden (min. 10, Standard: 60) |
| **Leistungsvorgabe gültig für** | Wie lange eine gesetzte Leistung gilt (Standard: 10 Minuten) |

---

## Datenpunkte

### Verbindung

| Datenpunkt | Beschreibung |
|-----------|-------------|
| `info.connection` | Verbindungsstatus zur my-PV Cloud |
| `<sn>.isOnline` | Gerät online/offline |
| `<sn>.isPowerControlPossible` | Leistungsregelung möglich |

### Leistung (`<sn>.data`)

| Datenpunkt | Beschreibung | Einheit |
|-----------|-------------|---------|
| `power` | Aktuelle Leistung | W |
| `power_nominal` | Nominalleistung (Typenschild) | W |
| `power_max` | Max. steuerbare Leistung inkl. Slaves | W |
| `power_solar` | Solaranteil | W |
| `power_grid` | Netzanteil | W |
| `power_system` | Gesamtleistung inkl. Sekundärregler | W |
| `surplus` | Überschuss (Meter + Batterieladeleistung) | W |

### Temperaturen (`<sn>.data`)

| Datenpunkt | Beschreibung | Einheit |
|-----------|-------------|---------|
| `temp1` | Wassertemperatur | °C |
| `temp2` – `temp4` | Weitere Temperaturfühler | °C |
| `temp_ps` | Temperatur Leistungsteil | °C |

> Rohwerte aus der API (0.1 °C) werden automatisch umgerechnet.

### Gerätestatus (`<sn>.data`)

| Datenpunkt | Beschreibung | Werte |
|-----------|-------------|-------|
| `screen_mode_flag` | Betriebszustand | 0=Standby, 1=Heizen, 2=Heizen Sicherstellung, 3=Heizen beendet, 4=Deaktiviert, 5=Fehler, 6=Sperrzeit |
| `ctrlstate` | Status Ansteuerung | z.B. `Cloud Control P=500` |
| `error_state` | Fehlerbits | |
| `warnings` | Warnungsbits | |

### Messwerte Haus (`<sn>.data`)

| Datenpunkt | Beschreibung | Einheit |
|-----------|-------------|---------|
| `m0sum` | Hausanschluss Gesamt | W |
| `m1sum` | Photovoltaik Gesamt | W |
| `m2sum` | Batteriespeicher Gesamt | W |
| `m2soc` | Batteriespeicher SoC | % |
| `m3sum` | Ladestation Gesamt | W |
| `m4sum` | Wärmepumpe Gesamt | W |

### Steuerung (`<sn>.control`) – schreibbar

| Datenpunkt | Beschreibung | Einheit |
|-----------|-------------|---------|
| `setPower` | Leistungsvorgabe setzen | W |

---

## Leistung steuern

Den Datenpunkt `<sn>.control.setPower` auf den gewünschten Wert in Watt setzen. Der Adapter sendet automatisch einen `POST`-Request an die my-PV API mit der konfigurierten Gültigkeitsdauer.

**Beispiel via Blockly / JavaScript:**
```js
setState('my-pv.0.2001001234567890.control.setPower', 3000);
```

---

## Technische Details

- **API-Basis-URL:** `https://api.my-pv.com/api/v1`
- **Authentifizierung:** Bearer Token im Authorization-Header
- **Betriebsmodus:** Daemon (dauerhaft laufend, internes Polling)
- **Alle Temperaturen** werden von 0.1 °C auf °C umgerechnet
- **Alle Ströme** werden von 0.1 A auf A umgerechnet
- **Netzfrequenz** wird von mHz auf Hz umgerechnet

---

## Changelog

### 1.0.0
- Erstes stabiles Release
- Vollständige API-Unterstützung (`/data`, `/isOnline`, `/isPowerControlPossible`, `/solarForecast`, `/isFirmwareCompatible`)
- Alle ~150 Gerätefelder mit deutschen Namen, Einheiten und ioBroker-Rollen
- Automatische Einheitenumrechnung (Temperatur, Strom, Frequenz)
- Statusfelder mit Klartextzuordnung (`screen_mode_flag`, `cur_eth_mode`, `load_state`)
- Leistungsregelung via `control.setPower`
- Firmware-Kompatibilitätsprüfung beim Start

---


