import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });

export const InstagramIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
  </svg>
);
export const FacebookIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 8h2.5V4.5H14A3.5 3.5 0 0 0 10.5 8v2H8v3.5h2.5V21H14v-7.5h2.5L17 10h-3V8.5c0-.3.2-.5.5-.5Z" />
  </svg>
);
export const YoutubeIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
    <path d="m10 9.5 5 2.5-5 2.5Z" fill="currentColor" />
  </svg>
);
export const PinterestIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10.5 16.5 12 9.5M9.2 12.2C8.5 9.8 10.4 8 12.3 8c2 0 3 1.3 3 2.8 0 2-1.200 3.600-2.800 3.600-.8 0-1.300-.5-1.300-1" />
  </svg>
);
export const WhatsAppIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 20.5 5 16A8.5 8.5 0 1 1 8 19Z" />
    <path d="M9 9.2c.2 2.300 2.500 4.600 5 5.500l1.200-1.200-1.700-1-.8.6c-.8-.4-1.500-1.100-1.900-1.900l.6-.8-1-1.700Z" fill="currentColor" stroke="none" />
  </svg>
);
