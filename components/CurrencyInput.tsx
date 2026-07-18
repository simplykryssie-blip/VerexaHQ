"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  onBlur?: (value: string) => void;
};

export default function CurrencyInput({
  value,
  onChange,
  placeholder = "0.00",
  className = "",
  required,
  disabled,
  onBlur,
}: Props) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">
        $
      </span>
      <input
        inputMode="decimal"
        value={value}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        onBlur={() => onBlur?.(value)}
        onChange={(event) => {
          const cleaned = event.target.value.replace(/[^0-9.-]/g, "");
          onChange(cleaned);
        }}
        className="w-full border border-line rounded-sm pl-7 pr-3 py-2 text-sm"
      />
    </div>
  );
}
