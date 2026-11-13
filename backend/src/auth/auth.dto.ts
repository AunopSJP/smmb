import { Transform, Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsNumber, Max, Min, ValidateIf, IsOptional, IsString, Length, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { MUTABLE_NOTIFICATION_TYPES } from '../push/messages.js';
import { normalizePhone } from './phone.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
// เบอร์ที่ใช้ไม่ได้ → คืนค่าเดิมให้ @Matches ตอบ 400
const phone = ({ value }: { value: unknown }) => normalizePhone(value) ?? value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : value;

const PHONE_RE = /^0[1-9]\d{8}$/; // ไม่รับ 00… (รหัสโทรระหว่างประเทศ · รูปแบบเบอร์แทนที่ของบัญชีที่ลบ)
const HOUSE_TYPES = ['house', 'townhome', 'village', 'condo', 'shop', 'other'] as const;
const CARE_TAGS = ['elderly', 'children', 'disabled', 'bedridden', 'pregnant', 'pets'] as const;
const TITLES = ['mr', 'mrs', 'ms', 'other'] as const;
const PHONE_MSG = 'phone must be a Thai mobile number like 0812345678';

/** 💡 อย่างน้อย 8 ตัว ไม่บังคับอักขระพิเศษ (ผู้ใช้สูงอายุ) · สูงสุด 128 กันส่งยาวมากให้ hash ช้า */
class PasswordField {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

/** ย่าน/หมู่บ้าน (ไม่บังคับ) — ว่าง = ไม่ระบุ */
const emptyToUndefined = ({ value }: { value: unknown }) => {
  const v = typeof value === 'string' ? value.trim() : value;
  return v === '' ? undefined : v;
};

/**
 * ข้อมูลบ้านที่ละเอียดขึ้น (✅ 2026-11-04) — ไม่บังคับที่ API (เว็บบังคับที่ฟอร์ม) · พิกัด/ผู้ติดต่อฉุกเฉินต้องมาเป็นคู่
 * ใช้ซ้ำใน SignupOwnerDto / AddOwnerRoleDto (class-validator ไม่รองรับสืบทอดหลายชั้น จึงประกาศฟิลด์ซ้ำ)
 */
/**
 * รายละเอียดเพิ่ม (✅ 2026-11-06 "ข้อมูลตอนสมัครขอแบบละเอียดเลย") — ทุกช่องไม่บังคับที่ API (เว็บบังคับบางช่อง) · เก็บใน user_tb.profile
 * ไม่เก็บเลขบัตรประชาชน (ไม่จำเป็นต่อระบบ — เก็บน้อยที่สุดที่ยังใช้ได้)
 */
export class ProfileExtrasDto {
  @IsOptional() @IsIn(TITLES) title?: (typeof TITLES)[number];
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 60) first_name?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 60) last_name?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 40) nickname?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(3, 200) @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'email looks invalid' }) email?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Matches(/^[0-9]{5}$/, { message: 'postal_code must be 5 digits' }) postal_code?: string;
  /** เจ้าของบ้าน */
  @IsOptional() @IsIn(HOUSE_TYPES) house_type?: (typeof HOUSE_TYPES)[number];
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) village?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(99) residents?: number;
  /** ผู้ที่ต้องการดูแลพิเศษในบ้าน (เจ้าหน้าที่เห็นเฉพาะตอน SOS เปิดอยู่) */
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(CARE_TAGS, { each: true }) care?: (typeof CARE_TAGS)[number][];
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 200) landmark?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 60) emergency_relation?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) contact_time?: string;
  /** เจ้าหน้าที่ */
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) rank?: string;
}

export class SignupOwnerDto extends PasswordField {
  @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @Transform(phone) @IsString() @Matches(PHONE_RE, { message: PHONE_MSG }) phone!: string;
  @Transform(trim) @IsString() @Length(1, 50) house_no!: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) area?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 200) address_line?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) subdistrict?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) district?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) province?: string;
  @ValidateIf((o: { lat?: number; lng?: number }) => o.lat !== undefined || o.lng !== undefined) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @ValidateIf((o: { lat?: number; lng?: number }) => o.lat !== undefined || o.lng !== undefined) @IsNumber() @Min(-180) @Max(180) lng?: number;
  @ValidateIf((o: { emergency_name?: string; emergency_phone?: string }) => o.emergency_name !== undefined || o.emergency_phone !== undefined) @Transform(trim) @IsString() @Length(1, 100) emergency_name?: string;
  @ValidateIf((o: { emergency_name?: string; emergency_phone?: string }) => o.emergency_name !== undefined || o.emergency_phone !== undefined) @Transform(phone) @IsString() @Matches(PHONE_RE, { message: PHONE_MSG }) emergency_phone?: string;
  @IsOptional() @ValidateNested() @Type(() => ProfileExtrasDto) profile?: ProfileExtrasDto;
  @IsString() @Length(1, 50) terms_version!: string;
}

export class SignupOfficerDto extends PasswordField {
  @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @Transform(phone) @IsString() @Matches(PHONE_RE, { message: PHONE_MSG }) phone!: string;
  @Transform(upper) @IsString() @Length(4, 32) group_code!: string;
  /** ตำแหน่ง/ยศ และเลขประจำตัวในหน่วยงาน (✅ 2026-11-04) */
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) position?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 50) staff_no?: string;
  @ValidateIf((o: { emergency_name?: string; emergency_phone?: string }) => o.emergency_name !== undefined || o.emergency_phone !== undefined) @Transform(trim) @IsString() @Length(1, 100) emergency_name?: string;
  @ValidateIf((o: { emergency_name?: string; emergency_phone?: string }) => o.emergency_name !== undefined || o.emergency_phone !== undefined) @Transform(phone) @IsString() @Matches(PHONE_RE, { message: PHONE_MSG }) emergency_phone?: string;
  @IsOptional() @ValidateNested() @Type(() => ProfileExtrasDto) profile?: ProfileExtrasDto;
  @IsString() @Length(1, 50) terms_version!: string;
}

class AgencyInfo {
  @Transform(trim) @IsString() @Length(1, 200) name!: string;
  @IsIn(['police', 'guard', 'other']) type!: 'police' | 'guard' | 'other';
  /** ช่องทางติดต่อที่ตั้งใจเปิดเผย — แสดงให้คนที่ขอเข้าหน่วยงาน (A11 / A11-b) */
  @Transform(trim) @IsString() @Length(3, 200) contact!: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 300) address?: string;
  /** เลขทะเบียนหน่วยงาน / ใบอนุญาต (แอดมินใช้ประกอบการอนุมัติ) */
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) registration_no?: string;
  /** ที่อยู่ละเอียด + ช่องทางติดต่อ + พิกัด (✅ 2026-11-06 · แสดงบนแผนที่ให้เจ้าของบ้านเลือกหน่วยงาน) */
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) subdistrict?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) district?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) province?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Matches(/^[0-9]{5}$/, { message: 'postal_code must be 5 digits' }) postal_code?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(3, 30) phone?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(3, 200) email?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) contact_person?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 300) coverage_note?: string;
  @ValidateIf((o: { lat?: number; lng?: number }) => o.lat !== undefined || o.lng !== undefined) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @ValidateIf((o: { lat?: number; lng?: number }) => o.lat !== undefined || o.lng !== undefined) @IsNumber() @Min(-180) @Max(180) lng?: number;
}

class HeadInfo extends PasswordField {
  @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @Transform(phone) @IsString() @Matches(PHONE_RE, { message: PHONE_MSG }) phone!: string;
  @IsOptional() @ValidateNested() @Type(() => ProfileExtrasDto) profile?: ProfileExtrasDto;
}

export class SignupAgencyDto {
  @ValidateNested() @Type(() => AgencyInfo) agency!: AgencyInfo;
  @ValidateNested() @Type(() => HeadInfo) head!: HeadInfo;
  @IsString() @Length(1, 50) terms_version!: string;
}

export class SigninDto {
  // ไม่ตรวจรูปแบบละเอียด — เบอร์ผิดรูปแบบตอบเหมือนรหัสผิด (ไม่บอกว่าเบอร์ไหนมีบัญชี)
  @Transform(phone) @IsString() @Length(1, 30) phone!: string;
  @IsString() @Length(1, 128) password!: string;
}

/** ลบบัญชี (api.md §3.2) — ต้องพิมพ์ยืนยัน + รหัสผ่านปัจจุบัน */
export class DeleteAccountDto {
  @IsString() @Length(1, 128) password!: string;
  @IsIn(['DELETE']) confirm!: 'DELETE';
}

export class ChangePasswordDto {
  @IsString() @Length(1, 128) current_password!: string;
  @IsString() @MinLength(8) @MaxLength(128) new_password!: string;
}

/** การแสดงผลที่เก็บกับบัญชี (api.md §3 `Prefs`) — `lang` ใช้กับข้อความแจ้งเตือนจาก server ด้วย */
export class PrefsDto {
  @IsOptional() @IsIn(['light', 'dark', 'system']) theme?: 'light' | 'dark' | 'system';
  @IsOptional() @IsIn(['th', 'en']) lang?: 'th' | 'en';
  @IsOptional() @IsIn(['normal', 'large', 'xlarge']) text_size?: 'normal' | 'large' | 'xlarge';
  @IsOptional() @IsBoolean() simple_home?: boolean;
  @IsOptional() @IsBoolean() night_auto_dark?: boolean;
  /** โหมดใช้งานง่าย (ตัวใหญ่ ปุ่มใหญ่ หน้าหลักเรียบง่าย) — ทุกบทบาท */
  @IsOptional() @IsBoolean() easy_mode?: boolean;
  /** โหมดการแสดงผล 3 ระดับ (✅ 2026-11-06): easy = เห็นเฉพาะที่จำเป็น · default = ปกติ · advanced = เห็นรายละเอียดทุกอย่าง · `easy_mode` คงไว้ให้ client รุ่นเก่า (= ui_mode === 'easy') */
  @IsOptional() @IsIn(['easy', 'default', 'advanced']) ui_mode?: 'easy' | 'default' | 'advanced';
  /** แจ้งเตือนที่ปิดรับ — รับเฉพาะ type ที่ปิดได้ (MUTABLE_NOTIFICATION_TYPES) · ส่งมาเป็นรายการเต็มทุกครั้ง */
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(MUTABLE_NOTIFICATION_TYPES, { each: true }) muted_types?: (typeof MUTABLE_NOTIFICATION_TYPES)[number][];
}

export class UpdateMeDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100) display_name?: string;
  @IsOptional() @ValidateNested() @Type(() => PrefsDto) prefs?: PrefsDto;
  /** รายละเอียดเพิ่ม (รวมกับของเดิม ส่งมาเฉพาะที่เปลี่ยน · ส่งค่า null/ว่างเพื่อลบไม่ได้ — ใช้ค่าใหม่ทับ) */
  @IsOptional() @ValidateNested() @Type(() => ProfileExtrasDto) profile?: ProfileExtrasDto;
}

export class AddOwnerRoleDto {
  @Transform(trim) @IsString() @Length(1, 50) house_no!: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) area?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 200) address_line?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) subdistrict?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) district?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) province?: string;
  @ValidateIf((o: { lat?: number; lng?: number }) => o.lat !== undefined || o.lng !== undefined) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @ValidateIf((o: { lat?: number; lng?: number }) => o.lat !== undefined || o.lng !== undefined) @IsNumber() @Min(-180) @Max(180) lng?: number;
  @ValidateIf((o: { emergency_name?: string; emergency_phone?: string }) => o.emergency_name !== undefined || o.emergency_phone !== undefined) @Transform(trim) @IsString() @Length(1, 100) emergency_name?: string;
  @ValidateIf((o: { emergency_name?: string; emergency_phone?: string }) => o.emergency_name !== undefined || o.emergency_phone !== undefined) @Transform(phone) @IsString() @Matches(PHONE_RE, { message: PHONE_MSG }) emergency_phone?: string;
  @IsOptional() @ValidateNested() @Type(() => ProfileExtrasDto) profile?: ProfileExtrasDto;
  @IsString() @Length(1, 50) terms_version!: string;
}

export class AcceptTermsDto {
  @IsString() @Length(1, 50) terms_version!: string;
}

export class JoinAgencyDto {
  @Transform(upper) @IsString() @Length(4, 32) group_code!: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) position?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 50) staff_no?: string;
  @IsString() @Length(1, 50) terms_version!: string;
}
