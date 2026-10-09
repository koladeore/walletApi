import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { SecurityService } from './security.service';
import { CodeDto, ResetConfirmDto, ResetRequestDto, StepUpRequestDto } from './security.dto';

@ApiTags('account-security')
@Controller('auth/security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}
  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read your email verification status' })
  status(@Req() req: AuthenticatedRequest) {
    return this.security.status(req.user.id);
  }
  @Post('email/request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deliver a single-use email verification code' })
  emailRequest(@Req() req: AuthenticatedRequest) {
    return this.security.requestEmail(req.user.id);
  }
  @Post('email/confirm')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm email with the delivered code' })
  emailConfirm(@Req() req: AuthenticatedRequest, @Body() dto: CodeDto) {
    return this.security.confirmEmail(req.user.id, dto.challengeId, dto.code);
  }
  @Post('password/request-reset')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request password recovery; response does not disclose account existence',
  })
  resetRequest(@Body() dto: ResetRequestDto) {
    return this.security.requestReset(dto.email);
  }
  @Post('password/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Use a reset code and invalidate previous sessions' })
  reset(@Body() dto: ResetConfirmDto) {
    return this.security.resetPassword(dto.challengeId, dto.code, dto.newPassword);
  }
  @Post('step-up/request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm password and request an email code for an exact sensitive action',
  })
  stepRequest(@Req() req: AuthenticatedRequest, @Body() dto: StepUpRequestDto) {
    return this.security.requestStepUp(req.user.id, dto.password, dto.action, dto.details);
  }
  @Post('step-up/confirm')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Exchange the email code for a single-use 5-minute action proof' })
  stepConfirm(@Req() req: AuthenticatedRequest, @Body() dto: CodeDto) {
    return this.security.confirmStepUp(req.user.id, dto.challengeId, dto.code);
  }
}
