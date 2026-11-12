import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePreference } from './usePreferences';

const api = { getPreference: vi.fn(), setPreference: vi.fn() };

beforeEach(() => {
  api.getPreference.mockReset();
  api.setPreference.mockReset().mockResolvedValue({ success: true });
  (window as any).electronAPI = api;
});

describe('usePreference', () => {
  it('loads the saved value and saves a change', async () => {
    api.getPreference.mockResolvedValue(false);
    const hook = renderHook(() => usePreference('showPOI', true));
    await waitFor(() => expect(hook.result.current[2]).toBe(false));
    expect(hook.result.current[0]).toBe(false);

    act(() => hook.result.current[1](true));
    expect(hook.result.current[0]).toBe(true);
    expect(api.setPreference).toHaveBeenCalledWith('showPOI', true);
  });

  it('keeps and saves a value set before the saved one was loaded', async () => {
    let answer: (value: unknown) => void = () => {};
    api.getPreference.mockReturnValue(new Promise(resolve => { answer = resolve; }));
    const hook = renderHook(() => usePreference('showPOI', true));

    act(() => hook.result.current[1](false));   // The user is faster than the load
    expect(api.setPreference).not.toHaveBeenCalled();
    await act(async () => { answer(true); });

    await waitFor(() => expect(hook.result.current[2]).toBe(false));
    expect(hook.result.current[0]).toBe(false);
    expect(api.setPreference).toHaveBeenCalledWith('showPOI', false);
  });

  it('does not save the default when nothing was changed', async () => {
    api.getPreference.mockResolvedValue(null);
    const hook = renderHook(() => usePreference('showPOI', true));
    await waitFor(() => expect(hook.result.current[2]).toBe(false));
    expect(hook.result.current[0]).toBe(true);
    expect(api.setPreference).not.toHaveBeenCalled();
  });
});
