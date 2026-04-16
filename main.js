"use strict";

const utils = require("@iobroker/adapter-core");
const axios = require("axios");

const BASE_URL = "https://api.my-pv.com/v1";

class MyPvAdapter extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: "my-pv" });

        this.on("ready", this.onReady.bind(this));
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

    // ─── API helpers ──────────────────────────────────────────────────────────

    async _get(path) {
        const response = await this._api.get(path);
        return response.data;
    }

    async fetchAll() {
        const sn = this.config.serialNumber;
        try {
            if (this.config.fetchDeviceStatus) {
                await this.fetchDeviceStatus(sn);
            }
            if (this.config.fetchPowerData) {
                await this.fetchPowerData(sn);
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

    /**
     * GET /v1/device/{serialnumber}/status
     * Gerätestatus abrufen (Temperatur, Betriebsmodus, …)
     */
    async fetchDeviceStatus(sn) {
        const data = await this._get(`/device/${sn}/status`);
        this.log.debug(`Status: ${JSON.stringify(data)}`);
        await this._writeObject(sn, "status");
        await this._writeStatesFromObject(sn, "status", data);
    }

    /**
     * GET /v1/device/{serialnumber}/power
     * Aktuell abgerufene Leistungsdaten
     */
    async fetchPowerData(sn) {
        const data = await this._get(`/device/${sn}/power`);
        this.log.debug(`Power: ${JSON.stringify(data)}`);
        await this._writeObject(sn, "power");
        await this._writeStatesFromObject(sn, "power", data);
    }

    // ─── State helpers ────────────────────────────────────────────────────────

    async _writeObject(sn, channel) {
        await this.setObjectNotExistsAsync(`${sn}.${channel}`, {
            type: "channel",
            common: { name: channel },
            native: {},
        });
    }

    /**
     * Schreibt alle Key/Value-Paare eines Objektes als States.
     * Unterstützt einfache Werte sowie ein flaches JSON-Objekt aus der API.
     */
    async _writeStatesFromObject(sn, channel, data) {
        if (typeof data !== "object" || data === null) return;

        for (const [key, value] of Object.entries(data)) {
            const stateId = `${sn}.${channel}.${key}`;
            const type = typeof value === "number" ? "number"
                       : typeof value === "boolean" ? "boolean"
                       : "string";

            await this.setObjectNotExistsAsync(stateId, {
                type: "state",
                common: {
                    name: key,
                    type,
                    role: this._guessRole(key, type),
                    read: true,
                    write: false,
                    unit: this._guessUnit(key),
                },
                native: {},
            });

            const val = type === "string" && typeof value !== "string"
                ? JSON.stringify(value)
                : value;

            this.setState(stateId, { val, ack: true });
        }
    }

    /** Einfache Heuristik für sinnvolle Rollen */
    _guessRole(key, type) {
        const k = key.toLowerCase();
        if (k.includes("temp")) return "value.temperature";
        if (k.includes("power") || k.includes("watt")) return "value.power";
        if (k.includes("energy") || k.includes("kwh")) return "value.energy";
        if (k.includes("voltage") || k.includes("volt")) return "value.voltage";
        if (k.includes("current") || k.includes("ampere")) return "value.current";
        if (k.includes("status") || k.includes("mode")) return "text";
        if (k.includes("error") || k.includes("fault")) return "indicator.alarm";
        if (type === "boolean") return "indicator";
        if (type === "number") return "value";
        return "text";
    }

    /** Einfache Einheiten-Heuristik */
    _guessUnit(key) {
        const k = key.toLowerCase();
        if (k.includes("temp")) return "°C";
        if (k.includes("power") || k.includes("watt")) return "W";
        if (k.includes("energy") || k.includes("kwh")) return "kWh";
        if (k.includes("voltage") || k.includes("volt")) return "V";
        if (k.includes("current") || k.includes("ampere")) return "A";
        if (k.includes("percent") || k.includes("soc")) return "%";
        return "";
    }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

if (require.main !== module) {
    module.exports = (options) => new MyPvAdapter(options);
} else {
    new MyPvAdapter();
}
