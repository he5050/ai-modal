import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const { mockLoadPersistedJson, mockSavePersistedJson } = vi.hoisted(() => ({
  mockLoadPersistedJson: vi.fn(),
  mockSavePersistedJson: vi.fn(),
}));

vi.mock("./lib/persistence", () => ({
  loadPersistedJson: mockLoadPersistedJson,
  savePersistedJson: mockSavePersistedJson,
}));

vi.mock("./components/Sidebar", () => ({
  Sidebar: ({
    onPageChange,
  }: {
    onPageChange: (page: string) => void;
  }) => (
    <div>
      <button onClick={() => onPageChange("detect")}>go-detect</button>
      <button onClick={() => onPageChange("prompts")}>go-prompts</button>
    </div>
  ),
}));

vi.mock("./components/DetectPage", () => ({
  DetectPage: () => <div>Detect Page</div>,
}));

vi.mock("./components/ModelsPage", () => ({
  ModelsPage: () => <div>Models Page</div>,
}));

vi.mock("./components/ProviderDetailPage", () => ({
  ProviderDetailPage: () => <div>Provider Detail Page</div>,
}));

vi.mock("./components/SkillsPage", () => ({
  SkillsPage: () => <div>Skills Page</div>,
}));

vi.mock("./components/SettingsPage", () => ({
  DEBUG_DB_KEY: "debug",
  DEBUG_KEY: "debug",
  CONCURRENCY_DB_KEY: "concurrency",
  CONCURRENCY_KEY: "concurrency",
  SettingsPage: () => <div>Settings Page</div>,
}));

vi.mock("./components/RulesPage", () => ({
  RulesPage: () => <div>Rules Page</div>,
}));

vi.mock("./components/ConfigPage", () => ({
  ConfigPage: () => <div>Config Page</div>,
}));

vi.mock("./components/PromptsPage", () => ({
  PromptsPage: ({
    onCreate,
  }: {
    onCreate: () => void;
  }) => {
    return (
      <div>
        <div>Prompts Page</div>
        <button onClick={onCreate}>open-prompt-create</button>
      </div>
    );
  },
}));

vi.mock("./components/PromptDetailPage", () => ({
  PromptDetailPage: ({
    onDirtyChange,
  }: {
    onDirtyChange: (dirty: boolean) => void;
  }) => {
    useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
    return (
      <div>
        <div>Prompt Detail Page</div>
        <button onClick={() => onDirtyChange(true)}>mark-prompt-detail-dirty</button>
      </div>
    );
  },
}));

vi.mock("./components/DevLog", () => ({
  DevLog: () => <div>DevLog</div>,
}));

vi.mock("./components/Toast", () => ({
  ToastContainer: () => <div>ToastContainer</div>,
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPersistedJson.mockImplementation(
      async (_dbKey: string, _legacyKey: string, fallback: unknown) => fallback,
    );
    mockSavePersistedJson.mockResolvedValue(undefined);
  });

  it("blocks navigation away from prompts when there are unsaved changes", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("Detect Page")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "go-prompts" }));
    expect(await screen.findByText("Prompts Page")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "open-prompt-create" }));
    expect(await screen.findByText("Prompt Detail Page")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "mark-prompt-detail-dirty" }),
    );
    await user.click(screen.getByRole("button", { name: "go-detect" }));

    expect(await screen.findByText("离开当前编辑？")).toBeInTheDocument();
    expect(screen.queryByText("Detect Page")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "放弃并离开" }));

    await waitFor(() => {
      expect(screen.getByText("Detect Page")).toBeInTheDocument();
    });
  });
});
