'use client';

import { useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { toast } from '@/components/ui/toast';
import { errorText } from '@/lib/disposition';

/**
 * One market action: calls the api, refreshes the market and the matrix,
 * and shows the api's own reason on failure (it says what is missing).
 */
export function useMarketAction<TInput = void, TOutput = unknown>(
  state: string,
  request: (input: TInput) => { path: string; method?: string; body?: unknown },
  messages: { success: string | ((out: TOutput) => string); failure: string },
  onDone?: (out: TOutput) => void,
) {
  const qc = useQueryClient();
  return useApiMutation<TInput, TOutput>(
    (input) => {
      const r = request(input);
      return apiJson<TOutput>(r.path, {
        method: r.method ?? 'POST',
        ...(r.body !== undefined ? { body: JSON.stringify(r.body) } : {}),
      });
    },
    {
      onSuccess: (out) => {
        toast.success(typeof messages.success === 'function' ? messages.success(out) : messages.success);
        qc.invalidateQueries({ queryKey: [`/markets/${state}`] });
        qc.invalidateQueries({ queryKey: ['/markets'] });
        onDone?.(out);
      },
      onError: (err) => toast.error(messages.failure, { description: errorText(err) }),
    },
  );
}
