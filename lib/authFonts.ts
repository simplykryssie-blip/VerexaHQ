import localFont from "next/font/local";

// Scoped to the auth screens (login, portal login, forgot/reset password) --
// the rest of the app has no next/font setup and falls back to system fonts,
// so these are additive and don't affect anything outside the auth shell.
export const archivo = localFont({
  src: "../public/fonts/Archivo-Variable.ttf",
  variable: "--font-archivo",
  weight: "100 900",
  display: "swap",
});

export const publicSans = localFont({
  src: "../public/fonts/PublicSans-Variable.ttf",
  variable: "--font-public-sans",
  weight: "100 900",
  display: "swap",
});

export const plexMono = localFont({
  src: "../public/fonts/PlexMono-Regular.ttf",
  variable: "--font-plex-mono",
  weight: "400",
  display: "swap",
});
