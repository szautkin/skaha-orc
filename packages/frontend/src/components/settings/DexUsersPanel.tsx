import { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2, Save, Lock, KeyRound } from 'lucide-react';
import { useDexUsers, useSaveDexUsers } from '@/hooks/use-dex-users';
import type { DexStaticUser } from '@/hooks/use-dex-users';
import { api } from '@/lib/api';
import { toast } from 'sonner';

function generateUserID(): string {
  return crypto.randomUUID();
}

// bcrypt placeholder hash for "changeme"
const PLACEHOLDER_HASH = '$2a$10$2b2cU8CPhOTaGrs1HRQuAueS7JTT5ZHsHSzYiFPm1leZck7Mc8T4W';

export function DexUsersPanel() {
  const { data, isLoading } = useDexUsers();
  const save = useSaveDexUsers();
  const [users, setUsers] = useState<DexStaticUser[]>([]);
  const [dirty, setDirty] = useState(false);
  const [passwords, setPasswords] = useState<Record<number, string>>({});
  const [hashing, setHashing] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (data) {
      setUsers(data);
      setDirty(false);
    }
  }, [data]);

  const addUser = () => {
    setUsers((prev) => [
      ...prev,
      { email: '', username: '', userID: generateUserID(), hash: PLACEHOLDER_HASH },
    ]);
    setDirty(true);
  };

  const removeUser = (index: number) => {
    setUsers((prev) => prev.filter((_, i) => i !== index));
    setPasswords((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setDirty(true);
  };

  const updateUser = (index: number, field: keyof DexStaticUser, value: string) => {
    setUsers((prev) =>
      prev.map((u, i) => (i === index ? { ...u, [field]: value } : u)),
    );
    setDirty(true);
  };

  const hashAndSet = async (index: number) => {
    const password = passwords[index];
    if (!password || password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setHashing((prev) => ({ ...prev, [index]: true }));
    try {
      const { hash } = await api.hashPassword(password);
      updateUser(index, 'hash', hash);
      setPasswords((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      toast.success('Password hashed');
    } catch (err) {
      toast.error(`Hash failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setHashing((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handleSave = () => {
    const invalid = users.some((u) => !u.email || !u.username);
    if (invalid) {
      toast.error('Each user must have an email and username');
      return;
    }
    save.mutate(users, {
      onSuccess: () => {
        toast.success(`Saved ${users.length} user(s)`);
        setDirty(false);
      },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-congress-blue" />
      </div>
    );
  }

  const inputClass = 'w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-congress-blue';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Static Users</h3>
          <p className="text-xs text-neutral-gray mt-0.5">
            Users that can log in via Dex. Use the password field below to set passwords — hashes are generated server-side.
          </p>
        </div>
        <button
          onClick={addUser}
          className="flex items-center gap-1.5 text-sm text-congress-blue hover:text-prussian-blue"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-neutral-gray py-4 text-center">No users configured. Add one to get started.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-gray uppercase tracking-wider border-b">
              <th className="py-2 pr-2">Email</th>
              <th className="py-2 pr-2">Username</th>
              <th className="py-2 pr-2">Set Password</th>
              <th className="py-2 pr-2 w-16">Hash</th>
              <th className="py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {users.map((user, idx) => (
              <tr key={user.userID} className="border-b border-gray-100">
                <td className="py-1.5 pr-2">
                  <input
                    value={user.email}
                    onChange={(e) => updateUser(idx, 'email', e.target.value)}
                    className={inputClass}
                    placeholder="user@example.com"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    value={user.username}
                    onChange={(e) => updateUser(idx, 'username', e.target.value)}
                    className={inputClass}
                    placeholder="username"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <div className="flex gap-1">
                    <input
                      type="password"
                      value={passwords[idx] ?? ''}
                      onChange={(e) => setPasswords((prev) => ({ ...prev, [idx]: e.target.value }))}
                      className={inputClass}
                      placeholder="new password"
                    />
                    <button
                      onClick={() => void hashAndSet(idx)}
                      disabled={hashing[idx] || !passwords[idx]}
                      className="flex items-center gap-1 px-2 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                      title="Hash & set password"
                    >
                      {hashing[idx] ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <KeyRound className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </td>
                <td className="py-1.5 pr-2">
                  {user.hash ? (
                    <span title={user.hash}>
                      <Lock className="w-3.5 h-3.5 text-success-green" />
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-gray">none</span>
                  )}
                </td>
                <td className="py-1.5">
                  <button
                    onClick={() => removeUser(idx)}
                    className="text-tall-poppy-red hover:text-red-700 p-1"
                    title="Remove user"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button
        onClick={handleSave}
        disabled={!dirty || save.isPending}
        className="flex items-center gap-2 bg-congress-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-prussian-blue transition-colors disabled:opacity-50"
      >
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Users
      </button>
    </div>
  );
}
