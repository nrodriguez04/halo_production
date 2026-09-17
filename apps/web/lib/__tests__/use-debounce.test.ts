import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from '../use-debounce';

describe('useDebouncedValue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('first', 250));
    expect(result.current).toBe('first');
  });

  it('holds the previous value until the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: 'first' } },
    );

    rerender({ value: 'second' });
    expect(result.current).toBe('first');

    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current).toBe('second');
  });

  it('only emits the last value when input changes rapidly', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    rerender({ value: 'abc' });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // Still within the window of the latest keystroke.
    expect(result.current).toBe('a');

    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current).toBe('abc');
  });
});
