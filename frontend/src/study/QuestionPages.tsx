import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookOpen, Bookmark, Check, CheckCircle2, CircleHelp, Flag, ShieldCheck, Target, XCircle } from "lucide-react";
import { api, apiErrorMessage, resolveMediaUrl } from "../api";
import type { Page, Question } from "../api";
import { ApiNotice, EmptyState, PageHeading, QuestionSkeleton, Skeleton } from "../shared/Shared";

function QuestionCard({ question }: { question: Question }) {
  const bookmark = useMutation({
    mutationFn: async () => (await api.post("/bookmarks/", { question_id: question.id })).data,
  });
  return <article className="question-card"><div className="question-card-top"><span className="question-num">CÂU {question.question_number ?? question.id}</span><button aria-label="Đánh dấu yêu thích" className="icon-button" onClick={() => bookmark.mutate()}><Bookmark size={17} /></button></div><Link to={`/study/questions/${question.id}`}><h3>{question.content}</h3></Link>{question.category && <span className="tag tag-soft">{question.category.name}</span>}<Link className="card-link" to={`/study/questions/${question.id}`}>Ôn tập câu này <ArrowRight size={14} /></Link></article>;
}

export function QuestionPage() {
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

export function SavedQuestions({ mode }: { mode: "bookmarks" | "mistakes" }) {
  const endpoint = mode === "bookmarks" ? "/bookmarks/" : "/study/mistakes/";
  const saved = useQuery({ queryKey: [mode], queryFn: async () => (await api.get<Page<Question>>(endpoint)).data, retry: false });
  const title = mode === "bookmarks" ? "Câu hỏi yêu thích" : "Câu cần ôn lại";
  return <div className="page-content"><PageHeading eyebrow="ÔN TẬP CÁ NHÂN" title={title} subtitle={mode === "bookmarks" ? "Những câu hỏi bạn đã lưu để xem lại." : "Ôn lại câu hỏi bạn từng trả lời chưa chính xác."} action={<Link to="/study" className="button button-outline"><BookOpen size={16} /> Tìm câu hỏi</Link>} />
    {saved.isLoading ? <QuestionSkeleton /> : saved.isError ? <ApiNotice message={`Không tải được ${title.toLowerCase()}.`} /> : saved.data?.results.length ? <div className="question-grid">{saved.data.results.map((question) => <QuestionCard key={question.id} question={question} />)}</div> : <EmptyState icon={mode === "bookmarks" ? <Bookmark /> : <CircleHelp />} title={mode === "bookmarks" ? "Bạn chưa lưu câu hỏi nào" : "Chưa có câu trả lời sai"} text={mode === "bookmarks" ? "Nhấn biểu tượng dấu trang khi ôn tập để lưu câu hỏi." : "Hãy luyện tập để hệ thống ghi nhận câu cần ôn lại."} action={<Link className="text-link" to="/study">Bắt đầu ôn tập <ArrowRight size={14} /></Link>} />}
  </div>;
}
