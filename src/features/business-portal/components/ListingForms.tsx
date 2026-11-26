import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { Icon } from '@/components/common/Icon';
import { Button } from '@/components/ui/button';
import { Field, FieldError, Input, Label, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { CATEGORY_BY_ID, GROUP_BY_ID } from '@/data/categories';
import { businessContactSchema } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import {
  basicsSchema, categorySchema, detailsSchema, ownerSchema,
  type CategoryInput, type ContactInput, type DetailsInput, type OwnerInput,
} from '@/services/businessPortal';
import type { BusinessListing } from '@/types';
import { amenitiesFor } from '../lib/amenities';
import { CharCount, type FormFooter } from './bits';
import { CategoryPicker } from './CategoryPicker';

/**
 * The listing's editable sections as self-contained forms. Each validates with the same zod schema
 * the service uses, and renders whatever footer it is given: the wizard passes Back / Continue,
 * the manage screens pass a save bar. A rejected save keeps the form as it was so nothing is lost.
 */

interface SectionProps<T> {
  onSubmit: (values: T) => Promise<unknown>;
  footer: FormFooter;
}

const basicsOnlySchema = basicsSchema.extend({ categoryId: z.string() });

/* ── Owner ──────────────────────────────────────────────────────────────── */

export function OwnerForm({ defaultName, onSubmit, footer }: SectionProps<OwnerInput> & { defaultName: string }) {
  const form = useForm<OwnerInput>({ resolver: zodResolver(ownerSchema), defaultValues: { ownerName: defaultName }, mode: 'onTouched' });
  const { errors, isSubmitting, isDirty } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      form.reset(values);
    } catch {
      /* reported by the caller */
    }
  });
  return (
    <form onSubmit={submit} noValidate>
      <Field label="Your name" htmlFor="owner-name" error={errors.ownerName?.message} hint="The person NearMe contacts about this listing. Not shown to customers.">
        <Input id="owner-name" autoComplete="name" aria-invalid={Boolean(errors.ownerName)} {...form.register('ownerName')} />
      </Field>
      {footer({ submitting: isSubmitting, dirty: isDirty, reset: () => form.reset() })}
    </form>
  );
}

/* ── Name, description and (optionally) category ────────────────────────── */

export function DetailsForm({
  listing, withCategory, onSubmit, footer,
}: SectionProps<DetailsInput> & { listing?: Pick<BusinessListing, 'name' | 'description' | 'categoryId'>; withCategory?: boolean }) {
  const form = useForm<DetailsInput>({
    // Without the category field only name and description are checked; the category passes through untouched.
    resolver: withCategory ? zodResolver(detailsSchema) : zodResolver(basicsOnlySchema),
    defaultValues: { name: listing?.name ?? '', description: listing?.description ?? '', categoryId: listing?.categoryId ?? '' },
    mode: 'onTouched',
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  const description = useWatch({ control: form.control, name: 'description' });
  const categoryId = useWatch({ control: form.control, name: 'categoryId' });
  const [picking, setPicking] = useState(false);
  const cat = CATEGORY_BY_ID[categoryId];

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      form.reset(values);
    } catch {
      /* reported by the caller */
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Business name" htmlFor="biz-name" error={errors.name?.message} hint="The name on your signboard, as customers know it.">
        <Input id="biz-name" autoComplete="organization" aria-invalid={Boolean(errors.name)} {...form.register('name')} />
      </Field>

      <div>
        <div className="flex items-end justify-between">
          <Label htmlFor="biz-description">Description</Label>
          <span className="mb-1.5">
            <CharCount value={description} max={500} />
          </span>
        </div>
        <Textarea
          id="biz-description"
          rows={4}
          aria-invalid={Boolean(errors.description)}
          placeholder="What you offer, what you are known for, and anything a first-time customer should know."
          {...form.register('description')}
        />
        {errors.description ? <FieldError>{errors.description.message}</FieldError> : <p className="mt-1.5 text-[13px] text-muted-2">At least 20 characters. Plain and specific works best.</p>}
      </div>

      {withCategory && (
        <div>
          <Label>Category</Label>
          <div className={cn('flex items-center gap-3 rounded-xl border bg-surface p-3', errors.categoryId ? 'border-danger' : 'border-line-2')}>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-bg-2 text-ink-2">
              <Icon name={cat?.icon ?? 'Store'} className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-ink">{cat?.singular ?? 'No category yet'}</span>
              {cat && <span className="block text-[13px] text-muted-2">{GROUP_BY_ID[cat.groupId].label}</span>}
            </span>
            <Button type="button" variant="secondary" size="sm" onClick={() => setPicking(true)}>
              {cat ? 'Change' : 'Choose'}
            </Button>
          </div>
          <FieldError>{errors.categoryId?.message}</FieldError>
          <Sheet open={picking} onOpenChange={setPicking} title="Choose a category" description="Pick the one that best describes your main business." size="lg">
            <CategoryPicker
              value={categoryId}
              onChange={(id) => {
                form.setValue('categoryId', id, { shouldDirty: true, shouldValidate: true });
                setPicking(false);
              }}
            />
          </Sheet>
        </div>
      )}

      {footer({ submitting: isSubmitting, dirty: isDirty, reset: () => form.reset() })}
    </form>
  );
}

/* ── Category on its own (onboarding) ───────────────────────────────────── */

export function CategoryForm({ categoryId, onSubmit, footer }: SectionProps<CategoryInput> & { categoryId: string }) {
  const form = useForm<CategoryInput>({ resolver: zodResolver(categorySchema), defaultValues: { categoryId } });
  const { errors, isSubmitting, isDirty } = form.formState;
  const value = useWatch({ control: form.control, name: 'categoryId' });
  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      form.reset(values);
    } catch {
      /* reported by the caller */
    }
  });
  return (
    <form onSubmit={submit} noValidate>
      <CategoryPicker value={value} onChange={(id) => form.setValue('categoryId', id, { shouldDirty: true, shouldValidate: true })} />
      <FieldError>{errors.categoryId?.message}</FieldError>
      {footer({ submitting: isSubmitting, dirty: isDirty, reset: () => form.reset() })}
    </form>
  );
}

/* ── Contact ────────────────────────────────────────────────────────────── */

export function ContactForm({ listing, onSubmit, footer }: SectionProps<ContactInput> & { listing: Pick<BusinessListing, 'phone' | 'email' | 'website' | 'address'> }) {
  const form = useForm<ContactInput>({
    resolver: zodResolver(businessContactSchema) as Resolver<ContactInput>,
    defaultValues: { phone: listing.phone, email: listing.email ?? '', website: listing.website ?? '', address: listing.address },
    mode: 'onTouched',
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      form.reset(values);
    } catch {
      /* reported by the caller */
    }
  });
  return (
    <form onSubmit={submit} noValidate className="@container space-y-4">
      <div className="grid gap-4 @md:grid-cols-2">
        <Field label="Phone number" htmlFor="biz-phone" error={errors.phone?.message} hint="Customers tap this to call you.">
          <Input id="biz-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" aria-invalid={Boolean(errors.phone)} {...form.register('phone')} />
        </Field>
        <Field label="Email (optional)" htmlFor="biz-email" error={errors.email?.message}>
          <Input id="biz-email" type="email" inputMode="email" autoComplete="email" placeholder="hello@yourbusiness.in" aria-invalid={Boolean(errors.email)} {...form.register('email')} />
        </Field>
      </div>
      <Field label="Website (optional)" htmlFor="biz-website" error={errors.website?.message} hint="Your site, menu link or social page.">
        <Input id="biz-website" type="url" inputMode="url" autoComplete="url" placeholder="yourbusiness.in" aria-invalid={Boolean(errors.website)} {...form.register('website')} />
      </Field>
      <Field label="Address" htmlFor="biz-address" error={errors.address?.message} hint="Shop or door number, street, area, city and PIN code.">
        <Textarea id="biz-address" rows={3} autoComplete="street-address" aria-invalid={Boolean(errors.address)} className="min-h-[84px]" {...form.register('address')} />
      </Field>
      {footer({ submitting: isSubmitting, dirty: isDirty, reset: () => form.reset() })}
    </form>
  );
}

/* ── Amenities ──────────────────────────────────────────────────────────── */

export function AmenitiesForm({ listing, onSubmit, footer }: SectionProps<string[]> & { listing: Pick<BusinessListing, 'categoryId' | 'amenities'> }) {
  const id = useId();
  const [saved, setSaved] = useState<string[]>(listing.amenities);
  const [selected, setSelected] = useState<string[]>(listing.amenities);
  const [submitting, setSubmitting] = useState(false);

  // Options for this kind of business, plus anything already ticked that a category change left behind.
  const options = useMemo(() => {
    const base = amenitiesFor(listing.categoryId);
    return [...base, ...saved.filter((a) => !base.includes(a))];
  }, [listing.categoryId, saved]);

  const dirty = selected.length !== saved.length || selected.some((a) => !saved.includes(a));
  const toggle = (label: string) => setSelected((list) => (list.includes(label) ? list.filter((a) => a !== label) : [...list, label]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Stored in the order they are listed, not the order they were ticked.
      const ordered = options.filter((a) => selected.includes(a));
      await onSubmit(ordered);
      setSaved(ordered);
      setSelected(ordered);
    } catch {
      /* reported by the caller */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <fieldset>
        <legend className="sr-only">Amenities</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((label, i) => {
            const checked = selected.includes(label);
            const inputId = `${id}-${i}`;
            return (
              <label
                key={label}
                htmlFor={inputId}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand',
                  checked ? 'border-forest bg-surface font-medium text-ink' : 'border-line bg-surface text-ink-2 hover:border-line-2 hover:bg-surface-2',
                )}
              >
                <input id={inputId} type="checkbox" checked={checked} onChange={() => toggle(label)} className="sr-only" />
                <span className={cn('grid size-5 shrink-0 place-items-center rounded-md border transition-colors', checked ? 'border-forest bg-forest text-on-forest' : 'border-line-2 bg-surface')} aria-hidden>
                  {checked && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>
      {footer({ submitting, dirty, reset: () => setSelected(saved) })}
    </form>
  );
}
