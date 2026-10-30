import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { normalizePhone } from './phone.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
// เบอร์ที่ใช้ไม่ได้ → คืนค่าเดิมให้ @Matches ตอบ 400
const phone = ({ value }: { value: unknown }) => normalizePhone(value) ?? value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : value;

const PHONE_RE = /^0\d{9}$/;
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

export class SignupOwnerDto extends PasswordField {
  @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @Transform(phone) @IsString() @Matches(PHONE_RE, { message: PHONE_MSG }) phone!: string;
  @Transform(trim) @IsString() @Length(1, 50) house_no!: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) area?: string;
  @IsString() @Length(1, 50) terms_version!: string;
}

export class SignupOfficerDto extends PasswordField {
  @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @Transform(phone) @IsString() @Matches(PHONE_RE, { message: PHONE_MSG }) phone!: string;
  @Transform(upper) @IsString() @Length(4, 32) group_code!: string;
  @IsString() @Length(1, 50) terms_version!: string;
}

class AgencyInfo {
  @Transform(trim) @IsString() @Length(1, 200) name!: string;
  @IsIn(['police', 'guard', 'other']) type!: 'police' | 'guard' | 'other';
  /** ช่องทางติดต่อที่ตั้งใจเปิดเผย — แสดงให้คนที่ขอเข้าหน่วยงาน (A11 / A11-b) */
  @Transform(trim) @IsString() @Length(3, 200) contact!: string;
}

class HeadInfo extends PasswordField {
  @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @Transform(phone) @IsString() @Matches(PHONE_RE, { message: PHONE_MSG }) phone!: string;
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
}

export class UpdateMeDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100) display_name?: string;
  @IsOptional() @ValidateNested() @Type(() => PrefsDto) prefs?: PrefsDto;
}

export class AddOwnerRoleDto {
  @Transform(trim) @IsString() @Length(1, 50) house_no!: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(1, 100) area?: string;
  @IsString() @Length(1, 50) terms_version!: string;
}

export class AcceptTermsDto {
  @IsString() @Length(1, 50) terms_version!: string;
}

export class JoinAgencyDto {
  @Transform(upper) @IsString() @Length(4, 32) group_code!: string;
  @IsString() @Length(1, 50) terms_version!: string;
}
