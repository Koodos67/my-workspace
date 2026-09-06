export function isConfigured() {
  return Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL && process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}
