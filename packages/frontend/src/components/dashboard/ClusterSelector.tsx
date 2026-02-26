import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export function ClusterSelector() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['kube-contexts'],
    queryFn: api.getKubeContexts,
  });

  const switchContext = useMutation({
    mutationFn: (context: string) => api.setKubeContext(context),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      toast.success('Cluster context switched');
    },
    onError: (err) => toast.error(`Failed to switch context: ${err.message}`),
  });

  if (isLoading) {
    return <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />;
  }

  const contexts = data?.contexts ?? [];
  const current = data?.current ?? '';

  if (contexts.length === 0) return null;

  return (
    <select
      value={current}
      onChange={(e) => switchContext.mutate(e.target.value)}
      disabled={switchContext.isPending}
      className="bg-prussian-blue/80 text-white text-xs border border-gray-500 rounded px-2 py-1 focus:outline-none focus:border-congress-blue"
    >
      {!current && <option value="">No context</option>}
      {contexts.map((ctx) => (
        <option key={ctx} value={ctx}>
          {ctx}
        </option>
      ))}
    </select>
  );
}
