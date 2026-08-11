export const PASSWORD_REQUIREMENTS_HINT = "At least 8 characters, including 1 number and 1 special character.";

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[0-9]/.test(password)) return "Password must include at least 1 number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include at least 1 special character.";
  return null;
}
