import type { SecurityAction } from './actions';
export declare class CodeDto {
    challengeId: string;
    code: string;
}
export declare class ResetRequestDto {
    email: string;
}
export declare class ResetConfirmDto extends CodeDto {
    newPassword: string;
}
export declare class StepUpRequestDto {
    password: string;
    action: SecurityAction;
    details: Record<string, unknown>;
}
