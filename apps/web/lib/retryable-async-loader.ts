export function createRetryableAsyncLoader<T>(load: () => Promise<T>) {
  let pending: Promise<T> | null = null;

  return async () => {
    if (!pending) {
      pending = load();
    }

    try {
      return await pending;
    } catch (error) {
      pending = null;
      throw error;
    }
  };
}
