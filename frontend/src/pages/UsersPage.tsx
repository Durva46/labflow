import { useEffect, useState } from 'react';
import { apiGetList, apiPatch, apiPost } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, Tbody, Td, Th, Thead, Tr } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Field } from '../components/ui/Field';
import { Pagination } from '../components/ui/Pagination';
import { useAuth } from '../context/AuthContext';
import type { User } from '../types';

export function UsersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [users, setUsers] = useState<User[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);

  const load = async () => {
    try {
      const response = await apiGetList<User>('/users', {
        params: { page, pageSize: 25, search: search || undefined },
      });
      setUsers(response.data);
      setMeta(response.meta);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, page, search]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md text-center">
          <p className="text-base font-semibold text-gray-900">You do not have permission</p>
          <p className="mt-1 text-sm text-gray-500">Only administrators can manage users.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500">Create users, update roles, and reset passwords.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create user</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Input
              placeholder="Search users"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
          </div>
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {users.map((item) => (
                <Tr key={item.id}>
                  <Td>{item.name}</Td>
                  <Td>{item.email}</Td>
                  <Td>
                    <Badge tone="neutral">{item.role}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={item.isActive ? 'success' : 'neutral'}>
                      {item.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Td>
                  <Td className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditUser(item)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setResetUser(item)}>
                      Reset password
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <Pagination page={page} totalPages={meta.totalPages} onChange={setPage} />
        </CardContent>
      </Card>
      {createOpen ? (
        <CreateUserDialog
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      ) : null}
      {editUser ? (
        <EditUserDialog
          user={editUser}
          currentUserId={user?.id ?? null}
          onClose={() => setEditUser(null)}
          onSaved={() => {
            setEditUser(null);
            void load();
          }}
        />
      ) : null}
      {resetUser ? (
        <ResetPasswordDialog
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSaved={() => setResetUser(null)}
        />
      ) : null}
    </div>
  );
}

function CreateUserDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', role: 'LAB_STAFF', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiPost('/users', form);
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Failed to create user.');
    } finally {
      setBusy(false);
    }
  };

  const strength = form.password.length >= 8 ? 'strong' : form.password.length >= 6 ? 'medium' : 'weak';

  return (
    <Modal
      open
      onClose={onClose}
      title="Create user"
      description="Passwords are never displayed. Temporary password must be changed on next login if required."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
        </Field>
        <Field label="Role" required>
          <Select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
            <option value="ADMIN">ADMIN</option>
            <option value="LAB_MANAGER">LAB_MANAGER</option>
            <option value="LAB_STAFF">LAB_STAFF</option>
          </Select>
        </Field>
        <Field label="Temporary password" required>
          <Input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
          <p className="text-xs text-gray-500">Strength: {strength}</p>
        </Field>
      </div>
    </Modal>
  );
}

function EditUserDialog({
  user,
  currentUserId,
  onClose,
  onSaved,
}: {
  user: User;
  currentUserId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ role: user.role, isActive: user.isActive });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSelf = user.id === currentUserId;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/users/${user.id}`, form);
      onSaved();
    } catch (err: any) {
      if (err?.code === 'SELF_ACTION_FORBIDDEN') {
        setError('You cannot deactivate or demote your own account.');
      } else {
        setError(err?.message || 'Failed to update user.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit user"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <p className="text-sm text-gray-900">{user.name}</p>
        <Field label="Role">
          <Select
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as User['role'] }))}
            disabled={isSelf}
          >
            <option value="ADMIN">ADMIN</option>
            <option value="LAB_MANAGER">LAB_MANAGER</option>
            <option value="LAB_START">LAB_STAFF</option>
            <option value="LAB_STAFF">LAB_STAFF</option>
          </Select>
          {isSelf ? <p className="text-xs text-gray-500">Cannot change your own role.</p> : null}
        </Field>
        <Field label="Active">
          <Select
            value={form.isActive ? 'true' : 'false'}
            onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.value === 'true' }))}
            disabled={isSelf}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
          {isSelf ? <p className="text-xs text-gray-500">Cannot deactivate your own account.</p> : null}
        </Field>
      </div>
    </Modal>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ newPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/users/${user.id}/reset-password`, form);
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Reset password"
      description="Passwords are never displayed. The user must change it at next login."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Reset
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <p className="text-sm text-gray-900">{user.name}</p>
        <Field label="New password" required>
          <Input type="password" value={form.newPassword} onChange={(e) => setForm((p) => ({ ...p, newPassword: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  );
}
