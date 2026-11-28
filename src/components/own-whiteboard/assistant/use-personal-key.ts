'use client';

import { useEffect, useRef, useState } from 'react';
import { forgetDeviceKey, loadDeviceKey, rememberDeviceKey } from './device-key';

export function usePersonalKey(owner: string | null) {
  const [value, setValue] = useState('');
  const [remembered, setRemembered] = useState(false);
  const [loading, setLoading] = useState(Boolean(owner));
  const [deviceError, setDeviceError] = useState(false);
  const version = useRef(0);
  const writing = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);

  // Parent keys this hook by account; the board owns it even with the Dock closed.
  useEffect(() => {
    if (!owner) return;
    async function restore() {
      const token = ++version.current;
      setLoading(true);
      try {
        const key = await loadDeviceKey(owner!);
        if (token !== version.current) return;
        setValue(key);
        setRemembered(Boolean(key));
        setDeviceError(false);
      } catch {
        if (token !== version.current) return;
        setValue('');
        setRemembered(false);
        setDeviceError(true);
      } finally {
        if (token === version.current) setLoading(false);
      }
    }
    void restore();
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('owb-device-key-notices');
      channel.current.onmessage = event => {
        if (event.data === owner) void restore();
      };
    }
    return () => {
      ++version.current;
      channel.current?.close();
      channel.current = null;
    };
  }, [owner]);

  async function save(key: string, remember: boolean) {
    if (writing.current || loading) throw new Error('请稍候再试。');
    if (remember && !owner) throw new Error('请先登录，再在这台设备上记住 Key。');
    writing.current = true;
    ++version.current;
    setLoading(true);
    try {
      if (remember && owner) {
        await rememberDeviceKey(owner, key);
      } else if (owner && (remembered || !key)) {
        await forgetDeviceKey(owner);
      }
      if (owner && (remember || remembered || !key)) channel.current?.postMessage(owner);
      setValue(key);
      setRemembered(remember);
      if (remember || remembered || !key) setDeviceError(false);
    } catch {
      throw new Error('设备存储操作未完成，请检查浏览器存储权限后重试。');
    } finally {
      writing.current = false;
      setLoading(false);
    }
  }
  return { value, owner, remembered, loading, deviceError, save };
}
