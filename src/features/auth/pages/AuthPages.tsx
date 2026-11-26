import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Bookmark, MailCheck, Radio, Star } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { Notice } from '@/components/common/states';
import { Logo } from '@/components/navigation/Logo';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { hasBackend } from '@/lib/env';
import { emailSchema, passwordSchema } from '@/lib/schemas';
import { authService } from '@/services/auth';
import { useAuth } from '@/store/auth';
import { AuthForm } from '../components/AuthForm';

const PERKS = [
  { icon: Star, title: 'Review the places you know', text: 'Your ratings help neighbours choose well.' },
  { icon: Radio, title: 'Share what is happening', text: 'Queues, closures, free parking: three taps.' },
  { icon: Bookmark, title: 'Keep your places', text: 'Collections for weekends, errands and emergencies.' },
];

/** Split layout for the account screens. Discovery is always one tap away: nothing is locked behind sign-in. */
function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-10rem)] w-full max-w-[1100px] items-stretch gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_440px] lg:py-12">
      <section className="relative hidden overflow-hidden rounded-[32px] bg-forest p-10 text-on-forest lg:flex lg:flex-col">
        {/* Orbit motif from the logo, large and quiet */}
        <svg viewBox="0 0 400 400" className="absolute -bottom-24 -right-24 size-[420px] opacity-[0.09]" aria-hidden>
          <circle cx="200" cy="200" r="150" fill="none" stroke="currentColor" strokeWidth="26" strokeDasharray="236 236" strokeLinecap="round" />
          <circle cx="200" cy="200" r="62" fill="currentColor" />
        </svg>
        <p className="text-sm opacity-75">NearMe · Everything around you</p>
        <h2 className="display mt-auto max-w-sm text-[44px]">Your neighbourhood, better with you in it.</h2>
        <ul className="mt-8 space-y-4">
          {PERKS.map((p) => (
            <li key={p.title} className="flex items-start gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
                <p.icon className="size-5" strokeWidth={1.75} />
              </span>
              <span>
                <span className="block text-[15px] font-semibold">{p.title}</span>
                <span className="block text-sm opacity-75">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col justify-center">
        <Link to="/" className="mb-6 inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted-2 hover:text-ink">
          <ArrowLeft className="size-4" /> Keep exploring without an account
        </Link>
        <Logo className="mb-6 lg:hidden" />
        <h1 className="display text-[32px] text-ink sm:text-[38px]">{title}</h1>
        <p className="mb-6 mt-1.5 text-[15px] text-muted-2">{subtitle}</p>
        {children}
      </section>
    </div>
  );
}

/** Where to go after signing in. Only same-site paths are honoured. */
function useNext() {
  const [params] = useSearchParams();
  const next = params.get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/profile';
}

function useRedirectIfSignedIn() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const next = useNext();
  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, navigate, next]);
}

export function LoginPage() {
  useRedirectIfSignedIn();
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to review, save across devices and share live updates.">
      <AuthForm initialMode="signin" />
    </AuthShell>
  );
}

export function RegisterPage() {
  useRedirectIfSignedIn();
  return (
    <AuthShell title="Create your account" subtitle="It takes a minute. You can keep browsing either way.">
      <AuthForm initialMode="signup" />
      <p className="mt-5 text-center text-[12.5px] leading-relaxed text-muted-2">By creating an account you agree to contribute honestly. Your precise location is never shown to others.</p>
    </AuthShell>
  );
}

const resetSchema = z.object({ email: emailSchema, password: passwordSchema.optional() });
type ResetForm = z.infer<typeof resetSchema>;

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [sent, setSent] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError } = useForm<ResetForm>({ resolver: zodResolver(resetSchema) as never, defaultValues: { email: '', password: '' } });

  const submit = handleSubmit(async ({ email, password }) => {
    try {
      if (hasBackend) {
        await authService.resetPassword(email);
        setSent(email);
        return;
      }
      if (!password) return setError('password', { message: 'Choose a new password of at least 8 characters.' });
      await authService.setLocalPassword(email, password);
      toast.success('Password updated', { description: 'Sign in with your new password.' });
      navigate('/login');
    } catch (e) {
      setError('email', { message: e instanceof Error ? e.message : 'Could not reset the password.' });
    }
  });

  return (
    <AuthShell title="Reset your password" subtitle={hasBackend ? 'Enter your email and we will send a reset link.' : 'Set a new password for an account on this device.'}>
      {sent ? (
        <Notice tone="success" icon={MailCheck}>
          <p className="font-semibold text-ink">Check your inbox</p>
          If an account exists for {sent}, a reset link is on its way. It can take a couple of minutes.
        </Notice>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {!hasBackend && (
            <Notice>
              <span className="font-medium text-ink">Local mode.</span> There is no email server, so reset links cannot be sent. Because the account lives only on this device, you can set a new password here.
            </Notice>
          )}
          <Field label="Email" htmlFor="reset-email" error={formState.errors.email?.message}>
            <Input id="reset-email" type="email" autoComplete="email" aria-invalid={Boolean(formState.errors.email)} {...register('email')} />
          </Field>
          {!hasBackend && (
            <Field label="New password" htmlFor="reset-password" hint="At least 8 characters." error={formState.errors.password?.message}>
              <Input id="reset-password" type="password" autoComplete="new-password" aria-invalid={Boolean(formState.errors.password)} {...register('password')} />
            </Field>
          )}
          <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
            {hasBackend ? 'Send reset link' : 'Set new password'}
          </Button>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-muted-2">
        Remembered it?{' '}
        <Link to="/login" className="font-semibold text-ink underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
