import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { SecurityAction } from './actions';

export class CodeDto {
  @ApiProperty({
    format: 'uuid',
    example: 'de305d54-75b4-431b-adb2-eb6b9e546014',
    description: 'Challenge ID from the request response or recovery email',
  })
  @IsUUID()
  challengeId!: string;
  @ApiProperty({
    example: '012345',
    pattern: '^\\d{6}$',
    description: 'Six-digit code from email, as a string; preserve leading zeros',
  })
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.code)
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
export class ResetRequestDto {
  @ApiProperty({ example: 'user@example.com' }) @IsEmail() @MaxLength(320) email!: string;
}
export class ResetConfirmDto extends CodeDto {
  @ApiProperty({
    minLength: 12,
    maxLength: 72,
    example: 'MyNewPassword123!',
    description:
      'At least 12 characters and at most 72 UTF-8 bytes. Successful reset invalidates existing sessions.',
  })
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.newPassword)
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  newPassword!: string;
}
export class StepUpRequestDto {
  @ApiProperty({
    example: 'YOUR_CURRENT_PASSWORD',
    description: 'Current login password; never store this in frontend logs',
  })
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.password)
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
  @ApiProperty({ enum: ['TRANSFER', 'PAYOUT', 'BENEFICIARY', 'ADMIN'] })
  @IsIn(['TRANSFER', 'PAYOUT', 'BENEFICIARY', 'ADMIN'])
  action!: SecurityAction;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { beneficiaryId: 'YOUR_UUID', amount: '100.00' },
  })
  @IsObject()
  details!: Record<string, unknown>;
}
