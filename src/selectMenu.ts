/**
 * In-page dropdown lists for every <select> in the app.
 *
 * The browser draws a native select's list as its own window, which can run off the edge of the browser (onto
 * another screen with several monitors). This replaces the list with one drawn inside the page: below the
 * select, or above it when there's more room, never taller than the window, scrolling if needed. The <select>
 * itself stays, so React's value / onChange work as before: picking an option sets its value and fires the
 * usual change event.
 */

let menu: HTMLDivElement | null = null;
let current: HTMLSelectElement | null = null;
let active = -1;
let items: { el: HTMLDivElement; opt: HTMLOptionElement }[] = [];
let typed = '';
let typedAt = 0;

const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;

function close(refocus = true) {
  if (!menu) return;
  menu.remove();
  menu = null;
  items = [];
  active = -1;
  const sel = current;
  current = null;
  if (refocus) sel?.focus();
  window.removeEventListener('resize', onWindowChange);
  window.removeEventListener('scroll', onScroll, true);
}

function choose(opt: HTMLOptionElement) {
  const sel = current;
  close(false);
  if (!sel || opt.disabled) return;
  if (sel.value !== opt.value) {
    valueSetter.call(sel, opt.value);
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function highlight(i: number, scroll = true) {
  if (!items.length) return;
  i = Math.max(0, Math.min(items.length - 1, i));
  items[active]?.el.classList.remove('active');
  active = i;
  items[i].el.classList.add('active');
  if (scroll) items[i].el.scrollIntoView({ block: 'nearest' });
}

function open(sel: HTMLSelectElement) {
  close(false);
  current = sel;
  menu = document.createElement('div');
  menu.className = 'select-menu';
  menu.setAttribute('role', 'listbox');
  const add = (opt: HTMLOptionElement, indent: boolean) => {
    if (opt.hidden) return;
    const el = document.createElement('div');
    el.className = 'select-option' + (indent ? ' indent' : '') + (opt.disabled ? ' disabled' : '') + (opt.value === sel.value ? ' selected' : '');
    el.textContent = opt.textContent;
    const sw = opt.dataset.swatch;
    if (sw) {
      // Colour lists: a chip of the colour before its name.
      const chip = document.createElement('span');
      chip.className = 'select-chip';
      chip.style.background = sw;
      el.prepend(chip);
    }
    el.setAttribute('role', 'option');
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', () => choose(opt));
    el.addEventListener('mousemove', () => highlight(items.findIndex((x) => x.el === el), false));
    menu!.appendChild(el);
    items.push({ el, opt });
  };
  for (const child of Array.from(sel.children)) {
    if (child instanceof HTMLOptGroupElement) {
      const h = document.createElement('div');
      h.className = 'select-group';
      h.textContent = child.label;
      menu.appendChild(h);
      for (const o of Array.from(child.children)) if (o instanceof HTMLOptionElement) add(o, true);
    } else if (child instanceof HTMLOptionElement) add(child, false);
  }
  document.body.appendChild(menu);
  place();
  const sel0 = items.findIndex((x) => x.opt.value === sel.value);
  highlight(sel0 >= 0 ? sel0 : 0);
  window.addEventListener('resize', onWindowChange);
  window.addEventListener('scroll', onScroll, true);
}

/** Below the select if it fits, otherwise wherever there's more room; always inside the window. */
function place() {
  if (!menu || !current) return;
  const r = current.getBoundingClientRect();
  const margin = 8;
  const below = window.innerHeight - r.bottom - margin;
  const above = r.top - margin;
  menu.style.minWidth = `${Math.max(r.width, 120)}px`;
  menu.style.maxWidth = `${Math.max(200, window.innerWidth - 2 * margin)}px`;
  menu.style.maxHeight = '';
  const natural = Math.min(menu.scrollHeight, 420);
  const down = below >= natural || below >= above;
  const room = Math.max(120, down ? below : above);
  const h = Math.min(natural, room);
  menu.style.maxHeight = `${h}px`;
  menu.style.top = `${down ? r.bottom + 2 : r.top - h - 2}px`;
  const w = menu.offsetWidth;
  menu.style.left = `${Math.max(margin, Math.min(r.left, window.innerWidth - w - margin))}px`;
}

function onWindowChange() {
  close(false);
}
function onScroll(e: Event) {
  if (!menu || !current || (e.target instanceof Node && menu.contains(e.target))) return; // scrolling the list itself
  // Follow the select as the page scrolls; close once it's scrolled out of sight.
  const r = current.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) close(false);
  else place();
}

function isPlainSelect(t: EventTarget | null): t is HTMLSelectElement {
  return t instanceof HTMLSelectElement && !t.multiple && !t.disabled && (t.size ?? 0) <= 1;
}

export function installSelectMenus() {
  // Clicking a select opens our list instead of the browser's.
  document.addEventListener(
    'mousedown',
    (e) => {
      const t = e.target;
      if (menu && t instanceof Node && menu.contains(t)) return;
      if (isPlainSelect(t) && e.button === 0) {
        e.preventDefault();
        if (current === t) close();
        else {
          t.focus();
          open(t);
        }
        return;
      }
      close(false); // clicked elsewhere
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (menu) {
        const k = e.key;
        if (k === 'ArrowDown' || k === 'ArrowUp') highlight(active + (k === 'ArrowDown' ? 1 : -1));
        else if (k === 'PageDown' || k === 'PageUp') highlight(active + (k === 'PageDown' ? 10 : -10));
        else if (k === 'Home' || k === 'End') highlight(k === 'Home' ? 0 : items.length - 1);
        else if (k === 'Enter' || k === ' ') {
          if (items[active]) choose(items[active].opt);
        } else if (k === 'Escape' || k === 'Tab') close();
        else if (k.length === 1) {
          // Type to jump to an option.
          const now = performance.now();
          typed = now - typedAt < 700 ? typed + k.toLowerCase() : k.toLowerCase();
          typedAt = now;
          const i = items.findIndex((x) => x.el.textContent!.toLowerCase().trimStart().startsWith(typed));
          if (i >= 0) highlight(i);
        } else return;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // The keys that would open the browser's list open ours.
      if (isPlainSelect(e.target) && (e.key === ' ' || e.key === 'Enter' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        open(e.target);
      }
    },
    true,
  );
}
