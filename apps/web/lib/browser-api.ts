export const browserApiBase = process.env.NEXT_PUBLIC_API_URL ??
 (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:4000/api/v1');
