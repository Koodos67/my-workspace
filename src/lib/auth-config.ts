import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { Resend } from 'resend';
import { getPool } from './db';
export function authOptions(): BetterAuthOptions {
  return {
    appName: 'KOODOS',
    database: getPool(),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30, customRules: { '/sign-in/magic-link': { window: 60, max: 3 } } },
    plugins: [
      magicLink({
        disableSignUp: true,
        expiresIn: 60 * 15,
        storeToken: 'hashed',
        async sendMagicLink({ email, url }) {
          // disableSignUp alone still sends mail to unknown users; suppress that here.
          const { rows } = await getPool().query(
            'SELECT 1 FROM public."user" u JOIN public.profiles p ON p.id = u.id WHERE lower(u.email) = lower($1) AND (p.role = $2 OR EXISTS (SELECT 1 FROM memberships m JOIN clients c ON c.id = m.client_id WHERE m.profile_id = u.id AND c.status = $3))',
            [email, 'admin', 'active'],
          );
          if (!rows.length) return;
          const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
            from: process.env.EMAIL_FROM!,
            to: email,
            subject: 'Your sign-in link to KOODOS',
            text: 'Welcome to KOODOS.\n\nSign in to your workspace:\n' + url + '\n\nThis link expires in 15 minutes and can only be used once. If you did not request it, you can ignore this email.',
          });
          if (error) console.error('Magic-link delivery failed:', error.name);
        },
      }),
      nextCookies(),
    ],
  };
}
let instance: ReturnType<typeof betterAuth> | undefined;
export function getAuth() { return instance ??= betterAuth(authOptions()); }
