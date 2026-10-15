/** Whether a key event is going into a text box (so app shortcuts should leave it alone). */
export function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA') return true;
  if (t.tagName !== 'INPUT') return false;
  const type = (t as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'color', 'range', 'file'].includes(type);
}

/** Any form control (text box, dropdown, checkbox...). */
export function isFormControl(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
