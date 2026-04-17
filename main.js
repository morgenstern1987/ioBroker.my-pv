"use strict";

const utils = require("@iobroker/adapter-core");
const axios = require("axios");

const BASE_URL = "https://api.my-pv.com/api/v1";

// Vollständige Felddefinitionen aus der my-PV API Dokumentation
const FIELD_DEFINITIONS = {
    // Leistung
    power:              { name: "Leistung",                                  unit: "W",   role: "value.power",       type: "number" },
    power_act:          { name: "Leistung AC THOR",                          unit: "W",   role: "value.power",       type: "number" },
    power_ac9:          { name: "Leistung AC THOR 9s",                       unit: "W",   role: "value.power",       type: "number" },
    power_elwa2:        { name: "Leistung ELWA 2",                           unit: "W",   role: "value.power",       type: "number" },
    power_max:          { name: "Max. steuerbare Leistung (inkl. Slaves)",   unit: "W",   role: "value.power",       type: "number" },
    power_nominal:      { name: "Nominalleistung (Typenschild)",             unit: "W",   role: "value.power",       type: "number" },
    power_system:       { name: "Gesamtleistung inkl. Sekundärregler",       unit: "W",   role: "value.power",       type: "number" },
    power_solar:        { name: "Solaranteil",                               unit: "W",   role: "value.power",       type: "number" },
    power_grid:         { name: "Netzanteil",                                unit: "W",   role: "value.power",       type: "number" },
    power_solar_act:    { name: "Solaranteil AC THOR",                       unit: "W",   role: "value.power",       type: "number" },
    power_grid_act:     { name: "Netzanteil AC THOR",                        unit: "W",   role: "value.power",       type: "number" },
    power_solar_ac9:    { name: "Solaranteil AC THOR 9s",                    unit: "W",   role: "value.power",       type: "number" },
    power_grid_ac9:     { name: "Netzanteil AC THOR 9s",                     unit: "W",   role: "value.power",       type: "number" },
    power1_solar:       { name: "Ausgang 1 Solaranteil",                     unit: "W",   role: "value.power",       type: "number" },
    power1_grid:        { name: "Ausgang 1 Netzanteil",                      unit: "W",   role: "value.power",       type: "number" },
    power2_solar:       { name: "Ausgang 2 Solaranteil",                     unit: "W",   role: "value.power",       type: "number" },
    power2_grid:        { name: "Ausgang 2 Netzanteil",                      unit: "W",   role: "value.power",       type: "number" },
    power3_solar:       { name: "Ausgang 3 Solaranteil",                     unit: "W",   role: "value.power",       type: "number" },
    power3_grid:        { name: "Ausgang 3 Netzanteil",                      unit: "W",   role: "value.power",       type: "number" },
    surplus:            { name: "Überschuss (Meter + Batterieladeleistung)", unit: "W",   role: "value.power",       type: "number" },
    load_nom:           { name: "Nominelle Leistung (ohne EV, WP)",          unit: "W",   role: "value.power",       type: "number" },

    // Temperaturen (Rohwert in 0.1°C)
    temp1:              { name: "Temperatur 1 (Wassertemperatur)",           unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    temp2:              { name: "Temperatur 2",                              unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    temp3:              { name: "Temperatur 3",                              unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    temp4:              { name: "Temperatur 4",                              unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    temp_ps:            { name: "Temperatur Leistungsteil",                  unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    tempInt1:           { name: "Interne Temperatur 1",                      unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    tempInt2:           { name: "Interne Temperatur 2",                      unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    tempInt3:           { name: "Interne Temperatur 3",                      unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },

    // Spannungen
    volt_mains:         { name: "Eingangsspannung L1",                       unit: "V",   role: "value.voltage",     type: "number" },
    volt_L2:            { name: "Eingangsspannung L2",                       unit: "V",   role: "value.voltage",     type: "number" },
    volt_L3:            { name: "Eingangsspannung L3",                       unit: "V",   role: "value.voltage",     type: "number" },
    volt_out:           { name: "Ausgangsspannung Leistungsteil",            unit: "V",   role: "value.voltage",     type: "number" },
    volt_aux:           { name: "Spannung L2 an AUX-Relais",                 unit: "V",   role: "value.voltage",     type: "number" },
    volt_bat:           { name: "Batteriespannung",                          unit: "mV",  role: "value.voltage",     type: "number" },
    volt_solar:         { name: "PV-Spannung",                               unit: "mV",  role: "value.voltage",     type: "number" },

    // Ströme (Rohwert in 0.1A)
    curr_mains:         { name: "Netzstrom L1",                              unit: "A",   role: "value.current",     type: "number", factor: 0.1 },
    curr_L2:            { name: "Netzstrom L2",                              unit: "A",   role: "value.current",     type: "number", factor: 0.1 },
    curr_L3:            { name: "Netzstrom L3",                              unit: "A",   role: "value.current",     type: "number", factor: 0.1 },

    // Frequenz (Rohwert in mHz)
    freq:               { name: "Netzfrequenz",                              unit: "Hz",  role: "value.frequency",   type: "number", factor: 0.001 },

    // Hausanschluss / Meter
    m0sum:              { name: "Hausanschluss Gesamt",                      unit: "W",   role: "value.power",       type: "number" },
    m0l1:               { name: "Hausanschluss L1",                          unit: "W",   role: "value.power",       type: "number" },
    m0l2:               { name: "Hausanschluss L2",                          unit: "W",   role: "value.power",       type: "number" },
    m0l3:               { name: "Hausanschluss L3",                          unit: "W",   role: "value.power",       type: "number" },
    m0bat:              { name: "Batteriespeicher",                          unit: "W",   role: "value.power",       type: "number" },

    // Photovoltaik
    m1sum:              { name: "Photovoltaik Gesamt",                       unit: "W",   role: "value.power",       type: "number" },
    m1l1:               { name: "Photovoltaik L1",                           unit: "W",   role: "value.power",       type: "number" },
    m1l2:               { name: "Photovoltaik L2",                           unit: "W",   role: "value.power",       type: "number" },
    m1l3:               { name: "Photovoltaik L3",                           unit: "W",   role: "value.power",       type: "number" },
    m1devstate:         { name: "PV Kommunikationsstatus",                   unit: "",    role: "value",             type: "number" },

    // Batteriespeicher
    m2sum:              { name: "Batteriespeicher Gesamt",                   unit: "W",   role: "value.power",       type: "number" },
    m2l1:               { name: "Batteriespeicher L1",                       unit: "W",   role: "value.power",       type: "number" },
    m2l2:               { name: "Batteriespeicher L2",                       unit: "W",   role: "value.power",       type: "number" },
    m2l3:               { name: "Batteriespeicher L3",                       unit: "W",   role: "value.power",       type: "number" },
    m2soc:              { name: "Batteriespeicher SoC",                      unit: "%",   role: "value.battery",     type: "number" },
    m2state:            { name: "Batterie Status",                           unit: "",    role: "value",             type: "number" },
    m2devstate:         { name: "Batteriespeicher Kommunikationsstatus",     unit: "",    role: "value",             type: "number" },

    // Ladestation
    m3sum:              { name: "Ladestation Gesamt",                        unit: "W",   role: "value.power",       type: "number" },
    m3l1:               { name: "Ladestation L1",                            unit: "W",   role: "value.power",       type: "number" },
    m3l2:               { name: "Ladestation L2",                            unit: "W",   role: "value.power",       type: "number" },
    m3l3:               { name: "Ladestation L3",                            unit: "W",   role: "value.power",       type: "number" },
    m3soc:              { name: "Ladestation SoC",                           unit: "%",   role: "value.battery",     type: "number" },
    m3devstate:         { name: "Ladestation Kommunikationsstatus",          unit: "",    role: "value",             type: "number" },

    // Wärmepumpe
    m4sum:              { name: "Wärmepumpe Gesamt",                         unit: "W",   role: "value.power",       type: "number" },
    m4l1:               { name: "Wärmepumpe L1",                             unit: "W",   role: "value.power",       type: "number" },
    m4l2:               { name: "Wärmepumpe L2",                             unit: "W",   role: "value.power",       type: "number" },
    m4l3:               { name: "Wärmepumpe L3",                             unit: "W",   role: "value.power",       type: "number" },
    m4devstate:         { name: "Wärmepumpe Kommunikationsstatus",           unit: "",    role: "value",             type: "number" },

    // Gerätestatus
    screen_mode_flag:   { name: "Gerätestatus",                              unit: "",    role: "value",             type: "number",
                          states: { 0: "Standby", 1: "Heizen", 2: "Heizen Sicherstellung", 3: "Heizen beendet", 4: "Keine Verbindung/Deaktiviert", 5: "Fehler", 6: "Sperrzeit aktiv" } },
    ctrlstate:          { name: "Status Ansteuerung",                        unit: "",    role: "text",              type: "string" },
    cloudstate:         { name: "Cloud Status",                              unit: "",    role: "value",             type: "number" },
    ps_state:           { name: "Status Leistungsteil",                      unit: "",    role: "value",             type: "number" },
    "9s_state":         { name: "Status Leistungsteil 9s",                   unit: "",    role: "value",             type: "number" },
    error_state:        { name: "Fehlerbits",                                unit: "",    role: "indicator.alarm",   type: "number" },
    ctrl_errors:        { name: "Fehlerbits Steuerung",                      unit: "",    role: "indicator.alarm",   type: "number" },
    warnings:           { name: "Warnungsbits",                              unit: "",    role: "indicator.alarm",   type: "number" },
    blockactive:        { name: "Block Status",                              unit: "",    role: "indicator",         type: "number" },
    boostactive:        { name: "WW-Sicherstellung aktiv",                   unit: "",    role: "indicator",         type: "number" },
    schicht_flag:       { name: "Schichtladung Status",                      unit: "",    role: "indicator",         type: "number" },
    act_night_flag:     { name: "Tag/Nacht",                                 unit: "",    role: "indicator",         type: "number" },
    wp_flag:            { name: "Wärmepumpe Status",                         unit: "",    role: "indicator",         type: "number" },
    ecarstate:          { name: "E-Auto Status",                             unit: "",    role: "value",             type: "mixed" },
    load_state:         { name: "Last angeschlossen",                        unit: "",    role: "indicator",         type: "number",
                          states: { 0: "Keine Last", 1: "Verbunden" } },

    // Geräteinformationen
    device:             { name: "Gerätetyp",                                 unit: "",    role: "text",              type: "string" },
    acthor9s:           { name: "Gerät (1=AC THOR, 2=AC THOR 9s)",          unit: "",    role: "value",             type: "number" },
    fwversion:          { name: "Firmware Version",                          unit: "",    role: "text",              type: "string" },
    fwversionlatest:    { name: "Neueste Firmware",                          unit: "",    role: "text",              type: "string" },
    coversion:          { name: "Co-Controller Version",                     unit: "",    role: "text",              type: "string" },
    coversionlatest:    { name: "Neueste Co-Controller FW",                  unit: "",    role: "text",              type: "string" },
    psversion:          { name: "Leistungsteil Version",                     unit: "",    role: "text",              type: "string" },
    psversionlatest:    { name: "Neueste Leistungsteil FW",                  unit: "",    role: "text",              type: "string" },
    p9sversion:         { name: "Leistungsteil 9s Version",                  unit: "",    role: "text",              type: "string" },
    p9sversionlatest:   { name: "Neueste Leistungsteil 9s FW",               unit: "",    role: "text",              type: "string" },

    // Netzwerk
    cur_ip:             { name: "IP-Adresse",                                unit: "",    role: "text",              type: "string" },
    cur_gw:             { name: "Gateway",                                   unit: "",    role: "text",              type: "string" },
    cur_dns:            { name: "DNS-Server",                                unit: "",    role: "text",              type: "string" },
    cur_sn:             { name: "Subnetzmaske",                              unit: "",    role: "text",              type: "string" },
    cur_eth_mode:       { name: "Ethernet-Modus",                            unit: "",    role: "value",             type: "number",
                          states: { 0: "LAN", 1: "WLAN", 2: "AP" } },
    wifi_signal:        { name: "WLAN-Signalstärke",                         unit: "",    role: "value",             type: "number" },
    wifi_signal_strength:{ name: "WLAN-Signalstärke",                        unit: "dBm", role: "value",             type: "number" },
    meter_ss:           { name: "WiFi Meter Signalstärke",                   unit: "%",   role: "value",             type: "number" },
    meter_ssid:         { name: "WiFi Meter SSID",                           unit: "",    role: "text",              type: "string" },

    // Zeit
    date:               { name: "Datum",                                     unit: "",    role: "text",              type: "string" },
    loctime:            { name: "Uhrzeit",                                   unit: "",    role: "text",              type: "string" },
    unixtime:           { name: "Unix-Zeit",                                 unit: "",    role: "value.time",        type: "number" },
    uptime:             { name: "Uptime",                                    unit: "h",   role: "value",             type: "number" },
    uptime_s:           { name: "Uptime",                                    unit: "s",   role: "value",             type: "number" },

    // Sonstiges
    fan_speed:          { name: "Lüfter Stufe",                              unit: "",    role: "value",             type: "number" },
    pump_pwm:           { name: "Pumpe PWM",                                 unit: "",    role: "value",             type: "number" },
    ecarboostctr:       { name: "E-Auto Boostzeit",                          unit: "min", role: "value",             type: "number" },
    legboostnext:       { name: "Nächster Legionellen-Boost",                unit: "Tage",role: "value",             type: "mixed" },
    upd_state:          { name: "Update Status",                             unit: "",    role: "value",             type: "number" },
    upd_percentage:     { name: "Update Fortschritt",                        unit: "%",   role: "value",             type: "number" },
    rel1_out:           { name: "Relais Status",                             unit: "",    role: "indicator",         type: "number" },
    rel_selv:           { name: "SELV Relais Status",                        unit: "",    role: "indicator",         type: "number" },
    relay_alarm:        { name: "Relais Alarm",                              unit: "",    role: "indicator.alarm",   type: "number" },
    relay_boost:        { name: "Relais Boost",                              unit: "",    role: "indicator",         type: "number" },
};

class MyPvAdapter extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: "my-pv" });

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));

        this._pollTimer = null;
        this._sn = null;
        this._api = null;
    }

    async onReady() {
        this.setState("info.connection", false, true);

        const { apiToken, serialNumber, pollInterval } = this.config;

        if (!apiToken || !serialNumber) {
            this.log.warn("API-Token oder Seriennummer fehlt – bitte in den Adaptereinstellungen eintragen.");
            return;
        }

        this._sn = serialNumber.trim();

        this._api = axios.create({
            baseURL: BASE_URL,
            headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout: 10000,
        });

        this.subscribeStates(`${this._sn}.control.*`);

        const compatible = await this._checkFirmwareCompatible();
        if (!compatible) {
            this.log.error("Firmware nicht kompatibel – bitte Gerät aktualisieren.");
            return;
        }

        await this.fetchAll();

        const intervalMs = Math.max(10, parseInt(pollInterval, 10) || 60) * 1000;
        this._pollTimer = setInterval(() => this.fetchAll(), intervalMs);
    }

    onUnload(callback) {
        if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
        this.setState("info.connection", false, true);
        callback();
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return;
        const sn = this._sn;
        if (!sn) return;

        if (id === `${this.namespace}.${sn}.control.setPower`) {
            try {
                const power = parseInt(state.val, 10) || 0;
                await this._post(`/device/${sn}/power`, {
                    power,
                    validForMinutes: this.config.validForMinutes || 10,
                    timeBoostOverride: 0,
                    timeBoostValue: 0,
                    legionellaBoostBlock: 1,
                });
                this.setState(id, { val: state.val, ack: true });
                this.log.info(`Leistungsvorgabe gesetzt: ${power} W`);
            } catch (err) {
                this.log.error(`Fehler beim Setzen der Leistung: ${err.message}`);
            }
        }
    }

    async _get(path) {
        const r = await this._api.get(path);
        return r.data;
    }

    async _post(path, body) {
        const r = await this._api.post(path, body);
        return r.data;
    }

    async _checkFirmwareCompatible() {
        try {
            const data = await this._get(`/device/${this._sn}/isFirmwareCompatible`);
            return data?.isFirmwareCompatible !== "false" && data?.isFirmwareCompatible !== false;
        } catch (err) {
            this.log.warn(`Firmware-Check fehlgeschlagen (${err.message}) – fahre fort.`);
            return true;
        }
    }

    async fetchAll() {
        const sn = this._sn;
        try {
            await this._fetchData(sn);
            await this._fetchExtras(sn);
            this.setState("info.connection", true, true);
        } catch (err) {
            this.setState("info.connection", false, true);
            this.log.error(`Fehler beim Datenabruf: ${err.message}`);
            if (err.response) {
                this.log.debug(`HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`);
            }
        }
    }

    async _fetchData(sn) {
        const data = await this._get(`/device/${sn}/data`);
        this.log.debug(`data: ${JSON.stringify(data)}`);
        await this._ensureChannel(`${sn}.data`, "Gerätedaten");
        await this._writeStatesFromObject(sn, "data", data);
    }

    async _fetchExtras(sn) {
        // isOnline
        try {
            const data = await this._get(`/device/${sn}/isOnline`);
            const val = data === true || data?.isOnline === true || data?.online === true;
            await this._ensureState(`${sn}.isOnline`, { name: "Gerät online", type: "boolean", role: "indicator.connected", read: true, write: false });
            this.setState(`${sn}.isOnline`, { val, ack: true });
        } catch (err) { this.log.debug(`isOnline: ${err.message}`); }

        // isPowerControlPossible
        try {
            const data = await this._get(`/device/${sn}/isPowerControlPossible`);
            const val = data === true || data?.isPowerControlPossible === true;
            await this._ensureState(`${sn}.isPowerControlPossible`, { name: "Power Control möglich", type: "boolean", role: "indicator", read: true, write: false });
            this.setState(`${sn}.isPowerControlPossible`, { val, ack: true });
        } catch (err) { this.log.debug(`isPowerControlPossible: ${err.message}`); }

        // solarForecast
        try {
            const data = await this._get(`/device/${sn}/solarForecast`);
            await this._ensureChannel(`${sn}.solarForecast`, "Solar-Prognose");
            await this._writeStatesFromObject(sn, "solarForecast", data);
        } catch (err) { this.log.debug(`solarForecast: ${err.message}`); }

        // Control-Channel
        await this._ensureChannel(`${sn}.control`, "Steuerung");
        await this._ensureState(`${sn}.control.setPower`, {
            name: "Leistungsvorgabe setzen", type: "number", role: "value.power",
            unit: "W", read: true, write: true, def: 0,
        });
    }

    async _ensureChannel(id, name) {
        await this.setObjectNotExistsAsync(id, { type: "channel", common: { name }, native: {} });
    }

    async _ensureState(id, common) {
        await this.extendObjectAsync(id, { type: "state", common: { ...common }, native: {} });
    }

    async _writeStatesFromObject(sn, channel, data) {
        if (typeof data !== "object" || data === null) return;

        for (const [key, rawValue] of Object.entries(data)) {
            if (typeof rawValue === "object" && rawValue !== null && !Array.isArray(rawValue)) {
                await this._ensureChannel(`${sn}.${channel}.${key}`, key);
                await this._writeStatesFromObject(sn, `${channel}.${key}`, rawValue);
                continue;
            }

            const stateId = `${sn}.${channel}.${key}`;
            const def = FIELD_DEFINITIONS[key];

            let val = Array.isArray(rawValue) ? JSON.stringify(rawValue) : rawValue;

            // Typ erzwingen falls Definition vorhanden (API liefert manchmal String statt Number)
            if (def?.type === "number" && typeof val === "string") {
                const parsed = parseFloat(val);
                val = isNaN(parsed) ? null : parsed;
            } else if (def?.type === "mixed" && typeof val === "string") {
                const parsed = parseFloat(val);
                if (!isNaN(parsed)) val = parsed;
            } else if (def?.type === "boolean" && typeof val === "string") {
                val = val === "true" || val === "1";
            }

            // Skalierungsfaktor anwenden (z.B. 0.1 für Temp/Strom)
            if (def?.factor && typeof val === "number") {
                val = Math.round(val * def.factor * 10) / 10;
            }

            const common = def ? {
                name:  def.name,
                type:  def.type,
                role:  def.role,
                unit:  def.unit,
                read:  true,
                write: false,
                ...(def.states ? { states: def.states } : {}),
            } : {
                name:  key,
                type:  typeof val === "number" ? "number" : typeof val === "boolean" ? "boolean" : "string",
                role:  "value",
                unit:  "",
                read:  true,
                write: false,
            };

            await this._ensureState(stateId, common);
            this.setState(stateId, { val: val ?? null, ack: true });
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new MyPvAdapter(options);
} else {
    new MyPvAdapter();
}
