import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
export class CursorQueryDto {
  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Records per page. Maximum 100.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @ApiPropertyOptional({
    description:
      'Opaque nextCursor from the previous response. Keep the same filters. Omit for first page.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}
type Field = 'createdAt' | 'startedAt' | 'firstSeenAt';
type Bounds = {
  OR: Array<{
    id?: { lt: string };
    createdAt?: Date | { lt: Date };
    startedAt?: Date | { lt: Date };
    firstSeenAt?: Date | { lt: Date };
  }>;
};
export function cursorBounds(
  cursor: string | undefined,
  scope: string,
  field: Field = 'createdAt',
): Bounds | Record<string, never> {
  if (!cursor) return {};
  try {
    if (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw Error();
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') throw Error();
    const value = parsed as Record<string, unknown>;
    if (
      value.scope !== scope ||
      value.field !== field ||
      typeof value.id !== 'string' ||
      value.id.length < 1 ||
      value.id.length > 200 ||
      typeof value.date !== 'string'
    )
      throw Error();
    const date = new Date(value.date);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== value.date) throw Error();
    return { OR: [{ [field]: { lt: date } }, { [field]: date, id: { lt: value.id } }] };
  } catch {
    throw new BadRequestException('Invalid cursor for this list and filters');
  }
}
export function cursorPage<T extends { id: string }, R = T>(
  rows: T[],
  limit: number,
  scope: string,
  field: Field = 'createdAt',
  map: (row: T) => R = (row) => row as unknown as R,
) {
  const hasMore = rows.length > limit;
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  const date = last ? (last as unknown as Record<string, unknown>)[field] : null;
  const nextCursor =
    hasMore && last && date instanceof Date
      ? Buffer.from(
          JSON.stringify({ scope, field, date: date.toISOString(), id: last.id }),
        ).toString('base64url')
      : null;
  return { data: visible.map(map), meta: { limit, hasMore, nextCursor } };
}
