import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, HardDrive, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Notice } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { hasBackend } from '@/lib/env';
import { phoneSchema, signInSchema, signUpSchema, type SignUpInput } from '@/lib/schemas';
import { authService } from '@/services/auth';

type Mode = 'signin' | 'signup';

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

/** Phone sign-in by one-time code. Only rendered when a backend with an SMS provider is configured. */
function PhoneSignIn({ onDone }: { onDone?: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setBusy(true);
    setError('');
    try {
      await authService.requestPhoneOtp(parsed.data);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      await authService.verifyPhoneOtp(phone, code.trim());
      toast.success('Signed in');
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Mobile number" htmlFor="auth-phone" hint="Include the country code, e.g. +91 98765 43210" error={!sent ? error : undefined}>
        <Input id="auth-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={sent} />
      </Field>
      {sent && (
        <Field label="6-digit code" htmlFor="auth-otp" error={error}>
          <Input id="auth-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="tabular tracking-[0.3em]" />
        </Field>
      )}
      <Button className="w-full" size="lg" loading={busy} onClick={sent ? verify : send} disabled={sent && code.length < 6}>
        {sent ? 'Verify and continue' : 'Send code'}
      </Button>
    </div>
  );
}

export function AuthForm({ initialMode = 'signin', onDone, embedded }: { initialMode?: Mode; onDone?: () => void; embedded?: boolean }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmSent, setConfirmSent] = useState(false);
  const signup = mode === 'signup';

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signup ? signUpSchema : signInSchema) as never,
    defaultValues: { name: '', email: '', password: '' },
    mode: 'onTouched',
  });
  const { register, handleSubmit, formState } = form;
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      if (signup) {
        const { user, needsEmailConfirmation } = await authService.signUp(values);
        if (needsEmailConfirmation) return setConfirmSent(true);
        toast.success(`Welcome, ${user?.name.split(' ')[0]}`);
      } else {
        const user = await authService.signIn(values);
        toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
      }
      onDone?.();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    }
  });

  const google = async () => {
    try {
      await authService.signInWithGoogle();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Google sign-in failed.');
    }
  };

  if (confirmSent) {
    return (
      <Notice tone="success">
        <p className="font-semibold text-ink">Check your inbox</p>
        We sent a confirmation link to {form.getValues('email')}. Open it to finish creating your account.
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      {!hasBackend && (
        <Notice icon={HardDrive}>
          <span className="font-medium text-ink">Local mode.</span> No server is connected, so this account lives on this device only. Google and phone sign-in become available once Supabase keys are added.
        </Notice>
      )}

      {hasBackend && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" size="lg" onClick={google} className="px-3">
              <GoogleGlyph /> Google
            </Button>
            <Button variant={method === 'phone' ? 'soft' : 'secondary'} size="lg" onClick={() => setMethod(method === 'phone' ? 'email' : 'phone')} className="px-3">
              <Smartphone /> {method === 'phone' ? 'Use email' : 'Phone'}
            </Button>
          </div>
          <div className="flex items-center gap-3 text-[12.5px] text-muted">
            <span className="h-px flex-1 bg-line" /> or continue with {method} <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      {method === 'phone' && hasBackend ? (
        <PhoneSignIn onDone={onDone} />
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-3.5">
          {signup && (
            <Field label="Your name" htmlFor="auth-name" error={errors.name?.message}>
              <Input id="auth-name" autoComplete="name" aria-invalid={Boolean(errors.name)} {...register('name')} />
            </Field>
          )}
          <Field label="Email" htmlFor="auth-email" error={errors.email?.message}>
            <Input id="auth-email" type="email" inputMode="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
          </Field>
          <Field label="Password" htmlFor="auth-password" error={errors.password?.message} hint={signup ? 'At least 8 characters.' : undefined}>
            <div className="relative">
              <Input id="auth-password" type={show ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} aria-invalid={Boolean(errors.password)} className="pr-11" {...register('password')} />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-2 hover:bg-bg-2">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>

          {!signup && (
            <div className="-mt-1 text-right">
              <Link to="/forgot-password" className="text-[13px] font-medium text-brand-ink hover:underline">
                Forgot password?
              </Link>
            </div>
          )}

          {formError && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
              {formError}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
            {signup ? 'Create account' : 'Sign in'}
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-muted-2">
        {signup ? 'Already have an account?' : 'New to NearMe?'}{' '}
        {embedded ? (
          <button type="button" onClick={() => { setMode(signup ? 'signin' : 'signup'); setFormError(''); form.clearErrors(); }} className="font-semibold text-ink underline underline-offset-2">
            {signup ? 'Sign in' : 'Create an account'}
          </button>
        ) : (
          <Link to={signup ? '/login' : '/register'} className="font-semibold text-ink underline underline-offset-2">
            {signup ? 'Sign in' : 'Create an account'}
          </Link>
        )}
      </p>
    </div>
  );
}
