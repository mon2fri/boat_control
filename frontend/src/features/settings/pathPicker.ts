export type PathPickerOutcome =
  | { status: "picked"; path: string }
  | { status: "cancelled"; message: string }
  | { status: "unsupported"; message: string };

interface HostPickerBridge {
  pickPath?: (options: { title: string; defaultPath: string }) => Promise<string | null | undefined>;
  selectPath?: (options: { title: string; defaultPath: string }) => Promise<string | null | undefined>;
}

interface PickerWindow extends Window {
  boatControlHost?: HostPickerBridge;
  electronAPI?: HostPickerBridge;
}

function findHostBridge(): HostPickerBridge | null {
  const candidate = window as PickerWindow;
  for (const bridge of [candidate.boatControlHost, candidate.electronAPI]) {
    if (bridge && (bridge.pickPath || bridge.selectPath)) return bridge;
  }
  return null;
}

function hasBrowserFileSystemPicker(): boolean {
  return typeof (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker === "function";
}

/**
 * Resolve a database path using the best available system picker.
 *
 * The Django backend deliberately has no server-side dialog, so the only
 * component that can expose an absolute host path is an optional desktop host
 * bridge (`window.boatControlHost` / `window.electronAPI`). Plain browsers
 * hide absolute folder paths for security. When a browser File System Access
 * picker exists we state that limitation explicitly; otherwise we explain
 * that no system picker is available. In every case the absolute text input
 * remains available and authoritative.
 */
export async function chooseExceptionTrackingDbPath(
  currentPath: string,
): Promise<PathPickerOutcome> {
  const bridge = findHostBridge();
  if (bridge) {
    const pick = bridge.pickPath ?? bridge.selectPath;
    if (!pick) {
      return {
        status: "unsupported",
        message: "The desktop host did not expose a path picker. Enter the absolute path instead.",
      };
    }
    try {
      const selected = await pick({
        title: "Choose exception tracking database",
        defaultPath: currentPath,
      });
      if (!selected) {
        return { status: "cancelled", message: "No path selected." };
      }
      return { status: "picked", path: selected };
    } catch (error) {
      return {
        status: "unsupported",
        message: error instanceof Error
          ? `The desktop path picker failed: ${error.message}. Enter the absolute path instead.`
          : "The desktop path picker failed. Enter the absolute path instead.",
      };
    }
  }

  return {
    status: "unsupported",
    message: hasBrowserFileSystemPicker()
      ? "This browser can open a file picker, but it does not reveal the absolute folder path. Type or paste the full absolute path instead."
      : "No system path picker is available in this browser/host. Type or paste the full absolute path instead.",
  };
}
