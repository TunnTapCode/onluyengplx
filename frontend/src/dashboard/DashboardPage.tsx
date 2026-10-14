import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, FileText, Target, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, getTokens } from "../api";
import type { Page } from "../api";
import { ApiNotice, EmptyState, PageHeading, Skeleton } from "../shared/Shared";

function useProgress() {
  return useQuery({
    queryKey: ["progress"],
    queryFn: async () => (await api.get<Record<string, unknown>>("/study/progress/")).data,
    retry: false,
    enabled: Boolean(getTokens()),
  });
}

export function Dashboard() {
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
