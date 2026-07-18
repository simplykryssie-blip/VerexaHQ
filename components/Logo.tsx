export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="verexa-v" x1="8" y1="7" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22B8DB" />
          <stop offset="0.52" stopColor="#20C5AB" />
          <stop offset="1" stopColor="#22B866" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="white" />
      <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="12.25" stroke="#DDEAE5" strokeWidth="1.5" />
      <path d="M9.5 12.5L21.2 36.5C22.4 39 25.9 39.1 27.2 36.7L39.5 12.5H31.2L24.4 27.6L17.9 12.5H9.5Z" fill="url(#verexa-v)" />
      <path d="M17.4 12.5L24.4 27.6L31.2 12.5H24.8L24.4 14.1L23.8 12.5H17.4Z" fill="white" fillOpacity=".28" />
    </svg>
  );
}

export function Logo({
  size = 22,
  showTagline = false,
  dark = false,
}: {
  size?: number;
  showTagline?: boolean;
  dark?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size * 1.7} />
      <div>
        <div
          className="font-extrabold tracking-tight leading-none"
          style={{ fontSize: size, color: dark ? "#172622" : "white" }}
        >
          Verexa<span className="brand-gradient-text">HQ</span>
        </div>
        {showTagline && (
          <div
            className="text-[10px] uppercase tracking-widest mt-1 font-semibold"
            style={{ color: dark ? "#64748B" : "rgba(255,255,255,0.7)" }}
          >
            CRM for Business Service Firms
          </div>
        )}
      </div>
    </div>
  );
}
