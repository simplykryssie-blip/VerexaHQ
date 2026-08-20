export function passwordRequirementsHint(minLength: number = 8): string {
  return `At least ${minLength} characters, including 1 number and 1 special character.`;
}

export const PASSWORD_REQUIREMENTS_HINT = passwordRequirementsHint(8);

export function validatePasswordStrength(password: string, minLength: number = 8): string | null {
  if (password.length < minLength) return `Password must be at least ${minLength} characters.`;
  if (!/[0-9]/.test(password)) return "Password must include at least 1 number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include at least 1 special character.";
  return null;
}
