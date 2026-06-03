import { useEffect, useRef } from 'react';

const PERMISSION_KEY = 'tracing-dashboard-notify-permission';

export function useNotification() {
  const hasNotification = typeof Notification !== 'undefined';
  const grantedRef = useRef(hasNotification && Notification.permission === 'granted');

  useEffect(() => {
    if (!hasNotification) return;
    if (Notification.permission === 'granted') {
      grantedRef.current = true;
      return;
    }
    if (Notification.permission === 'denied') return;

    const asked = sessionStorage.getItem(PERMISSION_KEY);
    if (asked) return;

    const timer = setTimeout(() => {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          grantedRef.current = true;
        }
        sessionStorage.setItem(PERMISSION_KEY, '1');
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const notify = (title: string, body: string, tag?: string) => {
    if (!grantedRef.current) return;
    try {
      new Notification(title, { body, tag, icon: '/favicon.ico' });
    } catch {
      // ignore
    }
  };

  return notify;
}
