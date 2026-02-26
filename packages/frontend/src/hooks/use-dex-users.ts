import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DexStaticUser {
  email: string;
  username: string;
  userID: string;
  hash: string;
}

export function useDexUsers() {
  return useQuery({
    queryKey: ['dex-users'],
    queryFn: api.getDexUsers,
  });
}

export function useSaveDexUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (users: DexStaticUser[]) => api.saveDexUsers(users),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dex-users'] });
    },
  });
}
