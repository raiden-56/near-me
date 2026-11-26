import { zodResolver } from '@hookform/resolvers/zod';
import { RotateCcw, Save, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Icon } from '@/components/common/Icon';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Field, FieldError, Input } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/sheet';
import { CATEGORY_BY_ID } from '@/data/categories';
import { REPORT_TYPES } from '@/lib/community';
import { adminConfigSchema, DEFAULT_ADMIN_CONFIG, effectiveFeaturedIds, type AdminConfigInput } from '@/services/admin';
import type { AdminConfig } from '@/types';
import { useConfigMutations } from '../hooks';
import { Panel, SettingRow } from './kit';

export type PolicySection = 'expiry' | 'trust' | 'approval' | 'categories';

function humanMinutes(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return 'not set';
  if (m < 60) return `${m} min`;
  if (m < 1440) return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
  const days = Math.floor(m / 1440);
  const hours = Math.round((m % 1440) / 60);
  return hours ? `${days} d ${hours} h` : `${days} d`;
}

const TRUST_FIELDS = [
  {
    name: 'minConfirmationsForVerified',
    label: 'Confirmations to verify',
    hint: 'How many different people must confirm an update before it shows as community verified.',
  },
  { name: 'maxReportsPerHour', label: 'Updates per person, per hour', hint: 'Posting stops at this limit for an hour. Businesses updating their own place are exempt.' },
  { name: 'disagreementsToHide', label: 'Disagreements to hold back', hint: 'An update is held for review at this many disagreements, when they outnumber confirmations.' },
] as const;

/**
 * Platform configuration as one validated form. Screens choose which sections to show; the
 * whole configuration is always validated and saved together, so it can never be half-applied.
 */
export function PolicyForm({ config, sections, allowReset, saveLabel = 'Save changes' }: { config: AdminConfig; sections: readonly PolicySection[]; allowReset?: boolean; saveLabel?: string }) {
  const formId = useId();
  const { update, reset: resetToDefaults } = useConfigMutations();
  const [confirmReset, setConfirmReset] = useState(false);

  const {
    register, handleSubmit, control, reset, setValue,
    formState: { errors, isDirty },
  } = useForm<AdminConfigInput>({
    resolver: zodResolver(adminConfigSchema),
    values: config,
    // Changes made elsewhere (a category switched off) flow in without discarding unsaved edits.
    resetOptions: { keepDirtyValues: true },
    mode: 'onBlur',
  });

  const expiry = useWatch({ control, name: 'expiryMinutes' });
  const disabledIds = useWatch({ control, name: 'disabledCategoryIds' });
  const featuredIds = useWatch({ control, name: 'featuredCategoryIds' });
  const has = (s: PolicySection) => sections.includes(s);

  const onSubmit = handleSubmit((values) =>
    update.mutate(values, {
      onSuccess: (saved) => {
        reset(saved);
        toast.success('Configuration saved', { description: 'New live updates and votes use these settings from now on.' });
      },
    }),
  );

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="space-y-4">
      {has('expiry') && (
        <Panel title="Expiration policy" subtitle="How long each kind of live update stays current before it is marked expired" bodyClassName="px-0 pb-0 pt-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <caption className="sr-only">Minutes a live update stays current, per report type</caption>
              <thead>
                <tr className="text-[12.5px] text-muted-2">
                  <th scope="col" className="border-b border-line px-5 pb-2 font-medium">
                    Report type
                  </th>
                  <th scope="col" className="border-b border-line px-3 pb-2 font-medium">
                    Minutes
                  </th>
                  <th scope="col" className="border-b border-line px-3 pb-2 font-medium">
                    Reads as
                  </th>
                  <th scope="col" className="border-b border-line px-5 pb-2 text-right font-medium">
                    Default
                  </th>
                </tr>
              </thead>
              <tbody>
                {REPORT_TYPES.map((t) => {
                  const error = errors.expiryMinutes?.[t.type]?.message;
                  const inputId = `${formId}-expiry-${t.type}`;
                  return (
                    <tr key={t.type} className="align-top">
                      <th scope="row" className="border-b border-line px-5 py-2.5 font-normal">
                        <label htmlFor={inputId} className="flex h-10 items-center gap-2.5 text-ink">
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-bg-2 text-ink-2">
                            <Icon name={t.icon} className="size-4" />
                          </span>
                          {t.label}
                        </label>
                      </th>
                      <td className="border-b border-line px-3 py-2.5">
                        <Input
                          id={inputId}
                          type="number"
                          inputMode="numeric"
                          min={5}
                          max={10080}
                          step={5}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? `${inputId}-error` : undefined}
                          className="tabular h-10 w-[104px] text-sm"
                          {...register(`expiryMinutes.${t.type}`, { valueAsNumber: true })}
                        />
                        <div id={`${inputId}-error`}>
                          <FieldError>{error}</FieldError>
                        </div>
                      </td>
                      <td className="tabular border-b border-line px-3 py-2.5">
                        <span className="flex h-10 items-center text-ink-2">{humanMinutes(expiry?.[t.type])}</span>
                      </td>
                      <td className="tabular border-b border-line px-5 py-2.5 text-right">
                        <span className="flex h-10 items-center justify-end text-muted-2">{humanMinutes(DEFAULT_ADMIN_CONFIG.expiryMinutes[t.type])}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[12.5px] text-muted-2">Between 5 minutes and 7 days. Changes apply to updates posted from now on; existing ones keep the expiry they were given.</p>
        </Panel>
      )}

      {has('trust') && (
        <Panel title="Trust settings" subtitle="When the community's votes change what people see">
          <div className="grid gap-5 md:grid-cols-3">
            {TRUST_FIELDS.map((f) => {
              const inputId = `${formId}-${f.name}`;
              return (
                <Field key={f.name} label={f.label} htmlFor={inputId} hint={f.hint} error={errors[f.name]?.message}>
                  <Input id={inputId} type="number" inputMode="numeric" min={1} step={1} aria-invalid={Boolean(errors[f.name])} className="tabular" {...register(f.name, { valueAsNumber: true })} />
                </Field>
              );
            })}
          </div>
        </Panel>
      )}

      {has('approval') && (
        <Panel title="Approval" subtitle="What is checked by an administrator before it goes public" bodyClassName="px-5 pb-2 pt-2">
          <div className="divide-y divide-line">
            <Controller
              control={control}
              name="dealsRequireApproval"
              render={({ field }) => (
                <SettingRow
                  title="Deals need approval"
                  description="New deals from businesses wait in the Deals queue until an administrator approves them."
                  control={<Switch checked={field.value} onCheckedChange={field.onChange} onBlur={field.onBlur} aria-label="Deals need approval" />}
                />
              )}
            />
            <Controller
              control={control}
              name="eventsRequireApproval"
              render={({ field }) => (
                <SettingRow
                  title="Events need approval"
                  description="Events submitted by the community wait in the Events queue until an administrator approves them."
                  control={<Switch checked={field.value} onCheckedChange={field.onChange} onBlur={field.onBlur} aria-label="Events need approval" />}
                />
              )}
            />
          </div>
        </Panel>
      )}

      {has('categories') && (
        <Panel
          title="Categories"
          subtitle="Which categories are switched off or featured"
          action={
            <Link to="/admin/categories" className="text-[13px] font-medium text-brand-ink hover:underline">
              Manage categories
            </Link>
          }
        >
          <div className="grid gap-5 md:grid-cols-2">
            <IdList
              label="Switched off"
              empty="Every category is switched on."
              ids={disabledIds ?? []}
              onRemove={(id) => setValue('disabledCategoryIds', (disabledIds ?? []).filter((x) => x !== id), { shouldDirty: true })}
              removeVerb="Switch on"
            />
            <IdList
              label="Featured"
              empty="Using the taxonomy defaults."
              ids={featuredIds ?? []}
              fallbackIds={effectiveFeaturedIds({ featuredCategoryIds: [] })}
              onRemove={(id) => setValue('featuredCategoryIds', (featuredIds ?? []).filter((x) => x !== id), { shouldDirty: true })}
              removeVerb="Stop featuring"
            />
          </div>
        </Panel>
      )}

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-surface/95 p-3 shadow-lift backdrop-blur-sm">
        <Button type="submit" loading={update.isPending} disabled={!isDirty}>
          <Save /> {saveLabel}
        </Button>
        {isDirty && (
          <Button variant="ghost" onClick={() => reset(config)}>
            Discard changes
          </Button>
        )}
        <p className="text-[13px] text-muted-2" role="status">
          {Object.keys(errors).length ? 'Fix the highlighted fields to save.' : isDirty ? 'You have unsaved changes.' : 'Everything is saved.'}
        </p>
        {allowReset && (
          <Button variant="secondary" className="ml-auto" onClick={() => setConfirmReset(true)}>
            <RotateCcw /> Reset to defaults
          </Button>
        )}
      </div>

      {allowReset && (
        <ConfirmDialog
          open={confirmReset}
          onOpenChange={setConfirmReset}
          title="Reset configuration to defaults?"
          description="Expiry times, trust settings and approval rules return to their defaults. Every category is switched on again and the featured list goes back to the taxonomy picks."
          confirmLabel="Reset to defaults"
          destructive
          loading={resetToDefaults.isPending}
          onConfirm={() =>
            resetToDefaults.mutate(undefined, {
              onSuccess: (defaults) => {
                reset(defaults);
                setConfirmReset(false);
              },
            })
          }
        />
      )}
    </form>
  );
}

function IdList({ label, empty, ids, fallbackIds, onRemove, removeVerb }: { label: string; empty: string; ids: string[]; fallbackIds?: string[]; onRemove: (id: string) => void; removeVerb: string }) {
  const name = (id: string) => CATEGORY_BY_ID[id]?.label ?? id;
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-ink-2">
        {label} <span className="tabular font-normal text-muted">({ids.length})</span>
      </p>
      {ids.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-lg border border-line-2 bg-surface py-1 pl-2.5 pr-1 text-[13px] text-ink">
              {name(id)}
              <button type="button" onClick={() => onRemove(id)} aria-label={`${removeVerb} ${name(id)}`} className="grid size-6 place-items-center rounded-md text-muted-2 hover:bg-bg-2 hover:text-ink">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-2">
          {empty}
          {fallbackIds?.length ? ` Currently: ${fallbackIds.map(name).join(', ')}.` : ''}
        </p>
      )}
    </div>
  );
}
