import { CursorQueryDto } from '../common/pagination/cursor';
import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Req,
  Query,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { NotificationService } from './notification.service';
class NotificationQuery extends CursorQueryDto {
  @ApiPropertyOptional({ enum: ['page', 'cursor'], default: 'page' })
  @IsOptional()
  @IsIn(['page', 'cursor'])
  mode?: 'page' | 'cursor';
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 1000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page = 1;
  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'false' })
  @IsOptional()
  @IsIn(['true', 'false'])
  unreadOnly?: string;
}
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}
  @Get()
  @ApiOperation({
    summary: 'List your persisted notifications, newest first',
    description:
      'Legacy mode uses 20 per page; mode=cursor supports limit (max 100) and nextCursor. data contains navigation IDs and money in minor-unit strings. Render title/body as plain text. These are informational; read wallet/payment endpoints for authoritative state.',
  })
  list(@Req() req: AuthenticatedRequest, @Query() query: NotificationQuery) {
    return this.notifications.list(req.user.id, query.page, query.unreadOnly === 'true', query);
  }
  @Get('unread-count')
  @ApiOperation({ summary: 'Read your unread notification count' })
  count(@Req() req: AuthenticatedRequest) {
    return this.notifications.unreadCount(req.user.id);
  }
  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark your currently unread notifications as read' })
  all(@Req() req: AuthenticatedRequest) {
    return this.notifications.readAll(req.user.id);
  }
  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Mark one of your notifications read; repeated calls preserve its first read timestamp',
  })
  read(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.notifications.read(req.user.id, id);
  }
}
