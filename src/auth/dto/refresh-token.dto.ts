import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MinLength, MaxLength } from 'class-validator';
export class RefreshTokenDto {
  @ApiProperty({
    example: 'eyJ...refresh-token',
    description:
      'Latest refresh token for this session. Replace both tokens after every successful refresh.',
  })
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.refreshToken)
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  refreshToken!: string;
}
