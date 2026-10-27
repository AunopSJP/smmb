import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { isAllowedPushEndpoint } from './push.sender.js';

@ValidatorConstraint({ name: 'pushEndpoint' })
class PushEndpointRule implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isAllowedPushEndpoint(value);
  }
  defaultMessage() {
    return 'endpoint must be an https URL of a known push service';
  }
}

class PushKeys {
  @IsString() @Length(1, 200) p256dh!: string;
  @IsString() @Length(1, 100) auth!: string;
}

/** PushSubscriptionJSON ของเบราว์เซอร์ + device_label */
export class SubscribeDto {
  @IsString() @MaxLength(1000) @Validate(PushEndpointRule) endpoint!: string;
  @ValidateNested() @Type(() => PushKeys) keys!: PushKeys;
  // เบราว์เซอร์ส่งมาด้วย (มักเป็น null) — รับไว้แต่ไม่ใช้
  @IsOptional() @IsInt() expirationTime?: number | null;
  @IsOptional() @IsString() @MaxLength(100) device_label?: string;
}

export class UnsubscribeDto {
  @IsString() @MaxLength(1000) endpoint!: string;
}

export class ListNotificationsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) per_page: number = 20;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  unread: boolean = false;
}

export class MarkReadDto {
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('4', { each: true }) ids?: string[];
}
