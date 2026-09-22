import { cn } from "@/lib/utils";

// Fixed, evenly-spaced hues so avatar colors stay distinguishable without
// being garish — derived from name hash, not random, so a merchant always
// gets the same color.
const HUES = [8, 28, 48, 88, 148, 178, 208, 248, 288, 328];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function MerchantAvatar({ name, className }: { name: string; className?: string }) {
  const hue = HUES[hashString(name) % HUES.length];
  return (
    <span
      className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium", className)}
      style={{
        backgroundColor: `oklch(0.9 0.06 ${hue})`,
        color: `oklch(0.35 0.1 ${hue})`,
      }}
    >
      {initials(name)}
    </span>
  );
}
