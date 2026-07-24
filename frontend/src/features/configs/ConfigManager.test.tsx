import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigManager } from "./ConfigManager";

vi.mock("../settings/useSettings", () => ({
  useConfigs: vi.fn(),
  useCreateConfig: vi.fn(),
  useUpdateConfig: vi.fn(),
  useDeleteConfig: vi.fn(),
}));

import { useConfigs, useCreateConfig, useUpdateConfig, useDeleteConfig } from "../settings/useSettings";

function renderManager(overrides: { onLoad?: (name: string) => void; hasUnsavedChanges?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConfigManager
        configType="rules"
        onLoad={overrides.onLoad ?? vi.fn()}
        currentContent={{}}
        hasUnsavedChanges={overrides.hasUnsavedChanges ?? false}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("ConfigManager", () => {
  it("shows delete error message when deletion fails", async () => {
    const delMutate = vi.fn((_name: string, opts: { onSuccess?: () => void; onError?: () => void }) => {
      opts.onError?.();
    });
    vi.mocked(useDeleteConfig).mockReturnValue({
      mutate: delMutate,
      isPending: false,
      isError: true,
      error: { message: "Delete failed: file not found" },
      isSuccess: false,
    } as unknown as ReturnType<typeof useDeleteConfig>);
    vi.mocked(useConfigs).mockReturnValue({
      data: [{ name: "my-config", version: 1, content: {} }],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useConfigs>);
    vi.mocked(useCreateConfig).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useCreateConfig>);
    vi.mocked(useUpdateConfig).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useUpdateConfig>);

    renderManager();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "my-config" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    const dialog = screen.getByRole("alertdialog", { name: /Remove config/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(screen.getByText(/Delete failed: file not found/)).toBeInTheDocument();
    });
  });

  it("dismisses delete confirmation dialog on error", async () => {
    const delMutate = vi.fn((_name: string, opts: { onSuccess?: () => void; onError?: () => void }) => {
      opts.onError?.();
    });
    vi.mocked(useDeleteConfig).mockReturnValue({
      mutate: delMutate,
      isPending: false,
      isError: true,
      error: { message: "Server error" },
      isSuccess: false,
    } as unknown as ReturnType<typeof useDeleteConfig>);
    vi.mocked(useConfigs).mockReturnValue({
      data: [{ name: "my-config", version: 1, content: {} }],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useConfigs>);
    vi.mocked(useCreateConfig).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useCreateConfig>);
    vi.mocked(useUpdateConfig).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useUpdateConfig>);

    renderManager();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "my-config" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    const dialog = screen.getByRole("alertdialog", { name: /Remove config/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("shows success message on delete success", async () => {
    const delMutate = vi.fn((_name: string, opts: { onSuccess?: () => void }) => {
      opts.onSuccess?.();
    });
    vi.mocked(useDeleteConfig).mockReturnValue({
      mutate: delMutate,
      isPending: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useDeleteConfig>);
    vi.mocked(useConfigs).mockReturnValue({
      data: [{ name: "my-config", version: 1, content: {} }],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useConfigs>);
    vi.mocked(useCreateConfig).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useCreateConfig>);
    vi.mocked(useUpdateConfig).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useUpdateConfig>);

    renderManager();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "my-config" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    const dialog = screen.getByRole("alertdialog", { name: /Remove config/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(delMutate).toHaveBeenCalledWith("my-config", expect.any(Object));
    });
  });

  it("triggers confirmation when loading with unsaved changes", async () => {
    const onLoad = vi.fn();
    vi.mocked(useDeleteConfig).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useDeleteConfig>);
    vi.mocked(useConfigs).mockReturnValue({
      data: [{ name: "my-config", version: 1, content: {} }],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useConfigs>);
    vi.mocked(useCreateConfig).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useCreateConfig>);
    vi.mocked(useUpdateConfig).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useUpdateConfig>);

    renderManager({ onLoad, hasUnsavedChanges: true });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "my-config" } });
    fireEvent.click(screen.getByRole("button", { name: "Load config" }));

    expect(screen.getByRole("alertdialog", { name: /Discard unsaved/ })).toBeInTheDocument();
    expect(onLoad).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog", { name: /Discard unsaved/ });
    fireEvent.click(within(dialog).getByRole("button", { name: /Discard and load/ }));

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalledWith("my-config");
    });
  });

  it("calls create.mutate on save new", async () => {
    const createMutate = vi.fn();
    vi.mocked(useDeleteConfig).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useDeleteConfig>);
    vi.mocked(useConfigs).mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useConfigs>);
    vi.mocked(useCreateConfig).mockReturnValue({
      mutate: createMutate,
      isPending: false,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useCreateConfig>);
    vi.mocked(useUpdateConfig).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useUpdateConfig>);

    renderManager();

    fireEvent.click(screen.getByRole("button", { name: "Save new config" }));

    const dialog = screen.getByRole("alertdialog", { name: "Save new config" });
    fireEvent.change(within(dialog).getByPlaceholderText("my-config"), { target: { value: "test-rules" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createMutate).toHaveBeenCalledWith({ name: "test-rules", content: {} }, expect.any(Object));
    });
  });
});
