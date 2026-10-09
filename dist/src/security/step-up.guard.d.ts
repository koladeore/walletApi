import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SecurityAction } from './actions';
import { SecurityService } from './security.service';
export declare const RequiresStepUp: (action: SecurityAction) => import("@nestjs/common").CustomDecorator<string>;
export declare const SensitiveAction: (action: SecurityAction) => <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
export declare class StepUpGuard implements CanActivate {
    private readonly reflector;
    private readonly security;
    constructor(reflector: Reflector, security: SecurityService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
