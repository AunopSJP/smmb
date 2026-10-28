import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { ApiConfig, apiInterceptor } from './core/api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // ?id=… ของ URL ส่งเข้า input() ของหน้าได้ตรง ๆ
    provideRouter(routes, withComponentInputBinding()),
    // API อยู่โดเมนเดียวกับเว็บแอป (cookie `sid`) — dev ใช้ proxy.conf.json · path นำหน้าตั้งใน config.json (apiBase)
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
    provideAppInitializer(() => inject(ApiConfig).load()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
