# ioBroker my-PV Adapter — Project Guidelines

You are working as a Senior Software Engineer on an ioBroker adapter for the my-PV Cloud API.
All generated code must comply with ioBroker DEV standards, ETSI EN 303 645 (cybersecurity)
and ISO/IEC 25010 (software quality) at all times.

## Architecture

- Import `@iobroker/adapter-core`. NEVER use `lib/utils.js`.
- Admin UI exclusively via `admin/jsonConfig.json` (no HTML/JS).
- i18n: edit only `admin/i18n/en.json`; run `npm run translate` for other languages.
- Use `adapter.setTimeout` / `adapter.setInterval` — NEVER global Node.js timers.
- Use `adapter.terminate(code)` instead of `process.exit()` (Compact Mode safety).
- Use `setObjectNotExistsAsync` / `extendObjectAsync` — NEVER plain `setObject`.

## API

- Base URL: `https://api.my-pv.com/api/v1`
- Auth: Bearer token (stored encrypted via `encryptedNative`)
- Key endpoints:
  - `GET /device/{sn}/data` — all live device values
  - `GET /device/{sn}/isFirmwareCompatible` — check before polling
  - `GET /device/{sn}/isOnline` — online indicator
  - `GET /device/{sn}/isPowerControlPossible`
  - `GET /device/{sn}/solarForecast`
  - `POST /device/{sn}/power` — set power (W), body: {power, validForMinutes, ...}
- Temperature fields: raw value in 0.1 °C → apply factor 0.1
- Current fields: raw value in 0.1 A → apply factor 0.1
- Frequency: raw value in mHz → apply factor 0.001
- `legboostnext` and `ecarstate`: API may return string OR number (type: "mixed")

## Data model

- `common.type` always set (string / number / boolean / mixed).
- `common.role` must be specific — NEVER use `"state"` for all fields.
- Serialise arrays/objects with `JSON.stringify()` before `setState`.
- `info.connection` boolean state always maintained.
- Object IDs: only `[A-Za-z0-9-_]` — sanitise serial numbers.
- `ack: true` for device values; `ack: false` for user commands.

## Lifecycle & Cleanup (CRITICAL)

- `onUnload(callback)`: clear ALL timers (`this.clearTimeout`), set `info.connection=false`,
  call `callback()` in `finally` — even if errors occur.
- Only register event handlers that are actually used.
- Compact Mode: tested and `compact: true` in io-package.json.

## Security

- API token stored in `encryptedNative` + `protectedNative`.
- No hardcoded credentials — ever.
- Validate all incoming payloads (type + range) before `setState`.
- Axios timeout: 10s — no hanging sockets.

## Testing

- `test/package.js`: `tests.packageFiles()` from `@iobroker/testing`.
- Run `npm test` before every release.

## Versioning

- Keep `version` in `package.json` and `io-package.json` in sync.
- Add entry to `common.news` in `io-package.json` for each release (all 11 languages).
