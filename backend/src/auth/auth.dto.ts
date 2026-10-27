import { Transform, Type } from 'class-transformer';
import { IsIn, IsString, Length, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
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

export class SignupOwnerDto extends PasswordField {
  @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @Transform(phone) @IsString() @Matches(PHONE_RE, { message: PHONE_MSG }) phone!: string;
  @Transform(trim) @IsString() @Length(1, 50) house_no!: string;
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

export class AddOwnerRoleDto {
  @Transform(trim) @IsString() @Length(1, 50) house_no!: string;
  @IsString() @Length(1, 50) terms_version!: string;
}

export class AcceptTermsDto {
  @IsString() @Length(1, 50) terms_version!: string;
}

export class JoinAgencyDto {
  @Transform(upper) @IsString() @Length(4, 32) group_code!: string;
  @IsString() @Length(1, 50) terms_version!: string;
}
