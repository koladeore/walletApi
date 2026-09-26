import {
  Controller,
  Get,
  UseGuards,
  Req,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'User profiles retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getAllUsers() {
    return this.usersService.getAllUsers();
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getProfile(@Req() req: AuthenticatedRequest) {
    const user = await this.usersService.getProfile(req.user.id);
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return user;
  }

  @Get('wallet')
  @ApiOperation({ summary: 'Get current user wallet balance' })
  @ApiResponse({ status: 200, description: 'Wallet retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getWallet(@Req() req: AuthenticatedRequest) {
    const wallet = await this.usersService.getWallet(req.user.id);
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid user ID.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async getUserById(@Param('id', new ParseUUIDPipe()) id: string) {
    const user = await this.usersService.getProfile(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
