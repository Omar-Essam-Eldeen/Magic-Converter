/**
 * "Conversion done" system notifications.
 *
 * Privacy: notifications are created locally on the device by the page /
 * service-worker registration (web) or the OS via Capacitor's
 * LocalNotifications plugin (native app). Nothing is sent to any server,
 * ever — this is not a push service. A notification is only shown while
 * the app is in the background (document hidden); when the user is
 * looking at the app, the in-app state already tells them it finished.
 */

/** True when running inside the native (Capacitor) Android app. */
export function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

export function notifySupported(): boolean {
  if (isNative()) return true;
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (isNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const status = await LocalNotifications.requestPermissions();
      return status.display === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  if (!notifySupported()) return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export async function showDoneNotification(title: string, body: string): Promise<void> {
  if (document.visibilityState !== 'hidden') return;
  if (isNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') return;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2_000_000_000),
            title,
            body,
            schedule: { at: new Date(Date.now() + 100) },
          },
        ],
      });
    } catch {
      /* native notification failed — stay silent */
    }
    return;
  }
  if (!notifySupported() || Notification.permission !== 'granted') return;
  const options: NotificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    tag: 'converter-done',
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    /* fall through to the page-level constructor */
  }
  try {
    new Notification(title, options);
  } catch {
    /* unsupported in this context (e.g. iOS browser tab) — stay silent */
  }
}
