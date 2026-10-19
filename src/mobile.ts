import { useSyncExternalStore } from 'react';

/**
 * Phone layout: below this width the side panels become a bottom sheet and the toolbar compacts. Touch screens
 * (any size) also get bigger tap targets in the plan and on-screen walk-through controls.
 */
export const MOBILE_QUERY = '(max-width: 760px)';
const TOUCH_QUERY = '(pointer: coarse)';

function watch(query: string) {
  const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null;
  return {
    get: () => !!mq?.matches,
    subscribe: (cb: () => void) => {
      mq?.addEventListener('change', cb);
      return () => mq?.removeEventListener('change', cb);
    },
  };
}

const mobile = watch(MOBILE_QUERY);
const touch = watch(TOUCH_QUERY);

export const isMobile = mobile.get;
export const isTouch = touch.get;
export const useMobile = () => useSyncExternalStore(mobile.subscribe, mobile.get);
export const useTouch = () => useSyncExternalStore(touch.subscribe, touch.get);

/** Walk-through joystick: forward / sideways, each −1…1 (read by the walk loop alongside the keys). */
export const walkStick = { fwd: 0, strafe: 0 };
