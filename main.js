"use strict";

/**
 * ioBroker my-PV Cloud Adapter
 *
 * Connects ioBroker to the my-PV Cloud API for AC ELWA 2,
 * AC·THOR and AC·THOR 9s devices.
 *
 * @license MIT
 */

const utils = require("@iobroker/adapter-core");
const axios = require("axios");

const BASE_URL = "https://api.my-pv.com/api/v1";

// ─── Field definitions (my-PV API documentation) ──────────────────────────────
// factor: raw value multiplier (e.g. 0.1 for values in 1/10 units)
// states: discrete value mapping for multistate fields

/** @type {Record<string, {name:string, unit:string, role:string, type:string, factor?:number, states?:Record<number,string>}>} */
const FIELD_DEFINITIONS = {
    // Power
    power:              { name: "Power",                                    unit: "W",   role: "value.power",       type: "number" },
    power_act:          { name: "Power AC THOR",                            unit: "W",   role: "value.power",       type: "number" },
    power_ac9:          { name: "Power AC THOR 9s",                         unit: "W",   role: "value.power",       type: "number" },
    power_elwa2:        { name: "Power ELWA 2",                             unit: "W",   role: "value.power",       type: "number" },
    power_max:          { name: "Max controllable power (incl. slaves)",    unit: "W",   role: "value.power",       type: "number" },
    power_nominal:      { name: "Nominal power (nameplate)",                unit: "W",   role: "value.power",       type: "number" },
    power_system:       { name: "Total power incl. secondary controllers",  unit: "W",   role: "value.power",       type: "number" },
    power_solar:        { name: "Solar share",                              unit: "W",   role: "value.power",       type: "number" },
    power_grid:         { name: "Grid share",                               unit: "W",   role: "value.power",       type: "number" },
    power_solar_act:    { name: "Solar share AC THOR",                      unit: "W",   role: "value.power",       type: "number" },
    power_grid_act:     { name: "Grid share AC THOR",                       unit: "W",   role: "value.power",       type: "number" },
    power_solar_ac9:    { name: "Solar share AC THOR 9s",                   unit: "W",   role: "value.power",       type: "number" },
    power_grid_ac9:     { name: "Grid share AC THOR 9s",                    unit: "W",   role: "value.power",       type: "number" },
    power1_solar:       { name: "Output 1 solar share",                     unit: "W",   role: "value.power",       type: "number" },
    power1_grid:        { name: "Output 1 grid share",                      unit: "W",   role: "value.power",       type: "number" },
    power2_solar:       { name: "Output 2 solar share",                     unit: "W",   role: "value.power",       type: "number" },
    power2_grid:        { name: "Output 2 grid share",                      unit: "W",   role: "value.power",       type: "number" },
    power3_solar:       { name: "Output 3 solar share",                     unit: "W",   role: "value.power",       type: "number" },
    power3_grid:        { name: "Output 3 grid share",                      unit: "W",   role: "value.power",       type: "number" },
    surplus:            { name: "Surplus (meter + battery charge power)",   unit: "W",   role: "value.power",       type: "number" },
    load_nom:           { name: "Nominal power (excl. EV, heat pump)",      unit: "W",   role: "value.power",       type: "number" },

    // Temperature (raw: 0.1 °C)
    temp1:              { name: "Temperature 1 (water)",                    unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    temp2:              { name: "Temperature 2",                            unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    temp3:              { name: "Temperature 3",                            unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    temp4:              { name: "Temperature 4",                            unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    temp_ps:            { name: "Power stage temperature",                  unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    tempInt1:           { name: "Internal temperature 1",                   unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    tempInt2:           { name: "Internal temperature 2",                   unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },
    tempInt3:           { name: "Internal temperature 3",                   unit: "°C",  role: "value.temperature", type: "number", factor: 0.1 },

    // Voltage
    volt_mains:         { name: "Input voltage L1",                         unit: "V",   role: "value.voltage",     type: "number" },
    volt_L2:            { name: "Input voltage L2",                         unit: "V",   role: "value.voltage",     type: "number" },
    volt_L3:            { name: "Input voltage L3",                         unit: "V",   role: "value.voltage",     type: "number" },
    volt_out:           { name: "Output voltage power stage",               unit: "V",   role: "value.voltage",     type: "number" },
    volt_aux:           { name: "Voltage L2 at AUX relay",                  unit: "V",   role: "value.voltage",     type: "number" },
    volt_bat:           { name: "Battery voltage",                          unit: "mV",  role: "value.voltage",     type: "number" },
    volt_solar:         { name: "PV voltage",                               unit: "mV",  role: "value.voltage",     type: "number" },

    // Current (raw: 0.1 A)
    curr_mains:         { name: "Grid current L1",                          unit: "A",   role: "value.current",     type: "number", factor: 0.1 },
    curr_L2:            { name: "Grid current L2",                          unit: "A",   role: "value.current",     type: "number", factor: 0.1 },
    curr_L3:            { name: "Grid current L3",                          unit: "A",   role: "value.current",     type: "number", factor: 0.1 },

    // Frequency (raw: mHz)
    freq:               { name: "Grid frequency",                           unit: "Hz",  role: "value.frequency",   type: "number", factor: 0.001 },

    // Grid connection / meter
    m0sum:              { name: "Grid connection total",                     unit: "W",   role: "value.power",       type: "number" },
    m0l1:               { name: "Grid connection L1",                        unit: "W",   role: "value.power",       type: "number" },
    m0l2:               { name: "Grid connection L2",                        unit: "W",   role: "value.power",       type: "number" },
    m0l3:               { name: "Grid connection L3",                        unit: "W",   role: "value.power",       type: "number" },
    m0bat:              { name: "Battery storage",                           unit: "W",   role: "value.power",       type: "number" },

    // Photovoltaics
    m1sum:              { name: "Photovoltaics total",                       unit: "W",   role: "value.power",       type: "number" },
    m1l1:               { name: "Photovoltaics L1",                          unit: "W",   role: "value.power",       type: "number" },
    m1l2:               { name: "Photovoltaics L2",                          unit: "W",   role: "value.power",       type: "number" },
    m1l3:               { name: "Photovoltaics L3",                          unit: "W",   role: "value.power",       type: "number" },
    m1devstate:         { name: "PV communication status",                   unit: "",    role: "value",             type: "number" },

    // Battery storage
    m2sum:              { name: "Battery storage total",                     unit: "W",   role: "value.power",       type: "number" },
    m2l1:               { name: "Battery storage L1",                        unit: "W",   role: "value.power",       type: "number" },
    m2l2:               { name: "Battery storage L2",                        unit: "W",   role: "value.power",       type: "number" },
    m2l3:               { name: "Battery storage L3",                        unit: "W",   role: "value.power",       type: "number" },
    m2soc:              { name: "Battery SoC",                               unit: "%",   role: "value.battery",     type: "number" },
    m2state:            { name: "Battery status",                            unit: "",    role: "value",             type: "number" },
    m2devstate:         { name: "Battery storage communication status",      unit: "",    role: "value",             type: "number" },

    // EV charger
    m3sum:              { name: "EV charger total",                          unit: "W",   role: "value.power",       type: "number" },
    m3l1:               { name: "EV charger L1",                             unit: "W",   role: "value.power",       type: "number" },
    m3l2:               { name: "EV charger L2",                             unit: "W",   role: "value.power",       type: "number" },
    m3l3:               { name: "EV charger L3",                             unit: "W",   role: "value.power",       type: "number" },
    m3soc:              { name: "EV charger SoC",                            unit: "%",   role: "value.battery",     type: "number" },
    m3devstate:         { name: "EV charger communication status",           unit: "",    role: "value",             type: "number" },

    // Heat pump
    m4sum:              { name: "Heat pump total",                           unit: "W",   role: "value.power",       type: "number" },
    m4l1:               { name: "Heat pump L1",                              unit: "W",   role: "value.power",       type: "number" },
    m4l2:               { name: "Heat pump L2",                              unit: "W",   role: "value.power",       type: "number" },
    m4l3:               { name: "Heat pump L3",                              unit: "W",   role: "value.power",       type: "number" },
    m4devstate:         { name: "Heat pump communication status",            unit: "",    role: "value",             type: "number" },

    // Device status
    screen_mode_flag:   { name: "Device status",                             unit: "",    role: "value",             type: "number",
                          states: { 0: "Standby", 1: "Heating", 2: "Heating (boost)", 3: "Heating finished", 4: "Disabled / No connection", 5: "Error", 6: "Blocked" } },
    ctrlstate:          { name: "Control state",                             unit: "",    role: "text",              type: "string" },
    cloudstate:         { name: "Cloud status",                              unit: "",    role: "value",             type: "number" },
    ps_state:           { name: "Power stage status",                        unit: "",    role: "value",             type: "number" },
    "9s_state":         { name: "Power stage 9s status",                     unit: "",    role: "value",             type: "number" },
    error_state:        { name: "Error bits",                                unit: "",    role: "indicator.alarm",   type: "number" },
    ctrl_errors:        { name: "Control error bits",                        unit: "",    role: "indicator.alarm",   type: "number" },
    warnings:           { name: "Warning bits",                              unit: "",    role: "indicator.alarm",   type: "number" },
    blockactive:        { name: "Block active",                              unit: "",    role: "indicator",         type: "number" },
    boostactive:        { name: "Hot water boost active",                    unit: "",    role: "indicator",         type: "number" },
    schicht_flag:       { name: "Layered charging active",                   unit: "",    role: "indicator",         type: "number" },
    act_night_flag:     { name: "Day / night",                               unit: "",    role: "indicator",         type: "number" },
    wp_flag:            { name: "Heat pump status",                          unit: "",    role: "indicator",         type: "number" },
    ecarstate:          { name: "EV status",                                 unit: "",    role: "value",             type: "mixed"  },
    load_state:         { name: "Load connected",                            unit: "",    role: "indicator",         type: "number",
                          states: { 0: "No load", 1: "Connected" } },
    bststrt:            { name: "Activate hot water boost",                  unit: "",    role: "value",             type: "number" },
    relay_alarm:        { name: "Relay alarm",                               unit: "",    role: "indicator.alarm",   type: "number" },
    relay_boost:        { name: "Relay boost",                               unit: "",    role: "indicator",         type: "number" },
    rel1_out:           { name: "Relay status",                              unit: "",    role: "indicator",         type: "number" },
    rel_selv:           { name: "SELV relay status",                         unit: "",    role: "indicator",         type: "number" },
    pump_pwm:           { name: "Pump PWM",                                  unit: "",    role: "value",             type: "number" },
    fan_speed:          { name: "Fan speed",                                 unit: "",    role: "value",             type: "number" },
    ecarboostctr:       { name: "EV boost time",                             unit: "min", role: "value",             type: "number" },
    legboostnext:       { name: "Next legionella boost",                     unit: "d",   role: "value",             type: "mixed"  },

    // Device info
    device:             { name: "Device type",                               unit: "",    role: "text",              type: "string" },
    acthor9s:           { name: "Device (1=AC THOR, 2=AC THOR 9s)",         unit: "",    role: "value",             type: "number" },
    fwversion:          { name: "Firmware version",                          unit: "",    role: "text",              type: "string" },
    fwversionlatest:    { name: "Latest firmware",                           unit: "",    role: "text",              type: "string" },
    coversion:          { name: "Co-controller version",                     unit: "",    role: "text",              type: "string" },
    coversionlatest:    { name: "Latest co-controller firmware",             unit: "",    role: "text",              type: "string" },
    psversion:          { name: "Power stage version",                       unit: "",    role: "text",              type: "string" },
    psversionlatest:    { name: "Latest power stage firmware",               unit: "",    role: "text",              type: "string" },
    p9sversion:         { name: "Power stage 9s version",                    unit: "",    role: "text",              type: "string" },
    p9sversionlatest:   { name: "Latest power stage 9s firmware",            unit: "",    role: "text",              type: "string" },

    // Network
    cur_ip:             { name: "IP address",                                unit: "",    role: "text",              type: "string" },
    cur_gw:             { name: "Gateway",                                   unit: "",    role: "text",              type: "string" },
    cur_dns:            { name: "DNS server",                                unit: "",    role: "text",              type: "string" },
    cur_sn:             { name: "Subnet mask",                               unit: "",    role: "text",              type: "string" },
    cur_eth_mode:       { name: "Ethernet mode",                             unit: "",    role: "value",             type: "number",
                          states: { 0: "LAN", 1: "WLAN", 2: "AP" } },
    wifi_signal:        { name: "WiFi signal strength",                      unit: "",    role: "value",             type: "number" },
    wifi_signal_strength:{ name: "WiFi signal strength (dBm)",              unit: "dBm", role: "value",             type: "number" },
    meter_ss:           { name: "WiFi meter signal strength",                unit: "%",   role: "value",             type: "number" },
    meter_ssid:         { name: "WiFi meter SSID",                           unit: "",    role: "text",              type: "string" },

    // Time
    date:               { name: "Date",                                      unit: "",    role: "text",              type: "string" },
    loctime:            { name: "Local time",                                unit: "",    role: "text",              type: "string" },
    unixtime:           { name: "Unix timestamp",                            unit: "",    role: "value.time",        type: "number" },
    uptime:             { name: "Uptime",                                    unit: "h",   role: "value",             type: "number" },
    uptime_s:           { name: "Uptime (seconds)",                          unit: "s",   role: "value",             type: "number" },

    // Updates
    upd_state:          { name: "Update status",                             unit: "",    role: "value",             type: "number" },
    upd_percentage:     { name: "Update progress",                           unit: "%",   role: "value",             type: "number" },
};

// ─── Adapter class ─────────────────────────────────────────────────────────────

class MyPvAdapter extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options]
     */
    constructor(options = {}) {
        super({ ...options, name: "my-pv" });

        // Only register handlers that are actually used
        this.on("ready",       this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload",      this.onUnload.bind(this));

        /** @type {ReturnType<typeof setTimeout> | null} */
        this._pollTimeout = null;

        /** @type {import("axios").AxiosInstance | null} */
        this._api = null;

        /** @type {string} */
        this._sn = "";
    }

    // ─── Lifecycle ─────────────────────────────────────────────────────────────

    async onReady() {
        // Set connection state to false on startup
        await this.setState("info.connection", false, true);

        const { apiToken, serialNumber, pollInterval } = this.config;

        if (!apiToken || !serialNumber) {
            this.log.error("API token or serial number missing — please configure the adapter.");
            this.terminate ? this.terminate(11) : process.exit(11);
            return;
        }

        this._sn = String(serialNumber).trim().replace(/[^A-Za-z0-9-_]/g, "");
        if (!this._sn) {
            this.log.error(`Invalid serial number: "${serialNumber}"`);
            this.terminate ? this.terminate(11) : process.exit(11);
            return;
        }

        this._api = axios.create({
            baseURL: BASE_URL,
            headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            timeout: 10_000,
        });

        // Create device channel and control states upfront
        await this._setupObjects();

        // Subscribe only to own writable states
        this.subscribeStates(`${this._sn}.control.*`);

        // Check firmware compatibility once on startup
        const compatible = await this._checkFirmwareCompatible();
        if (!compatible) {
            this.log.error("Device firmware is not compatible with the my-PV API. Please update the device.");
            this.terminate ? this.terminate(11) : process.exit(11);
            return;
        }

        // Immediate first poll
        await this._poll();
    }

    /**
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            if (this._pollTimeout) {
                this.clearTimeout(this._pollTimeout);
                this._pollTimeout = null;
            }
            this._api = null;
            // Fire-and-forget — we are shutting down
            this.setState("info.connection", false, true);
        } catch (_e) {
            // ignore errors during cleanup
        } finally {
            callback();
        }
    }

    /**
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        // Only process commands (ack=false), ignore confirmations
        if (!state || state.ack) return;

        const sn = this._sn;
        if (!sn) return;

        if (id === `${this.namespace}.${sn}.control.setPower`) {
            await this._cmdSetPower(state);
        }
    }

    // ─── Setup ─────────────────────────────────────────────────────────────────

    async _setupObjects() {
        const sn = this._sn;

        // Device channel
        await this.setObjectNotExistsAsync(sn, {
            type: "device",
            common: { name: `my-PV device ${sn}` },
            native: {},
        });

        // Data channel
        await this.setObjectNotExistsAsync(`${sn}.data`, {
            type: "channel",
            common: { name: "Device data" },
            native: {},
        });

        // Control channel
        await this.setObjectNotExistsAsync(`${sn}.control`, {
            type: "channel",
            common: { name: "Control" },
            native: {},
        });

        // Writable: set power
        await this.extendObjectAsync(`${sn}.control.setPower`, {
            type: "state",
            common: {
                name:  "Set power",
                type:  "number",
                role:  "value.power",
                unit:  "W",
                min:   0,
                read:  true,
                write: true,
                def:   0,
            },
            native: {},
        });

        // Writable: power validity duration
        await this.extendObjectAsync(`${sn}.control.validForMinutes`, {
            type: "state",
            common: {
                name:  "Power setpoint validity",
                type:  "number",
                role:  "value",
                unit:  "min",
                min:   1,
                max:   60,
                read:  true,
                write: true,
                def:   10,
            },
            native: {},
        });

        // Read-only extras
        await this.setObjectNotExistsAsync(`${sn}.isOnline`, {
            type: "state",
            common: {
                name:  "Device online",
                type:  "boolean",
                role:  "indicator.reachable",
                read:  true,
                write: false,
                def:   false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(`${sn}.isPowerControlPossible`, {
            type: "state",
            common: {
                name:  "Power control possible",
                type:  "boolean",
                role:  "indicator",
                read:  true,
                write: false,
                def:   false,
            },
            native: {},
        });
    }

    // ─── Polling ────────────────────────────────────────────────────────────────

    async _poll() {
        try {
            await this._fetchAll();
            await this.setState("info.connection", true, true);
        } catch (err) {
            await this.setState("info.connection", false, true);
            this.log.warn(`Poll failed: ${err.message}`);
            if (err.response) {
                this.log.debug(`HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`);
            }
        } finally {
            // Use adapter.setTimeout — automatically cleaned up on unload
            const intervalMs = Math.max(10, parseInt(String(this.config.pollInterval), 10) || 60) * 1_000;
            this._pollTimeout = this.setTimeout(() => this._poll(), intervalMs);
        }
    }

    // ─── API calls ──────────────────────────────────────────────────────────────

    /**
     * @param {string} path
     */
    async _get(path) {
        const r = await this._api.get(path);
        return r.data;
    }

    /**
     * @param {string} path
     * @param {unknown} body
     */
    async _post(path, body) {
        const r = await this._api.post(path, body);
        return r.data;
    }

    async _checkFirmwareCompatible() {
        try {
            const data = await this._get(`/device/${this._sn}/isFirmwareCompatible`);
            const compatible = data?.isFirmwareCompatible !== "false" && data?.isFirmwareCompatible !== false;
            if (!compatible) this.log.warn("Firmware compatibility check returned false.");
            return compatible;
        } catch (err) {
            this.log.warn(`Firmware check failed (${err.message}) — continuing.`);
            return true;
        }
    }

    async _fetchAll() {
        const sn = this._sn;

        // Fetch primary data endpoint (contains all live values)
        const data = await this._get(`/device/${sn}/data`);
        this.log.debug(`data: ${JSON.stringify(data)}`);
        await this._writeStatesFromObject(sn, "data", data);

        // Parallel fetch of secondary endpoints — failures are non-fatal
        await Promise.allSettled([
            this._fetchBool(`/device/${sn}/isOnline`,              `${sn}.isOnline`,              d => d === true || d?.isOnline === true || d?.online === true),
            this._fetchBool(`/device/${sn}/isPowerControlPossible`,`${sn}.isPowerControlPossible`,d => d === true || d?.isPowerControlPossible === true),
            this._fetchSolarForecast(sn),
        ]);
    }

    /**
     * Fetch a boolean endpoint and set a single state.
     * @param {string} path
     * @param {string} stateId
     * @param {(data: unknown) => boolean} extract
     */
    async _fetchBool(path, stateId, extract) {
        try {
            const data = await this._get(path);
            await this.setState(stateId, { val: extract(data), ack: true });
        } catch (err) {
            this.log.debug(`${path}: ${err.message}`);
        }
    }

    async _fetchSolarForecast(sn) {
        try {
            const data = await this._get(`/device/${sn}/solarForecast`);
            await this.setObjectNotExistsAsync(`${sn}.solarForecast`, {
                type: "channel",
                common: { name: "Solar forecast" },
                native: {},
            });
            await this._writeStatesFromObject(sn, "solarForecast", data);
        } catch (err) {
            this.log.debug(`solarForecast: ${err.message}`);
        }
    }

    // ─── Commands ───────────────────────────────────────────────────────────────

    /**
     * @param {ioBroker.State} state
     */
    async _cmdSetPower(state) {
        const power = parseInt(String(state.val), 10);
        if (isNaN(power) || power < 0) {
            this.log.warn(`Invalid power value: ${state.val}`);
            return;
        }

        // Read validity duration from control state (ack=true = confirmed value)
        const validState = await this.getStateAsync(`${this._sn}.control.validForMinutes`);
        const validForMinutes = validState?.val != null ? parseInt(String(validState.val), 10) : 10;

        try {
            await this._post(`/device/${this._sn}/power`, {
                power,
                validForMinutes:      Math.max(1, Math.min(60, validForMinutes || 10)),
                timeBoostOverride:    0,
                timeBoostValue:       0,
                legionellaBoostBlock: 1,
            });
            await this.setState(`${this._sn}.control.setPower`, { val: power, ack: true });
            this.log.info(`Power setpoint: ${power} W (valid for ${validForMinutes} min)`);
        } catch (err) {
            this.log.error(`Failed to set power: ${err.message}`);
        }
    }

    // ─── State write helpers ────────────────────────────────────────────────────

    /**
     * Write all key/value pairs of an API response object as states.
     * Objects with a scalar factor are converted automatically.
     * @param {string} sn
     * @param {string} channel
     * @param {Record<string, unknown>} data
     */
    async _writeStatesFromObject(sn, channel, data) {
        if (typeof data !== "object" || data === null) return;

        // Parallelise object creation and state writes for performance
        await Promise.all(
            Object.entries(data).map(([key, rawValue]) =>
                this._writeOneState(sn, channel, key, rawValue)
            )
        );
    }

    /**
     * @param {string} sn
     * @param {string} channel
     * @param {string} key
     * @param {unknown} rawValue
     */
    async _writeOneState(sn, channel, key, rawValue) {
        // Recurse into nested objects
        if (typeof rawValue === "object" && rawValue !== null && !Array.isArray(rawValue)) {
            await this.setObjectNotExistsAsync(`${sn}.${channel}.${key}`, {
                type: "channel",
                common: { name: key },
                native: {},
            });
            await this._writeStatesFromObject(sn, `${channel}.${key}`, /** @type {any} */ (rawValue));
            return;
        }

        const stateId = `${sn}.${channel}.${key}`;
        const def = FIELD_DEFINITIONS[key];

        // Serialise arrays
        let val = Array.isArray(rawValue) ? JSON.stringify(rawValue) : rawValue;

        // Coerce type to match definition (API occasionally sends strings for numeric fields)
        if (def) {
            if (def.type === "number" && typeof val === "string") {
                const n = parseFloat(val);
                val = isNaN(n) ? null : n;
            } else if (def.type === "mixed" && typeof val === "string") {
                const n = parseFloat(val);
                if (!isNaN(n)) val = n;
            } else if (def.type === "boolean" && typeof val === "string") {
                val = val === "true" || val === "1";
            }
        }

        // Apply scaling factor (e.g. 0.1 for temperatures in 1/10 °C)
        if (def?.factor && typeof val === "number") {
            val = Math.round(val * def.factor * 10) / 10;
        }

        // Build common definition
        const common = def
            ? {
                name:  def.name,
                type:  def.type === "mixed" ? "string" : def.type,
                role:  def.role,
                unit:  def.unit,
                read:  true,
                write: false,
                ...(def.states ? { states: def.states } : {}),
            }
            : {
                name:  key,
                type:  typeof val === "number" ? "number" : typeof val === "boolean" ? "boolean" : "string",
                role:  "value",
                unit:  "",
                read:  true,
                write: false,
            };

        // extendObjectAsync updates existing objects; setObjectNotExistsAsync would not
        await this.extendObjectAsync(stateId, { type: "state", common, native: {} });
        this.setState(stateId, { val: val ?? null, ack: true });
    }
}

// ─── Entry point ────────────────────────────────────────────────────────────────

if (require.main !== module) {
    module.exports = /** @param {Partial<utils.AdapterOptions>} options */ (options) => new MyPvAdapter(options);
} else {
    (() => new MyPvAdapter())();
}
