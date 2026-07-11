import { createClient } from '@surewina/api-client';

export const api = createClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1',
});