'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { apiFetch, apiJson, ApiError } from './api-fetch';

type ParamRecord = Record<string, string | number | boolean | undefined | null>;

function buildSearch(params?: ParamRecord) {
  if (!params) return '';
  return new URLSearchParams(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== '',
    ) as [string, string][],
  ).toString();
}

// Light wrapper that keeps cache keys aligned with the URL path so callers
// don't need to invent keys, and forwards search params for cache scoping.
export function useApiQuery<T>(
  path: string,
  options: Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'> & {
    params?: ParamRecord;
  } = {},
) {
  const { params, ...queryOptions } = options;
  const search = buildSearch(params);
  const fullPath = search ? `${path}?${search}` : path;
  return useQuery<T, ApiError>({
    queryKey: [path, params ?? null],
    queryFn: () => apiJson<T>(fullPath),
    ...queryOptions,
  });
}

// Imperative variant that fires the same request useApiQuery would and stores
// the result under the same cache key, so a subsequent useApiQuery render
// hits the cache instead of going to the network. Use for hover-prefetch on
// nav links etc. No-op if the data is already fresh.
export function prefetchApi<T>(
  client: QueryClient,
  path: string,
  params?: ParamRecord,
) {
  const search = buildSearch(params);
  const fullPath = search ? `${path}?${search}` : path;
  return client.prefetchQuery({
    queryKey: [path, params ?? null],
    queryFn: () => apiJson<T>(fullPath),
    staleTime: 30_000,
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
