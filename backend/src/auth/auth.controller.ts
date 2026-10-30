import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { Auth, Public, RequireRole } from './auth.decorators.js';
import { AllowDuringSetup } from './account-setup.guard.js';
import {
  AcceptTermsDto,
  AddOwnerRoleDto,
  ChangePasswordDto,
  JoinAgencyDto,
  SigninDto,
  SignupAgencyDto,
  SignupOfficerDto,
  SignupOwnerDto,
  UpdateMeDto,
} from './auth.dto.js';
import { AuthService, type ClientMeta } from './auth.service.js';
import { MeService, type Me, type PlanInfo } from './me.service.js';
import { SessionService, type AuthContext } from './session.service.js';
import { TermsService, type CurrentTerms } from './terms.service.js';

const meta = (req: Request): ClientMeta => ({ ip: req.ip, userAgent: req.get('user-agent') });

/** กันเดารหัสกลุ่ม (เข้าหน่วยงาน / เพิ่มบทบาท) · 💡 ตัวเลขยังไม่ได้ตกลง */
const SIGNUP_LIMIT = { limit: 10, windowSec: 60 };
/** สมัครบัญชีใหม่ — ผ่อนกว่า เพราะทีมทดสอบ/บ้านเดียวกันใช้ IP เดียวกัน (NAT ของ Wi-Fi / เครือข่ายมือถือ) */
const SIGNUP_FORM_LIMIT = { limit: 30, windowSec: 60 };
/** ล็อกอิน: รหัสผิดถูกจำกัดต่อบัญชีอยู่แล้ว (5 ครั้ง/15 นาที) ต่อ IP จึงผ่อนได้ ไม่งั้นคนหลายคนที่ใช้ Wi-Fi เดียวกันล็อกอินพร้อมกันไม่ได้ */
const SIGNIN_LIMIT = { limit: 20, windowSec: 60 };

// docs/api.md §2
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly me: MeService,
  ) {}

  @Public()
  @RateLimit(SIGNUP_FORM_LIMIT)
  @Post('signup/owner')
  async signupOwner(@Body() dto: SignupOwnerDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, me } = await this.auth.signupOwner(dto, meta(req));
    this.sessions.setCookie(res, token);
    return me;
  }

  @Public()
  @RateLimit(SIGNUP_LIMIT)
  @Post('signup/officer')
  async signupOfficer(@Body() dto: SignupOfficerDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, me } = await this.auth.signupOfficer(dto, meta(req));
    this.sessions.setCookie(res, token);
    return me;
  }

  @Public()
  @RateLimit(SIGNUP_FORM_LIMIT)
  @Post('signup/agency')
  async signupAgency(@Body() dto: SignupAgencyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, me } = await this.auth.signupAgency(dto, meta(req));
    this.sessions.setCookie(res, token);
    return me;
  }

  /** api.md §0: 20 ครั้ง/นาที ต่อ IP + ล็อกบัญชี 5 ครั้ง/15 นาที */
  @Public()
  @RateLimit(SIGNIN_LIMIT)
  @HttpCode(HttpStatus.OK)
  @Post('signin')
  async signin(@Body() dto: SigninDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, me } = await this.auth.signin(dto, meta(req));
    this.sessions.setCookie(res, token);
    return { ok: true, data: me };
  }

  @AllowDuringSetup()
  @HttpCode(HttpStatus.OK)
  @Post('signout')
  async signout(@Auth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(auth.sessionId);
    this.sessions.clearCookie(res);
    return { ok: true };
  }

  @AllowDuringSetup()
  @Get('verify')
  verify(@Auth() auth: AuthContext): Promise<Me> {
    return this.me.build(auth.userId, undefined, auth.sessionId);
  }

  @AllowDuringSetup()
  @RateLimit({ limit: 5, windowSec: 60 })
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @Auth() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(auth.userId, dto);
    this.sessions.clearCookie(res);
    return { ok: true };
  }
}

// docs/api.md §2–3 — เพิ่มบทบาทให้บัญชีที่มีอยู่ + ข้อมูลตัวเอง
@Controller('api/v1/me')
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly me: MeService,
    private readonly terms: TermsService,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
  ) {}

  @AllowDuringSetup()
  @Get()
  get(@Auth() auth: AuthContext): Promise<Me> {
    return this.me.build(auth.userId, undefined, auth.sessionId);
  }

  /** แพ็กเกจปัจจุบันของบัญชีเจ้าของบ้าน (หน้าตั้งค่าตู้ H13) */
  @RequireRole('owner')
  @Get('plan')
  plan(@Auth() auth: AuthContext): Promise<PlanInfo> {
    return this.me.plan(auth.userId);
  }

  /** แก้ชื่อที่แสดง / ภาษา-ธีม-ขนาดตัวอักษร (api.md §3) — `prefs.lang` ใช้แปลข้อความแจ้งเตือน */
  @AllowDuringSetup()
  @Patch()
  update(@Auth() auth: AuthContext, @Body() dto: UpdateMeDto): Promise<Me> {
    return this.me.update(auth.userId, dto, auth.sessionId);
  }

  /** ยอมรับข้อตกลงฉบับใหม่ (A13) — บันทึกหลักฐานใน terms_acceptance_tb */
  @AllowDuringSetup()
  @HttpCode(HttpStatus.OK)
  @Post('terms')
  async acceptTerms(@Auth() auth: AuthContext, @Body() dto: AcceptTermsDto, @Req() req: Request): Promise<Me> {
    await this.terms.assertCurrent(this.pool, dto.terms_version);
    await this.terms.accept(this.pool, auth.userId, dto.terms_version, meta(req));
    return this.me.build(auth.userId, undefined, auth.sessionId);
  }

  @RateLimit(SIGNUP_LIMIT)
  @Post('roles/owner')
  addOwnerRole(@Auth() auth: AuthContext, @Body() dto: AddOwnerRoleDto, @Req() req: Request): Promise<Me> {
    return this.auth.addOwnerRole(auth.userId, auth.sessionId, dto, meta(req));
  }

  @RateLimit(SIGNUP_LIMIT)
  @Post('agency/join')
  joinAgency(@Auth() auth: AuthContext, @Body() dto: JoinAgencyDto, @Req() req: Request): Promise<Me> {
    return this.auth.joinAgency(auth.userId, auth.sessionId, dto, meta(req));
  }
}

@Controller('api/v1/terms')
export class TermsController {
  constructor(private readonly terms: TermsService) {}

  @Public()
  @Get('current')
  current(): Promise<CurrentTerms> {
    return this.terms.current();
  }
}
