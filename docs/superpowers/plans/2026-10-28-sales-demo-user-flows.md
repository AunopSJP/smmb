# Sales Demo User Flows Implementation Plan

> **For agentic workers:** Execute inline in this task. Do not commit changes.

**Goal:** Prepare one repeatable sales-demo environment where all primary user roles use a coherent seeded backend scenario while ESP32-CAM communicates with that same backend through the signed box protocol.

**Architecture:** Keep `backend dev:mock` as the persistent PGlite-backed API, using the same controllers and business services as normal local runtime. Keep physical board communication on `/v1/box/*`; user-facing flows should use backend APIs where implemented, and any intentionally simulated presentation screens must be clearly labeled and share the documented demo scenario.

**Tech Stack:** NestJS, PGlite/Postgres schema, Angular PWA, ESP32-CAM PlatformIO firmware, existing HMAC protocol.

## Global Constraints

- Use only dependencies already present in the repository.
- Do not reset the persistent mock database during implementation or verification.
- Do not commit changes.
- Preserve the documented server-authoritative inspection flow; the board only reports raw QR reads.
- Keep database table names suffixed with `tb` and record names explicit if schema changes are necessary.
- Report physical board verification separately from simulator verification.

---

### Task 1: Map the demo scenario and user-flow coverage

**Files:**
- Read: `docs/SMMB_ขั้นตอนการใช้งานแต่ละคน.md`
- Read: `frontend/src/app/app.routes.ts`
- Read: `frontend/src/app/layout/area-shell.ts`
- Read: `backend/scripts/dev-mock.mjs`
- Read: existing frontend API services and role pages

- [x] Trace owner, officer, agency head, rider, admin/technician, and box flows from route to API or mock store.
- [x] Identify screens still using isolated local demo data or placeholders.
- [x] Confirm the seeded dev backend can serve signed real-board requests.

### Task 2: Make the sales demo scenario coherent and repeatable

**Files:**
- Modify: `backend/scripts/dev-mock.mjs`
- Modify: `frontend/src/app/pages/demo-start.ts` only if it must launch seeded backend accounts
- Modify: `README.md`

- [x] Ensure the seed scenario supports an owner, agency head, officer, admin, a bound box, an unbound box, QR slots, and a complete representative delivery/inspection/SOS history without resetting existing mock data. The mock startup adds only missing history types; it does not wipe or overwrite user activity.
- [x] Make demo account/role entry points clearly use those seeded backend identities instead of diverging in-memory accounts for live flows. `/demo` signs in through the backend before entering each role.
- [x] Document the run command, demo accounts, board network requirements, and one complete presentation script in `README.md` and `docs/SALES_DEMO_GUIDE.md`.

### Task 3: Close user-facing flow gaps that block the sales story

**Files:**
- Modify the role pages currently marked as prototype when their flow has a backend API.
- Modify backend service/controller only for missing endpoints required by documented primary flows.
- Modify matching API contracts and user-flow docs.

- [x] Keep owner activation, home/status, history, SOS, officer inspection, QR badge, SOS response, agency zones/members, rider delivery, admin box registration, and technician test connected to the same seeded backend scenario; verify representative API flows in `docs/IMPLEMENTATION_STATUS.md`.
- [x] Where a flow intentionally remains a local presentation mock, visibly label it and avoid presenting its data as live backend state. The `/demo` entry labels itself as a backend demo; H15 family members remain an explicitly out-of-scope proposal.
- [x] Ensure QR registration output can be retrieved again for printing/recovery and document any remaining non-core prototype screens. D04 reads printable active QR records from the box detail API; use QR reissue when a lost code must be invalidated.

### Task 4: Verify the complete demo path

**Files:**
- Modify: `docs/CODEX_HANDOFF.md`

- [x] Confirm the owner, officer, agency-head, rider, and admin/technician paths use the documented seeded scenario; manual API flow evidence is recorded in `docs/IMPLEMENTATION_STATUS.md`.
- [x] Run the box simulator through boot, test, inspection and accepted result against the dev mock backend.
- [x] Build backend, frontend, and firmware; do not reset the persistent mock database.
- [x] Record that a physical ESP32-CAM still needs a live optical check if no board is connected; COM17 could not enter its serial bootloader during the last attempt.
