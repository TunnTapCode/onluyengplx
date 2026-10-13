import { Component, useEffect, useRef, useState, type ErrorInfo, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, BookOpen, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, FileText, Flag, GraduationCap, LayoutDashboard, LogOut, Maximize2, Minimize2,
  Menu, RotateCcw, ShieldCheck, Sparkles, Target, TrendingUp, X, XCircle,
  Settings2,
} from "lucide-react";
import { api, apiErrorMessage, getTokens, isConflictError, resolveMediaUrl, setTokens } from "./api";
import type { AnswerOption, Category, ExamConfiguration, ExamResult, ExamSession, LicenseClass, Page, Question, User } from "./api";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AdminExams from "./AdminExams";

function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get<User>("/auth/me/")).data,
    enabled: Boolean(getTokens()),
    retry: false,
  });
}

function Protected({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  if (!getTokens()) return <Navigate to="/login" replace />;
  if (user.isLoading) return <div className="page-center"><div className="spinner" /></div>;
  if (user.isError) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function StaffOnly({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  if (user.isLoading) return <div className="page-center"><div className="spinner" /></div>;
  if (!user.data?.is_staff) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function App() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.setQueryData(["me"], null);
      queryClient.clear();
    };
    window.addEventListener("gplx:unauthorized", onUnauthorized);
    return () => window.removeEventListener("gplx:unauthorized", onUnauthorized);
  }, [queryClient]);

  return <AppErrorBoundary><Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
    <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
    <Route path="/dashboard" element={<Protected><Shell><Dashboard /></Shell></Protected>} />
    <Route path="/study" element={<Shell><Study /></Shell>} />
    <Route path="/study/questions/:id" element={<Shell><QuestionPage /></Shell>} />
    <Route path="/exam" element={<Shell><ExamHome /></Shell>} />
    <Route path="/exam/session/:sessionId" element={<Protected><ExamPage /></Protected>} />
    <Route path="/exam/result/:attemptId" element={<Protected><Shell><ResultPage /></Shell></Protected>} />
    <Route path="/history" element={<Protected><Shell><History /></Shell></Protected>} />
    <Route path="/bookmarks" element={<Protected><Shell><SavedQuestions mode="bookmarks" /></Shell></Protected>} />
    <Route path="/mistakes" element={<Protected><Shell><SavedQuestions mode="mistakes" /></Shell></Protected>} />
    <Route path="/profile" element={<Protected><Shell><Profile /></Shell></Protected>} />
    <Route path="/admin/exams" element={<Protected><StaffOnly><Shell><AdminExams /></Shell></StaffOnly></Protected>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AppErrorBoundary>;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Application rendering failed", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) return <div className="page-center"><div className="empty-state"><span className="empty-icon"><CircleHelp /></span><h3>Đã xảy ra lỗi hiển thị</h3><p>Vui lòng tải lại trang. Nếu sự cố vẫn tiếp diễn, hãy thử lại sau.</p><button className="button button-dark" onClick={() => window.location.reload()}>Tải lại trang</button></div></div>;
    return this.props.children;
  }
}

function Brand() {
  return <Link to="/" className="brand"><span className="brand-mark"><GraduationCap size={20} /></span><span>vững<span className="brand-light">tay</span>nái</span></Link>;
}

function Landing() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const questionCount = useQuery({
    queryKey: ["questions", "count"],
    queryFn: async () => (await api.get<Page<Question>>("/questions/?page_size=1")).data.count,
    retry: false,
  });
  const categories = useQuery({
    queryKey: ["landing", "category-count"],
    queryFn: async () => {
      const response = await api.get<Page<{ id: number }>>("/categories/");
      return Array.isArray(response.data) ? response.data.length : response.data.count;
    },
    retry: false,
  });
  return (
    <div className="landing">
      <header className="landing-nav wrap">
        <Brand />
        <button className="icon-button mobile-menu" aria-label="Mở menu" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X /> : <Menu />}</button>
        <nav className={mobileOpen ? "nav-links open" : "nav-links"}>
          <a href="#features">Tính năng</a><a href="#how">Cách học</a><a href="#faq">Câu hỏi thường gặp</a>
          <div className="nav-actions"><Link className="text-link" to="/login">Đăng nhập</Link><Link className="button button-dark button-small" to="/register">Bắt đầu miễn phí <ArrowRight size={15} /></Link></div>
        </nav>
      </header>
      <main>
        <section className="hero wrap">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> Học lý thuyết, vững tâm thi</div>
            <h1>Luyện thi GPLX<br /><span className="headline-accent">tự tin, vững tay lái.</span></h1>
            <p className="hero-description">Ôn tập bộ câu hỏi sát hạch theo chủ đề, luyện đề mô phỏng và hiểu rõ từng đáp án — để bạn sẵn sàng cho ngày thi.</p>
            <div className="hero-buttons"><Link to="/study" className="button button-dark">Bắt đầu ôn tập <ArrowRight size={17} /></Link><Link to="/exam" className="button button-outline">Thi thử ngay <ArrowUpRight size={16} /></Link></div>
            <div className="hero-proof"><div className="proof-icons"><span>✓</span><span>✓</span><span>✓</span></div><span>Học theo tiến độ của riêng bạn</span></div>
          </div>
          <div className="hero-art">
            <div className="art-blob" />
            <div className="road-card">
              <div className="road-top"><div className="road-icon"><Target size={19} /></div><span className="road-label">SẴN SÀNG ÔN TẬP</span><span className="road-more">•••</span></div>
              <div className="road-score">Bắt đầu <small>từ câu đầu tiên</small></div>
              <div className="progress-track"><span style={{ width: 0 }} /></div>
              <div className="road-caption">Tiến độ cập nhật khi bạn học <span>↗</span></div>
              <div className="road-illustration"><div className="sun" /><div className="hill hill-one" /><div className="hill hill-two" /><div className="road-stripe" /><div className="car"><span /></div></div>
            </div>
            <div className="floating-note"><span className="note-check"><Check size={15} /></span><span><b>Học từng bước nhỏ</b><small>Vững thêm một chút mỗi ngày</small></span></div>
            <div className="hero-sparkle">✳</div>
          </div>
        </section>
        <section className="stats wrap">
          <div className="stat"><b>{questionCount.data?.toLocaleString("vi-VN") ?? "—"}</b><span>câu hỏi trong hệ thống</span></div>
          <div className="stat"><b>{categories.data ?? "—"}</b><span>chủ đề ôn tập</span></div>
          <div className="stat"><b>30 phút</b><span>mỗi ngày để tiến bộ</span></div>
          <div className="stat-note"><ShieldCheck size={18} /><span>Dữ liệu học tập được đồng bộ<br />trên tài khoản của bạn</span></div>
        </section>
        <section className="section wrap" id="features">
          <div className="section-heading"><div><div className="eyebrow">HỌC ĐÚNG CÁCH</div><h2>Mỗi chặng đường,<br />một bước tiến rõ ràng.</h2></div><p>Tập trung vào những gì giúp bạn hiểu bài và tự tin khi bước vào kỳ sát hạch.</p></div>
          <div className="feature-grid">
            <Feature icon={<BookOpen />} number="01" title="Ôn tập theo chủ đề" text="Chia nhỏ bộ câu hỏi thành từng chương dễ tiếp thu. Theo dõi phần đã học và quay lại câu cần ôn." />
            <Feature icon={<Target />} number="02" title="Thi thử như thật" text="Làm bài có giới hạn thời gian, điều hướng câu hỏi và nhận kết quả sau khi nộp bài." />
            <Feature icon={<TrendingUp />} number="03" title="Tiến độ của bạn" text="Xem lại lịch sử học và kết quả để biết mình đã tiến bộ ở đâu, cần tập trung phần nào." />
          </div>
        </section>
        <section className="how-section wrap" id="how"><div className="how-heading"><div className="eyebrow">BẮT ĐẦU TRONG VÀI BƯỚC</div><h2>Học theo cách phù hợp với bạn.</h2></div><div className="how-grid"><div><span>01</span><b>Chọn chủ đề</b><p>Bắt đầu từ chương bạn muốn ôn tập.</p></div><div><span>02</span><b>Luyện từng câu</b><p>Trả lời và xem lại đáp án từ hệ thống.</p></div><div><span>03</span><b>Theo dõi tiến độ</b><p>Đăng nhập để lưu kết quả học và thi.</p></div></div></section>
        <section className="study-cta">
          <div className="wrap cta-inner"><div className="cta-icon"><Sparkles size={22} /></div><div><h2>Sẵn sàng cho hành trình của bạn?</h2><p>Bắt đầu với một chủ đề nhỏ — tiến bộ sẽ đến từ những lần luyện tập đều đặn.</p></div><Link className="button button-dark" to="/study">Khám phá bộ câu hỏi <ArrowRight size={16} /></Link></div>
        </section>
        <section className="section wrap faq-section" id="faq"><div className="section-heading"><div><div className="eyebrow">GIẢI ĐÁP NHANH</div><h2>Bạn có thể muốn biết</h2></div></div><div className="faq-list"><Faq question="Tôi có thể học mà không cần tài khoản không?" answer="Bạn có thể xem và ôn câu hỏi công khai. Đăng nhập để lưu lịch sử, câu yêu thích và đồng bộ tiến độ." /><Faq question="Ứng dụng có sẵn toàn bộ câu hỏi chính thức không?" answer="Bộ dữ liệu được quản trị viên nhập từ nguồn đã xác minh. Nếu dữ liệu hoặc cấu hình còn thiếu, ứng dụng sẽ thông báo thay vì tự tạo câu hỏi hay đáp án." /><Faq question="Tôi có thể xem lại bài thi sau khi nộp không?" answer="Có. Bài thi đã hoàn thành được lưu vào tài khoản để bạn xem kết quả và những câu cần ôn lại." /></div></section>
      </main>
      <footer className="footer"><div className="wrap footer-inner"><Brand /><span>Học vững lý thuyết. Tự tin trên mọi hành trình.</span><span>© {new Date().getFullYear()} Vững Tay Lái</span></div></footer>
    </div>
  );
}

function Feature({ icon, number, title, text }: { icon: ReactNode; number: string; title: string; text: string }) {
  return <article className="feature-card"><div className="feature-top"><span className="feature-icon">{icon}</span><span>{number}</span></div><h3>{title}</h3><p>{text}</p></article>;
}

function Faq({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return <button className={`faq-item ${open ? "faq-open" : ""}`} onClick={() => setOpen(!open)}><span><b>{question}</b>{open && <small>{answer}</small>}</span>{open ? <ArrowDown size={17} /> : <ArrowRight size={17} />}</button>;
}

const authSchema = z.object({
  username: z.string().min(1, "Vui lòng nhập tên đăng nhập"),
  email: z.string().email("Email không hợp lệ").optional().or(z.literal("")),
  password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự"),
});
const registerSchema = authSchema.extend({ email: z.string().email("Email không hợp lệ") });
type AuthValues = z.infer<typeof authSchema> & { email?: string };

function AuthPage({ mode }: { mode: "login" | "register" | "forgot" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState("");
  const isRegister = mode === "register";
  const schema = isRegister ? registerSchema : authSchema;
  const { register, handleSubmit, formState: { errors } } = useForm<AuthValues>({ resolver: zodResolver(schema) });
  const mutation = useMutation({
    mutationFn: async (values: AuthValues) => {
      if (isRegister) await api.post("/auth/register/", values);
      const response = await api.post("/auth/login/", { username: values.username, password: values.password });
      return response.data as { access: string; refresh: string };
    },
    onSuccess: (tokens) => {
      setTokens(tokens);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/dashboard", { replace: true });
    },
    onError: (error) => setErrorMessage(apiErrorMessage(error)),
  });
  const title = mode === "register" ? "Tạo tài khoản" : mode === "forgot" ? "Đặt lại mật khẩu" : "Chào mừng trở lại";
  if (mode === "forgot") {
    return <div className="auth-page"><div className="auth-side"><Brand /><div className="auth-art"><div className="auth-route">● ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ⌖</div><h2>Chặng đường<br />vững tay lái bắt đầu từ đây.</h2><p>Học tập có kế hoạch, thi thử tự tin, tiến bộ từng ngày.</p></div><span className="auth-foot">VỮNG TAY LÁI · HỌC TẬP CHỦ ĐỘNG</span></div><div className="auth-main"><Link to="/login" className="auth-back"><ArrowLeft size={15} /> Về đăng nhập</Link><div className="auth-form-wrap"><div className="eyebrow">HỖ TRỢ TÀI KHOẢN</div><h1>{title}</h1><p className="muted">Chức năng gửi email đặt lại mật khẩu sẽ được bật khi máy chủ được cấu hình dịch vụ email.</p><div className="alert alert-info">Hiện chưa thể gửi liên kết đặt lại tự động. Vui lòng liên hệ quản trị viên để được hỗ trợ.</div><Link className="button button-dark button-full" to="/login">Quay lại đăng nhập <ArrowRight size={16} /></Link></div></div></div>;
  }
  return <div className="auth-page"><div className="auth-side"><Brand /><div className="auth-art"><div className="auth-route">● ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ⌖</div><h2>Chặng đường<br />vững tay lái bắt đầu từ đây.</h2><p>Học tập có kế hoạch, thi thử tự tin, tiến bộ từng ngày.</p><div className="auth-decoration">↗</div></div><span className="auth-foot">VỮNG TAY LÁI · HỌC TẬP CHỦ ĐỘNG</span></div><div className="auth-main"><Link to="/" className="auth-back"><ArrowLeft size={15} /> Về trang chủ</Link><div className="auth-form-wrap"><div className="eyebrow">TÀI KHOẢN HỌC TẬP</div><h1>{title}</h1><p className="muted">{isRegister ? "Đăng ký để lưu tiến độ và bài thi của bạn." : "Đăng nhập để tiếp tục hành trình ôn luyện."}</p>
    <form onSubmit={handleSubmit((values) => { setErrorMessage(""); mutation.mutate(values); })} className="form-stack">
      {isRegister && <label>Email<input type="email" placeholder="ban@email.com" {...register("email")} />{errors.email && <small className="field-error">{errors.email.message}</small>}</label>}
      <label>Tên đăng nhập<input autoComplete="username" placeholder="Tên đăng nhập" {...register("username")} />{errors.username && <small className="field-error">{errors.username.message}</small>}</label>
      <label>Mật khẩu<input type="password" autoComplete={isRegister ? "new-password" : "current-password"} placeholder="Tối thiểu 8 ký tự" {...register("password")} />{errors.password && <small className="field-error">{errors.password.message}</small>}</label>
      {!isRegister && <div className="form-extra"><span /> <Link to="/forgot-password">Quên mật khẩu?</Link></div>}
      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}
      <button className="button button-dark button-full" disabled={mutation.isPending}>{mutation.isPending ? "Đang xử lý..." : isRegister ? "Tạo tài khoản" : "Đăng nhập"} <ArrowRight size={16} /></button>
    </form>
    <p className="auth-switch">{isRegister ? "Đã có tài khoản?" : "Chưa có tài khoản?"} <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Đăng nhập" : "Đăng ký"}</Link></p>
  </div></div></div>;
}

const navItems = [
  { to: "/dashboard", text: "Tổng quan", icon: LayoutDashboard },
  { to: "/study", text: "Ôn tập", icon: BookOpen },
  { to: "/exam", text: "Thi thử", icon: FileText },
  { to: "/history", text: "Lịch sử thi", icon: Clock3, private: true },
  { to: "/bookmarks", text: "Câu yêu thích", icon: Bookmark, private: true },
];

function Shell({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = user.data?.first_name || user.data?.username || "Học viên";
  const logout = async () => {
    try {
      const refresh = getTokens()?.refresh;
      if (refresh) await api.post("/auth/logout/", { refresh });
    } finally {
      setTokens(null);
      navigate("/");
    }
  };
  return <div className="app-shell"><aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}><div className="sidebar-brand"><Brand /><button className="icon-button side-close" onClick={() => setMenuOpen(false)}><X size={18} /></button></div><div className="side-label">KHÔNG GIAN HỌC</div><nav>  {navItems.map((item) => { const Icon = item.icon; return <Link onClick={() => setMenuOpen(false)} key={item.to} className={`side-link ${location.pathname === item.to ? "active" : ""}`} to={item.to}><Icon size={18} /><span>{item.text}</span></Link>; })}{user.data?.is_staff && <Link onClick={() => setMenuOpen(false)} className={`side-link ${location.pathname === "/admin/exams" ? "active" : ""}`} to="/admin/exams"><Settings2 size={18} /><span>Cấu hình thi thử</span></Link>}<Link className={`side-link ${location.pathname === "/mistakes" ? "active" : ""}`} to="/mistakes"><CircleHelp size={18} /><span>Câu cần ôn lại</span></Link></nav><div className="sidebar-bottom"><div className="sidebar-tip"><Sparkles size={17} /><b>Mẹo nhỏ</b><p>Học 15–20 phút mỗi ngày giúp bạn ghi nhớ tốt hơn.</p></div><button className="side-link side-logout" onClick={logout}><LogOut size={18} /><span>Đăng xuất</span></button><Link to="/profile" className="user-mini"><span className="avatar">{name.charAt(0).toUpperCase()}</span><span><b>{name}</b><small>Xem hồ sơ</small></span><ChevronDown size={15} /></Link></div></aside>
    {menuOpen && <button className="mobile-overlay" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />}
    <main className="main-area"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Mở menu"><Menu /></button><div className="breadcrumbs">Không gian học <span>/</span> <b>{navItems.find((item) => item.to === location.pathname)?.text ?? "Luyện tập"}</b></div><div className="topbar-right"><span className="status-pill"><span /> Học theo nhịp của bạn</span><Link to="/profile" className="avatar top-avatar">{name.charAt(0).toUpperCase()}</Link></div></header>{children}</main></div>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action && <div>{action}</div>}</div>;
}

function useProgress() {
  return useQuery({
    queryKey: ["progress"],
    queryFn: async () => (await api.get<Record<string, unknown>>("/study/progress/")).data,
    retry: false,
    enabled: Boolean(getTokens()),
  });
}

function Dashboard() {
  const progress = useProgress();
  const recent = useQuery({
    queryKey: ["recent"],
    queryFn: async () => (await api.get<Page<Record<string, unknown>>>("/study/recent/")).data,
    retry: false,
  });
  const stats = progress.data ?? {};
  const parseMetric = (keys: string[], fallback = 0) => {
    for (const key of keys) if (typeof stats[key] === "number") return stats[key] as number;
    return fallback;
  };
  const total = parseMetric(["questions_studied", "total_answered", "answered_count", "answered_questions"]);
  const correct = parseMetric(["correct_answers"]);
  const accuracy = parseMetric(["accuracy_percentage"], total > 0 ? Math.round((correct / total) * 100) : 0);
  const tests = parseMetric(["exams_completed", "exam_count"]);
  const average = parseMetric(["average_score", "average_exam_score"]);
  return <div className="page-content"><PageHeading eyebrow="TỔNG QUAN HỌC TẬP" title="Chào bạn, hôm nay học gì?" subtitle="Từng câu trả lời đúng đưa bạn gần hơn tới mục tiêu." action={<Link to="/study" className="button button-dark">Tiếp tục ôn tập <ArrowRight size={16} /></Link>} />
    {progress.isError && <ApiNotice message="Chưa tải được tiến độ học tập từ máy chủ." />}
    <div className="metric-grid"><Metric icon={<BookOpen />} label="Câu đã luyện" value={total} tone="mint" /><Metric icon={<Target />} label="Tỷ lệ chính xác" value={`${accuracy}%`} tone="blue" /><Metric icon={<FileText />} label="Đề đã hoàn thành" value={tests} tone="peach" /><Metric icon={<TrendingUp />} label="Điểm trung bình" value={average} tone="lavender" /></div>
    <div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-heading"><div><h2>Tiến độ học tập</h2><p>Thống kê được đồng bộ từ lịch sử của bạn</p></div><span className="tag tag-soft">Gần đây</span></div>{progress.isLoading ? <Skeleton height={220} /> : <ProgressChart data={Array.isArray(stats.exam_scores) ? stats.exam_scores as Array<{ date: string; score: number }> : []} />}</section>
      <section className="panel chapter-panel"><div className="panel-heading"><div><h2>Ôn tập theo chương</h2><p>Chọn một chương để tiếp tục</p></div></div><ChapterList /></section></div>
    <section className="panel recent-panel"><div className="panel-heading"><div><h2>Hoạt động gần đây</h2><p>Các lần ôn tập và thi thử của bạn</p></div><Link className="text-link" to="/history">Xem lịch sử <ArrowRight size={14} /></Link></div>{recent.isLoading ? <Skeleton height={100} /> : recent.data?.results?.length ? <div className="recent-list">{recent.data.results.slice(0, 4).map((item, index) => <div key={String(item.id ?? index)} className="recent-row"><span className="recent-icon"><BookOpen size={17} /></span><span><b>{String(item.title ?? (item.question_number ? `Câu ${item.question_number}` : "Lần ôn tập"))}</b><small>{String(item.answered_at ?? item.created_at ?? "")}</small></span><span className="recent-result">{String(item.is_correct ? "Đúng" : item.score ?? "")}</span></div>)}</div> : <EmptyState icon={<FileText />} title="Chưa có hoạt động gần đây" text="Bắt đầu ôn tập để lưu lại hành trình học của bạn." action={<Link className="text-link" to="/study">Đi tới ôn tập <ArrowRight size={14} /></Link>} />}</section>
  </div>;
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number | string; tone: string }) {
  return <div className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><span className="metric-label">{label}</span><b>{value}</b><small><span className="metric-dot" /> Tính từ dữ liệu của bạn</small></div>;
}

function ProgressChart({ data }: { data: Array<{ date: string; score: number }> }) {
  if (!data.length) return <EmptyState icon={<TrendingUp />} title="Chưa có dữ liệu biểu đồ" text="Hoàn thành một bài thi thử để xem tiến độ điểm số." />;
  return <div className="chart-area"><ResponsiveContainer width="100%" height={220}><LineChart data={data} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke="#edf0ed" vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#8b938e", fontSize: 11 }} /><YAxis domain={[0, "auto"]} tickLine={false} axisLine={false} tick={{ fill: "#8b938e", fontSize: 11 }} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e8ebe7", boxShadow: "0 8px 24px #17211a12" }} /><Line type="monotone" dataKey="score" stroke="#397c63" strokeWidth={3} dot={{ fill: "#397c63", strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer></div>;
}

function ChapterList() {
  const progress = useProgress();
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const response = await api.get<Page<{ id: number; name: string; slug?: string }>>("/categories/");
      return Array.isArray(response.data) ? response.data : response.data.results;
    },
    retry: false,
  });
  if (categories.isLoading || progress.isLoading) return <Skeleton height={190} />;
  if (categories.isError || !categories.data?.length) return <EmptyState icon={<BookOpen />} title="Chưa có chủ đề" text="Danh mục sẽ xuất hiện sau khi dữ liệu câu hỏi được nhập vào hệ thống." />;
  const categoryProgress = Array.isArray(progress.data?.category_progress)
    ? progress.data.category_progress as Array<{ category_id: number; studied: number; total: number }>
    : [];
  return <div className="chapter-list">{categories.data.slice(0, 5).map((category, index) => {
    const entry = categoryProgress.find((item) => item.category_id === category.id);
    const learned = entry?.studied ?? 0;
    const total = entry?.total ?? 0;
    const percent = total > 0 ? Math.round((learned / total) * 100) : 0;
    return <Link to={`/study?category=${category.id}`} className="chapter-row" key={category.id}><span className={`chapter-number n-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span><span><b>{category.name}</b><small>{learned} / {total} câu đã luyện</small><span className="chapter-progress"><i style={{ width: `${percent}%` }} /></span></span><ArrowRight size={16} /></Link>;
  })}</div>;
}

function Study() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const studyPageRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [finished, setFinished] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [savedAnswers, setSavedAnswers] = useState<Record<number, { page: number; selected: string | null; result?: StudyAnswerResult }>>({});
  const queryMode = params.get("mode");
  const mode = queryMode === "chapter" || queryMode === "critical"
    ? queryMode
    : params.has("category") ? "chapter" : "full";
  const licenseClassId = mode === "full" ? params.get("license_class") ?? "" : "";
  const hasSelection = params.has("mode") || params.has("category") || params.has("license_class");
  const category = mode === "chapter" ? params.get("category") ?? "" : "";
  const currentUser = useCurrentUser();
  const storageKey = hasSelection && currentUser.data?.id
    ? `gplx_study_session_${currentUser.data.id}_${mode}_${category || licenseClassId || "all"}`
    : null;
  const [restoredStorageKey, setRestoredStorageKey] = useState<string | null>(null);
  const [pendingResumeKey, setPendingResumeKey] = useState<string | null>(null);
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const response = await api.get<Page<Category> | Category[]>("/categories/");
      return Array.isArray(response.data) ? response.data : response.data.results;
    },
  });
  const questions = useQuery({
    queryKey: ["questions", mode, category, licenseClassId, page],
    queryFn: async () => (await api.get<Page<Question>>("/questions/", { params: { category: category || undefined, license_class: licenseClassId || undefined, is_critical: mode === "critical" ? "true" : undefined, page, page_size: 1 } })).data,
    enabled: hasSelection
      && (!getTokens() || currentUser.isError || Boolean(storageKey && restoredStorageKey === storageKey))
      && (mode !== "chapter" || Boolean(category)),
  });
  const studyStatuses = useQuery({
    queryKey: ["study-statuses", mode, category, licenseClassId],
    queryFn: async () => (await api.get<StudyQuestionStatus[]>("/study/statuses/", {
      params: { mode, category: mode === "chapter" ? category : undefined, license_class: licenseClassId || undefined },
    })).data,
    enabled: Boolean(hasSelection && getTokens() && currentUser.data),
  });
  const resetPractice = useMutation({
    mutationFn: async () => {
      if (!getTokens()) return { deleted_attempts: 0 };
      const payload = mode === "chapter"
        ? { mode, category: Number(category) }
        : licenseClassId ? { mode, license_class: Number(licenseClassId) } : { mode };
      return (await api.post<{ deleted_attempts: number }>("/study/reset/", payload)).data;
    },
    onSuccess: () => {
      if (storageKey) localStorage.removeItem(storageKey);
      setPage(1);
      setFinished(false);
      setSavedAnswers({});
      void queryClient.invalidateQueries({ queryKey: ["progress"] });
      void queryClient.invalidateQueries({ queryKey: ["recent"] });
      void queryClient.invalidateQueries({ queryKey: ["mistakes"] });
      void queryClient.invalidateQueries({ queryKey: ["questions", mode, category, licenseClassId] });
      void queryClient.invalidateQueries({ queryKey: ["study-statuses"] });
      setConfirmRestart(false);
    },
  });
  useEffect(() => {
    if (!confirmRestart || resetPractice.isPending) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmRestart(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmRestart, resetPractice.isPending]);
  const restartPractice = () => setConfirmRestart(true);
  useEffect(() => {
    if (!storageKey) {
      setRestoredStorageKey(null);
      return;
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const saved = JSON.parse(stored) as {
          page?: number;
          finished?: boolean;
          savedAnswers?: Record<number, { page: number; selected: string | null; result?: StudyAnswerResult }>;
        };
        const restoredAnswers = saved.savedAnswers ?? {};
        const savedPage = saved.page ?? 0;
        setPage(Number.isInteger(savedPage) && savedPage > 0 ? savedPage : 1);
        setFinished(saved.finished === true);
        setSavedAnswers(restoredAnswers);
        setPendingResumeKey(stored ? storageKey : null);
      } else {
        setPage(1);
        setFinished(false);
        setSavedAnswers({});
        setPendingResumeKey(null);
      }
      setRestoredStorageKey(storageKey);
    } catch (error) {
      console.error("Could not restore study session", error);
      localStorage.removeItem(storageKey);
      setPage(1);
      setFinished(false);
      setSavedAnswers({});
      setPendingResumeKey(null);
      setRestoredStorageKey(storageKey);
    }
  }, [storageKey]);
  useEffect(() => {
    if (!pendingResumeKey || pendingResumeKey !== storageKey || !questions.data || finished) return;
    const answeredPages = new Set(
      Object.values(savedAnswers)
        .filter((answer) => answer.result && Number.isInteger(answer.page) && answer.page > 0)
        .map((answer) => answer.page),
    );
    const hasLegacyAnswers = Object.values(savedAnswers).some(
      (answer) => answer.result && (!Number.isInteger(answer.page) || answer.page < 1),
    );
    if (hasLegacyAnswers) {
      const currentQuestionId = questions.data.results[0]?.id;
      const currentQuestionWasAnswered = currentQuestionId !== undefined
        && Boolean(savedAnswers[currentQuestionId]?.result);
      const resumePage = Math.min(
        questions.data.count + 1,
        Math.max(1, page + (currentQuestionWasAnswered ? 1 : 0)),
      );
      setPage(resumePage);
      setFinished(resumePage > questions.data.count);
      setPendingResumeKey(null);
      return;
    }
    let resumePage = 1;
    while (resumePage <= questions.data.count && answeredPages.has(resumePage)) resumePage += 1;
    setFinished(resumePage > questions.data.count);
    setPage(resumePage);
    setPendingResumeKey(null);
  }, [finished, pendingResumeKey, questions.data, savedAnswers, storageKey]);
  useEffect(() => {
    if (!storageKey || restoredStorageKey !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ page, finished, savedAnswers }));
    } catch (error) {
      console.error("Could not save study session", error);
    }
  }, [finished, page, restoredStorageKey, savedAnswers, storageKey]);
  const setMode = (nextMode: "full" | "chapter" | "critical", chapterId?: number) => {
    const next = new URLSearchParams(params);
    next.set("mode", nextMode);
    if (nextMode === "chapter" && chapterId !== undefined) next.set("category", String(chapterId));
    else next.delete("category");
    next.delete("license_class");
    setParams(next);
    setPage(1);
    setFinished(false);
  };
  const backToContent = () => {
    setParams(new URLSearchParams());
    setPage(1);
    setFinished(false);
  };
  const nextQuestion = () => {
    if (page >= (questions.data?.count ?? 0)) setFinished(true);
    else setPage((current) => current + 1);
  };
  const updateSelection = (questionId: number, questionPage: number, selected: string | null) => {
    setSavedAnswers((current) => ({ ...current, [questionId]: { ...current[questionId], page: questionPage, selected } }));
  };
  const saveAnswerResult = (questionId: number, questionPage: number, selected: string, result: StudyAnswerResult) => {
    setSavedAnswers((current) => ({ ...current, [questionId]: { page: questionPage, selected, result } }));
  };
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === studyPageRef.current);
      setFullscreenError(null);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  const toggleFullscreen = async () => {
    const pageElement = studyPageRef.current;
    if (!pageElement) return;
    setFullscreenError(null);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (pageElement.requestFullscreen) await pageElement.requestFullscreen();
      else setFullscreenError("Trình duyệt hiện tại không hỗ trợ chế độ toàn màn hình.");
    } catch (error) {
      console.error("Could not toggle study fullscreen", error);
      setFullscreenError("Không thể chuyển sang chế độ toàn màn hình. Hãy thử lại.");
    }
  };
  const savedResults = Object.values(savedAnswers).flatMap((answer) => answer.result ? [answer.result] : []);
  const chapterList = (categories.data ?? []).slice(0, 6);
  const selectedChapter = chapterList.find((item) => String(item.id) === category);
  const studyTitle = mode === "critical" ? "Ôn tập câu điểm liệt"
    : mode === "chapter" ? selectedChapter?.name ?? "Ôn tập theo chương"
      : "Ôn theo bộ đề (600 câu)";
  if (!hasSelection) {
    return <div className="page-content study-page">
      <section className="study-intro">
        <div className="study-intro-copy">
          <span className="study-eyebrow"><BookOpen size={15} /> KHÔNG GIAN ÔN TẬP</span>
          <h1>Hôm nay bạn muốn ôn phần nào?</h1>
          <p>Chọn một nội dung để bắt đầu. Học theo bộ câu hỏi, từng chương hoặc tập trung luyện câu điểm liệt.</p>
        </div>
        <Link to="/mistakes" className="study-mistakes-link"><CircleHelp size={17} /><span><b>Câu cần ôn lại</b><small>Xem các câu bạn đã trả lời sai</small></span><ArrowRight size={16} /></Link>
      </section>
      <div className="study-section-heading"><div><span className="study-section-kicker">BẮT ĐẦU HỌC</span><h2>Chọn nội dung ôn tập</h2></div><span className="study-card-count">08 nội dung</span></div>
      {categories.isLoading ? <div className="study-choice-grid" aria-label="Đang tải nội dung ôn tập">{Array.from({ length: 8 }, (_, index) => <div className="study-choice-skeleton" key={index} />)}</div>
        : categories.isError ? <ApiNotice message="Không tải được danh sách chương. Hãy kiểm tra kết nối với máy chủ và thử lại." />
          : chapterList.length !== 6 ? <ApiNotice message="Danh sách chương chưa đầy đủ. Cần có đủ 6 chương để bắt đầu ôn tập." />
            : <div className="study-choice-grid">
              <button className="study-choice-card study-choice-full" onClick={() => setMode("full")}>
                <span className="study-choice-top"><span className="study-choice-icon"><BookOpen size={21} /></span><span className="study-choice-arrow"><ArrowUpRight size={18} /></span></span>
                <span className="study-choice-label">TRỌN BỘ CÂU HỎI</span><b>Ôn theo bộ đề (600c)</b><small>Luyện tập toàn bộ câu hỏi lý thuyết trong bộ đề.</small><span className="study-choice-meta">600 câu hỏi <ArrowRight size={14} /></span>
              </button>
              {chapterList.map((chapter, index) => <button className={`study-choice-card study-choice-chapter chapter-tone-${(index % 3) + 1}`} key={chapter.id} onClick={() => setMode("chapter", chapter.id)}>
                <span className="study-choice-top"><span className="study-choice-icon chapter-icon"><FileText size={20} /></span><span className="study-choice-number">{String(index + 1).padStart(2, "0")}</span></span>
                <span className="study-choice-label">CHƯƠNG {index + 1}</span><b>{chapter.name}</b><small>Ôn tập kiến thức và câu hỏi theo chương.</small><span className="study-choice-meta">{chapter.question_count ?? 0} câu hỏi <ArrowRight size={14} /></span>
              </button>)}
              <button className="study-choice-card study-choice-critical" onClick={() => setMode("critical")}>
                <span className="study-choice-top"><span className="study-choice-icon"><ShieldCheck size={21} /></span><span className="study-choice-arrow"><ArrowUpRight size={18} /></span></span>
                <span className="study-choice-label">CẦN GHI NHỚ</span><b>Ôn tập câu điểm liệt</b><small>Tập trung vào các câu sai là trượt cả bài thi.</small><span className="study-choice-meta">60 câu điểm liệt <ArrowRight size={14} /></span>
              </button>
            </div>}
    </div>;
  }
  return <div className="page-content study-page" ref={studyPageRef}>
    <div className="study-quiz-topline"><button className="study-back-button" onClick={backToContent}><ArrowLeft size={16} /> Tất cả nội dung ôn tập</button><span>{studyTitle}</span><div className="study-quiz-topline-actions"><button className="study-fullscreen-button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Thoát toàn màn hình" : "Xem toàn màn hình"}>{isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}</button>{!finished && <button className="study-restart-button" onClick={restartPractice}><RotateCcw size={14} /> Làm lại từ đầu</button>}</div></div>
    {fullscreenError && <ApiNotice message={fullscreenError} />}
    {studyStatuses.isError && <ApiNotice message={apiErrorMessage(studyStatuses.error)} />}
    <div className="study-exercise-layout">
      <div className="study-exercise-main">
        {finished
          ? <section className="study-finished panel"><span className="study-finished-icon"><CheckCircle2 size={30} /></span><span className="study-eyebrow">HOÀN THÀNH PHẦN ÔN TẬP</span><h1>Bạn đã hoàn thành!</h1><p>Bạn đã trả lời {savedResults.length} / {questions.data?.count ?? 0} câu. {savedResults.filter((result) => result.is_correct).length} câu đúng, {savedResults.filter((result) => !result.is_correct).length} câu sai. Kết quả từng câu đã được ghi nhận{getTokens() ? " vào tiến độ tài khoản của bạn" : " trong phiên ôn tập này"}.</p><div><button className="button button-dark" onClick={restartPractice}>Làm lại từ đầu <ArrowRight size={15} /></button><button className="button button-outline" onClick={backToContent}>Chọn nội dung khác</button></div></section>
          : questions.isLoading ? <QuestionSkeleton />
            : questions.isError ? <ApiNotice message="Không tải được câu hỏi. Hãy kiểm tra kết nối với máy chủ và thử lại." />
              : questions.data?.results[0] ? <StudyQuiz key={`${mode}-${category}-${questions.data.results[0].id}`} question={questions.data.results[0]} index={page} total={questions.data.count} savedAnswer={savedAnswers[questions.data.results[0].id ?? -1]} onSelectionChange={updateSelection} onAnswerSaved={saveAnswerResult} onPrevious={() => setPage((current) => Math.max(1, current - 1))} onNext={nextQuestion} />
                : <EmptyState icon={<BookOpen />} title="Chưa có câu hỏi trong nội dung này" text="Hãy chọn nội dung khác hoặc thử lại sau." />}
      </div>
      {questions.data && <StudyQuestionNav
        count={questions.data.count}
        currentPage={page}
        savedAnswers={savedAnswers}
        sharedStatuses={studyStatuses.data ?? []}
        onSelect={(questionPage) => { setPage(questionPage); setFinished(false); }}
      />}
    </div>
    {confirmRestart && <div className="study-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !resetPractice.isPending) setConfirmRestart(false); }}>
      <section className="study-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="study-restart-title" aria-describedby="study-restart-description">
        <span className="study-confirm-icon"><AlertTriangle size={22} /></span>
        <h2 id="study-restart-title">Làm lại từ đầu?</h2>
        <p id="study-restart-description">Kết quả đã lưu của phần “{studyTitle}” sẽ bị xóa và không thể khôi phục. Bạn có chắc chắn muốn làm lại không?</p>
        {resetPractice.isError && <ApiNotice message={apiErrorMessage(resetPractice.error)} />}
        <div className="study-confirm-actions">
          <button className="button button-outline" onClick={() => setConfirmRestart(false)} disabled={resetPractice.isPending}>Hủy</button>
          <button className="button button-dark" autoFocus onClick={() => resetPractice.mutate()} disabled={resetPractice.isPending}>{resetPractice.isPending ? "Đang xóa kết quả..." : "Xóa kết quả và làm lại"}</button>
        </div>
      </section>
    </div>}
  </div>;
}

type StudyAnswerResult = { is_correct: boolean; correct_options: string[]; explanation: string | null };
type SavedStudyAnswer = { page: number; selected: string | null; result?: StudyAnswerResult };
type StudyQuestionStatus = { question_id: number; page: number; is_correct: boolean };

function StudyQuestionNav({ count, currentPage, savedAnswers, sharedStatuses, onSelect }: {
  count: number;
  currentPage: number;
  savedAnswers: Record<number, SavedStudyAnswer>;
  sharedStatuses: StudyQuestionStatus[];
  onSelect: (page: number) => void;
}) {
  const [quizHeight, setQuizHeight] = useState<number>();
  useEffect(() => {
    const quiz = document.querySelector(".study-exercise-layout .study-quiz");
    if (!quiz) {
      setQuizHeight(undefined);
      return;
    }
    const updateHeight = () => setQuizHeight(Math.round(quiz.getBoundingClientRect().height));
    updateHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(quiz);
    return () => observer.disconnect();
  }, [currentPage]);
  const answerByPage = new Map(sharedStatuses.map((status) => [status.page, status.is_correct]));
  for (const answer of Object.values(savedAnswers)) {
    if (answer.result && Number.isInteger(answer.page)) answerByPage.set(answer.page, answer.result.is_correct);
  }
  const answeredCount = answerByPage.size;
  return <aside className="study-question-nav panel" aria-label="Danh sách câu hỏi" style={quizHeight ? { height: `${quizHeight}px` } : undefined}>
    <div className="study-question-nav-heading"><div><h2>Danh sách câu</h2><p>{answeredCount} / {count} câu đã trả lời</p></div><span className="study-nav-total">{count}</span></div>
    <div className="study-question-nav-legend"><span><i className="nav-legend-dot nav-correct" /> Đúng</span><span><i className="nav-legend-dot nav-incorrect" /> Sai</span><span><i className="nav-legend-dot nav-unanswered" /> Chưa trả lời</span></div>
    <div className="study-question-nav-grid">
      {Array.from({ length: count }, (_, index) => {
        const questionPage = index + 1;
        const answer = answerByPage.get(questionPage);
        const stateClass = answer === true ? "answered-correct" : answer === false ? "answered-incorrect" : "unanswered";
        return <button
          key={questionPage}
          type="button"
          className={`study-question-nav-item ${stateClass} ${questionPage === currentPage ? "current" : ""}`}
          aria-current={questionPage === currentPage ? "step" : undefined}
          aria-label={`Câu ${questionPage}: ${answer === true ? "đã trả lời đúng" : answer === false ? "đã trả lời sai" : "chưa trả lời"}`}
          onClick={() => onSelect(questionPage)}
        >{questionPage}</button>;
      })}
    </div>
  </aside>;
}

function StudyQuiz({ question, index, total, savedAnswer, onSelectionChange, onAnswerSaved, onPrevious, onNext }: {
  question: Question;
  index: number;
  total: number;
  savedAnswer?: { page: number; selected: string | null; result?: StudyAnswerResult };
  onSelectionChange: (questionId: number, page: number, selected: string | null) => void;
  onAnswerSaved: (questionId: number, page: number, selected: string, result: StudyAnswerResult) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const questionId = question.id ?? 0;
  const selected = savedAnswer?.selected ?? null;
  const queryClient = useQueryClient();
  const answer = useMutation({
    mutationFn: async () => (await api.post("/study/answer/", {
      question_id: questionId,
      selected_options: selected === null ? [] : [selected],
      attempt_mode: "practice",
    })).data as StudyAnswerResult,
    onSuccess: (result) => {
      if (selected !== null) onAnswerSaved(questionId, index, selected, result);
      void queryClient.invalidateQueries({ queryKey: ["progress"] });
    },
  });
  const result = savedAnswer?.result ?? answer.data;
  const checked = Boolean(result);
  const progress = total > 0 ? Math.round((index / total) * 100) : 0;
  return <section className="study-quiz panel">
    <div className="study-quiz-progress"><span>CÂU {question.question_number ?? question.id ?? index}</span><span>{index} / {total}</span></div>
    <div className="study-quiz-track"><span style={{ width: `${progress}%` }} /></div>
    {question.is_critical && <span className="study-critical-tag"><ShieldCheck size={14} /> CÂU ĐIỂM LIỆT</span>}
    <h1>{question.content}</h1>
    {question.image && <img className="question-image" src={resolveMediaUrl(question.image)} alt="Hình minh họa câu hỏi" />}
    <div className="study-answer-options">{question.answers.map((option, optionIndex) => {
      const optionKey = option.label ?? option.key ?? String(option.order ?? optionIndex + 1);
      const isCorrect = checked && result?.correct_options.includes(optionKey);
      const isIncorrect = checked && selected === optionKey && !result?.is_correct;
      return <button key={option.id ?? optionKey} className={`answer-option ${selected === optionKey ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isIncorrect ? "incorrect" : ""}`} onClick={() => !checked && onSelectionChange(questionId, index, optionKey)} disabled={checked}>
        <span className="answer-label">{option.label ?? option.key ?? String.fromCharCode(65 + optionIndex)}</span><span>{option.content ?? option.text}</span>{isCorrect && <CheckCircle2 size={18} />}{isIncorrect && <XCircle size={18} />}
      </button>;
    })}</div>
    {checked && result && <div className={`answer-feedback ${result.is_correct ? "feedback-correct" : "feedback-wrong"}`}><b>{result.is_correct ? "Chính xác!" : "Chưa chính xác"}</b><p>{result.explanation ?? question.explanation ?? "Đáp án đã được kiểm tra. Hiện chưa có phần giải thích cho câu hỏi này."}</p></div>}
    {answer.isError && <ApiNotice message={apiErrorMessage(answer.error)} />}
    <div className="study-quiz-actions">
      <button className="button button-outline" onClick={onPrevious} disabled={index <= 1}><ArrowLeft size={16} /> Câu trước</button>
      <div className="study-quiz-action-primary">
        {!checked && <button className="button button-dark" onClick={() => answer.mutate()} disabled={selected === null || answer.isPending}>{answer.isPending ? "Đang kiểm tra..." : "Kiểm tra đáp án"} <Check size={16} /></button>}
        <button className={checked ? "button button-dark" : "button button-outline"} onClick={onNext}>{index >= total ? "Hoàn thành" : "Câu tiếp"} <ArrowRight size={16} /></button>
      </div>
    </div>
  </section>;
}

function QuestionCard({ question }: { question: Question }) {
  const bookmark = useMutation({
    mutationFn: async () => (await api.post("/bookmarks/", { question_id: question.id })).data,
  });
  return <article className="question-card"><div className="question-card-top"><span className="question-num">CÂU {question.question_number ?? question.id}</span><button aria-label="Đánh dấu yêu thích" className="icon-button" onClick={() => bookmark.mutate()}><Bookmark size={17} /></button></div><Link to={`/study/questions/${question.id}`}><h3>{question.content}</h3></Link>{question.category && <span className="tag tag-soft">{question.category.name}</span>}<Link className="card-link" to={`/study/questions/${question.id}`}>Ôn tập câu này <ArrowRight size={14} /></Link></article>;
}

function QuestionPage() {
  const { id = "" } = useParams();
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const queryClient = useQueryClient();
  const question = useQuery({ queryKey: ["question", id], queryFn: async () => (await api.get<Question>(`/questions/${id}/`)).data });
  const answer = useMutation({
    mutationFn: async () => (await api.post("/study/answer/", { question_id: Number(id), selected_options: selected === null ? [] : [selected], attempt_mode: "practice" })).data as { is_correct?: boolean; correct_options?: string[]; explanation?: string | null },
    onSuccess: () => { setChecked(true); void queryClient.invalidateQueries({ queryKey: ["progress"] }); },
  });
  const data = question.data;
  if (question.isLoading) return <div className="page-content"><Skeleton height={350} /></div>;
  if (question.isError || !data) return <div className="page-content"><ApiNotice message="Không tìm thấy câu hỏi hoặc máy chủ chưa sẵn sàng." /></div>;
  return <div className="page-content"><Link to="/study" className="back-link"><ArrowLeft size={15} /> Về thư viện câu hỏi</Link><div className="question-layout"><section className="panel practice-panel"><div className="practice-progress"><span>CÂU {data.question_number ?? data.id}</span><span>Ôn tập</span></div><div className="practice-progress-track"><span style={{ width: "12%" }} /></div><h1>{data.content}</h1>{data.image && <img className="question-image" src={resolveMediaUrl(data.image)} alt="Hình minh họa câu hỏi" loading="lazy" />}<div className="answer-options">{data.answers.map((option, index) => { const optionId = option.label ?? option.key ?? String(option.order ?? index + 1); const correct = checked && answer.data?.correct_options?.includes(optionId); const incorrect = checked && selected === optionId && answer.data?.is_correct === false; return <button key={option.id ?? optionId} className={`answer-option ${selected === optionId ? "selected" : ""} ${correct ? "correct" : ""} ${incorrect ? "incorrect" : ""}`} onClick={() => !checked && setSelected(optionId)} disabled={checked}><span className="answer-label">{option.label ?? option.key ?? String.fromCharCode(65 + index)}</span><span>{option.content ?? option.text}</span>{correct && <CheckCircle2 size={18} />}{incorrect && <XCircle size={18} />}</button>; })}</div>
      {checked && <div className={`answer-feedback ${answer.data?.is_correct ? "feedback-correct" : "feedback-wrong"}`}><b>{answer.data?.is_correct ? "Chính xác!" : "Chưa chính xác"}</b>{(answer.data?.explanation ?? data.explanation) && <p>{answer.data?.explanation ?? data.explanation}</p>}{!answer.data?.explanation && !data.explanation && <p>Đáp án đã được kiểm tra. Hiện chưa có phần giải thích cho câu hỏi này.</p>}</div>}
      {answer.isError && <ApiNotice message={apiErrorMessage(answer.error)} />}
      <div className="practice-actions"><button onClick={() => setSelected(null)} className="button button-outline">Bỏ chọn</button>{!checked ? <button onClick={() => selected !== null && answer.mutate()} disabled={selected === null || answer.isPending} className="button button-dark">{answer.isPending ? "Đang kiểm tra..." : "Kiểm tra đáp án"} <Check size={16} /></button> : <Link to={`/study/questions/${Number(id) + 1}`} className="button button-dark">Câu tiếp theo <ArrowRight size={16} /></Link>}</div>
    </section><aside className="panel practice-aside"><div className="aside-icon"><Target size={19} /></div><h3>Học để hiểu, không chỉ để nhớ.</h3><p>Chọn đáp án bạn cho là đúng. Kết quả sẽ được lưu vào tiến độ học tập.</p><div className="aside-divider" /><div className="aside-row"><ShieldCheck size={16} /><span>Đáp án được kiểm tra từ máy chủ</span></div><Link to="/mistakes" className="aside-row"><CircleHelp size={16} /><span>Xem câu đã trả lời sai</span></Link><ReportForm questionId={data.id ?? Number(id)} /></aside></div></div>;
}

function ReportForm({ questionId }: { questionId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("wrong_answer");
  const [description, setDescription] = useState("");
  const report = useMutation({
    mutationFn: async () => api.post(`/questions/${questionId}/report/`, { reason, description }),
  });
  if (!open) return <button className="report-trigger" onClick={() => setOpen(true)}><Flag size={14} /> Báo lỗi câu hỏi</button>;
  return <div className="report-form"><label>Lý do<select value={reason} onChange={(event) => setReason(event.target.value)}><option value="wrong_answer">Đáp án có thể sai</option><option value="typo">Lỗi chính tả / câu chữ</option><option value="outdated">Có thể đã lỗi thời</option><option value="missing_image">Thiếu hoặc sai hình</option><option value="other">Lý do khác</option></select></label><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} placeholder="Mô tả thêm (không bắt buộc)" />{report.isError && <small className="field-error">{apiErrorMessage(report.error)}</small>}{report.isSuccess && <small className="success-message">Đã gửi báo cáo để quản trị viên xem xét.</small>}<div><button className="button button-outline button-small" onClick={() => setOpen(false)}>Đóng</button><button className="button button-dark button-small" disabled={report.isPending} onClick={() => report.mutate()}>{report.isPending ? "Đang gửi..." : "Gửi báo lỗi"}</button></div></div>;
}

function ExamHome() {
  const [selectedLicenseClassId, setSelectedLicenseClassId] = useState<number | null>(null);
  const licenseClasses = useQuery({
    queryKey: ["exam-license-classes"],
    queryFn: async () => {
      const response = await api.get<Page<LicenseClass> | LicenseClass[]>("/license-classes/", {
        params: { page_size: 100 },
      });
      return Array.isArray(response.data) ? response.data : response.data.results;
    },
    retry: false,
  });
  const configs = useQuery({
    queryKey: ["exam-configurations"],
    queryFn: async () => {
      const response = await api.get<Page<ExamConfiguration> | ExamConfiguration[]>("/exams/configurations/", {
        params: { page_size: 100 },
      });
      return Array.isArray(response.data) ? response.data : response.data.results;
    },
    retry: false,
  });
  const selectedLicenseClass = licenseClasses.data?.find((item) => item.id === selectedLicenseClassId);
  const selectedConfigs = (configs.data?.filter((config) => config.license_class === selectedLicenseClassId) ?? [])
    .sort((left, right) => left.name.localeCompare(right.name, "vi", { numeric: true }));
  const licenseClassGroups = [
    { title: "Hạng giấy phép mô tô", codes: ["A1", "A", "B1"] },
    { title: "Hạng giấy phép ô tô", codes: ["B", "C1", "C", "D1", "D2", "D"] },
    { title: "Hạng giấy phép kéo rơ moóc và kết hợp", codes: ["BE", "C1E", "CE", "DE", "D1E", "D2E"] },
  ];
  return <div className="page-content"><PageHeading eyebrow="LUYỆN TẬP CÓ THỜI GIAN" title="Thi thử" subtitle="Làm quen nhịp độ bài thi và kiểm tra mức độ sẵn sàng." />
    <div className="exam-intro panel"><div className="exam-intro-copy"><span className="exam-tag"><Clock3 size={14} /> MÔ PHỎNG BÀI THI</span><h2>Một lần thi thử,<br />thêm một lần tự tin.</h2><p>Mỗi phiên thi có thời gian, bộ câu hỏi và kết quả được quản lý bởi máy chủ.</p><div className="exam-facts"><span><FileText size={16} /> Cấu hình từ hệ thống</span><span><ShieldCheck size={16} /> Chấm điểm phía máy chủ</span></div></div><div className="exam-decoration"><div className="exam-ring"><Target size={43} /></div><div className="exam-badge"><Check size={16} /> Sẵn sàng</div></div></div>
    {licenseClasses.isLoading || configs.isLoading ? <Skeleton height={160} />
      : licenseClasses.isError ? <ApiNotice message="Không tải được danh sách hạng giấy phép. Vui lòng thử lại sau." />
        : configs.isError ? <ApiNotice message="Không tải được cấu hình thi. Vui lòng thử lại sau." />
          : selectedLicenseClass ? <>
            <div className="exam-license-selection-heading">
              <button className="study-back-button" onClick={() => setSelectedLicenseClassId(null)}><ArrowLeft size={15} /> Tất cả hạng giấy phép</button>
              <div><span className="exam-tag">HẠNG GIẤY PHÉP ĐÃ CHỌN</span><h2>{selectedLicenseClass.code} — {selectedLicenseClass.name}</h2><p>{selectedLicenseClass.description || "Chọn cấu hình đề thi để bắt đầu."}</p></div>
            </div>
            {selectedConfigs.length
              ? <div className="config-grid">{selectedConfigs.map((config) => <ExamConfigCard key={config.id} config={config} />)}</div>
              : <EmptyState icon={<FileText />} title="Chưa có đề thi cho hạng này" text="Quản trị viên cần thêm cấu hình thi trước khi có thể bắt đầu." />}
          </>
          : licenseClasses.data?.length
            ? <div className="exam-license-groups">{licenseClassGroups.map((group) => {
              const groupedClasses = licenseClasses.data?.filter((item) => group.codes.includes(item.code)) ?? [];
              if (!groupedClasses.length) return null;
              return <section className="exam-license-group" key={group.title} aria-labelledby={`license-group-${group.codes[0]}`}>
                <h2 id={`license-group-${group.codes[0]}`}>{group.title}</h2>
                <div className="exam-license-grid">{groupedClasses.map((licenseClass) => {
                  const classConfigs = configs.data?.filter((config) => config.license_class === licenseClass.id) ?? [];
                  return <button
                    type="button"
                    className="exam-license-card"
                    key={licenseClass.id}
                    onClick={() => setSelectedLicenseClassId(licenseClass.id)}
                    aria-label={`Chọn hạng ${licenseClass.code} ${licenseClass.name}`}
                  >
                    <span className="exam-license-card-icon"><FileText size={19} /></span>
                    <span className="exam-license-card-code">{licenseClass.code}</span>
                    <b>{licenseClass.name}</b>
                    <small>{licenseClass.description || "Giấy phép lái xe"}</small>
                    <span className={`exam-license-card-count ${classConfigs.length ? "" : "unavailable"}`}>
                      {classConfigs.length ? `${classConfigs.length} đề thi` : "Chưa có đề thi"}
                      <ArrowRight size={14} />
                    </span>
                  </button>;
                })}</div>
              </section>;
            })}</div>
            : <EmptyState icon={<FileText />} title="Chưa có hạng giấy phép" text="Danh sách hạng giấy phép hiện chưa có dữ liệu." />}
  </div>;
}

function ExamConfigCard({ config }: { config: ExamConfiguration }) {
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: async () => (await api.post<ExamSession>("/exams/sessions/", { configuration_id: config.id })).data,
    onSuccess: (session) => navigate(`/exam/session/${session.id}`),
  });
  return <div className="config-card"><span className="config-icon"><FileText size={18} /></span><div><h3>{config.name}</h3><p>{config.license_class_code ?? "Hạng GPLX"} · {config.question_count} câu · {config.duration_seconds == null ? "Chưa cài thời gian" : `${Math.ceil(config.duration_seconds / 60)} phút`}</p></div><span className="pass-mark">{config.passing_score == null ? "Chưa cài điểm đạt" : `Đạt từ ${config.passing_score}`}</span><button className="button button-dark" disabled={mutation.isPending || config.duration_seconds == null || config.passing_score == null} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang tạo đề..." : "Bắt đầu thi"} <ArrowRight size={15} /></button>{mutation.isError && <small className="field-error">{apiErrorMessage(mutation.error)}</small>}</div>;
}

function ExamPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const submittedRef = useRef(false);
  const restoredRef = useRef(false);
  const sessionQuery = useQuery({ queryKey: ["exam-session", sessionId], queryFn: async () => (await api.get<ExamSession>(`/exams/sessions/${sessionId}/`)).data, retry: false });
  const session = sessionQuery.data;
  const questions = session?.questions ?? [];
  useEffect(() => {
    if (session && !restoredRef.current) {
      setAnswers(Object.fromEntries(Object.entries(session.answers ?? {}).map(([questionId, key]) => [Number(questionId), key])));
      restoredRef.current = true;
    }
  }, [session]);
  useEffect(() => {
    if (!session?.expires_at) return;
    const tick = () => setRemaining(Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session?.expires_at]);
  const submit = useMutation({
    mutationFn: async (): Promise<ExamResult> => {
      try {
        await api.put(`/exams/sessions/${sessionId}/answers/`, { answers });
      } catch (error) {
        if (!isConflictError(error)) throw error;
        const finalized = (await api.get<ExamSession>(`/exams/sessions/${sessionId}/`)).data.result;
        if (finalized?.attempt_id) return finalized;
        throw new Error("Phiên thi đã kết thúc nhưng chưa có kết quả để hiển thị.");
      }
      return (await api.post<ExamResult>(`/exams/sessions/${sessionId}/submit/`)).data;
    },
    onSuccess: (result) => {
      submittedRef.current = true;
      void queryClient.invalidateQueries({ queryKey: ["history"] });
      navigate(`/exam/result/${result.attempt_id}`, { replace: true });
    },
  });
  const saveAnswers = useMutation({
    mutationFn: async (updated: Record<number, string>) => api.put(
      `/exams/sessions/${sessionId}/answers/`,
      { answers: updated },
    ),
  });
  useEffect(() => {
    if (remaining === 0 && session?.status === "in_progress" && !submittedRef.current && !submit.isPending) {
      submittedRef.current = true;
      submit.mutate();
    }
  }, [remaining, session?.status, submit.isPending]);
  if (sessionQuery.isLoading) return <div className="page-center"><div className="spinner" /></div>;
  if (sessionQuery.isError || !session) return <div className="page-content"><ApiNotice message="Không thể khôi phục phiên thi này. Hãy kiểm tra lịch sử thi hoặc bắt đầu đề mới." /><Link className="button button-dark" to="/exam">Về trang thi thử</Link></div>;
  if (session.status !== "in_progress" && session.result?.attempt_id) return <Navigate to={`/exam/result/${session.result.attempt_id}`} replace />;
  if (!questions.length) return <div className="page-content"><ApiNotice message="Phiên thi không có câu hỏi. Hãy kiểm tra cấu hình với quản trị viên." /><Link className="button button-dark" to="/exam">Về trang thi thử</Link></div>;
  const question = questions[current];
  const questionId = question.question_id ?? question.id;
  if (questionId === undefined) return <div className="page-content"><ApiNotice message="Dữ liệu câu hỏi trong phiên thi không hợp lệ." /><Link className="button button-dark" to="/exam">Về trang thi thử</Link></div>;
  const mm = remaining === null ? "--" : String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = remaining === null ? "--" : String(remaining % 60).padStart(2, "0");
  const choose = (answerKey: string) => {
    const updated = { ...answers, [questionId]: answerKey };
    setAnswers(updated);
    saveAnswers.mutate(updated);
  };
  return <div className="exam-page"><header className="exam-top"><Link to="/exam" className="brand"><span className="brand-mark"><GraduationCap size={20} /></span><span>vững<span className="brand-light">tay</span>lái</span></Link><div className="exam-top-center"><b>{session.configuration?.name ?? "Bài thi thử"}</b><span>{questions.length} câu hỏi</span></div><div className={`timer ${remaining !== null && remaining < 60 ? "timer-low" : ""}`}><Clock3 size={17} /><span>{mm}:{ss}</span></div></header>
    <div className="exam-progress"><span style={{ width: `${((current + 1) / questions.length) * 100}%` }} /></div>
    <div className="exam-body"><div className="exam-question-area"><div className="exam-question-meta"><span>CÂU {current + 1} / {questions.length}</span><span className="tag tag-soft">Chọn một đáp án</span></div><h1>{question.content}</h1>{question.image && <img className="question-image exam-image" src={resolveMediaUrl(question.image)} alt="Hình minh họa câu hỏi" loading="lazy" />}<div className="answer-options">{question.answers.map((option, index) => { const answerKey = option.key ?? option.label ?? String(option.order ?? index + 1); return <button key={answerKey} className={`answer-option ${answers[questionId] === answerKey ? "selected" : ""}`} onClick={() => choose(answerKey)}><span className="answer-label">{option.key ?? option.label ?? String.fromCharCode(65 + index)}</span><span>{option.text ?? option.content}</span></button>; })}</div><div className="exam-nav-buttons"><button disabled={current === 0} className="button button-outline" onClick={() => setCurrent(current - 1)}><ArrowLeft size={15} /> Câu trước</button><button className="button button-outline" onClick={() => setCurrent(Math.min(current + 1, questions.length - 1))}>Câu tiếp <ArrowRight size={15} /></button></div></div>
      <aside className="exam-question-nav panel"><div className="panel-heading"><div><h2>Danh sách câu</h2><p>{Object.keys(answers).length} / {questions.length} đã trả lời</p></div></div><div className="number-grid">{questions.map((item, index) => { const itemId = item.question_id ?? item.id; return <button key={itemId ?? index} className={`${current === index ? "current" : ""} ${itemId !== undefined && answers[itemId] ? "answered" : ""}`} onClick={() => setCurrent(index)}>{index + 1}</button>; })}</div><div className="legend"><span><i className="legend-current" /> Đang xem</span><span><i className="legend-answered" /> Đã trả lời</span><span><i /> Chưa trả lời</span></div><button onClick={() => setConfirm(true)} disabled={submit.isPending} className="button button-dark button-full">{submit.isPending ? "Đang nộp bài..." : "Nộp bài thi"} <ArrowRight size={15} /></button>{saveAnswers.isError && <small className="field-error">{apiErrorMessage(saveAnswers.error)}</small>}{submit.isError && <small className="field-error">{apiErrorMessage(submit.error)}</small>}</aside></div>
    {confirm && <div className="modal-backdrop"><div className="confirm-modal"><button className="icon-button modal-close" onClick={() => setConfirm(false)}><X size={17} /></button><span className="modal-icon"><Flag size={19} /></span><h2>Nộp bài thi?</h2><p>Bạn đã trả lời {Object.keys(answers).length} trên {questions.length} câu. Câu bỏ trống vẫn được tính vào kết quả.</p><div className="modal-actions"><button className="button button-outline" onClick={() => setConfirm(false)}>Tiếp tục làm bài</button><button className="button button-dark" onClick={() => submit.mutate()}>Nộp bài <ArrowRight size={15} /></button></div></div></div>}
  </div>;
}

function ResultPage() {
  const { attemptId = "" } = useParams();
  const result = useQuery({ queryKey: ["exam-result", attemptId], queryFn: async () => (await api.get<ExamResult>(`/exams/results/${attemptId}/`)).data });
  if (result.isLoading) return <div className="page-center"><div className="spinner" /></div>;
  if (result.isError || !result.data) return <div className="page-content"><ApiNotice message="Không tải được kết quả bài thi." /></div>;
  const data = result.data;
  return <div className="page-content"><div className={`result-hero panel ${data.passed ? "result-pass" : "result-fail"}`}><div className="result-icon">{data.passed ? <CheckCircle2 size={29} /> : <XCircle size={29} />}</div><span className="eyebrow">{data.passed ? "HOÀN THÀNH TỐT" : "TIẾP TỤC CỐ GẮNG"}</span><h1>{data.passed ? "Bạn đã đạt!" : "Chưa đạt lần này"}</h1><p>Kết quả được chấm và lưu trên máy chủ.</p><div className="score-number">{data.score}<small> điểm</small></div><div className="result-counts"><span><CheckCircle2 size={16} /> {data.correct_count} đúng</span><span><XCircle size={16} /> {data.wrong_count} sai</span><span>{data.unanswered_count} bỏ trống</span></div>{data.critical_failure && <div className="alert alert-error">Không đạt do trả lời sai câu điểm liệt.</div>}<div className="result-actions"><Link to="/exam" className="button button-dark">Làm đề mới <ArrowRight size={15} /></Link><Link to="/dashboard" className="button button-outline">Về tổng quan</Link></div></div>
    <section className="panel result-review"><div className="panel-heading"><div><h2>Ôn lại câu hỏi</h2><p>Kiểm tra đáp án sau khi hoàn thành bài thi</p></div></div>{data.questions?.length ? data.questions.map((q, index) => <div className="result-question" key={q.question_id ?? index}><b>Câu {q.question_number ?? index + 1}. {q.content}</b><div className="result-answer-list">{q.answers.map((option: AnswerOption, answerIndex) => { const key = option.key ?? option.label ?? ""; const selected = q.selected_key === key; const correct = q.correct_keys?.includes(key); return <p className={correct ? "result-answer-correct" : selected ? "result-answer-wrong" : ""} key={`${key}-${answerIndex}`}>{selected ? "Bạn chọn: " : correct ? "Đáp án đúng: " : ""}{option.text ?? option.content}</p>; })}</div><p>{q.explanation ?? "Phần giải thích chưa được cung cấp trong bộ dữ liệu."}</p></div>) : <EmptyState icon={<BookOpen />} title="Chi tiết câu hỏi không khả dụng" text="Kết quả tổng hợp đã được lưu. Hãy liên hệ quản trị viên nếu cần xem lại đáp án." />}</section></div>;
}

function History() {
  const [page, setPage] = useState(1);
  const history = useQuery({ queryKey: ["history", page], queryFn: async () => (await api.get<Page<ExamResult>>("/exams/history/", { params: { page, page_size: 10 } })).data, retry: false });
  return <div className="page-content"><PageHeading eyebrow="HÀNH TRÌNH CỦA BẠN" title="Lịch sử thi" subtitle="Xem lại kết quả các bài thi đã hoàn thành." />
    <section className="panel history-panel">{history.isLoading ? <Skeleton height={180} /> : history.isError ? <ApiNotice message="Không tải được lịch sử thi." /> : history.data?.results.length ? <><div className="history-list">{history.data.results.map((item) => <Link className="history-row" to={`/exam/result/${item.attempt_id}`} key={item.attempt_id}><span className={`history-status ${item.passed ? "passed" : "failed"}`}>{item.passed ? <Check size={16} /> : <X size={16} />}</span><span><b>{item.score} điểm</b><small>{item.started_at ? new Date(item.started_at).toLocaleString("vi-VN") : "Bài thi thử"}</small></span><span className={`tag ${item.passed ? "tag-green" : "tag-red"}`}>{item.passed ? "Đạt" : "Chưa đạt"}</span><ArrowRight size={16} /></Link>)}</div><div className="pagination"><button className="button button-outline button-small" disabled={!history.data.previous || page <= 1} onClick={() => setPage(page - 1)}>Trước</button><span>Trang {page}</span><button className="button button-outline button-small" disabled={!history.data.next} onClick={() => setPage(page + 1)}>Tiếp</button></div></> : <EmptyState icon={<Clock3 />} title="Chưa có bài thi nào" text="Sau khi hoàn thành một đề thi, kết quả sẽ xuất hiện tại đây." action={<Link className="text-link" to="/exam">Thi thử ngay <ArrowRight size={14} /></Link>} />}</section>
  </div>;
}

function SavedQuestions({ mode }: { mode: "bookmarks" | "mistakes" }) {
  const endpoint = mode === "bookmarks" ? "/bookmarks/" : "/study/mistakes/";
  const saved = useQuery({ queryKey: [mode], queryFn: async () => (await api.get<Page<Question>>(endpoint)).data, retry: false });
  const title = mode === "bookmarks" ? "Câu hỏi yêu thích" : "Câu cần ôn lại";
  return <div className="page-content"><PageHeading eyebrow="ÔN TẬP CÁ NHÂN" title={title} subtitle={mode === "bookmarks" ? "Những câu hỏi bạn đã lưu để xem lại." : "Ôn lại câu hỏi bạn từng trả lời chưa chính xác."} action={<Link to="/study" className="button button-outline"><BookOpen size={16} /> Tìm câu hỏi</Link>} />
    {saved.isLoading ? <QuestionSkeleton /> : saved.isError ? <ApiNotice message={`Không tải được ${title.toLowerCase()}.`} /> : saved.data?.results.length ? <div className="question-grid">{saved.data.results.map((question) => <QuestionCard key={question.id} question={question} />)}</div> : <EmptyState icon={mode === "bookmarks" ? <Bookmark /> : <CircleHelp />} title={mode === "bookmarks" ? "Bạn chưa lưu câu hỏi nào" : "Chưa có câu trả lời sai"} text={mode === "bookmarks" ? "Nhấn biểu tượng dấu trang khi ôn tập để lưu câu hỏi." : "Hãy luyện tập để hệ thống ghi nhận câu cần ôn lại."} action={<Link className="text-link" to="/study">Bắt đầu ôn tập <ArrowRight size={14} /></Link>} />}
  </div>;
}

function Profile() {
  const user = useCurrentUser();
  const [message, setMessage] = useState("");
  const update = useMutation({
    mutationFn: async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      return (await api.patch("/auth/me/", { first_name: form.get("first_name"), last_name: form.get("last_name"), email: form.get("email") })).data;
    },
    onSuccess: () => setMessage("Thông tin đã được cập nhật."),
    onError: (error) => setMessage(apiErrorMessage(error)),
  });
  return <div className="page-content"><PageHeading eyebrow="TÀI KHOẢN" title="Hồ sơ cá nhân" subtitle="Quản lý thông tin tài khoản học tập của bạn." /><div className="profile-layout"><div className="profile-forms"><section className="panel profile-panel"><div className="profile-heading"><span className="avatar profile-avatar">{(user.data?.username ?? "H").charAt(0).toUpperCase()}</span><div><h2>{user.data?.username ?? "Học viên"}</h2><p>{user.data?.email}</p></div></div><form className="form-stack" onSubmit={(event) => update.mutate(event)}><label>Tên<input name="first_name" defaultValue={user.data?.first_name} /></label><label>Họ<input name="last_name" defaultValue={user.data?.last_name} /></label><label>Email<input type="email" name="email" defaultValue={user.data?.email} /></label>{message && <div className={`alert ${update.isError ? "alert-error" : "alert-info"}`}>{message}</div>}<button className="button button-dark" disabled={update.isPending}>Lưu thay đổi <Check size={16} /></button></form></section><PasswordChangeForm /></div><aside className="panel practice-aside"><ShieldCheck size={23} /><h3>Tài khoản của riêng bạn</h3><p>Tiến độ, câu yêu thích và lịch sử thi được gắn với tài khoản đăng nhập của bạn.</p></aside></div></div>;
}

const passwordSchema = z.object({
  old_password: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
  new_password: z.string().min(8, "Mật khẩu mới cần ít nhất 8 ký tự"),
  confirm_password: z.string().min(1, "Vui lòng xác nhận mật khẩu mới"),
}).refine((values) => values.new_password === values.confirm_password, {
  path: ["confirm_password"],
  message: "Hai mật khẩu mới không khớp",
});
type PasswordValues = z.infer<typeof passwordSchema>;

function PasswordChangeForm() {
  const [message, setMessage] = useState("");
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
  });
  const change = useMutation({
    mutationFn: async (values: PasswordValues) => api.post("/auth/password/change/", {
      old_password: values.old_password,
      new_password: values.new_password,
    }),
    onSuccess: () => {
      setMessage("Mật khẩu đã được cập nhật.");
      reset();
    },
    onError: (error) => setMessage(apiErrorMessage(error)),
  });
  return <section className="panel profile-panel"><div className="panel-heading"><div><h2>Đổi mật khẩu</h2><p>Chọn mật khẩu mới tối thiểu 8 ký tự.</p></div></div><form className="form-stack" onSubmit={handleSubmit((values) => change.mutate(values))}><label>Mật khẩu hiện tại<input type="password" autoComplete="current-password" {...register("old_password")} />{errors.old_password && <small className="field-error">{errors.old_password.message}</small>}</label><label>Mật khẩu mới<input type="password" autoComplete="new-password" {...register("new_password")} />{errors.new_password && <small className="field-error">{errors.new_password.message}</small>}</label><label>Nhập lại mật khẩu mới<input type="password" autoComplete="new-password" {...register("confirm_password")} />{errors.confirm_password && <small className="field-error">{errors.confirm_password.message}</small>}</label>{message && <div className={`alert ${change.isError ? "alert-error" : "alert-info"}`}>{message}</div>}<button className="button button-dark" disabled={change.isPending}>{change.isPending ? "Đang cập nhật..." : "Cập nhật mật khẩu"} <Check size={16} /></button></form></section>;
}

function ApiNotice({ message }: { message: string }) {
  return <div className="api-notice"><span className="notice-icon"><CircleHelp size={18} /></span><span>{message}</span></div>;
}

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function Skeleton({ height = 100 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-label="Đang tải dữ liệu"><span /><span /><span /></div>;
}

function QuestionSkeleton() {
  return <div className="question-grid">{[0, 1, 2, 3].map((key) => <Skeleton key={key} height={180} />)}</div>;
}

export default App;
