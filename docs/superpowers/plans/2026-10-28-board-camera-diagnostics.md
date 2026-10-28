# Board and Camera Diagnostics Implementation Plan

> **For agentic workers:** Execute the tasks in this plan in order. Do not change the inspection flow or commit changes.

**Goal:** Show recent board connectivity and camera-test status on admin box detail D04 using HMAC-authenticated mock-compatible telemetry, without uploading images or changing inspections.

**Architecture:** Firmware emits small event records through the existing signed `/v1/box/events` endpoint only while executing camera test jobs. The backend maps recent event rows into a typed camera diagnostic summary, and D04 displays that summary using its existing five-second refresh. The box simulator emits the same event shapes so the page can be exercised without hardware.

**Tech Stack:** ESP32-CAM Arduino/PlatformIO, NestJS TypeScript, Angular TypeScript, existing PGlite mock backend, existing HMAC box protocol.

## Global Constraints

- Keep the primary inspection flow unchanged; the server remains the sole authority for inspection pass/retry/fail.
- Do not upload or persist camera images, add dependencies, or add a database migration.
- Send telemetry only for `test` jobs; telemetry failures must not affect job processing.
- Validate and map stored JSON at the backend boundary; expose only typed diagnostic fields to D04.
- User-visible labels must include Thai and English.
- Keep database table and field naming conventions if a database change becomes unavoidable; this plan makes no database change.
- Do not commit; the repository handoff assigns commits to the user.

---

### Task 1: Emit camera-test telemetry from firmware and simulator

**Files:**
- Modify: `firmware/src/camera_qr.h`
- Modify: `firmware/src/camera_qr.cpp`
- Modify: `firmware/src/main.cpp`
- Modify: `backend/scripts/box-sim.mjs`
- Modify: `docs/api.md`
- Modify: `docs/HARDWARE_FIRMWARE_GUIDE.md`

**Interfaces:**
- Firmware keeps existing `/ready` and `/result` calls unchanged.
- New event types: `camera_test_started`, `camera_ready`, `camera_scan_result`; reuse `camera_error`.
- `camera_scan_result` fields: `job_id`, `attempt`, `frames`, `qr_shapes`, `read_ok`, `read_ms`.
- Simulator sends equivalent events only for `test` jobs.

- [x] Add frame and QR-shape counters to `QrRead`; populate them from the existing scan loop.
- [x] Serialize diagnostic events as JSON and send them best-effort through the existing HMAC `/events` request.
- [x] Emit `camera_test_started` and `camera_ready` only for a `test` job, then emit `camera_scan_result` for each scan attempt.
- [x] Preserve the existing `camera_error`, `/ready`, `/result`, beep, and retry behavior when event delivery fails.
- [x] Update `box-sim.mjs` so simulated `test` jobs emit the same events before returning their normal result.
- [x] Document event names and payloads in `docs/api.md` and the firmware guide.
- [x] Build firmware and run one mock test job; confirm event JSON is accepted and a test job still passes.

### Task 2: Map recent camera events to a typed admin API summary

**Files:**
- Modify: `backend/src/box/admin-box.service.ts`
- Modify: `frontend/src/app/core/admin-api.ts`

**Interfaces:**
- Add `camera_diagnostics: CameraDiagnostics | null` to `AdminBoxDetail`.
- `CameraDiagnostics` includes state, `at`, `job_id`, optional dimensions, `attempt`, frame/QR counts, `read_ok`, and `read_ms`.
- Allowed states: `started`, `ready`, `scan_result`, `error`.

- [x] Add an explicit mapper that validates `type`, scalar field types, and allowed ranges from stored event JSON.
- [x] Select the newest recognized camera event from the existing 20 report rows and map it to `camera_diagnostics`; return `null` if none exists.
- [x] Add the matching frontend interface and consume the new API property.
- [x] Confirm ordinary boot/report/event records still map and old firmware yields `null`.
- [x] Build the backend.

### Task 3: Display diagnostics in D04

**Files:**
- Modify: `frontend/src/app/pages/admin/admin-boxes.ts`

**Interfaces:**
- D04 reads `AdminBoxDetail.camera_diagnostics`.
- No route or polling interval change; use the current five-second detail refresh.

- [x] Add a camera diagnostics card above the existing reports list.
- [x] Render bilingual states for not tested, initializing, ready, scan result, and camera error.
- [x] Show timestamp, job ID, captured frames, QR-shape count, read result, scan duration, and dimensions only when present.
- [x] Distinguish “frames captured, QR not found” from a camera initialization error.
- [x] Preserve the existing wake-test control and inspection-related content.
- [x] Build the frontend and inspect the D04 states using simulator events.

### Task 4: Verify compatibility and document current status

**Files:**
- Modify: `docs/CODEX_HANDOFF.md`

- [x] Exercise simulator test events and verify D04 receives the camera summary through the current mock backend.
- [x] Exercise a simulated inspection result and confirm the existing inspection reaches the same server-side verdict without diagnostics.
- [x] Run backend, frontend, and PlatformIO builds; do not reset the persistent mock database.
- [x] Record that real optical performance still requires a connected ESP32-CAM; do not report mock telemetry as physical-camera verification.
- [x] Check `git diff --check` and verify only task-related files changed.
