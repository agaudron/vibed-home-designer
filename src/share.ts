import { resetFileHandle } from './fileio';
import { normaliseDesign, store } from './store';
import type { Design } from './types';

/**
 * Share links: the whole design, compressed, in the link's #fragment. Browsers never send the fragment to the web
 * server, so there's still no server copy: whoever opens the link gets their own copy of the design.
 */

const PREFIX = '#design=';
/** Version tag inside the payload, so the format can change later. */
const VERSION = 'v1.';
/** Links longer than this may be cut short by some chat apps and SMS. */
const LONG_LINK = 8000;

const toB64Url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function encodeDesign(d: Design): Promise<string> {
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(d)), new CompressionStream('deflate-raw'));
  return VERSION + toB64Url(packed);
}

export async function decodeDesign(payload: string): Promise<Design> {
  if (!payload.startsWith(VERSION)) throw new Error('This share link is from a newer or unknown version');
  const json = new TextDecoder().decode(await pipe(fromB64Url(payload.slice(VERSION.length)), new DecompressionStream('deflate-raw')));
  return normaliseDesign(JSON.parse(json));
}

/** Make a share link for the current design and copy it to the clipboard. */
export async function copyShareLink() {
  try {
    const link = `${location.origin}${location.pathname}${PREFIX}${await encodeDesign(store.state.design)}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // No clipboard access (insecure page, permissions): let them copy it by hand.
      window.prompt('Copy this link to share your design:', link);
      return;
    }
    store.flash(
      link.length > LONG_LINK
        ? `Link copied (${Math.round(link.length / 1000)}k characters): some chat apps cut long links short — email it, or save and send the file instead`
        : 'Share link copied: anyone who opens it gets their own copy of this design',
    );
  } catch (e) {
    store.flash(`Couldn't make a share link: ${(e as Error).message}`);
  }
}

/** Open a design from a share link in the address bar (on load, or when a link is pasted into this tab). */
export async function openSharedLink() {
  if (!location.hash.startsWith(PREFIX)) return;
  const payload = location.hash.slice(PREFIX.length);
  // Take the design out of the address bar, so reloading doesn't load it again over your changes.
  history.replaceState(null, '', location.pathname + location.search);
  let design: Design;
  try {
    design = await decodeDesign(payload);
  } catch (e) {
    // Decompression errors aren't meaningful to people; a newer link format says so itself.
    const msg = (e as Error).message;
    store.flash(msg.includes('version') ? msg : "That share link couldn't be opened: it may have been cut short when it was sent. Ask for it again, or for the saved file");
    return;
  }
  const hasOwn = store.state.dirty || hasAutosave();
  if (hasOwn && !confirm(`Open the shared design “${design.name}”? It replaces the design in this browser — save yours to a file first if you want to keep it.`)) return;
  resetFileHandle();
  store.replaceDesign(design, null);
  store.set({ dirty: true });
  store.flash(`Opened the shared design “${design.name}”. Save it to keep your own copy.`);
}

function hasAutosave() {
  try {
    return !!localStorage.getItem('home-designer:autosave');
  } catch {
    return false;
  }
}

export function installShareLinks() {
  void openSharedLink();
  window.addEventListener('hashchange', () => void openSharedLink());
}
