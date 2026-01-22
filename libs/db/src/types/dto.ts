import type { PaymentStatus } from '../schema/payments';

// User DTOs
export interface CreateUserDto {
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface UpdateUserDto {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

// Payment DTOs
export interface CreatePaymentDto {
  userId: number;
  telegramPaymentChargeId: string;
  amount: number;
  currency?: string; // Defaults to 'XTR'
  status: PaymentStatus;
}
