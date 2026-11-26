import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Bookmark, Building2, ChevronRight, HardDrive, History, LogOut, MapPinPlus, Pencil, Settings, ShieldCheck, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Icon } from '@/components/common/Icon';
import { Page, stagger } from '@/components/common/layout-bits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, Progress, Skeleton } from '@/components/ui/controls';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { LogoMark } from '@/components/navigation/Logo';
import { LEVELS } from '@/lib/community';
import { profileSchema } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import { authService } from '@/services/auth';
import { useLocalDb } from '@/services/backend/localDb';
import { contributionsService } from '@/services/contributions';
import { useAuth } from '@/store/auth';
import type { UserProfile } from '@/types';

type ProfileForm = z.infer<typeof profileSchema>;

function EditProfileSheet({ user, open, onOpenChange }: { user: UserProfile; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { register, handleSubmit, formState } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) as never, defaultValues: { name: user.name, homeArea: user.homeArea ?? '', bio: user.bio ?? '' } });
  const submit = handleSubmit(async (values) => {
    try {
      await authService.updateProfile({ name: values.name, homeArea: values.homeArea || undefined, bio: values.bio || undefined });
      toast.success('Profile updated');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your profile.');
    }
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Edit profile" size="sm" footer={<Button className="w-full" onClick={submit} loading={formState.isSubmitting}>Save</Button>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Display name" htmlFor="pf-name" error={formState.errors.name?.message}>
          <Input id="pf-name" autoComplete="name" {...register('name')} />
        </Field>
        <Field label="Home neighbourhood" htmlFor="pf-area" hint="Shown on your profile. Never your address." error={formState.errors.homeArea?.message}>
          <Input id="pf-area" placeholder="e.g. BTM Layout" {...register('homeArea')} />
        </Field>
        <Field label="About you" htmlFor="pf-bio" error={formState.errors.bio?.message}>
          <Textarea id="pf-bio" placeholder="What do you know best about your area?" {...register('bio')} />
        </Field>
      </form>
    </Sheet>
  );
}

/** Shown to signed-out visitors: what an account adds, without blocking anything. */
function GuestProfile() {
  const links = [
    { to: '/saved', label: 'Saved places', icon: Bookmark },
    { to: '/notifications', label: 'Notifications', icon: Bell },
    { to: '/settings', label: 'Settings', icon: Settings },
    { to: '/business', label: 'NearMe for business', icon: Building2 },
  ];
  return (
    <Page className="max-w-[820px]">
      <section className="mt-6 overflow-hidden rounded-[28px] bg-forest p-6 text-on-forest sm:p-9 lg:mt-10">
        <LogoMark size={48} className="rounded-2xl ring-1 ring-white/15" />
        <h1 className="display mt-5 text-[32px] sm:text-[40px]">Make NearMe yours</h1>
        <p className="mt-2 max-w-md text-[15px] opacity-80">You can explore everything without an account. Sign in to review places, share live updates and build your neighbourhood reputation.</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Button asChild variant="brand" size="lg">
            <Link to="/register">Create an account</Link>
          </Button>
          <Button asChild size="lg" className="bg-white/12 text-on-forest hover:bg-white/20">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </section>

      <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="flex items-center gap-3.5 px-4 py-3.5 text-[15px] font-medium text-ink transition-colors hover:bg-surface-2">
              <l.icon className="size-5 text-muted-2" strokeWidth={1.75} /> {l.label}
              <ChevronRight className="ml-auto size-4 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}

export default function ProfilePage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const version = useLocalDb((s) => s.contributions);
  const unread = useLocalDb((s) => s.notifications.filter((n) => !n.read).length);
  const savedCount = useLocalDb((s) => Object.keys(s.saved).length);

  const summary = useQuery({ queryKey: ['contributions', 'summary', user?.id, version], queryFn: () => contributionsService.summary(user!.id), enabled: Boolean(user), staleTime: 0 });

  if (!user) return <GuestProfile />;
  const s = summary.data;

  const signOut = async () => {
    await authService.signOut();
    void qc.invalidateQueries();
    toast('Signed out');
    navigate('/');
  };

  const stats = [
    { label: 'Reviews', value: s?.counts.review ?? 0, icon: Star },
    { label: 'Live updates', value: s?.counts.report ?? 0, icon: History },
    { label: 'Confirmations', value: s?.counts.confirm ?? 0, icon: ShieldCheck },
    { label: 'Places helped', value: (s?.counts.place ?? 0) + (s?.counts.edit ?? 0) + (s?.counts.missing ?? 0) + (s?.counts.closed ?? 0), icon: MapPinPlus },
  ];

  const menu = [
    { to: '/profile/contributions', label: 'Contribution history', hint: s ? `${s.verified} verified, ${s.pending} pending` : '', icon: History },
    { to: '/contribute', label: 'Contribute to the map', hint: 'Add a place, fix details, report a closure', icon: MapPinPlus },
    { to: '/saved', label: 'Saved places', hint: `${savedCount} saved`, icon: Bookmark },
    { to: '/notifications', label: 'Notifications', hint: unread ? `${unread} unread` : 'All caught up', icon: Bell },
    { to: '/business', label: 'NearMe for business', hint: 'Claim or manage a listing', icon: Building2 },
    ...(user.role === 'admin' ? [{ to: '/admin', label: 'Admin', hint: 'Moderation and platform settings', icon: ShieldCheck }] : []),
    { to: '/settings', label: 'Settings', hint: 'Location, appearance, privacy', icon: Settings },
  ];

  return (
    <Page className="max-w-[980px]">
      {/* Identity */}
      <header className="flex items-start gap-4 pt-6 lg:pt-10">
        <Avatar name={user.name} hue={user.avatarHue} size={76} />
        <div className="min-w-0 flex-1">
          <h1 className="display text-[30px] text-ink sm:text-[36px]">{user.name}</h1>
          <p className="mt-0.5 truncate text-sm text-muted-2">{[user.homeArea, user.email ?? user.phone].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {s && <Badge tone="brand">{s.level.name}</Badge>}
            {user.role !== 'user' && <Badge tone="sage">{user.role === 'admin' ? 'Administrator' : 'Business owner'}</Badge>}
            {user.provider === 'local' && (
              <Badge tone="outline">
                <HardDrive /> Local account
              </Badge>
            )}
          </div>
          {user.bio && <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">{user.bio}</p>}
        </div>
        <Button variant="secondary" size="icon" onClick={() => setEditing(true)} aria-label="Edit profile">
          <Pencil />
        </Button>
      </header>

      {/* Level */}
      <section className="mt-7 rounded-[28px] bg-forest p-5 text-on-forest sm:p-7" aria-label="Contribution level">
        {!s ? (
          <Skeleton className="h-28 w-full bg-white/10" />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[13px] opacity-75">Community contribution score</p>
                <p className="display tabular mt-1 text-[52px] leading-none">{s.points}</p>
                <p className="mt-2 text-sm opacity-85">
                  <span className="font-semibold">{s.level.name}.</span> {s.level.blurb}
                </p>
              </div>
              {s.pendingPoints > 0 && <p className="tabular rounded-xl bg-white/10 px-3 py-2 text-[13px]">+{s.pendingPoints} points waiting to be verified</p>}
            </div>
            <div className="mt-5">
              <div className="h-2 overflow-hidden rounded-full bg-white/15">
                <motion.div className="h-full rounded-full bg-brand" initial={{ width: 0 }} animate={{ width: `${s.level.progress * 100}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
              </div>
              <ol className="mt-2.5 grid grid-cols-4 text-[11.5px] sm:text-[12.5px]">
                {LEVELS.map((l, i) => (
                  <li key={l.name} className={cn('leading-tight', i > 0 && 'text-center', i === LEVELS.length - 1 && '!text-right', i <= s.level.index ? 'font-semibold' : 'opacity-55')}>
                    {l.name}
                    <span className="tabular block font-normal opacity-70">{l.min}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[13px] opacity-75">{s.level.next ? `${s.level.toNext} more verified points to reach ${s.level.next}.` : 'You have reached the highest level.'} Only verified, helpful contributions earn points.</p>
            </div>
          </>
        )}
      </section>

      {/* Stats */}
      <motion.dl variants={stagger.container} initial="hidden" animate="show" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((st) => (
          <motion.div key={st.label} variants={stagger.item} className="card p-4">
            <st.icon className="size-5 text-muted-2" strokeWidth={1.75} aria-hidden />
            <dd className="display tabular mt-3 text-[30px] leading-none text-ink">{st.value}</dd>
            <dt className="mt-1 text-[13px] text-muted-2">{st.label}</dt>
          </motion.div>
        ))}
      </motion.dl>

      {/* Badges */}
      {s && (
        <section className="mt-10" aria-labelledby="badges-heading">
          <h2 id="badges-heading" className="display-sm text-[22px] text-ink">
            Badges
          </h2>
          <p className="mb-3.5 mt-0.5 text-sm text-muted-2">
            {s.badges.filter((b) => b.earned).length} of {s.badges.length} earned
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {s.badges.map((b) => (
              <li key={b.id} className={cn('rounded-2xl border p-4', b.earned ? 'border-butter bg-butter-soft/60' : 'border-line bg-surface')}>
                <span className={cn('grid size-11 place-items-center rounded-full', b.earned ? 'bg-butter text-[#252B26]' : 'bg-bg-2 text-muted')}>
                  <Icon name={b.icon} className="size-5" />
                </span>
                <p className={cn('mt-3 text-sm font-semibold', b.earned ? 'text-ink' : 'text-ink-2')}>{b.name}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted-2">{b.description}</p>
                {!b.earned && (
                  <>
                    <Progress value={Number(b.progress.split(' / ')[0]) / Number(b.progress.split(' / ')[1])} className="mt-2.5" tone="forest" />
                    <p className="tabular mt-1 text-[11.5px] text-muted">{b.progress}</p>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Links */}
      <ul className="mt-10 divide-y divide-line rounded-2xl border border-line bg-surface">
        {menu.map((m) => (
          <li key={m.to}>
            <Link to={m.to} className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2">
              <m.icon className="size-5 shrink-0 text-muted-2" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink">{m.label}</span>
                {m.hint && <span className="block truncate text-[13px] text-muted-2">{m.hint}</span>}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>

      <Button variant="ghost" className="mt-4 w-full text-danger hover:bg-danger-soft hover:text-danger" onClick={signOut}>
        <LogOut /> Sign out
      </Button>

      <EditProfileSheet key={`${user.name}-${user.bio}-${user.homeArea}`} user={user} open={editing} onOpenChange={setEditing} />
    </Page>
  );
}
