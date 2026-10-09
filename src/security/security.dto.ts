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
  @ApiProperty() @IsUUID() challengeId!: string;
  @ApiProperty({ example: '123456' })
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.code)
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
export class ResetRequestDto {
  @ApiProperty() @IsEmail() @MaxLength(320) email!: string;
}
export class ResetConfirmDto extends CodeDto {
  @ApiProperty({ minLength: 12, maxLength: 72 })
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.newPassword)
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  newPassword!: string;
}
export class StepUpRequestDto {
  @ApiProperty()
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
