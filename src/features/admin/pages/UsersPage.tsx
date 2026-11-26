import { SearchX, Server, Trash2, UserCheck, UserX, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState, Notice } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/controls';
import { Select } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/sheet';
import { hasBackend } from '@/lib/env';
import type { AdminUserRow } from '@/services/admin';
import { useAuth } from '@/store/auth';
import type { Role } from '@/types';
import { AdminPage, DataTable, FilterSelect, formatCount, QueryState, ROLE_LABEL, RowMenu, SearchField, Toolbar, UserStatusBadge, type Column, type RowAction } from '../components/kit';
import { useLatest, useUserMutations, useUsers } from '../hooks';

type RoleFilter = 'all' | Role;
const ROLES: Role[] = ['user', 'business', 'admin'];
const ROLE_OPTIONS: { value: RoleFilter; label: string }[] = [{ value: 'all', label: 'Any role' }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))];

const joined = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function UsersTable({ users }: { users: AdminUserRow[] }) {
  const me = useAuth((s) => s.user);
  const { setRole, setStatus, remove } = useUserMutations();
  const [q, setQ] = useState('');
  const [role, setRoleFilter] = useState<RoleFilter>('all');
  const [confirming, setConfirming] = useState<{ user: AdminUserRow; action: 'suspend' | 'delete' } | null>(null);
  const confirmed = useLatest(confirming);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => (role === 'all' || u.role === role) && (!needle || [u.name, u.email ?? '', u.phone ?? '', u.homeArea ?? ''].some((v) => v.toLowerCase().includes(needle))));
  }, [users, q, role]);

  const filtered = q.trim() !== '' || role !== 'all';
  const isMe = (u: AdminUserRow) => u.id === me?.id;

  const roleSelect = (u: AdminUserRow) => (
    <div className="w-[158px]">
      <Select
        aria-label={`Role for ${u.name}`}
        value={u.role}
        disabled={isMe(u) || setRole.isPending}
        title={isMe(u) ? 'You cannot change your own role' : undefined}
        onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value as Role })}
        className="h-9 text-[13px]"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </Select>
    </div>
  );

  const actionsFor = (u: AdminUserRow): (RowAction | false)[] =>
    isMe(u)
      ? []
      : [
          u.status === 'suspended'
            ? { label: 'Reactivate account', icon: UserCheck, onSelect: () => setStatus.mutate({ id: u.id, status: 'active' }) }
            : { label: 'Suspend account', icon: UserX, onSelect: () => setConfirming({ user: u, action: 'suspend' }) },
          { label: 'Delete account', icon: Trash2, destructive: true, separated: true, onSelect: () => setConfirming({ user: u, action: 'delete' }) },
        ];

  const identity = (u: AdminUserRow) => (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={u.name} hue={u.avatarHue} size={36} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate font-semibold text-ink">
          <span className="truncate">{u.name}</span>
          {isMe(u) && <Badge tone="brand">You</Badge>}
        </p>
        <p className="truncate text-[12.5px] text-muted-2">{u.email ?? u.phone ?? 'No contact details'}</p>
      </div>
    </div>
  );

  const columns: Column<AdminUserRow>[] = [
    { id: 'user', header: 'User', cell: (u) => <div className="max-w-[280px]">{identity(u)}</div> },
    { id: 'role', header: 'Role', cell: roleSelect },
    { id: 'status', header: 'Status', cell: (u) => <UserStatusBadge status={u.status} /> },
    {
      id: 'points',
      header: 'Contribution points',
      cell: (u) => (
        <div>
          <p className="tabular font-semibold text-ink">{formatCount(u.points)}</p>
          <p className="text-[12.5px] text-muted-2">{u.level}</p>
        </div>
      ),
    },
    {
      id: 'activity',
      header: 'Activity',
      cell: (u) => (
        <p className="tabular whitespace-nowrap text-[13px] text-ink-2">
          {u.reviews} reviews · {u.reports} updates
          {u.listings > 0 && ` · ${u.listings} ${u.listings === 1 ? 'listing' : 'listings'}`}
        </p>
      ),
    },
    { id: 'joined', header: 'Joined', cell: (u) => <span className="tabular whitespace-nowrap text-[13px] text-muted-2">{joined(u.createdAt)}</span> },
    {
      id: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      cell: (u) => (isMe(u) ? <span className="text-[12px] text-muted">Your account</span> : <RowMenu label={`Actions for ${u.name}`} actions={actionsFor(u)} className="ml-auto" />),
    },
  ];

  const target = confirmed?.user;
  const deletingUser = confirmed?.action === 'delete';

  return (
    <>
      {hasBackend && (
        <Notice icon={Server} className="mb-4">
          Accounts are managed by the connected backend. This table lists the accounts that were created on this device in local mode.
        </Notice>
      )}

      <Toolbar>
        <SearchField value={q} onChange={setQ} placeholder="Search name, email or area" label="Search users" />
        <FilterSelect label="Role" value={role} onChange={setRoleFilter} options={ROLE_OPTIONS} />
      </Toolbar>

      <DataTable
        caption="User accounts"
        noun={['account', 'accounts']}
        rows={rows}
        columns={columns}
        rowKey={(u) => u.id}
        card={(u) => (
          <div>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">{identity(u)}</div>
              <RowMenu label={`Actions for ${u.name}`} actions={actionsFor(u)} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              {roleSelect(u)}
              <UserStatusBadge status={u.status} />
              <span className="tabular text-[13px] text-ink-2">
                {formatCount(u.points)} pts · {u.level}
              </span>
            </div>
            <p className="tabular mt-2 text-[12.5px] text-muted-2">
              Joined {joined(u.createdAt)} · {u.reviews} reviews · {u.reports} updates
            </p>
            {isMe(u) && <p className="mt-1 text-[12.5px] text-muted-2">Your own role and status cannot be changed from here.</p>}
          </div>
        )}
        empty={
          filtered ? (
            <EmptyState
              icon={SearchX}
              title="No accounts match"
              description="Try a different search or role."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ('');
                    setRoleFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState icon={Users} title="No accounts yet" description="People appear here once they sign up on this device." />
          )
        }
      />

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={deletingUser ? `Delete ${target?.name ?? 'this account'}?` : `Suspend ${target?.name ?? 'this account'}?`}
        description={
          deletingUser
            ? 'The account, its reviews, live updates, suggestions and contribution history are removed for good. Business listings it owns are kept. This cannot be undone.'
            : 'They will not be able to sign in until the account is reactivated. Their existing reviews and updates stay visible.'
        }
        confirmLabel={deletingUser ? 'Delete account' : 'Suspend account'}
        destructive
        loading={remove.isPending || setStatus.isPending}
        onConfirm={() => {
          if (!confirming) return;
          const done = { onSuccess: () => setConfirming(null) };
          if (confirming.action === 'delete') remove.mutate(confirming.user.id, done);
          else setStatus.mutate({ id: confirming.user.id, status: 'suspended' }, done);
        }}
      />
    </>
  );
}

export default function UsersPage() {
  const users = useUsers();
  return (
    <AdminPage title="Users" subtitle="Accounts, their roles and how much each person has contributed.">
      <QueryState query={users}>{(data) => <UsersTable users={data} />}</QueryState>
    </AdminPage>
  );
}
