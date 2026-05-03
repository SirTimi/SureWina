import { z } from 'zod';
import { isValidNigerianPhone, normalizePhone, isValidStateCode } from '@surewina/utils';

export const purchaseSchema = z.object({
  quantity: z
    .number({ message: 'Quantity is required' })
    .int()
    .min(1, 'At least 1 ticket')
    .max(100, 'Maximum 100 tickets per purchase'),
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .refine((val) => isValidNigerianPhone(val), {
      message: 'Enter a valid Nigerian phone number',
    })
    .transform((val) => normalizePhone(val) as string),
  stateOfPlayCode: z
    .string()
    .min(1, 'Select your state of play')
    .refine((val) => isValidStateCode(val), {
      message: 'Invalid state code',
    }),
  paymentMethod: z.enum(['CARD', 'TRANSFER', 'USSD', 'OPAY'], {
    message: 'Select a payment method',
  }),
  ageConfirmed: z.literal(true, {
    message: 'You must confirm you are 18 or older',
  }),
});

export type PurchaseFormValues = z.input<typeof purchaseSchema>;
export type PurchaseFormParsed = z.output<typeof purchaseSchema>;