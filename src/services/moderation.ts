import { uid } from '@/lib/utils';
import type { ModerationItem, ModerationTarget, UserProfile } from '@/types';
import { localDb } from './backend/localDb';

export const FLAG_REASONS = [
  'Inaccurate or misleading',
  'Spam or advertising',
  'Offensive or abusive',
  'Not relevant to this place',
  'Shares private information',
  'Something else',
] as const;

export const moderationService = {
  /** Add something to the moderation queue. One open flag per person per item. */
  async flag(
    user: UserProfile,
    target: { type: ModerationTarget; id: string; label: string },
    reason: string,
    note?: string,
  ): Promise<{ created: boolean }> {
    await localDb.ready();
    const dup = localDb.get().moderation.some((m) => m.targetId === target.id && m.reporterId === user.id && m.status === 'open');
    if (dup) return { created: false };
    const item: ModerationItem = {
      id: uid('flag'),
      targetType: target.type,
      targetId: target.id,
      targetLabel: target.label,
      reason,
      note: note?.trim() || undefined,
      reporterId: user.id,
      reporterName: user.name,
      status: 'open',
      createdAt: Date.now(),
    };
    localDb.set((s) => ({ moderation: [item, ...s.moderation] }));
    return { created: true };
  },

  /** System-raised item, e.g. a report that many people disagreed with. */
  async autoFlag(target: { type: ModerationTarget; id: string; label: string }, reason: string) {
    await localDb.ready();
    if (localDb.get().moderation.some((m) => m.targetId === target.id && m.reporterId === 'system' && m.status === 'open')) return;
    localDb.set((s) => ({
      moderation: [
        { id: uid('flag'), targetType: target.type, targetId: target.id, targetLabel: target.label, reason, reporterId: 'system', reporterName: 'Automatic check', status: 'open', createdAt: Date.now() },
        ...s.moderation,
      ],
    }));
  },

  isHidden: (id: string) => localDb.get().hiddenIds.includes(id),
};
