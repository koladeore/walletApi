import { LimitsModule } from '../limits/limits.module';
import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { EmailModule } from '../email/email.module';
import { NotificationModule } from '../notification/notification.module';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [LimitsModule, EmailModule, NotificationModule, SecurityModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
