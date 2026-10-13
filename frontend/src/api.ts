import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});
const apiOrigin = new URL(api.defaults.baseURL ?? "http://localhost:8000/api/v1", window.location.origin).origin;

export function resolveMediaUrl(image: string | null | undefined): string | undefined {
  if (!image) return undefined;
  const imageUrl = new URL(image, window.location.origin);
  if (imageUrl.pathname.startsWith("/media/")) {
    return `${imageUrl.pathname}${imageUrl.search}${imageUrl.hash}`;
  }
  return image.startsWith("/") ? `${apiOrigin}${image}` : image;
}

type TokenPair = { access: string; refresh: string };
type RetriableRequest = InternalAxiosRequestConfig & { _retried?: boolean };
const tokenKey = "gplx_tokens";

export function getTokens(): TokenPair | null {
  const raw = localStorage.getItem(tokenKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenPair;
  } catch {
    localStorage.removeItem(tokenKey);
    return null;
  }
}

export function setTokens(tokens: TokenPair | null): void {
  if (tokens) localStorage.setItem(tokenKey, JSON.stringify(tokens));
  else localStorage.removeItem(tokenKey);
}

api.interceptors.request.use((config) => {
  const token = getTokens()?.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetriableRequest | undefined;
    const refresh = getTokens()?.refresh;
    if (error.response?.status !== 401 || !request || request._retried || !refresh) {
      return Promise.reject(error);
    }
    request._retried = true;
    try {
      const response = await axios.post<TokenPair>(
        `${api.defaults.baseURL}/auth/token/refresh/`,
        { refresh },
      );
      const current = getTokens();
      setTokens({ access: response.data.access, refresh: response.data.refresh ?? current?.refresh ?? refresh });
      request.headers.Authorization = `Bearer ${response.data.access}`;
      return api(request);
    } catch (refreshError) {
      setTokens(null);
      window.dispatchEvent(new Event("gplx:unauthorized"));
      return Promise.reject(refreshError);
    }
  },
);

export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };
export type Category = { id: number; name: string; slug?: string; order?: number; question_count?: number };
export type LicenseClass = { id: number; code: string; name: string; description?: string; legal_source?: string };
export type AnswerOption = {
  id?: number;
  label?: string;
  key?: string;
  content?: string;
  text?: string;
  order?: number;
};
export type Question = {
  id?: number;
  question_id?: number;
  question_number?: number;
  content: string;
  image?: string | null;
  explanation?: string | null;
  is_critical: boolean | null;
  category?: Category | null;
  answers: AnswerOption[];
  selected_key?: string | null;
  correct_keys?: string[];
};
export type ExamConfiguration = {
  id: number;
  name: string;
  license_class: number;
  license_class_code?: string;
  eligible_question_count?: number;
  eligible_critical_question_count?: number;
  question_count: number;
  duration_seconds: number | null;
  passing_score: number | null;
  critical_question_policy?: "fail_on_wrong";
  question_distribution?: Record<string, number>;
  fixed_question_ids?: number[];
  version?: number;
  is_active: boolean;
};
export type ExamSession = {
  id: string;
  status: string;
  expires_at: string;
  questions: Question[];
  answers?: Record<string, string>;
  configuration?: { name: string; license_class?: string; duration_seconds?: number };
  result?: ExamResult | null;
  configuration_name?: string;
};
export type ExamResult = {
  attempt_id: string;
  session_id: string;
  started_at?: string;
  submitted_at?: string | null;
  expires_at?: string;
  score: number;
  passed: boolean;
  correct_count: number;
  wrong_count: number;
  unanswered_count: number;
  critical_failure: boolean;
  duration_seconds?: number;
  questions?: Question[];
};
export type User = { id: number; username: string; email: string; first_name?: string; last_name?: string; is_staff: boolean };

export const apiErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const errors = data as Record<string, unknown>;
      if (typeof errors.detail === "string") return errors.detail;
      const nonFieldErrors = flattenErrorMessages(errors.non_field_errors);
      if (nonFieldErrors.length) return nonFieldErrors.join(" ");

      const fieldLabels: Record<string, string> = {
        email: "Email",
        first_name: "Tên",
        last_name: "Họ",
        password: "Mật khẩu",
        username: "Tên đăng nhập",
        license_class: "Hạng GPLX",
        name: "Tên cấu hình",
        question_count: "Tổng số câu",
        duration_seconds: "Thời lượng",
        passing_score: "Số câu đạt",
        question_distribution: "Phân bố câu hỏi",
      };
      const fieldErrors = Object.entries(errors).flatMap(([field, value]) => {
        const messages = flattenErrorMessages(value);
        if (!messages.length) return [];
        const label = fieldLabels[field] ?? field.replaceAll("_", " ");
        return messages.map((message) => `${label}: ${message}`);
      });
      if (fieldErrors.length) return fieldErrors.join(" ");
    }
    return error.message;
  }
  return "Đã xảy ra lỗi. Vui lòng thử lại.";
};

function flattenErrorMessages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenErrorMessages);
  if (value && typeof value === "object") return Object.values(value).flatMap(flattenErrorMessages);
  return [];
}

export const isConflictError = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === 409;

export { api };
