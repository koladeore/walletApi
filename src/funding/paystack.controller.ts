import { Controller, Get, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';

@ApiTags('paystack')
@Controller('paystack')
export class PaystackController {
  constructor(private readonly webhook: WebhookService) {}

  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  @ApiOperation({ summary: 'Paystack signed webhook (provider use only)' })
  receive(@Req() req: RawBodyRequest<Request>, @Headers('x-paystack-signature') signature: string) {
    return this.webhook.receive(req.rawBody, signature);
  }

  @Get('callback')
  @ApiOperation({ summary: 'Informational checkout callback; never credits wallets' })
  callback() {
    return {
      message:
        'Checkout returned. Check your funding status or use the authenticated verify endpoint to confirm payment.',
    };
  }
}
