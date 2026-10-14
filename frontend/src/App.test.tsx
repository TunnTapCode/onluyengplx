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
  let savedStudyStatuses: Array<{ question_id: number; page: number; is_correct: boolean }>;

  beforeEach(() => {
    localStorage.clear();
    savedStudyStatuses = [];
    vi.spyOn(api, "post").mockImplementation(async (url, payload) => {
      if (url === "/study/answer/") {
        const answerPayload = payload as { question_id: number; selected_options?: string[] };
        const isCorrect = answerPayload.selected_options?.[0] === "A";
        savedStudyStatuses = [
          ...savedStudyStatuses.filter((status) => status.question_id !== answerPayload.question_id),
          { question_id: answerPayload.question_id, page: answerPayload.question_id - 500, is_correct: isCorrect },
        ];
        return { data: {
          is_correct: isCorrect,
          correct_options: ["A"],
          explanation: "Giải thích mẫu.",
        } } as never;
      }
      if (url === "/study/reset/") {
        savedStudyStatuses = [];
        return { data: { deleted_attempts: 2 } } as never;
      }
      return { data: {} } as never;
    });
    vi.spyOn(api, "get").mockImplementation(async (url, config) => {
      if (url.includes("/categories/")) return { data: [
        { id: 1, name: "Quy tắc giao thông", question_count: 120 },
        { id: 2, name: "Văn hóa giao thông", question_count: 80 },
        { id: 3, name: "Kỹ thuật lái xe", question_count: 90 },
        { id: 4, name: "Cấu tạo và sửa chữa", question_count: 70 },
        { id: 5, name: "Báo hiệu đường bộ", question_count: 140 },
        { id: 6, name: "Sa hình", question_count: 100 },
      ] } as never;
      if (url === "/questions/") {
        const page = Number((config?.params as Record<string, unknown> | undefined)?.page ?? 1);
        return { data: {
        count: 2,
        next: null,
        previous: null,
        results: [{
          id: 500 + page,
          question_number: 12 + page,
          content: `Câu hỏi thực hành số ${page}`,
          is_critical: page === 1,
          answers: [
            { id: 7, label: "A", content: "Đáp án đúng" },
            { id: 8, label: "B", content: "Đáp án khác" },
          ],
        }],
      } } as never;
      }
      if (url.includes("/questions/")) return { data: { count: 600, next: null, previous: null, results: [] } } as never;
      if (url.includes("/auth/me/")) return { data: { id: 1, username: "hocvien", email: "hocvien@example.test" } } as never;
      if (url === "/study/statuses/") return { data: savedStudyStatuses } as never;
      if (url === "/exams/progress/") return { data: [] } as never;
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

  it("shows exam configuration tools to staff users", async () => {
    localStorage.setItem("gplx_tokens", JSON.stringify({ access: "staff-token", refresh: "refresh-token" }));
    vi.spyOn(api, "get").mockImplementation(async (url) => {
      if (url.includes("/auth/me/")) return { data: { id: 2, username: "admin", email: "admin@example.test", is_staff: true } } as never;
      if (url.includes("/exams/admin-options/")) return { data: {
        license_classes: [{ id: 1, code: "B", name: "Hạng B", eligible_question_count: 0, eligible_critical_question_count: 0 }],
        categories: [],
      } } as never;
      if (url.includes("/exams/configurations/")) return { data: { count: 0, results: [] } } as never;
      return { data: {} } as never;
    });
    renderApp("/admin/exams");

    expect(await screen.findByRole("heading", { name: "Cấu hình thi thử" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cấu hình thi thử/i })).toHaveAttribute("href", "/admin/exams");
    expect(await screen.findByText(/chưa có câu hỏi hoạt động được gán/i)).toBeInTheDocument();
  });

  it("shows per-question exam results in a right-side status list", async () => {
    localStorage.setItem("gplx_tokens", JSON.stringify({ access: "access-token", refresh: "refresh-token" }));
    vi.spyOn(api, "get").mockImplementation(async (url) => {
      if (url === "/auth/me/") return { data: { id: 1, username: "hocvien", email: "hocvien@example.test" } } as never;
      if (url === "/exams/results/attempt-1/") return { data: {
        attempt_id: "attempt-1",
        session_id: "session-1",
        score: 1,
        passed: false,
        correct_count: 1,
        wrong_count: 1,
        unanswered_count: 1,
        critical_failure: false,
        questions: [
          { question_id: 11, content: "Question one", is_critical: false, is_correct: true, selected_key: "A", answers: [] },
          { question_id: 12, content: "Question two", is_critical: false, is_correct: false, selected_key: "B", answers: [] },
          { question_id: 13, content: "Question three", is_critical: false, is_correct: false, selected_key: null, answers: [] },
        ],
      } } as never;
      return { data: {} } as never;
    });
    renderApp("/exam/result/attempt-1");

    expect(await screen.findByRole("heading", { name: "Chưa đạt lần này" })).toBeInTheDocument();
    expect(screen.queryByText("Ôn lại câu hỏi")).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Kết quả từng câu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Câu 1: Đúng" })).toHaveClass("result-correct");
    expect(screen.getByRole("button", { name: "Câu 2: Sai" })).toHaveClass("result-incorrect");
    expect(screen.getByRole("button", { name: "Câu 3: Bỏ trống" })).toHaveClass("result-unanswered");
  });

  it("opens a question review popup from the result list", async () => {
    localStorage.setItem("gplx_tokens", JSON.stringify({ access: "access-token", refresh: "refresh-token" }));
    vi.spyOn(api, "get").mockImplementation(async (url) => {
      if (url === "/auth/me/") return { data: { id: 1, username: "hocvien", email: "hocvien@example.test" } } as never;
      if (url === "/exams/results/attempt-1/") return { data: {
        attempt_id: "attempt-1",
        session_id: "session-1",
        score: 0,
        passed: false,
        correct_count: 0,
        wrong_count: 1,
        unanswered_count: 0,
        critical_failure: false,
        questions: [{
          question_id: 12,
          content: "Câu hỏi cần xem lại",
          image: "/media/questions/q_12.jpg",
          explanation: "Giải thích câu hỏi.",
          is_critical: false,
          is_correct: false,
          selected_key: "B",
          correct_keys: ["A"],
          answers: [
            { id: 1, label: "A", content: "Đáp án chính xác" },
            { id: 2, label: "B", content: "Đáp án đã chọn" },
          ],
        }],
      } } as never;
      return { data: {} } as never;
    });
    renderApp("/exam/result/attempt-1");

    await userEvent.click(await screen.findByRole("button", { name: "Câu 1: Sai" }));

    expect(screen.getByRole("dialog", { name: "Câu 1" })).toBeInTheDocument();
    expect(screen.getByText("Câu hỏi cần xem lại")).toBeInTheDocument();
    expect(screen.getByText("Đáp án chính xác")).toBeInTheDocument();
    expect(screen.getByText("Đáp án đã chọn")).toBeInTheDocument();
    expect(screen.getByText("Giải thích câu hỏi.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Đóng xem lại câu hỏi" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows license-class cards and starts the selected class configuration", async () => {
    localStorage.setItem("gplx_tokens", JSON.stringify({ access: "access-token", refresh: "refresh-token" }));
    vi.spyOn(api, "get").mockImplementation(async (url) => {
      if (url === "/license-classes/") return { data: [
        { id: 1, code: "A1", name: "Hạng A1", description: "Xe mô tô đến 125 cm³." },
        { id: 2, code: "B", name: "Hạng B", description: "Ô tô đến 3.500 kg." },
        { id: 3, code: "BE", name: "Hạng BE", description: "Ô tô kéo rơ moóc." },
      ] } as never;
      if (url === "/exams/configurations/") return { data: [
        { id: 21, license_class: 2, license_class_code: "B", name: "Đề thi hạng B", question_count: 25, duration_seconds: 1200, passing_score: 21 },
      ] } as never;
      if (url === "/exams/progress/") return { data: [] } as never;
      if (url.includes("/exams/sessions/")) return { data: {
        id: "session-1",
        status: "in_progress",
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        questions: [{ id: 1, content: "Câu hỏi kiểm tra", is_critical: true, answers: [{ id: 7, label: "A", content: "Đáp án mẫu" }] }],
      } } as never;
      return { data: {} } as never;
    });
    vi.mocked(api.post).mockImplementation(async (url) => {
      if (url === "/exams/sessions/") return { data: { id: "session-1" } } as never;
      return { data: {} } as never;
    });
    renderApp("/exam");

    expect(await screen.findByRole("heading", { name: "Hạng giấy phép mô tô" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hạng giấy phép ô tô" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hạng giấy phép kéo rơ moóc và kết hợp" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Chọn hạng A1 Hạng A1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Chọn hạng B Hạng B/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Chọn hạng BE Hạng BE/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Chọn hạng B Hạng B/i }));
    expect(await screen.findByRole("heading", { name: "B — Hạng B" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Bắt đầu thi/i }));
    expect(api.post).toHaveBeenCalledWith("/exams/sessions/", { configuration_id: 21 });
    expect(await screen.findByRole("heading", { name: "Câu hỏi kiểm tra" })).toBeInTheDocument();
    expect(screen.getByText("CÂU ĐIỂM LIỆT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Câu 1, điểm liệt, chưa trả lời" })).toBeInTheDocument();
  });

  it("shows redo and latest pass status for previously completed exam configurations", async () => {
    localStorage.setItem("gplx_tokens", JSON.stringify({ access: "access-token", refresh: "refresh-token" }));
    vi.spyOn(api, "get").mockImplementation(async (url) => {
      if (url === "/auth/me/") return { data: { id: 1, username: "hocvien", email: "hocvien@example.test" } } as never;
      if (url === "/license-classes/") return { data: [
        { id: 2, code: "B", name: "Hạng B", description: "Ô tô" },
      ] } as never;
      if (url === "/exams/configurations/") return { data: [
        { id: 21, license_class: 2, license_class_code: "B", name: "Đề 1", question_count: 30, duration_seconds: 1200, passing_score: 27 },
        { id: 22, license_class: 2, license_class_code: "B", name: "Đề 2", question_count: 30, duration_seconds: 1200, passing_score: 27 },
        { id: 23, license_class: 2, license_class_code: "B", name: "Đề 3", question_count: 30, duration_seconds: 1200, passing_score: 27 },
      ] } as never;
      if (url === "/exams/progress/") return { data: [
        { configuration_id: 21, attempt_id: "result-1", passed: true, score: 29, started_at: "2026-10-14T00:00:00Z" },
        { configuration_id: 22, attempt_id: "result-2", passed: false, score: 26, started_at: "2026-10-14T00:00:00Z" },
      ] } as never;
      return { data: {} } as never;
    });
    renderApp("/exam");

    await userEvent.click(await screen.findByRole("button", { name: /Chọn hạng B Hạng B/i }));

    expect(await screen.findByText("Đã làm · Đạt · 29 điểm")).toBeInTheDocument();
    expect(screen.getByText("Đã làm · Chưa đạt · 26 điểm")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Làm lại/i })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Bắt đầu thi/i })).toBeInTheDocument();
  });

  it("shows eight study cards and opens the selected practice content", async () => {
    renderApp("/study");

    const studyCards = await screen.findAllByRole("button", { name: /600c|CHƯƠNG [1-6]|câu điểm liệt/i });
    expect(studyCards).toHaveLength(8);
    expect(screen.getByRole("heading", { name: "Hôm nay bạn muốn ôn phần nào?" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Ôn tập câu điểm liệt/i }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 1" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Danh sách câu hỏi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Câu 1: chưa trả lời" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Câu 2: chưa trả lời" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Làm lại từ đầu/i })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/questions/", expect.objectContaining({
      params: expect.objectContaining({ is_critical: "true" }),
    }));
    expect(screen.getByRole("button", { name: /Câu trước/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Kiểm tra đáp án/i })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /A Đáp án đúng/i }));
    await userEvent.click(screen.getByRole("button", { name: /Kiểm tra đáp án/i }));
    expect(await screen.findByText("Chính xác!")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/study/answer/", {
      question_id: 501,
      selected_options: ["A"],
      attempt_mode: "practice",
    });
    await userEvent.click(screen.getByRole("button", { name: /Câu tiếp/i }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Câu trước/i })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: /Câu trước/i }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 1" })).toBeInTheDocument();
    expect(screen.getByText("Chính xác!")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Câu tiếp/i }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 2" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /B Đáp án khác/i }));
    await userEvent.click(screen.getByRole("button", { name: /Kiểm tra đáp án/i }));
    expect(await screen.findByText("Chưa chính xác")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Câu 1: đã trả lời đúng" })).toHaveClass("answered-correct");
    expect(screen.getByRole("button", { name: "Câu 2: đã trả lời sai" })).toHaveClass("answered-incorrect");
    await userEvent.click(screen.getByRole("button", { name: "Câu 1: đã trả lời đúng" }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 1" })).toBeInTheDocument();
    expect(screen.getByText("Chính xác!")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Câu 2: đã trả lời sai" }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 2" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Hoàn thành/i }));
    expect(await screen.findByRole("heading", { name: "Bạn đã hoàn thành!" })).toBeInTheDocument();
    expect(screen.getByText(/Bạn đã trả lời 2 \/ 2 câu\. 1 câu đúng, 1 câu sai\./)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Chọn nội dung khác/i }));
    await userEvent.click(screen.getByRole("button", { name: /CHƯƠNG 2 Văn hóa giao thông/i }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 1" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/questions/", expect.objectContaining({
      params: expect.objectContaining({ category: "2", page_size: 1 }),
    }));

    await userEvent.click(screen.getByRole("button", { name: /Tất cả nội dung ôn tập/i }));
    await userEvent.click(screen.getByRole("button", { name: /Ôn theo bộ đề \(600c\)/i }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 1" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/questions/", expect.objectContaining({
      params: expect.objectContaining({ page_size: 1, category: undefined, is_critical: undefined }),
    }));
  });

  it("shares answered-question markers between full practice and chapter practice", async () => {
    localStorage.setItem("gplx_tokens", JSON.stringify({ access: "access-token", refresh: "refresh-token" }));
    renderApp("/study");
    await userEvent.click(await screen.findByRole("button", { name: /Ôn theo bộ đề \(600c\)/i }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /A Đáp án đúng/i }));
    await userEvent.click(screen.getByRole("button", { name: /Kiểm tra đáp án/i }));
    expect(await screen.findByText("Chính xác!")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Câu 1: đã trả lời đúng" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Tất cả nội dung ôn tập/i }));
    await userEvent.click(screen.getByRole("button", { name: /CHƯƠNG 1 Quy tắc giao thông/i }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 1" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Câu 1: đã trả lời đúng" })).toHaveClass("answered-correct");
  });

  it("opens study content from the homepage without a render error", async () => {
    renderApp("/");
    await userEvent.click(screen.getByRole("link", { name: /Bắt đầu ôn tập/i }));
    expect(await screen.findByRole("heading", { name: "Hôm nay bạn muốn ôn phần nào?" })).toBeInTheDocument();
    expect(await screen.findAllByRole("button", { name: /600c|CHƯƠNG [1-6]|câu điểm liệt/i })).toHaveLength(8);
  });

  it("hides license-class study cards on the homepage until question mappings exist", async () => {
    renderApp("/");
    expect(screen.queryByRole("heading", { name: "Ôn tập theo hạng GPLX." })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Bắt đầu ôn tập/i })).toHaveAttribute("href", "/study");
  });

  it("enters and exits fullscreen for the active study page", async () => {
    const previousFullscreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    const previousExitDescriptor = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
    const previousRequestDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "requestFullscreen");
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: vi.fn(async () => {
        fullscreenElement = null;
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: vi.fn(async function (this: HTMLElement) {
        fullscreenElement = this;
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });
    try {
      renderApp("/study?mode=critical");
      await userEvent.click(await screen.findByRole("button", { name: "Xem toàn màn hình" }));
      expect(await screen.findByRole("button", { name: "Thoát toàn màn hình" })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Thoát toàn màn hình" }));
      expect(await screen.findByRole("button", { name: "Xem toàn màn hình" })).toBeInTheDocument();
    } finally {
      if (previousFullscreenDescriptor) Object.defineProperty(document, "fullscreenElement", previousFullscreenDescriptor);
      else Reflect.deleteProperty(document, "fullscreenElement");
      if (previousExitDescriptor) Object.defineProperty(document, "exitFullscreen", previousExitDescriptor);
      else Reflect.deleteProperty(document, "exitFullscreen");
      if (previousRequestDescriptor) Object.defineProperty(HTMLElement.prototype, "requestFullscreen", previousRequestDescriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
    }
  });

  it("restores the signed-in learner's active question and earlier answers after re-entry", async () => {
    localStorage.setItem("gplx_tokens", JSON.stringify({ access: "access-token", refresh: "refresh-token" }));
    const firstRender = renderApp("/study");
    await userEvent.click(await screen.findByRole("button", { name: /Ôn tập câu điểm liệt/i }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /A Đáp án đúng/i }));
    await userEvent.click(screen.getByRole("button", { name: /Kiểm tra đáp án/i }));
    expect(await screen.findByText("Chính xác!")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Câu tiếp/i }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 2" })).toBeInTheDocument();
    expect(localStorage.getItem("gplx_study_session_1_critical_all")).toContain('"page":2');
    firstRender.unmount();

    renderApp("/study?mode=critical");
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 2" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Câu trước/i }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 1" })).toBeInTheDocument();
    expect(screen.getByText("Chính xác!")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("resumes at the nearest unanswered question instead of the last visited page", async () => {
    localStorage.setItem("gplx_tokens", JSON.stringify({ access: "access-token", refresh: "refresh-token" }));
    localStorage.setItem("gplx_study_session_1_critical_all", JSON.stringify({
      page: 3,
      finished: false,
      savedAnswers: {
        501: { page: 1, selected: "A", result: { is_correct: true, correct_options: ["A"], explanation: null } },
        503: { page: 3, selected: "B", result: { is_correct: false, correct_options: ["A"], explanation: null } },
      },
    }));
    vi.spyOn(api, "get").mockImplementation(async (url, config) => {
      if (url.includes("/categories/")) return { data: [
        { id: 1, name: "Quy tắc giao thông", question_count: 120 },
        { id: 2, name: "Văn hóa giao thông", question_count: 80 },
        { id: 3, name: "Kỹ thuật lái xe", question_count: 90 },
        { id: 4, name: "Cấu tạo và sửa chữa", question_count: 70 },
        { id: 5, name: "Báo hiệu đường bộ", question_count: 140 },
        { id: 6, name: "Sa hình", question_count: 100 },
      ] } as never;
      if (url === "/auth/me/") return { data: { id: 1, username: "hocvien", email: "hocvien@example.test" } } as never;
      if (url === "/study/statuses/") return { data: [] } as never;
      if (url === "/questions/") {
        const page = Number((config?.params as Record<string, unknown> | undefined)?.page ?? 1);
        return { data: {
          count: 4,
          next: null,
          previous: null,
          results: [{
            id: 500 + page,
            question_number: 12 + page,
            content: `Câu hỏi thực hành số ${page}`,
            is_critical: true,
            answers: [{ id: 7, label: "A", content: "Đáp án đúng" }],
          }],
        } } as never;
      }
      return { data: {} } as never;
    });
    renderApp("/study?mode=critical");

    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 2" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/questions/", expect.objectContaining({
      params: expect.objectContaining({ page: 2, page_size: 1, is_critical: "true" }),
    }));
    expect(screen.getByRole("button", { name: /Kiểm tra đáp án/i })).toBeDisabled();
    expect(screen.getByText("2 / 4")).toBeInTheDocument();
  });

  it("continues from the saved page when restoring an older session format", async () => {
    localStorage.setItem("gplx_tokens", JSON.stringify({ access: "access-token", refresh: "refresh-token" }));
    localStorage.setItem("gplx_study_session_1_critical_all", JSON.stringify({
      page: 3,
      finished: false,
      savedAnswers: {
        501: { selected: "A", result: { is_correct: true, correct_options: ["A"], explanation: null } },
      },
    }));
    vi.spyOn(api, "get").mockImplementation(async (url, config) => {
      if (url.includes("/categories/")) return { data: [
        { id: 1, name: "Quy tắc giao thông", question_count: 120 },
        { id: 2, name: "Văn hóa giao thông", question_count: 80 },
        { id: 3, name: "Kỹ thuật lái xe", question_count: 90 },
        { id: 4, name: "Cấu tạo và sửa chữa", question_count: 70 },
        { id: 5, name: "Báo hiệu đường bộ", question_count: 140 },
        { id: 6, name: "Sa hình", question_count: 100 },
      ] } as never;
      if (url === "/auth/me/") return { data: { id: 1, username: "hocvien", email: "hocvien@example.test" } } as never;
      if (url === "/study/statuses/") return { data: [] } as never;
      if (url === "/questions/") {
        const page = Number((config?.params as Record<string, unknown> | undefined)?.page ?? 1);
        return { data: {
          count: 100,
          next: null,
          previous: null,
          results: [{
            id: 500 + page,
            question_number: page,
            content: `Câu hỏi thực hành số ${page}`,
            is_critical: true,
            answers: [{ id: 7, label: "A", content: "Đáp án đúng" }],
          }],
        } } as never;
      }
      return { data: {} } as never;
    });
    renderApp("/study?mode=critical");

    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 3" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/questions/", expect.objectContaining({
      params: expect.objectContaining({ page: 3, page_size: 1 }),
    }));
    expect(screen.getByText("3 / 100")).toBeInTheDocument();
  });

  it("clears saved database progress before restarting the selected practice", async () => {
    localStorage.setItem("gplx_tokens", JSON.stringify({ access: "access-token", refresh: "refresh-token" }));
    renderApp("/study?mode=critical");

    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /A Đáp án đúng/i }));
    await userEvent.click(screen.getByRole("button", { name: /Kiểm tra đáp án/i }));
    expect(await screen.findByText("Chính xác!")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Câu tiếp/i }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 2" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /B Đáp án khác/i }));
    await userEvent.click(screen.getByRole("button", { name: /Kiểm tra đáp án/i }));
    expect(await screen.findByText("Chưa chính xác")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Hoàn thành/i }));
    await userEvent.click(screen.getByRole("button", { name: /Làm lại từ đầu/i }));

    expect(screen.getByRole("alertdialog", { name: "Làm lại từ đầu?" })).toBeInTheDocument();
    expect(screen.getByText(/sẽ bị xóa và không thể khôi phục/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith("/study/reset/", { mode: "critical" });
    await userEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith("/study/reset/", { mode: "critical" });

    await userEvent.click(screen.getByRole("button", { name: /Làm lại từ đầu/i }));
    await userEvent.click(screen.getByRole("button", { name: /Xóa kết quả và làm lại/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/study/reset/", { mode: "critical" }));
    expect(await screen.findByRole("heading", { name: "Câu hỏi thực hành số 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kiểm tra đáp án/i })).toBeDisabled();
    expect(localStorage.getItem("gplx_study_session_1_critical_all")).toContain('"page":1');
  });
});
