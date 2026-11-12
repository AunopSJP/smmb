# SmmbWeb

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.4.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Browser E2E (Playwright)

```bash
npm run e2e:web
```

คำสั่งเดียวจบ: ลบ `backend/.mockdb-e2e` → build + เปิด backend mock (พอร์ต 3211, PGlite 54339) → เปิด `ng serve` (พอร์ต 4211) → รัน 9 เทสต์ที่ viewport 375x812 → ปิด server เอง
- ไม่ชนพอร์ตงาน dev (3000/3100/3111/4200/4201) · ลบได้เฉพาะ `.mockdb-e2e`
- เส้นหลัก 5 ไฟล์ (`owner` `officer` `rider` `sos` `admin`) + `regressions` · ตู้จำลอง = `backend/scripts/box-sim.mjs` เป็น child process
- ครั้งแรกต้องมีเบราว์เซอร์: `npx playwright install chromium`
- ตอนเขียนเทสต์ใหม่: เปิด server ค้างเอง แล้ว `E2E_REUSE=1 npx playwright test <ชื่อไฟล์>` (ไม่ล้างฐาน)
- ยังไม่ได้ใส่ใน CI (W-07)
