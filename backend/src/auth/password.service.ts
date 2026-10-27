import { Injectable, OnModuleInit } from '@nestjs/common';
import { hash, verify, type Algorithm } from '@node-rs/argon2';

/** argon2id ค่าตาม OWASP (m=19 MiB, t=2, p=1) · 2 = Algorithm.Argon2id (เป็น const enum ใช้ตรง ๆ ไม่ได้) */
const OPTIONS = { algorithm: 2 as Algorithm, memoryCost: 19456, timeCost: 2, parallelism: 1 };

@Injectable()
export class PasswordService implements OnModuleInit {
  /** hash ไว้ verify ตอนไม่เจอเบอร์ — ให้เวลาตอบเท่ากัน เดาไม่ได้ว่าเบอร์มีบัญชีไหม */
  private dummyHash = '';

  async onModuleInit() {
    this.dummyHash = await hash('dummy-password-for-timing', OPTIONS);
  }

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  /** hash = null → ไม่มีบัญชี แต่ยังเสียเวลาเท่าเดิม แล้วคืน false */
  async verify(passwordHash: string | null, password: string): Promise<boolean> {
    try {
      const ok = await verify(passwordHash ?? this.dummyHash, password);
      return passwordHash !== null && ok;
    } catch {
      return false;
    }
  }
}
