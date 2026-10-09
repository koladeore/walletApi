import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule, SecurityModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
