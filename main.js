"use strict";

const utils = require("@iobroker/adapter-core");
const axios = require("axios");

const BASE_URL = "https://api.my-pv.com/api/v1";

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

    // ─── Lifecycle ────────────────────────────────────────────────────────────

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

        // Schreibbaren State abonnieren
        this.subscribeStates(`${this._sn}.control.*`);

        // Firmware-Kompatibilität einmalig prüfen
        const compatible = await this._checkFirmwareCompatible();
        if (!compatible) {
            this.log.error("Firmware ist nicht kompatibel mit der my-PV API. Bitte Gerät aktualisieren.");
            return;
        }

        // Sofortiger erster Abruf
        await this.fetchAll();

        // Polling-Timer starten
        const intervalMs = Math.max(10, parseInt(pollInterval, 10) || 60) * 1000;
        this._pollTimer = setInterval(() => this.fetchAll(), intervalMs);
    }

    onUnload(callback) {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        this.setState("info.connection", false, true);
        callback();
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return;
        const sn = this._sn;
        if (!sn) return;

        // power.setPower → POST /device/{sn}/power
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

    // ─── API helpers ──────────────────────────────────────────────────────────

    async _get(path) {
        const response = await this._api.get(path);
        return response.data;
    }

    async _post(path, body) {
        const response = await this._api.post(path, body);
        return response.data;
    }

    // ─── Endpoints ────────────────────────────────────────────────────────────

    /** GET /api/v1/device/{serial}/isFirmwareCompatible */
    async _checkFirmwareCompatible() {
        try {
            const data = await this._get(`/device/${this._sn}/isFirmwareCompatible`);
            this.log.debug(`isFirmwareCompatible: ${JSON.stringify(data)}`);
            const compatible = data?.isFirmwareCompatible !== "false" && data?.isFirmwareCompatible !== false;
            return compatible;
        } catch (err) {
            this.log.warn(`Firmware-Check fehlgeschlagen (${err.message}) – fahre fort.`);
            return true; // im Zweifel weiter versuchen
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

    /** GET /api/v1/device/{serial}/data – Hauptendpoint für alle Gerätedaten */
    async _fetchData(sn) {
        const data = await this._get(`/device/${sn}/data`);
        this.log.debug(`data: ${JSON.stringify(data)}`);
        await this._ensureChannel(`${sn}.data`, "Gerätedaten");
        await this._writeStatesFromObject(sn, "data", data);
    }

    /** Weitere Endpoints – Fehler werden einzeln abgefangen */
    async _fetchExtras(sn) {
        // isOnline
        await this._fetchSimple(sn, "isOnline", "Gerät online", "boolean", "indicator.connected");

        // isPowerControlPossible
        await this._fetchSimple(sn, "isPowerControlPossible", "Power Control möglich", "boolean", "indicator");

        // data/soc
        try {
            const data = await this._get(`/device/${sn}/data/soc`);
            const val = typeof data === "number" ? data : data?.soc ?? data?.value ?? null;
            if (val !== null) {
                await this._ensureChannel(`${sn}.data`, "Gerätedaten");
                await this._ensureState(`${sn}.data.soc`, {
                    name: "State of Charge", type: "number",
                    role: "value.battery", unit: "%", read: true, write: false,
                });
                this.setState(`${sn}.data.soc`, { val, ack: true });
            }
        } catch (err) {
            this.log.debug(`data/soc: ${err.message}`);
        }

        // solarForecast
        try {
            const data = await this._get(`/device/${sn}/solarForecast`);
            await this._ensureChannel(`${sn}.solarForecast`, "Solar-Prognose");
            await this._writeStatesFromObject(sn, "solarForecast", data);
        } catch (err) {
            this.log.debug(`solarForecast: ${err.message}`);
        }

        // Control-Channel mit schreibbarem setPower anlegen
        await this._ensureChannel(`${sn}.control`, "Steuerung");
        await this._ensureState(`${sn}.control.setPower`, {
            name: "Leistungsvorgabe (W)",
            type: "number", role: "value.power",
            unit: "W", read: true, write: true, def: 0,
        });
        await this._ensureState(`${sn}.control.validForMinutes`, {
            name: "Gültigkeitsdauer (Minuten)",
            type: "number", role: "value",
            unit: "min", read: true, write: true, def: 10,
        });
    }

    async _fetchSimple(sn, endpoint, name, type, role) {
        try {
            const data = await this._get(`/device/${sn}/${endpoint}`);
            let val;
            if (type === "boolean") {
                val = data === true || data?.[endpoint] === true || data?.value === true;
            } else {
                val = typeof data === type ? data : data?.[endpoint] ?? data?.value ?? null;
            }
            if (val !== null) {
                await this._ensureState(`${sn}.${endpoint}`, { name, type, role, read: true, write: false });
                this.setState(`${sn}.${endpoint}`, { val, ack: true });
            }
        } catch (err) {
            this.log.debug(`${endpoint}: ${err.message}`);
        }
    }

    // ─── State helpers ────────────────────────────────────────────────────────

    async _ensureChannel(id, name) {
        await this.setObjectNotExistsAsync(id, {
            type: "channel", common: { name }, native: {},
        });
    }

    async _ensureState(id, common) {
        await this.setObjectNotExistsAsync(id, {
            type: "state", common: { ...common }, native: {},
        });
    }

    async _writeStatesFromObject(sn, channel, data) {
        if (typeof data !== "object" || data === null) return;

        for (const [key, value] of Object.entries(data)) {
            if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                await this._ensureChannel(`${sn}.${channel}.${key}`, key);
                await this._writeStatesFromObject(sn, `${channel}.${key}`, value);
                continue;
            }

            const stateId = `${sn}.${channel}.${key}`;
            const type = typeof value === "number" ? "number"
                       : typeof value === "boolean" ? "boolean"
                       : "string";

            await this._ensureState(stateId, {
                name: key, type,
                role: this._guessRole(key, type),
                unit: this._guessUnit(key),
                read: true, write: false,
            });

            const val = Array.isArray(value) ? JSON.stringify(value)
                      : type === "string" && typeof value !== "string" ? JSON.stringify(value)
                      : value;

            this.setState(stateId, { val, ack: true });
        }
    }

    _guessRole(key, type) {
        const k = key.toLowerCase();
        if (k.includes("temp")) return "value.temperature";
        if (k.includes("power") || k.includes("watt")) return "value.power";
        if (k.includes("energy") || k.includes("kwh")) return "value.energy";
        if (k.includes("voltage") || k.includes("volt")) return "value.voltage";
        if (k.includes("current") || k.includes("ampere")) return "value.current";
        if (k.includes("soc") || k.includes("percent")) return "value.battery";
        if (k.includes("freq")) return "value.frequency";
        if (k.includes("status") || k.includes("mode") || k.includes("state") || k.includes("ctrl")) return "text";
        if (k.includes("error") || k.includes("fault") || k.includes("alarm")) return "indicator.alarm";
        if (k.includes("online") || k.includes("connected")) return "indicator.connected";
        if (type === "boolean") return "indicator";
        if (type === "number") return "value";
        return "text";
    }

    _guessUnit(key) {
        const k = key.toLowerCase();
        if (k.includes("temp")) return "°C";
        if (k.includes("power") || k.includes("watt")) return "W";
        if (k.includes("energy") || k.includes("kwh")) return "kWh";
        if (k.includes("voltage") || k.includes("volt")) return "V";
        if (k.includes("current") || k.includes("ampere")) return "A";
        if (k.includes("soc") || k.includes("percent")) return "%";
        if (k.includes("freq")) return "Hz";
        return "";
    }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

if (require.main !== module) {
    module.exports = (options) => new MyPvAdapter(options);
} else {
    new MyPvAdapter();
}
