import type { HandValue } from "@neon21/shared";

type Props = {
  value: HandValue | null | undefined;
};

export function HandValueBadge({ value }: Props) {
  if (!value) return null;
  const label = value.label || (value.bust ? "BUST" : String(value.hard));
  return (
    <span className={`hand-badge${value.bust ? " hand-badge-bust" : ""}`}>
      {label}
    </span>
  );
}
