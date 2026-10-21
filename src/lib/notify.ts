/**
 * "Conversion done" system notifications.
 *
 * Privacy: notifications are created locally on the device by the page /
 * service-worker registration. Nothing is sent to any server, ever — this
 * is not a push service. A notification is only shown while the app is in
 * the background (document hidden); when the user is looking at the app,
 * the in-app state already tells them it finished.
 */

export function notifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (!notifySupported()) return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export async function showDoneNotification(title: string, body: string): Promise<void> {
  if (!notifySupported() || Notification.permission !== 'granted') return;
  if (document.visibilityState !== 'hidden') return;
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
