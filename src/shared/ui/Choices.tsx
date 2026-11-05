import type { ReactNode } from "react";

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
}
export function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
  variant = "report",
}: {
  label: string;
  value: T;
  options: readonly Choice<T>[];
  onChange: (value: T) => void;
  variant?: "report" | "mobile" | "compact";
}) {
  const className =
    variant === "mobile"
      ? "mobile-section-switch"
      : variant === "compact"
        ? "mode-switch"
        : "insight-choices";
  return (
    <div className={className} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          data-active={option.value === value}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
