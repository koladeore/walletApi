import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'Public user profile returned. Passwords and password hashes are never included.',
  })
  @ApiResponse({ status: 400, description: 'Invalid registration data.' })
  @ApiResponse({ status: 409, description: 'Email already exists.' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 200, description: 'User successfully logged in and tokens returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized / Invalid credentials.' })
  login(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest) {
    return this.authService.login(dto, req.headers['user-agent']);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate access and refresh tokens atomically',
    description:
      'Use the latest refresh token once. Serialize refresh calls across tabs. Reusing an old token revokes this entire session, including tokens returned by the first refresh. Session expiry is fixed at login; refreshing does not extend it.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string', example: 'eyJ...refresh-token' } },
    },
  })
  @ApiResponse({ status: 200, description: 'New access token successfully generated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized / Invalid refresh token.' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out user' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string', example: 'eyJ...refresh-token' } },
    },
  })
  @ApiResponse({ status: 200, description: 'User successfully logged out.' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List your active login sessions',
    description:
      'Device information is the client-provided User-Agent, not a verified device identity. lastUsedAt records login/refresh activity. current identifies this bearer token session.',
  })
  sessions(@Req() req: AuthenticatedRequest) {
    return this.authService.sessions(req.user.id, req.user.sessionId);
  }

  @Post('sessions/:id/logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Log out a selected session',
    description:
      'Use id from GET /auth/sessions, not user or wallet ID. Revokes both access and refresh tokens for that session. Other devices remain logged in.',
  })
  revoke(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.authService.revokeSession(req.user.id, id);
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Log out all devices, including this one',
    description:
      'Invalidates every session and existing action proofs. Clear local credentials and redirect to login.',
  })
  logoutAll(@Req() req: AuthenticatedRequest) {
    return this.authService.logoutAll(req.user.id);
  }
}
