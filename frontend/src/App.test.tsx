import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { api } from "./api";
import App from "./App";

function renderApp(path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GPLX app navigation", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    vi.spyOn(api, "get").mockImplementation(async (url) => {
      if (url.includes("/categories/")) return { data: [] } as never;
      if (url.includes("/questions/")) return { data: { count: 0, next: null, previous: null, results: [] } } as never;
      if (url.includes("/auth/me/")) return { data: { id: 1, username: "hocvien", email: "hocvien@example.test" } } as never;
      if (url.includes("/exams/sessions/")) return { data: {
        id: "session-1",
        status: "in_progress",
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        questions: [{ id: 1, content: "Câu hỏi kiểm tra", is_critical: false, answers: [{ id: 7, label: "A", content: "Đáp án mẫu" }] }],
      } } as never;
      if (url.includes("/study/")) return { data: { results: [] } } as never;
      return { data: {} } as never;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the learning-focused landing page and expands FAQ answers", async () => {
    renderApp();
    expect(screen.getByRole("heading", { name: /Luyện thi GPLX/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Bắt đầu ôn tập/i })).toHaveAttribute("href", "/study");
    await userEvent.click(screen.getByRole("button", { name: /Tôi có thể học mà không cần tài khoản/i }));
    expect(screen.getByText(/Đăng nhập để lưu lịch sử/i)).toBeInTheDocument();
  });

  it("validates registration fields before calling the API", async () => {
    renderApp("/register");
    await userEvent.click(screen.getByRole("button", { name: /Tạo tài khoản/i }));
    expect(await screen.findByText("Vui lòng nhập tên đăng nhập")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("logs in and opens the account dashboard", async () => {
    vi.spyOn(api, "post").mockResolvedValue({ data: { access: "access-token", refresh: "refresh-token" } });
    const user = userEvent.setup();
    renderApp("/login");

    await user.type(screen.getByLabelText("Tên đăng nhập"), "hocvien");
    await user.type(screen.getByLabelText("Mật khẩu"), "matkhau123");
    await user.click(screen.getByRole("button", { name: /Đăng nhập/i }));

    expect(await screen.findByRole("heading", { name: "Chào bạn, hôm nay học gì?" })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/auth/login/", { username: "hocvien", password: "matkhau123" });
    await waitFor(() => expect(localStorage.getItem("gplx_tokens")).toContain("access-token"));
  });

  it("does not auto-submit a newly restored exam session", async () => {
    localStorage.setItem("gplx_tokens", JSON.stringify({ access: "access-token", refresh: "refresh-token" }));
    renderApp("/exam/session/session-1");

    expect(await screen.findByRole("heading", { name: "Câu hỏi kiểm tra" })).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith("/exams/sessions/session-1/submit/");
  });
});
