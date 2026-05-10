import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProtocolResultDetailDialog } from "../ProtocolTestUI";

describe("ProtocolResultDetailDialog", () => {
  it("renders structured request and response diagnostics", async () => {
    render(
      <ProtocolResultDetailDialog
        model="deepseek-chat-search"
        onClose={() => {}}
        results={[
          {
            protocol: "gemini",
            available: false,
            latency_ms: 731,
            error: "convert_request_failed",
            response_text:
              '{"error":{"message":"not implemented","type":"new_api_error"}}',
            request_url:
              "https://api.heabl.top/v1beta/models/deepseek-chat-search:generateContent",
            request_method: "POST",
            request_headers: {
              "x-goog-api-key": "sk******ey",
            },
            request_body: '{"contents":[{"parts":[{"text":"hi"}]}]}',
            response_status: 501,
            response_headers: {
              "content-type": "application/json",
            },
          },
        ]}
      />,
    );

    // 展开协议卡片
    const expandButton = screen.getByRole("button", { name: /gemini/i });
    await userEvent.click(expandButton);

    expect(screen.getByText("Request")).toBeInTheDocument();
    expect(screen.getByText("HTTP Status")).toBeInTheDocument();
    expect(screen.getByText("Request Headers")).toBeInTheDocument();
    expect(screen.getByText("Request Body")).toBeInTheDocument();
    expect(screen.getByText("Response Headers")).toBeInTheDocument();
    expect(screen.getByText("Response Body")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText(/api\.heabl\.top/i)).toBeInTheDocument();
    expect(screen.getByText("HTTP 501")).toBeInTheDocument();
  });
});
