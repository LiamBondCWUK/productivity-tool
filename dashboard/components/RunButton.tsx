"use client";

interface RunButtonProps {
  label: string;
  runningLabel?: string;
  running: boolean;
  onClick: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
  title?: string;
}

export function RunButton({
  label,
  runningLabel,
  running,
  onClick,
  variant = "secondary",
  size = "sm",
  disabled = false,
  title,
}: RunButtonProps) {
  const base = "rounded font-medium transition-colors disabled:opacity-40";
  const sizeClass = size === "sm" ? "text-xs px-2.5 py-1" : "text-sm px-3 py-1.5";
  const variantClass = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white",
    secondary: "bg-gray-700 hover:bg-gray-600 text-gray-300",
    ghost: "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50",
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={running || disabled}
      className={`${base} ${sizeClass} ${variantClass}`}
      title={title}
    >
      {running ? (runningLabel ?? "Running…") : label}
    </button>
  );
}

interface StatusBannerProps {
  success?: boolean;
  error?: string;
  durationMs?: number;
  onDismiss?: () => void;
}

export function StatusBanner({ success, error, durationMs, onDismiss }: StatusBannerProps) {
  if (success === undefined && !error) return null;

  const isError = !!error;
  const bgClass = isError ? "bg-red-900/20 border-red-700/40" : "bg-green-900/20 border-green-700/40";
  const textClass = isError ? "text-red-300" : "text-green-300";

  return (
    <div className={`rounded border ${bgClass} p-2 flex items-center justify-between gap-2`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-xs ${textClass}`}>
          {isError ? `Error: ${error}` : "Complete"}
        </span>
        {durationMs !== undefined && (
          <span className="text-xs text-gray-500">{(durationMs / 1000).toFixed(1)}s</span>
        )}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="text-gray-500 hover:text-gray-300 text-xs">
          ✕
        </button>
      )}
    </div>
  );
}
