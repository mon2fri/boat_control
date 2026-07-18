/**
 * Validate a user-edited report name before sending it to the backend.
 *
 * Report names become part of a server-side file name, so the client rejects
 * path separators, control characters, and the parent-directory token up front.
 * The backend performs the authoritative sanitization; this is defense in depth
 * and immediate user feedback.
 */
const ILLEGAL = /[/\\:*?"<>|]/;
// eslint-disable-next-line no-control-regex -- intentionally matching control chars
const CONTROL = new RegExp("[\\x00-\\x1f\\x7f]");
const MAX_LENGTH = 120;

export interface NameValidation {
  valid: boolean;
  error?: string;
}

export function validateReportName(name: string): NameValidation {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { valid: false, error: "Name cannot be empty." };
  if (trimmed.length > MAX_LENGTH) {
    return { valid: false, error: `Name must be ${MAX_LENGTH} characters or fewer.` };
  }
  if (ILLEGAL.test(trimmed) || CONTROL.test(trimmed)) {
    return { valid: false, error: 'Name cannot contain / \\ : * ? " < > | or control characters.' };
  }
  if (trimmed === "." || trimmed === "..") {
    return { valid: false, error: "Name is reserved." };
  }
  return { valid: true };
}

/** The default report name: `{file1}_vs_{file2}` without extensions. */
export function defaultReportName(file1: string, file2: string): string {
  const strip = (n: string) => n.replace(/\.[^.]+$/, "");
  return `${strip(file1)}_vs_${strip(file2)}`;
}
