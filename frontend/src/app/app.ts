import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DisplaySettings } from './core/display-settings';
import { PrefsSync } from './core/prefs-sync';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  // สร้างตั้งแต่เปิดแอป → ใส่ธีม/ขนาดตัวอักษร/ภาษาบน <html> ทันที
  private readonly display = inject(DisplaySettings);
  /** ซิงก์ภาษา/ธีมกับบัญชี (PATCH /me) */
  private readonly prefsSync = inject(PrefsSync);
}
