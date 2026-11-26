import { appUrl, hasBackend } from '@/lib/env';
import { signInSchema, signUpSchema, type SignInInput, type SignUpInput } from '@/lib/schemas';
import { getSupabase } from '@/lib/supabase';
import { hash, uid } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import type { Role, UserProfile } from '@/types';
import { localDb } from './backend/localDb';

/**
 * Accounts.
 *  - Backend configured: Supabase Auth (email + password, Google OAuth, phone OTP). The profile
 *    row and its role live in Postgres and are protected by Row Level Security.
 *  - Local mode: an account that exists only on this device, so reviews, reports and saved places
 *    can be attributed while developing. Passwords are salted and hashed with SHA-256 before they
 *    are stored; nothing leaves the browser.
 */

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

async function digest(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface Credential {
  userId: string;
  salt: string;
  hash: string;
}
const CRED_KEY = 'nearme-local-credentials';
const readCreds = (): Record<string, Credential> => {
  try {
    return JSON.parse(localStorage.getItem(CRED_KEY) ?? '{}');
  } catch {
    return {};
  }
};
const writeCreds = (c: Record<string, Credential>) => localStorage.setItem(CRED_KEY, JSON.stringify(c));

const makeProfile = (name: string, email: string | undefined, provider: UserProfile['provider'], id = uid('user')): UserProfile => ({
  id,
  name,
  email,
  role: 'user',
  provider,
  avatarHue: hash(email ?? name) % 360,
  createdAt: Date.now(),
  status: 'active',
});

async function loadSupabaseProfile(userId: string, fallback: { name: string; email?: string; phone?: string }): Promise<UserProfile> {
  const supabase = await getSupabase()!;
  const { data } = await supabase.from('profiles').select('id, display_name, role, home_area, bio, created_at, status').eq('id', userId).maybeSingle();
  return {
    id: userId,
    name: data?.display_name ?? fallback.name,
    email: fallback.email,
    phone: fallback.phone,
    role: (data?.role as Role | undefined) ?? 'user',
    provider: 'supabase',
    avatarHue: hash(userId) % 360,
    homeArea: data?.home_area ?? undefined,
    bio: data?.bio ?? undefined,
    createdAt: data?.created_at ? Date.parse(data.created_at) : Date.now(),
    status: (data?.status as UserProfile['status']) ?? 'active',
  };
}

export const authService = {
  mode: hasBackend ? ('supabase' as const) : ('local' as const),

  /** Call once at startup: restores a Supabase session and keeps the store in sync with it. */
  async init() {
    const pending = getSupabase();
    if (!pending) return;
    const supabase = await pending;
    const apply = async (session: { user: { id: string; email?: string; phone?: string; user_metadata?: Record<string, unknown> } } | null) => {
      if (!session) return useAuth.getState().setUser(null);
      const u = session.user;
      const name = (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || u.email?.split('@')[0] || 'Explorer';
      useAuth.getState().setUser(await loadSupabaseProfile(u.id, { name, email: u.email, phone: u.phone }));
    };
    const { data } = await supabase.auth.getSession();
    await apply(data.session);
    supabase.auth.onAuthStateChange((_event, session) => void apply(session));
  },

  async signUp(input: SignUpInput): Promise<{ user: UserProfile | null; needsEmailConfirmation: boolean }> {
    const { name, email, password } = signUpSchema.parse(input);
    const pending = getSupabase();
    if (pending) {
      const supabase = await pending;
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: appUrl() } });
      if (error) throw new AuthError(error.message);
      if (!data.session || !data.user) return { user: null, needsEmailConfirmation: true };
      const user = await loadSupabaseProfile(data.user.id, { name, email });
      useAuth.getState().setUser(user);
      return { user, needsEmailConfirmation: false };
    }

    await localDb.ready();
    const creds = readCreds();
    if (creds[email]) throw new AuthError('An account with this email already exists on this device. Sign in instead.');
    const user = makeProfile(name, email, 'local');
    const salt = uid();
    creds[email] = { userId: user.id, salt, hash: await digest(password, salt) };
    writeCreds(creds);
    localDb.set((s) => ({ users: [...s.users, user] }));
    useAuth.getState().setUser(user);
    return { user, needsEmailConfirmation: false };
  },

  async signIn(input: SignInInput): Promise<UserProfile> {
    const { email, password } = signInSchema.parse(input);
    const pending = getSupabase();
    if (pending) {
      const supabase = await pending;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) throw new AuthError(error?.message ?? 'Could not sign in.');
      const user = await loadSupabaseProfile(data.user.id, { name: email.split('@')[0]!, email });
      useAuth.getState().setUser(user);
      return user;
    }

    await localDb.ready();
    const cred = readCreds()[email];
    // Same message for unknown email and wrong password, so accounts cannot be enumerated.
    const invalid = new AuthError('That email and password do not match an account on this device.');
    if (!cred) throw invalid;
    if ((await digest(password, cred.salt)) !== cred.hash) throw invalid;
    const user = localDb.get().users.find((u) => u.id === cred.userId);
    if (!user) throw invalid;
    if (user.status === 'suspended') throw new AuthError('This account has been suspended by a moderator.');
    useAuth.getState().setUser(user);
    return user;
  },

  /** Redirects to Google. Only available with a backend. */
  async signInWithGoogle(): Promise<void> {
    const pending = getSupabase();
    if (!pending) throw new AuthError('Google sign-in needs the Supabase backend. Add your project keys to .env.local to enable it.');
    const supabase = await pending;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } });
    if (error) throw new AuthError(error.message);
  },

  async requestPhoneOtp(phone: string): Promise<void> {
    const pending = getSupabase();
    if (!pending) throw new AuthError('Phone sign-in needs the Supabase backend with an SMS provider configured.');
    const supabase = await pending;
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw new AuthError(error.message);
  },

  async verifyPhoneOtp(phone: string, token: string): Promise<void> {
    const pending = getSupabase();
    if (!pending) throw new AuthError('Phone sign-in needs the Supabase backend.');
    const supabase = await pending;
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) throw new AuthError(error.message);
  },

  /** Returns true when a reset email was actually sent. */
  async resetPassword(email: string): Promise<boolean> {
    const pending = getSupabase();
    if (pending) {
      const supabase = await pending;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl('/login') });
      if (error) throw new AuthError(error.message);
      return true;
    }
    return false;
  },

  /** Local mode only: set a new password for an account stored on this device. */
  async setLocalPassword(email: string, password: string): Promise<void> {
    const creds = readCreds();
    const cred = creds[email.trim().toLowerCase()];
    if (!cred) throw new AuthError('No account with this email exists on this device.');
    const salt = uid();
    creds[email.trim().toLowerCase()] = { ...cred, salt, hash: await digest(password, salt) };
    writeCreds(creds);
  },

  async updateProfile(patch: Pick<Partial<UserProfile>, 'name' | 'homeArea' | 'bio'>): Promise<UserProfile> {
    const user = useAuth.getState().user;
    if (!user) throw new AuthError('Sign in to edit your profile.');
    const pending = getSupabase();
    if (pending) {
      const supabase = await pending;
      const { error } = await supabase.from('profiles').update({ display_name: patch.name, home_area: patch.homeArea, bio: patch.bio }).eq('id', user.id);
      if (error) throw new AuthError(error.message);
    } else {
      localDb.set((s) => ({ users: s.users.map((u) => (u.id === user.id ? { ...u, ...patch } : u)) }));
    }
    useAuth.getState().patchUser(patch);
    return { ...user, ...patch };
  },

  /**
   * Local mode only: switch the workspace this device account can open, so the business portal
   * and admin area can be explored without a server. With a backend the role is set in the
   * database by an administrator and enforced by RLS: this function refuses to run.
   */
  async setLocalRole(role: Role): Promise<void> {
    if (hasBackend) throw new AuthError('Roles are managed by an administrator.');
    const user = useAuth.getState().user;
    if (!user) throw new AuthError('Sign in first.');
    localDb.set((s) => ({ users: s.users.map((u) => (u.id === user.id ? { ...u, role } : u)) }));
    useAuth.getState().patchUser({ role });
  },

  async signOut(): Promise<void> {
    const pending = getSupabase();
    if (pending) await (await pending).auth.signOut();
    useAuth.getState().setUser(null);
  },

  async deleteLocalAccount(): Promise<void> {
    const user = useAuth.getState().user;
    if (!user || user.provider !== 'local') return;
    const creds = readCreds();
    if (user.email) delete creds[user.email];
    writeCreds(creds);
    localDb.set((s) => ({
      users: s.users.filter((u) => u.id !== user.id),
      reviews: s.reviews.filter((r) => r.userId !== user.id),
      reports: s.reports.filter((r) => r.reporterId !== user.id),
      contributions: s.contributions.filter((c) => c.userId !== user.id),
    }));
    useAuth.getState().setUser(null);
  },
};
