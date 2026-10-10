import {
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsDateString,
  Max,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TransactionType } from '@prisma/client';

export class TransactionHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Legacy page number (maximum 1000). Use cursor mode for deep history',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of records per page (maximum 100)',
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    enum: ['page', 'cursor'],
    default: 'page',
    description:
      'Cursor mode avoids deep offset/count queries; response meta contains nextCursor and hasMore.',
  })
  @IsOptional()
  @IsEnum({ page: 'page', cursor: 'cursor' })
  mode?: 'page' | 'cursor';
  @ApiPropertyOptional({
    description: 'nextCursor from the previous cursor-mode response. Preserve filters.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;

  @ApiPropertyOptional({ description: 'Filter by transaction type', enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ description: 'Filter from this date (ISO format)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter up to this date (ISO format)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
