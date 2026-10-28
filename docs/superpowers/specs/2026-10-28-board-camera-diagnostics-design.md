# Board and camera diagnostics design

## Goal

Give administrators and installers a web view of whether an ESP32-CAM board is connected and whether its camera can capture and read during a camera test. Keep the inspection flow and its server-side QR decision unchanged.

## Chosen approach

Add a diagnostics card to the existing admin box detail screen (D04). The screen already refreshes box details every five seconds and provides a wake-and-camera test. The board will report small, HMAC-authenticated diagnostic events through the existing `POST /v1/box/events` endpoint. The backend stores them in the existing append-only `box_report_tb` event log; no new table or image endpoint is needed.

Do not upload or persist camera images. Report camera stages and capture/read metrics instead. This avoids storing images of people or homes and keeps traffic low. The existing local `camweb` command remains an installation aid for framing and focus.

## Event data flow

Only `test` jobs produce camera diagnostic events. Inspection jobs continue their existing boot-independent sequence and only send the QR text to the server for validation.

1. When a test job starts, the board emits `camera_test_started` with the job ID.
2. After camera initialization, it emits `camera_ready` with the job ID and frame dimensions.
3. After each scan attempt, it emits `camera_scan_result` with the job ID, attempt number, frame count, frames containing a QR shape, whether a QR was decoded, and scan duration.
4. If initialization fails, the board emits the existing `camera_error` event.
5. The board continues to send the existing `/ready` and `/result` requests. These remain authoritative for job state and pass/retry/fail.

Diagnostic events are best-effort. Failure to send one must not delay or change the camera test or inspection result.

## Web display

The D04 diagnostics card summarizes the newest camera test from the box event list:

- Not tested yet
- Camera initialized; waiting for a scan result
- Frames captured, QR shape found or not found, and scan duration
- Camera initialization error
- Test job outcome from the existing job result

The card shows event time and refreshes with the existing five-second detail refresh. It must distinguish “camera captured frames” from “QR decoded”; a missing QR must not be shown as a camera hardware failure. All user-facing labels include Thai and English.

## Compatibility and security

- Reuse the HMAC-protected box event endpoint and the existing report log; no schema migration.
- Add the new event names and fields to `docs/api.md` and `docs/HARDWARE_FIRMWARE_GUIDE.md`.
- Do not expose `device_secret`, raw camera frames, or new personal data.
- Do not alter inspection jobs, QR formats, inspection decisions, or the server as the sole authority for pass/retry/fail.
- Older firmware that does not send diagnostics continues to work; the page shows no recent camera test.

## Failure behavior

If diagnostic event delivery fails, the firmware logs the delivery failure and continues the normal job. If no recent events arrive, D04 shows the last recorded result and its timestamp, or “not tested yet.” Existing connection, job, and camera errors remain visible through current status and report records.

## Verification

- Build the Angular app and PlatformIO firmware.
- Use the mock box simulator or a small mock event sequence to confirm the D04 card renders ready, QR-read, no-QR, and camera-error states.
- Confirm a test job can complete and an inspection job still reaches the existing server-side decision without diagnostic events.
- Physical board testing is required to confirm camera frame metrics reflect the connected sensor; compilation and mock events cannot establish optical focus or QR readability.

## Scope

Included: firmware camera-test telemetry, typed admin detail mapping/display, protocol/firmware documentation, and mock-flow verification.

Excluded: JPEG upload, video streaming, remote camera control, new database tables, changes to the inspection protocol, and production deployment.
