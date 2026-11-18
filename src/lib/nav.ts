import { router } from 'expo-router';

export type AppRoute = '/' | '/council' | '/insights' | '/settings';

/**
 * Moves between the app's top-level screens without piling up history:
 * the chat screen is the root, every other screen sits one level above it.
 */
export function navigateTo(current: string, path: AppRoute) {
  if (current === path) return;
  if (path === '/') {
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
    return;
  }
  if (current === '/') router.push(path);
  else router.replace(path);
}

/** Back from a pushed screen, falling back to the chat screen. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
