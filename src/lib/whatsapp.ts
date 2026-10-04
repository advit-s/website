/**
 * WhatsApp click-to-chat link. WhatsApp is an external CTA, never a route, and building a draft never sends anything:
 * the visitor reviews and sends the message themselves.
 * When the owner has not configured a number yet, we fall back to the contact page, which explains the setup state.
 */
export function whatsappHref(number: string | null | undefined, message?: string): string {
  if (!number || !/^\d{10,15}$/.test(number)) return "/contact#whatsapp";
  const text = message ? `?text=${encodeURIComponent(message.slice(0, 1500))}` : "";
  return `https://wa.me/${number}${text}`;
}

export const isExternal = (href: string): boolean => /^https?:\/\//.test(href);
