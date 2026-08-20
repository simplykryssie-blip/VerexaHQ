import Image from "next/image";
import { archivo, publicSans, plexMono } from "@/lib/authFonts";
import styles from "./AuthShell.module.css";

export function AuthShell({
  eyebrow,
  railHeading,
  railSub,
  railFoot,
  children,
}: {
  eyebrow: string;
  railHeading: string;
  railSub: string;
  railFoot: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.shell} ${archivo.variable} ${publicSans.variable} ${plexMono.variable}`}>
      <aside className={styles.rail}>
        <div className={styles.mark}>
          <Image src="/brand/vmark.png" alt="" width={35} height={28} className={styles.markGlyph} priority />
          <Image src="/brand/wordmark.png" alt="VerexaHQ" width={155} height={26} className={styles.wordmarkGlyph} priority />
        </div>

        <div className={styles.railBody}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 className={styles.railHeading}>{railHeading}</h2>
          <p className={styles.railSub}>{railSub}</p>
        </div>

        <div className={styles.railFoot}>{railFoot}</div>
      </aside>

      <div className={styles.formside}>
        <div className={styles.card}>{children}</div>
      </div>
    </div>
  );
}

export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.errbox} role="alert">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M7.5 4.5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="7.5" cy="10.6" r="0.9" fill="currentColor" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

export { styles as authStyles };
