'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { apiFetch, apiJson, ApiError } from './api-fetch';

// Light wrapper that keeps cache keys aligned with the URL path so callers
// don't need to invent keys, and forwards search params for cache scoping.
export function useApiQuery<T>(
  path: string,
  options: Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'> & {
    params?: Record<string, string | number | boolean | undefined | null>;
  } = {},
) {
  const { params, ...queryOptions } = options;
  const search = params
    ? new URLSearchParams(
        Object.entries(params).filter(
          ([, v]) => v !== undefined && v !== null && v !== '',
        ) as [string, string][],
      ).toString()
    : '';
  const fullPath = search ? `${path}?${search}` : path;
  return useQuery<T, ApiError>({
    queryKey: [path, params ?? null],
    queryFn: () => apiJson<T>(fullPath),
    ...queryOptions,
  });
}

// Tiny mutation helper. Callers handle invalidation via onSuccess.
export function useApiMutation<TInput = unknown, TOutput = unknown>(
  fn: (input: TInput) => Promise<TOutput>,
  options?: UseMutationOptions<TOutput, ApiError, TInput>,
) {
  return useMutation<TOutput, ApiError, TInput>({
    mutationFn: fn,
    ...options,
  });
}

export { useQueryClient, apiFetch, apiJson, ApiError };
