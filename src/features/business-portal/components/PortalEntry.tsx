import {
  ArrowRight, BadgeCheck, BadgePercent, ChartLine, Clock, FileCheck2, HardDrive, MapPinned, MessageSquare, Radio, ScanSearch, Search, Store, type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Reveal } from '@/components/common/layout-bits';
import { CategoryCover } from '@/components/common/PlaceImage';
import { Notice } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { AuthForm } from '@/features/auth/components/AuthForm';
import { hasBackend } from '@/lib/env';
import type { UserProfile } from '@/types';
import { PortalPage } from './bits';

type AuthMode = 'signin' | 'signup';

/** Sign-in or sign-up without leaving the portal. The layout re-renders as soon as the account exists. */
export function AuthSheet({ mode, onClose }: { mode: AuthMode | null; onClose: () => void }) {
  return (
    <Sheet
      open={mode !== null}
      onOpenChange={(open) => !open && onClose()}
      title={mode === 'signup' ? 'Create your business account' : 'Sign in to the business portal'}
      description="One account works across NearMe and the business portal."
      size="sm"
    >
      {/* Keyed so switching between the two buttons starts the form in the right mode. */}
      {mode && <AuthForm key={mode} embedded initialMode={mode} onDone={onClose} />}
    </Sheet>
  );
}

const BENEFITS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Search, title: 'Be found by people nearby', body: 'Your category, services and hours decide when you appear in search and on the map. Fill them in once.' },
  { icon: Clock, title: 'Hours customers can rely on', body: 'Set your week in a minute. NearMe shows "Open" or "Closes 9 pm" on your listing automatically.' },
  { icon: Radio, title: 'Say what is happening right now', body: 'Post open, busy or closed. It appears in NearMe Live marked "Business confirmed".' },
  { icon: BadgePercent, title: 'Run offers for the neighbourhood', body: 'Publish a discount or a happy hour with start and end dates. It reaches people within walking distance.' },
  { icon: MessageSquare, title: 'Answer your reviews', body: 'Thank regulars and respond to feedback. Replies appear under the review, signed by your business.' },
  { icon: ChartLine, title: 'See what is working', body: 'Views, direction requests, calls and saves, by day, so you know which changes brought people in.' },
];

const VERIFICATION_STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Store, title: 'Add your details', body: 'Name, category, location, opening hours and a phone number. Claiming an existing place prefills most of it.' },
  { icon: FileCheck2, title: 'Send one document', body: 'A GST certificate, shop licence, utility bill or owner ID. Only NearMe reviewers ever see it.' },
  { icon: ScanSearch, title: 'A reviewer checks it', body: 'Once approved, the Verified badge appears on your listing and you can publish offers and live updates.' },
];

/** Illustration of a listing, built from the same parts customers see. Captioned as an example. */
function ListingPreview() {
  return (
    <figure className="mx-auto w-full max-w-[400px]">
      <div className="card overflow-hidden">
        <CategoryCover categoryId="cafes" seed="business-portal-preview" className="aspect-[16/9]" iconClassName="size-12" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="display-sm truncate text-[21px] text-ink">Your business name</p>
              <p className="mt-0.5 text-[13px] text-muted-2">Cafe · 350 m away</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 pt-1 text-[12.5px] font-medium text-success">
              <BadgeCheck className="size-4" aria-hidden /> Verified
            </span>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[13px]">
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            <span className="font-medium text-success">Open</span>
            <span className="text-muted-2">· Closes 9 pm</span>
          </p>
          <div className="mt-4 rounded-xl bg-sage/60 p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-success">
              <BadgeCheck className="size-3.5" aria-hidden /> Business confirmed
            </p>
            <p className="mt-1 text-sm font-medium text-ink">Open and available now</p>
            <p className="text-[12.5px] text-muted-2">Updated 6 min ago</p>
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-line-2 p-3">
            <span className="display text-[19px] leading-none text-ink">20% off</span>
            <span className="text-[13px] text-muted-2">Weekday breakfast, until Friday</span>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[12.5px] text-muted-2">An example of how a verified listing appears to customers.</figcaption>
    </figure>
  );
}

/** What signed-out visitors see: why the portal exists, how verification works, and a way in. */
export function PortalIntro() {
  const [auth, setAuth] = useState<AuthMode | null>(null);
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-20 sm:px-6 lg:px-10">
      <section className="grid gap-10 pt-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14 lg:pt-16">
        <div>
          <p className="text-[13px] font-medium text-brand-ink">NearMe for business</p>
          <h1 className="display mt-2 text-[38px] text-ink sm:text-[50px] lg:text-[56px]">
            Put your business <span className="text-brand">on the map</span>
          </h1>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-2">
            People nearby are already looking for what you do. Claim your place, keep your hours and details right, and tell the neighbourhood when you are open, busy or running an offer.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => setAuth('signup')}>
              Create a business account <ArrowRight />
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setAuth('signin')}>
              Sign in
            </Button>
          </div>
          <p className="mt-4 text-[13px] text-muted-2">Listing your business is free. Already use NearMe? Sign in with the same account.</p>
        </div>
        <ListingPreview />
      </section>

      <Reveal>
        <section className="mt-16 lg:mt-24" aria-labelledby="benefits-heading">
          <h2 id="benefits-heading" className="display-sm text-[26px] text-ink sm:text-[30px]">
            What you can do from here
          </h2>
          <div className="mt-6 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map(({ icon: IconCmp, title, body }) => (
              <div key={title} className="flex gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-ink">
                  <IconCmp className="size-[18px]" strokeWidth={1.75} aria-hidden />
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-2">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="mt-16 rounded-[28px] bg-sage/55 p-5 sm:p-8 lg:mt-24" aria-labelledby="verify-heading">
          <h2 id="verify-heading" className="display-sm text-[26px] text-ink sm:text-[30px]">
            How verification works
          </h2>
          <p className="mt-1.5 max-w-2xl text-[15px] text-ink-2">
            The Verified badge tells customers that the person managing a listing really runs the business. It takes three steps.
          </p>
          <ol className="mt-6 grid gap-4 lg:grid-cols-3">
            {VERIFICATION_STEPS.map(({ icon: IconCmp, title, body }, i) => (
              <li key={title} className="rounded-2xl bg-surface p-5 shadow-card">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-forest text-[13px] font-semibold text-on-forest">{i + 1}</span>
                  <IconCmp className="size-5 text-sage-ink" strokeWidth={1.75} aria-hidden />
                </div>
                <h3 className="mt-3.5 text-[15px] font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-2">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={() => setAuth('signup')}>Get started</Button>
            <Link to="/" className="text-sm font-medium text-sage-ink underline-offset-4 hover:underline">
              Back to NearMe
            </Link>
          </div>
        </section>
      </Reveal>

      {!hasBackend && (
        <Notice icon={HardDrive} className="mt-8">
          <span className="font-medium text-ink">Local mode.</span> No server is connected to this copy of NearMe, so business accounts and listings are stored on this device only.
        </Notice>
      )}

      <AuthSheet mode={auth} onClose={() => setAuth(null)} />
    </div>
  );
}

/** First screen for an account with no listing yet. */
export function WelcomePanel({ user }: { user: UserProfile }) {
  const first = user.name.split(' ')[0];
  return (
    <PortalPage title={`Welcome, ${first}`} subtitle="Let us get your business in front of people nearby. Which of these fits?" eyebrow="NearMe for business">
      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/business/claim" className="card group flex flex-col p-6 transition-shadow hover:shadow-lift">
          <span className="grid size-12 place-items-center rounded-2xl bg-sage text-sage-ink">
            <MapPinned className="size-6" strokeWidth={1.75} aria-hidden />
          </span>
          <h2 className="display-sm mt-5 text-[22px] text-ink">Claim an existing place</h2>
          <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-2">
            Your business is probably on the map already. Find it, tell us it is yours, and we prefill the name, location and anything else the map knows.
          </p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
            Find my business <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
        <Link to="/business/onboarding?new=1" className="card group flex flex-col p-6 transition-shadow hover:shadow-lift">
          <span className="grid size-12 place-items-center rounded-2xl bg-butter-soft text-butter-ink">
            <Store className="size-6" strokeWidth={1.75} aria-hidden />
          </span>
          <h2 className="display-sm mt-5 text-[22px] text-ink">Register a new business</h2>
          <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-2">
            Newly opened, home-based, or simply not on the map yet? Create a listing from scratch. It takes about ten minutes.
          </p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
            Start a new listing <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="display-sm text-[20px] text-ink">Have these ready</h2>
          <ul className="mt-3 space-y-2.5 text-sm text-ink-2">
            {[
              'Your business name and a short description',
              'The address, and where the entrance is on the map',
              'Opening hours and a phone number customers can call',
              'A few photos of the place or your work (optional)',
              'One proof document for verification: GST certificate, shop licence, utility bill or owner ID',
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="display-sm text-[20px] text-ink">What happens after</h2>
          <ol className="mt-3 space-y-3 text-sm text-ink-2">
            {VERIFICATION_STEPS.map(({ title, body }, i) => (
              <li key={title} className="flex gap-3">
                <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-bg-2 text-[12px] font-semibold text-ink-2">{i + 1}</span>
                <span>
                  <span className="font-medium text-ink">{title}.</span> {body}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </PortalPage>
  );
}
