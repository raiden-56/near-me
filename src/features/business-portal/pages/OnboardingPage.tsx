import { ArrowLeft, ArrowRight, Check, LayoutDashboard, LogOut, MapPinned } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ErrorState, Notice } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Avatar, Progress, Skeleton } from '@/components/ui/controls';
import { AuthForm } from '@/features/auth/components/AuthForm';
import { hasBackend } from '@/lib/env';
import { cn } from '@/lib/utils';
import { authService } from '@/services/auth';
import { listingIssues, ONBOARDING_STEP_COUNT, type ListingChange, type PortalListing } from '@/services/businessPortal';
import { useAuth } from '@/store/auth';
import type { UserProfile } from '@/types';
import type { FormFooter } from '../components/bits';
import { HoursForm } from '../components/HoursForm';
import { CategoryForm, ContactForm, DetailsForm, OwnerForm } from '../components/ListingForms';
import { LocationForm } from '../components/LocationForm';
import { PhotoManager } from '../components/PhotoManager';
import { ServicesForm } from '../components/ServicesForm';
import { IssueList, VerificationForm, VerificationTimeline } from '../components/Verification';
import { useOptionalPortal } from '../context';
import { useCreateDraft, useListingById, useMarkStep, useSaveListing, useSubmitVerification } from '../hooks';
import { usePortalUi } from '../store';

const STEPS: { short: string; title: string; description: string }[] = [
  { short: 'Account', title: 'Your account', description: 'The NearMe account that will manage this listing.' },
  { short: 'Business details', title: 'Tell us about the business', description: 'The name customers know you by, and a short description.' },
  { short: 'Category', title: 'What kind of business is it?', description: 'This decides which searches and category pages you appear in.' },
  { short: 'Location', title: 'Where can customers find you?', description: 'Put the pin on your entrance so directions lead to the right door.' },
  { short: 'Opening hours', title: 'When are you open?', description: 'NearMe uses these to show whether you are open right now.' },
  { short: 'Services', title: 'What do you offer?', description: 'Optional. A short list helps people decide before they visit.' },
  { short: 'Photos', title: 'Show the place', description: 'Optional. The first photo is your cover.' },
  { short: 'Contact details', title: 'How do customers reach you?', description: 'A phone number and your full address.' },
  { short: 'Verification', title: 'Confirm that it is yours', description: 'One document is enough. It is only seen by NearMe reviewers.' },
  { short: 'Status', title: 'Verification status', description: 'Where your request stands.' },
];

const clampStep = (n: number, max: number) => Math.min(Math.max(1, Math.round(n) || 1), max);

/* ── Frame ──────────────────────────────────────────────────────────────── */

function Stepper({ step, reached, locked, onGo }: { step: number; reached: number; locked: boolean; onGo?: (n: number) => void }) {
  return (
    <>
      {/* Phones: one line and a bar. */}
      <div className="lg:hidden">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-medium text-ink">
            Step {step} of {ONBOARDING_STEP_COUNT}
          </span>
          <span className="text-muted-2">{STEPS[step - 1]!.short}</span>
        </div>
        <Progress value={step / ONBOARDING_STEP_COUNT} tone="forest" className="mt-2" />
      </div>

      {/* Desktop: the whole path, with finished steps you can jump back to. */}
      <ol className="hidden lg:block" aria-label="Setup steps">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const current = n === step;
          const done = !current && n <= reached && (n < reached || locked || reached === ONBOARDING_STEP_COUNT);
          const reachable = Boolean(onGo) && !locked && n <= reached && !current;
          const inner = (
            <>
              <span
                className={cn(
                  'tabular grid size-7 shrink-0 place-items-center rounded-full border text-[12.5px] font-semibold',
                  current ? 'border-forest bg-forest text-on-forest' : done ? 'border-line-2 bg-surface text-ink' : 'border-line bg-transparent text-muted',
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" strokeWidth={2.6} /> : n}
              </span>
              <span className={cn('text-sm', current ? 'font-semibold text-ink' : done ? 'font-medium text-ink-2' : 'text-muted-2')}>{s.short}</span>
            </>
          );
          return (
            <li key={s.short} aria-current={current ? 'step' : undefined}>
              {reachable ? (
                <button type="button" onClick={() => onGo?.(n)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-bg-2">
                  {inner}
                </button>
              ) : (
                <div className="flex items-center gap-3 px-2 py-1.5">{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function WizardFooter({ onBack, submitting, label = 'Save and continue', submit = true, onNext }: { onBack?: () => void; submitting?: boolean; label?: string; submit?: boolean; onNext?: () => void }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-4">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
          <ArrowLeft /> Back
        </Button>
      ) : (
        <span />
      )}
      <Button type={submit ? 'submit' : 'button'} onClick={onNext} loading={submitting}>
        {label} {!submitting && <ArrowRight />}
      </Button>
    </div>
  );
}

function Frame({ step, reached, locked, onGo, heading, eyebrow, children }: { step: number; reached: number; locked: boolean; onGo?: (n: number) => void; heading: string; eyebrow: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const title = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const meta = STEPS[step - 1]!;

  // Moving between steps replaces the content: tell keyboard and screen-reader users where they landed.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    title.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, [step, reduce]);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-6 lg:px-10">
      <header className="flex items-start justify-between gap-4 pb-5 pt-6 lg:pb-8 lg:pt-10">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-brand-ink">{eyebrow}</p>
          <h1 className="display mt-1 truncate text-[28px] text-ink sm:text-[34px]">{heading}</h1>
        </div>
        <Button variant="ghost" asChild className="shrink-0">
          <Link to="/business">{reached > 2 ? 'Save and exit' : 'Exit'}</Link>
        </Button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[224px_1fr] lg:gap-10">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Stepper step={step} reached={reached} locked={locked} onGo={onGo} />
        </aside>
        <motion.section key={step} initial={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="card min-w-0 p-5 sm:p-7">
          <p className="hidden text-[13px] font-medium text-muted-2 lg:block">
            Step {step} of {ONBOARDING_STEP_COUNT}
          </p>
          <h2 ref={title} tabIndex={-1} className="display-sm text-[24px] text-ink outline-none lg:mt-1">
            {meta.title}
          </h2>
          <p className="mt-1 text-sm text-muted-2">{meta.description}</p>
          <div className="mt-6">{children}</div>
        </motion.section>
      </div>
    </div>
  );
}

/* ── Step 1 pieces ──────────────────────────────────────────────────────── */

function AccountCard({ user }: { user: UserProfile }) {
  const signOut = async () => {
    await authService.signOut();
    toast('Signed out', { description: 'Sign in with the account that should manage this business.' });
  };
  return (
    <div className="mb-5 flex items-center gap-3.5 rounded-2xl border border-line bg-surface-2 p-3.5">
      <Avatar name={user.name} hue={user.avatarHue} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{user.name}</p>
        <p className="truncate text-[13px] text-muted-2">
          Signed in{user.email ? ` as ${user.email}` : ''}
          {!hasBackend && ' · account stored on this device'}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => void signOut()}>
        <LogOut /> <span className="hidden sm:inline">Use another account</span>
        <span className="sm:hidden">Switch</span>
      </Button>
    </div>
  );
}

/* ── The wizard for an existing draft ───────────────────────────────────── */

function ListingWizard({ listing, user, step, go }: { listing: PortalListing; user: UserProfile; step: number; go: (n: number) => void }) {
  const save = useSaveListing();
  const markStep = useMarkStep();
  const submitVerification = useSubmitVerification();

  const next = step + 1;
  const back = step > 1 ? () => go(step - 1) : undefined;
  const footer: FormFooter = (state) => <WizardFooter onBack={back} submitting={state.submitting} />;
  /** Save one section, unlock the next step, move on. Throws on failure so the form keeps its values. */
  const saveAndGo = async (change: ListingChange) => {
    await save.mutateAsync({ id: listing.id, change, step: next });
    go(next);
  };
  const key = `${listing.id}-${step}`;

  switch (step) {
    case 1:
      return (
        <>
          <AccountCard user={user} />
          <OwnerForm key={key} defaultName={listing.ownerName || user.name} onSubmit={(data) => saveAndGo({ section: 'owner', data })} footer={footer} />
        </>
      );
    case 2:
      return (
        <>
          {listing.placeId && (
            <Notice icon={MapPinned} className="mb-5">
              We filled in what the map already knows about this place. Check each step and correct anything that is out of date.
            </Notice>
          )}
          <DetailsForm key={key} listing={listing} onSubmit={({ name, description }) => saveAndGo({ section: 'basics', data: { name, description } })} footer={footer} />
        </>
      );
    case 3:
      return <CategoryForm key={key} categoryId={listing.categoryId} onSubmit={(data) => saveAndGo({ section: 'category', data })} footer={footer} />;
    case 4:
      return <LocationForm key={key} listing={listing} onSubmit={(data) => saveAndGo({ section: 'location', data })} footer={footer} />;
    case 5:
      return <HoursForm key={key} hours={listing.hours} onSubmit={(data) => saveAndGo({ section: 'hours', data })} footer={footer} />;
    case 6:
      return <ServicesForm key={key} services={listing.services} onSubmit={(data) => saveAndGo({ section: 'services', data })} footer={footer} />;
    case 7:
      return (
        <>
          <PhotoManager listing={listing} />
          <WizardFooter
            onBack={back}
            submit={false}
            submitting={markStep.isPending}
            label={listing.photos.length ? 'Continue' : 'Skip for now'}
            onNext={() => markStep.mutate({ id: listing.id, step: next }, { onSuccess: () => go(next) })}
          />
        </>
      );
    case 8:
      return <ContactForm key={key} listing={listing} onSubmit={(data) => saveAndGo({ section: 'contact', data })} footer={footer} />;
    case 9: {
      const issues = listingIssues(listing);
      if (issues.length)
        return (
          <>
            <IssueList issues={issues} hrefFor={(issue) => `/business/onboarding?listing=${listing.id}&step=${issue.step}`} />
            <div className="mt-8 border-t border-line pt-4">
              <Button type="button" variant="ghost" onClick={back}>
                <ArrowLeft /> Back
              </Button>
            </div>
          </>
        );
      return (
        <VerificationForm
          key={key}
          listing={listing}
          onSubmit={async (input) => {
            await submitVerification.mutateAsync({ id: listing.id, input });
            go(ONBOARDING_STEP_COUNT);
          }}
          leading={
            <Button type="button" variant="ghost" onClick={back}>
              <ArrowLeft /> Back
            </Button>
          }
        />
      );
    }
    default:
      return (
        <>
          <VerificationTimeline listing={listing} />
          <div className="mt-8 flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
            <Button asChild>
              <Link to="/business">
                <LayoutDashboard /> Go to your dashboard
              </Link>
            </Button>
            {listing.verification === 'rejected' && (
              <Button type="button" variant="secondary" onClick={() => go(9)}>
                Fix and resubmit
              </Button>
            )}
            {listing.verification === 'draft' && (
              <Button type="button" variant="secondary" onClick={() => go(9)}>
                Submit for verification
              </Button>
            )}
          </div>
          {listing.verification !== 'verified' && listing.verification !== 'rejected' && (
            <p className="mt-4 text-[13px] text-muted-2">You do not have to wait here. Your dashboard is open, and you can keep improving the listing while it is reviewed.</p>
          )}
        </>
      );
  }
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function OnboardingPage() {
  const user = useAuth((s) => s.user);
  const portal = useOptionalPortal();
  const selectListing = usePortalUi((s) => s.setActiveListing);
  const [params, setParams] = useSearchParams();
  const listingId = params.get('listing');
  const startFresh = params.get('new') === '1';

  // Opened without saying which listing: pick up an unfinished one rather than starting a second.
  const resumable = !listingId && !startFresh ? portal?.listings.find((l) => l.verification === 'draft' || l.verification === 'rejected') : undefined;
  useEffect(() => {
    if (resumable) setParams({ listing: resumable.id }, { replace: true });
  }, [resumable, setParams]);

  const query = useListingById(listingId);
  const createDraft = useCreateDraft();

  // Before the draft exists (steps 1 and 2) the answers live here; the listing is created with both.
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [preStep, setPreStep] = useState(1);

  /* Signed out: step 1 is the sign-in gate. */
  if (!user) {
    return (
      <Frame step={1} reached={1} locked={false} heading="Set up your business" eyebrow="NearMe for business">
        <p className="mb-5 text-sm text-ink-2">Create a free account, or sign in, to start your listing. The same account works across NearMe.</p>
        <AuthForm embedded initialMode="signup" />
      </Frame>
    );
  }

  /* An existing draft, addressed by the URL. */
  if (listingId) {
    if (query.isPending)
      return (
        <div className="mx-auto w-full max-w-[1120px] px-4 pt-10 sm:px-6 lg:px-10" aria-busy="true" aria-label="Loading your listing">
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="mt-8 h-[420px] rounded-2xl" />
        </div>
      );
    if (query.isError || !query.data)
      return (
        <div className="grid min-h-[60dvh] place-items-center">
          <div>
            <ErrorState error={query.error} title="We could not open that listing" compact />
            <div className="flex justify-center">
              <Button asChild variant="secondary">
                <Link to="/business">Back to the business portal</Link>
              </Button>
            </div>
          </div>
        </div>
      );

    const listing = query.data;
    // Once a request is with the reviewers the wizard has done its job: it only shows the status.
    const locked = listing.verification === 'submitted' || listing.verification === 'in_review' || listing.verification === 'verified';
    const reached = locked ? ONBOARDING_STEP_COUNT : clampStep(listing.onboardingStep ?? 2, ONBOARDING_STEP_COUNT);
    const step = locked ? ONBOARDING_STEP_COUNT : clampStep(Number(params.get('step')) || reached, reached);
    const go = (n: number) => setParams({ listing: listing.id, step: String(clampStep(n, ONBOARDING_STEP_COUNT)) });

    return (
      <Frame step={step} reached={reached} locked={locked} onGo={go} heading={listing.name ? `Set up ${listing.name}` : 'Set up your business'} eyebrow={listing.placeId ? 'Claiming a place on the map' : 'New listing'}>
        <ListingWizard listing={listing} user={user} step={step} go={go} />
      </Frame>
    );
  }

  /* Waiting for the resume redirect above. */
  if (resumable) return null;

  /* A brand-new listing: nothing is stored until the business has a name. */
  if (preStep === 1) {
    return (
      <Frame step={1} reached={1} locked={false} heading="Set up your business" eyebrow="New listing">
        <AccountCard user={user} />
        <OwnerForm
          defaultName={ownerName ?? user.name}
          onSubmit={async ({ ownerName: name }) => {
            setOwnerName(name);
            setPreStep(2);
          }}
          footer={(state) => <WizardFooter submitting={state.submitting} label="Continue" />}
        />
        <p className="mt-5 text-[13px] text-muted-2">
          Is your business already on the map?{' '}
          <Link to="/business/claim" className="font-medium text-brand-ink underline-offset-4 hover:underline">
            Claim it instead
          </Link>{' '}
          and we prefill what is known.
        </p>
      </Frame>
    );
  }

  return (
    <Frame step={2} reached={2} locked={false} onGo={(n) => n === 1 && setPreStep(1)} heading="Set up your business" eyebrow="New listing">
      <DetailsForm
        onSubmit={async ({ name, description }) => {
          const listing = await createDraft.mutateAsync({ ownerName: ownerName ?? user.name, name, description });
          selectListing(listing.id);
          toast.success('Draft saved', { description: 'You can leave at any point and pick up where you stopped.' });
          setParams({ listing: listing.id, step: '3' }, { replace: true });
        }}
        footer={(state) => <WizardFooter onBack={() => setPreStep(1)} submitting={state.submitting} />}
      />
    </Frame>
  );
}
