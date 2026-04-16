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
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    async onReady() {
        this.setState("info.connection", false, true);

        const { apiToken, serialNumber, pollInterval } = this.config;

        if (!apiToken || !serialNumber) {
            this.log.warn("API-Token oder Seriennummer fehlt – bitte in den Adaptereinstellungen eintragen.");
            return;
        }

        this._api = axios.create({
            baseURL: BASE_URL,
            headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            timeout: 10000,
        });

        this._sn = serialNumber.trim();

        // Schreibbare States abonnieren
        this.subscribeStates(`${this._sn}.setup.*`);
        this.subscribeStates(`${this._sn}.power.setPower`);

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

        // Setup-Wert schreiben
        if (id.startsWith(`${this.namespace}.${sn}.setup.`)) {
            const key = id.split(".").pop();
            try {
                await this._put(`/device/${sn}/setup`, { [key]: state.val });
                this.setState(id, { val: state.val, ack: true });
                this.log.info(`Setup geschrieben: ${key} = ${state.val}`);
            } catch (err) {
                this.log.error(`Fehler beim Schreiben von Setup (${key}): ${err.message}`);
            }
        }

        // Power Control
        if (id === `${this.namespace}.${sn}.power.setPower`) {
            try {
                await this._put(`/device/${sn}/power`, { power: state.val });
                this.setState(id, { val: state.val, ack: true });
                this.log.info(`Leistungsvorgabe gesetzt: ${state.val} W`);
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

    async _put(path, body) {
        const response = await this._api.put(path, body);
        return response.data;
    }

    async fetchAll() {
        const sn = this._sn;
        try {
            // Online-Status zuerst prüfen
            const online = await this._fetchIsOnline(sn);

            if (online) {
                await Promise.allSettled([
                    this._fetchData(sn),
                    this._fetchPower(sn),
                    this._fetchSoc(sn),
                    this._fetchSolarForecast(sn),
                    this._fetchIsPowerControlPossible(sn),
                ]);
            } else {
                this.log.debug("Gerät ist offline – überspringe Datenabruf.");
            }

            this.setState("info.connection", true, true);
        } catch (err) {
            this.setState("info.connection", false, true);
            this.log.error(`Fehler beim Datenabruf: ${err.message}`);
            if (err.response) {
                this.log.debug(`HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`);
            }
        }
    }

    // ─── Endpoints ────────────────────────────────────────────────────────────

    /** GET /api/v1/device/{serial}/isOnline */
    async _fetchIsOnline(sn) {
        try {
            const data = await this._get(`/device/${sn}/isOnline`);
            const isOnline = data === true || data?.online === true || data?.isOnline === true;
            await this._ensureState(`${sn}.isOnline`, {
                name: "Gerät online",
                type: "boolean",
                role: "indicator.connected",
                read: true, write: false,
            });
            this.setState(`${sn}.isOnline`, { val: isOnline, ack: true });
            return isOnline;
        } catch (err) {
            this.log.debug(`isOnline Fehler: ${err.message}`);
            return true; // Im Zweifel weiter versuchen
        }
    }

    /** GET /api/v1/device/{serial}/data */
    async _fetchData(sn) {
        const data = await this._get(`/device/${sn}/data`);
        this.log.debug(`data: ${JSON.stringify(data)}`);
        await this._ensureChannel(`${sn}.data`, "Gerätedaten");
        await this._writeStatesFromObject(sn, "data", data);
    }

    /** GET /api/v1/device/{serial}/data/soc */
    async _fetchSoc(sn) {
        try {
            const data = await this._get(`/device/${sn}/data/soc`);
            this.log.debug(`soc: ${JSON.stringify(data)}`);
            const val = typeof data === "number" ? data : data?.soc ?? data?.value ?? null;
            if (val !== null) {
                await this._ensureChannel(`${sn}.data`, "Gerätedaten");
                await this._ensureState(`${sn}.data.soc`, {
                    name: "State of Charge",
                    type: "number", role: "value.battery",
                    unit: "%", read: true, write: false,
                });
                this.setState(`${sn}.data.soc`, { val, ack: true });
            }
        } catch (err) {
            this.log.debug(`SOC nicht verfügbar: ${err.message}`);
        }
    }

    /** GET /api/v1/device/{serial}/power */
    async _fetchPower(sn) {
        const data = await this._get(`/device/${sn}/power`);
        this.log.debug(`power: ${JSON.stringify(data)}`);
        await this._ensureChannel(`${sn}.power`, "Leistung");
        await this._writeStatesFromObject(sn, "power", data);

        // Schreibbarer State für Power Control
        await this._ensureState(`${sn}.power.setPower`, {
            name: "Leistungsvorgabe setzen",
            type: "number", role: "value.power",
            unit: "W", read: true, write: true,
        });
    }

    /** GET /api/v1/device/{serial}/isPowerControlPossible */
    async _fetchIsPowerControlPossible(sn) {
        try {
            const data = await this._get(`/device/${sn}/isPowerControlPossible`);
            const val = data === true || data?.possible === true || data?.isPowerControlPossible === true;
            await this._ensureState(`${sn}.isPowerControlPossible`, {
                name: "Power Control möglich",
                type: "boolean", role: "indicator",
                read: true, write: false,
            });
            this.setState(`${sn}.isPowerControlPossible`, { val, ack: true });
        } catch (err) {
            this.log.debug(`isPowerControlPossible Fehler: ${err.message}`);
        }
    }

    /** GET /api/v1/device/{serial}/solarForecast */
    async _fetchSolarForecast(sn) {
        try {
            const data = await this._get(`/device/${sn}/solarForecast`);
            this.log.debug(`solarForecast: ${JSON.stringify(data)}`);
            await this._ensureChannel(`${sn}.solarForecast`, "Solar-Prognose");
            await this._writeStatesFromObject(sn, "solarForecast", data);
        } catch (err) {
            this.log.debug(`solarForecast nicht verfügbar: ${err.message}`);
        }
    }

    // ─── State helpers ────────────────────────────────────────────────────────

    async _ensureChannel(id, name) {
        await this.setObjectNotExistsAsync(id, {
            type: "channel",
            common: { name },
            native: {},
        });
    }

    async _ensureState(id, common) {
        await this.setObjectNotExistsAsync(id, {
            type: "state",
            common: { ...common },
            native: {},
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
                name: key,
                type,
                role: this._guessRole(key, type),
                unit: this._guessUnit(key),
                read: true,
                write: false,
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
        if (k.includes("status") || k.includes("mode") || k.includes("state")) return "text";
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
