/** True for an absolute Linux, Windows drive, or UNC host path. */
export function isAbsoluteHostPath(value: string): boolean {
  return /^(?:\/|[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(value.trim());
}
