import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "../SettingsPage";

const { mockLoadModelMappingSettings, mockSaveModelMappingSettings } = vi.hoisted(() => ({
  mockLoadModelMappingSettings: vi.fn(),
  mockSaveModelMappingSettings: vi.fn(),
}));

vi.mock("../../api", () => ({
  loadModelMappingSettings: mockLoadModelMappingSettings,
  saveModelMappingSettings: mockSaveModelMappingSettings,
}));

vi.mock("../ModelConfigSection", () => ({
  ModelConfigSection: () => <div>Model Config Section</div>,
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadModelMappingSettings.mockResolvedValue({ port: 5678 });
    mockSaveModelMappingSettings.mockResolvedValue({
      running: false,
      autostart: false,
      port: 6789,
      config_path: "",
      claude_dir: null,
      model_count: 0,
      mapped_models: [],
    });
  });

  it("saves the model mapping gateway port from system settings", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPage
        providers={[]}
        debugEnabled={false}
        onDebugChange={vi.fn()}
      />,
    );

    const input = await screen.findByDisplayValue("5678");
    await user.clear(input);
    await user.type(input, "6789");

    const saveButtons = screen.getAllByRole("button", { name: "保存" });
    await user.click(saveButtons[0]);

    await waitFor(() => {
      expect(mockSaveModelMappingSettings).toHaveBeenCalledWith({ port: 6789 });
    });
  });
});
