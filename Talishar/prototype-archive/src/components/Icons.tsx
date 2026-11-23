import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function GlobeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9h17M3.5 15h17M12 3c2.4 2.5 3.4 5.5 3.4 9S14.4 18.5 12 21c-2.4-2.5-3.4-5.5-3.4-9S9.6 5.5 12 3Z" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m10.5 13.5 3-3" />
      <path d="M7.7 16.3 6 18a3.5 3.5 0 1 1-5-5l3.2-3.2a3.5 3.5 0 0 1 5 0" />
      <path d="m16.3 7.7 1.7-1.7a3.5 3.5 0 1 1 5 5l-3.2 3.2a3.5 3.5 0 0 1-5 0" transform="translate(-1.5 -1.5)" />
    </svg>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5Z" />
    </svg>
  );
}

export function BotIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M12 3v4M8 12h.01M16 12h.01M8.5 16h7" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SwordIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m14 5 5-2-2 5L8 17l-3-3Z" />
      <path d="m6 16-3 3 2 2 3-3M10 15l-2-2" />
    </svg>
  );
}

export function PassIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 7h8a6 6 0 0 1 6 6v1" />
      <path d="m16 11 3 3 3-3M8 4 5 7l3 3" />
    </svg>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9a2.3 2.3 0 1 1 3.7 1.8c-.9.7-1.5 1.1-1.5 2.2M12 17h.01" />
    </svg>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m8 10 4 4 4-4" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  );
}
