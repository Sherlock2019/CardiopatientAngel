/* Flat SVG illustrations (no external images): care-team roles and the beating heart. */
import { useId } from "react";

const SKIN = ["#f1c7a5", "#d9a27c", "#b97d57", "#8d5a3b", "#f6d6bd"];
const HAIR = ["#2b2118", "#5a3a22", "#a2a2a2", "#c9a063", "#1c1c1c"];

function pick<T>(arr: T[], seed: string, salt = 0) {
  let h = salt;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return arr[h % arr.length];
}

function Person({ size, skin, hair, body, children, bg, title }: { size: number; skin: string; hair: string; body: string; children?: React.ReactNode; bg: string; title?: string }) {
  const clip = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} className="shrink-0">
      <circle cx="32" cy="32" r="32" fill={bg} />
      <clipPath id={clip}><circle cx="32" cy="32" r="32" /></clipPath>
      <g clipPath={`url(#${clip})`}>
        <path d="M10 64c0-13 10-21 22-21s22 8 22 21z" fill={body} />
        <rect x="27" y="35" width="10" height="9" rx="3" fill={skin} />
        <circle cx="32" cy="27" r="11" fill={skin} />
        <path d="M21 26c0-8 5-12 11-12s11 4 11 12c-2-4-6-6-11-6s-9 2-11 6z" fill={hair} />
        {children}
      </g>
    </svg>
  );
}

export function DoctorAvatar({ size = 48, title }: { size?: number; title?: string }) {
  return (
    <Person size={size} skin={SKIN[1]} hair={HAIR[0]} body="#ffffff" bg="#dbeafe" title={title}>
      {/* white coat lapels + blue scrubs + stethoscope */}
      <path d="M26 44l6 8 6-8 4 20H22z" fill="#2a78d6" />
      <path d="M24 46c0 7 3 10 6 10M40 46c0 7-3 10-6 10" stroke="#334155" strokeWidth="1.6" fill="none" />
      <circle cx="32" cy="57" r="2.4" fill="#94a3b8" stroke="#334155" strokeWidth="1" />
    </Person>
  );
}

export function NurseAvatar({ size = 48, title }: { size?: number; title?: string }) {
  return (
    <Person size={size} skin={SKIN[0]} hair={HAIR[1]} body="#14b8a6" bg="#ccfbf1" title={title}>
      {/* cap with a cross + scrub V-neck */}
      <path d="M22 18c2-5 6-7 10-7s8 2 10 7l-2 3H24z" fill="#ffffff" stroke="#99f6e4" strokeWidth="0.8" />
      <path d="M31 13.5h2v5h-2zM29.5 15h5v2h-5z" fill="#ef4444" />
      <path d="M28 44l4 6 4-6" fill="none" stroke="#0f766e" strokeWidth="1.6" />
    </Person>
  );
}

export function PatientAvatar({ size = 48, seed = "p", title }: { size?: number; seed?: string; title?: string }) {
  return (
    <Person size={size} skin={pick(SKIN, seed)} hair={pick(HAIR, seed, 7)} body="#93c5fd" bg="#1e293b" title={title}>
      {/* hospital gown dots + chest ECG patch */}
      <circle cx="22" cy="54" r="1.2" fill="#e0f2fe" /><circle cx="42" cy="54" r="1.2" fill="#e0f2fe" /><circle cx="30" cy="60" r="1.2" fill="#e0f2fe" />
      <rect x="35" y="47" width="7" height="5" rx="1.5" fill="#ffffff" />
      <path d="M36 49.5h1.4l.7-1.4.8 2.8.7-1.4H41" stroke="#ef4444" strokeWidth="0.8" fill="none" />
    </Person>
  );
}

export function BeatingHeart({ size = 56, bpm = 72 }: { size?: number; bpm?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="heart-beat shrink-0" style={{ animationDuration: `${60 / bpm}s` }}>
      <defs>
        <radialGradient id="heart-g" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ff8a8a" /><stop offset="0.55" stopColor="#e5484d" /><stop offset="1" stopColor="#9f1d22" />
        </radialGradient>
      </defs>
      <path d="M32 56S6 40 6 22c0-8 6-14 13-14 6 0 10 3 13 8 3-5 7-8 13-8 7 0 13 6 13 14 0 18-26 34-26 34z" fill="url(#heart-g)" />
      <path d="M12 30h10l3-6 4 12 4-16 3 10h16" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
