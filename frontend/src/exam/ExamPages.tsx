import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, FileText, Flag, GraduationCap, ShieldCheck, Target, X, XCircle } from "lucide-react";
import { api, apiErrorMessage, getTokens, isConflictError, resolveMediaUrl } from "../api";
import type { ExamConfiguration, ExamConfigurationProgress, ExamResult, ExamSession, LicenseClass, Page } from "../api";
import { ApiNotice, EmptyState, PageHeading, Skeleton } from "../shared/Shared";

export function ExamHome() {
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
  const examProgress = useQuery({
    queryKey: ["exam-configuration-progress"],
    queryFn: async () => (await api.get<ExamConfigurationProgress[]>("/exams/progress/")).data,
    enabled: Boolean(getTokens()),
    retry: false,
  });
  const selectedLicenseClass = licenseClasses.data?.find((item) => item.id === selectedLicenseClassId);
  const examProgressByConfiguration = new Map(
    (examProgress.data ?? []).map((item) => [item.configuration_id, item]),
  );
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
              ? <>
                {examProgress.isError && <ApiNotice message="Không tải được trạng thái các đề đã làm." />}
                <div className="config-grid">{selectedConfigs.map((config) => <ExamConfigCard
                  key={config.id}
                  config={config}
                  progress={examProgressByConfiguration.get(config.id)}
                />)}</div>
              </>
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

function ExamConfigCard({ config, progress }: { config: ExamConfiguration; progress?: ExamConfigurationProgress }) {
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: async () => (await api.post<ExamSession>("/exams/sessions/", { configuration_id: config.id })).data,
    onSuccess: (session) => navigate(`/exam/session/${session.id}`),
  });
  return <div className="config-card"><span className="config-icon"><FileText size={18} /></span><div><h3>{config.name}</h3><p>{config.license_class_code ?? "Hạng GPLX"} · {config.question_count} câu · {config.duration_seconds == null ? "Chưa cài thời gian" : `${Math.ceil(config.duration_seconds / 60)} phút`}</p></div><div className="config-card-status">{progress && <span className={`config-attempt-status ${progress.passed ? "passed" : "failed"}`}>{progress.passed ? "Đã làm · Đạt" : "Đã làm · Chưa đạt"} · {progress.score} điểm</span>}<span className="pass-mark">{config.passing_score == null ? "Chưa cài điểm đạt" : `Đạt từ ${config.passing_score}`}</span></div><button className="button button-dark" disabled={mutation.isPending || config.duration_seconds == null || config.passing_score == null} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang tạo đề..." : progress ? "Làm lại" : "Bắt đầu thi"} <ArrowRight size={15} /></button>{mutation.isError && <small className="field-error">{apiErrorMessage(mutation.error)}</small>}</div>;
}

export function ExamPage() {
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
      void queryClient.invalidateQueries({ queryKey: ["exam-configuration-progress"] });
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
    <div className="exam-body"><div className="exam-question-area"><div className="exam-question-meta"><span>CÂU {current + 1} / {questions.length}</span><div className="exam-question-tags">{question.is_critical && <span className="tag exam-critical-tag"><ShieldCheck size={13} /> CÂU ĐIỂM LIỆT</span>}<span className="tag tag-soft">Chọn một đáp án</span></div></div><h1>{question.content}</h1>{question.image && <img className="question-image exam-image" src={resolveMediaUrl(question.image)} alt="Hình minh họa câu hỏi" loading="lazy" />}<div className="answer-options">{question.answers.map((option, index) => { const answerKey = option.key ?? option.label ?? String(option.order ?? index + 1); return <button key={answerKey} className={`answer-option ${answers[questionId] === answerKey ? "selected" : ""}`} onClick={() => choose(answerKey)}><span className="answer-label">{option.key ?? option.label ?? String.fromCharCode(65 + index)}</span><span>{option.text ?? option.content}</span></button>; })}</div><div className="exam-nav-buttons"><button disabled={current === 0} className="button button-outline" onClick={() => setCurrent(current - 1)}><ArrowLeft size={15} /> Câu trước</button><button className="button button-outline" onClick={() => setCurrent(Math.min(current + 1, questions.length - 1))}>Câu tiếp <ArrowRight size={15} /></button></div></div>
      <aside className="exam-question-nav panel"><div className="panel-heading"><div><h2>Danh sách câu</h2><p>{Object.keys(answers).length} / {questions.length} đã trả lời</p></div></div><div className="number-grid">{questions.map((item, index) => { const itemId = item.question_id ?? item.id; const answered = itemId !== undefined && Boolean(answers[itemId]); return <button key={itemId ?? index} className={`${current === index ? "current" : ""} ${answered ? "answered" : ""} ${item.is_critical ? "critical" : ""}`} aria-label={`Câu ${index + 1}${item.is_critical ? ", điểm liệt" : ""}${answered ? ", đã trả lời" : ", chưa trả lời"}`} title={item.is_critical ? `Câu ${index + 1} · Câu điểm liệt` : `Câu ${index + 1}`} onClick={() => setCurrent(index)}>{index + 1}</button>; })}</div><div className="legend"><span><i className="legend-current" /> Đang xem</span><span><i className="legend-answered" /> Đã trả lời</span><span><i className="legend-critical" /> Câu điểm liệt</span><span><i /> Chưa trả lời</span></div><button onClick={() => setConfirm(true)} disabled={submit.isPending} className="button button-dark button-full">{submit.isPending ? "Đang nộp bài..." : "Nộp bài thi"} <ArrowRight size={15} /></button>{saveAnswers.isError && <small className="field-error">{apiErrorMessage(saveAnswers.error)}</small>}{submit.isError && <small className="field-error">{apiErrorMessage(submit.error)}</small>}</aside></div>
    {confirm && <div className="modal-backdrop"><div className="confirm-modal"><button className="icon-button modal-close" onClick={() => setConfirm(false)}><X size={17} /></button><span className="modal-icon"><Flag size={19} /></span><h2>Nộp bài thi?</h2><p>Bạn đã trả lời {Object.keys(answers).length} trên {questions.length} câu. Câu bỏ trống vẫn được tính vào kết quả.</p><div className="modal-actions"><button className="button button-outline" onClick={() => setConfirm(false)}>Tiếp tục làm bài</button><button className="button button-dark" onClick={() => submit.mutate()}>Nộp bài <ArrowRight size={15} /></button></div></div></div>}
  </div>;
}

export function ResultPage() {
  const { attemptId = "" } = useParams();
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number | null>(null);
  const result = useQuery({ queryKey: ["exam-result", attemptId], queryFn: async () => (await api.get<ExamResult>(`/exams/results/${attemptId}/`)).data });
  useEffect(() => {
    if (selectedQuestionIndex === null) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedQuestionIndex(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedQuestionIndex]);
  if (result.isLoading) return <div className="page-center"><div className="spinner" /></div>;
  if (result.isError || !result.data) return <div className="page-content"><ApiNotice message="Không tải được kết quả bài thi." /></div>;
  const data = result.data;
  const questions = data.questions ?? [];
  const selectedQuestion = selectedQuestionIndex === null ? null : questions[selectedQuestionIndex] ?? null;
  return <div className="page-content result-layout">
    <section className={`result-hero panel ${data.passed ? "result-pass" : "result-fail"}`}>
      <div className="result-icon">{data.passed ? <CheckCircle2 size={29} /> : <XCircle size={29} />}</div>
      <span className="eyebrow">{data.passed ? "HOÀN THÀNH TỐT" : "TIẾP TỤC CỐ GẮNG"}</span>
      <h1>{data.passed ? "Bạn đã đạt!" : "Chưa đạt lần này"}</h1>
      <p>Kết quả được chấm và lưu trên máy chủ.</p>
      <div className="score-number">{data.score}/{data.correct_count + data.wrong_count}<small> điểm</small></div>
      <div className="result-counts">
        <span><CheckCircle2 size={16} /> {data.correct_count} đúng</span>
        <span><XCircle size={16} /> {data.wrong_count} sai</span>
        <span>{data.unanswered_count} bỏ trống</span>
      </div>
      {data.critical_failure && <div className="alert alert-error">Không đạt do trả lời sai câu điểm liệt.</div>}
      <div className="result-actions">
        <Link to="/exam" className="button button-dark">Làm đề mới <ArrowRight size={15} /></Link>
        <Link to="/dashboard" className="button button-outline">Về tổng quan</Link>
      </div>
    </section>
    <aside className="exam-question-nav result-question-nav panel" aria-label="Kết quả từng câu">
      <div className="panel-heading">
        <div>
          <h2>Danh sách câu</h2>
          <p>{data.correct_count} đúng · {data.wrong_count} sai · {data.unanswered_count} bỏ trống</p>
        </div>
      </div>
      {questions.length
        ? <>
          <div className="number-grid result-number-grid" role="list" aria-label="Trạng thái từng câu hỏi">
            {questions.map((question, index) => {
              const status = question.selected_key == null
                ? "unanswered"
                : question.is_correct
                  ? "correct"
                  : "incorrect";
              const label = status === "correct" ? "Đúng" : status === "incorrect" ? "Sai" : "Bỏ trống";
              return <button
                type="button"
                className={`result-question-number result-${status}`}
                key={question.question_id ?? index}
                aria-label={`Câu ${index + 1}: ${label}`}
                title={`Câu ${index + 1}: ${label}`}
                onClick={() => setSelectedQuestionIndex(index)}
              >{index + 1}</button>;
            })}
          </div>
          <div className="legend">
            <span><i className="legend-result-correct" /> Đúng</span>
            <span><i className="legend-result-incorrect" /> Sai</span>
            <span><i /> Bỏ trống</span>
          </div>
        </>
        : <p className="result-no-questions">Không có danh sách câu hỏi cho kết quả này.</p>}
    </aside>
    {selectedQuestion && selectedQuestionIndex !== null && <div
      className="modal-backdrop exam-review-backdrop"
      onClick={() => setSelectedQuestionIndex(null)}
    >
      <section
        className="exam-review-modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-review-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button modal-close"
          aria-label="Đóng xem lại câu hỏi"
          onClick={() => setSelectedQuestionIndex(null)}
        ><X size={17} /></button>
        <div className="exam-review-heading">
          <span className={`tag ${selectedQuestion.selected_key == null ? "tag-soft" : selectedQuestion.is_correct ? "tag-green" : "tag-red"}`}>
            {selectedQuestion.selected_key == null ? "Bỏ trống" : selectedQuestion.is_correct ? "Trả lời đúng" : "Trả lời sai"}
          </span>
          <h2 id="exam-review-title">Câu {selectedQuestionIndex + 1}</h2>
        </div>
        <p className="exam-review-question">{selectedQuestion.content}</p>
        {selectedQuestion.image && <img
          className="question-image exam-review-image"
          src={resolveMediaUrl(selectedQuestion.image)}
          alt="Hình minh họa câu hỏi"
        />}
        <div className="answer-options exam-review-options">
          {selectedQuestion.answers.map((option, index) => {
            const key = option.key ?? option.label ?? String(option.order ?? index + 1);
            const isSelected = selectedQuestion.selected_key === key;
            const isCorrect = selectedQuestion.correct_keys?.includes(key) ?? false;
            return <div
              className={`answer-option exam-review-option ${isCorrect ? "correct" : isSelected ? "incorrect" : ""}`}
              key={key}
            >
              <span className="answer-label">{option.key ?? option.label ?? String.fromCharCode(65 + index)}</span>
              <span>{option.text ?? option.content}</span>
              {isCorrect && <strong>Đáp án đúng</strong>}
              {isSelected && <strong>{isCorrect ? "Bạn đã chọn" : "Bạn chọn"}</strong>}
            </div>;
          })}
        </div>
        {selectedQuestion.explanation && <p className="exam-review-explanation">{selectedQuestion.explanation}</p>}
      </section>
    </div>}
  </div>;
}

export function History() {
  const [page, setPage] = useState(1);
  const history = useQuery({ queryKey: ["history", page], queryFn: async () => (await api.get<Page<ExamResult>>("/exams/history/", { params: { page, page_size: 10 } })).data, retry: false });
  return <div className="page-content"><PageHeading eyebrow="HÀNH TRÌNH CỦA BẠN" title="Lịch sử thi" subtitle="Xem lại kết quả các bài thi đã hoàn thành." />
    <section className="panel history-panel">{history.isLoading ? <Skeleton height={180} /> : history.isError ? <ApiNotice message="Không tải được lịch sử thi." /> : history.data?.results.length ? <><div className="history-list">{history.data.results.map((item) => <Link className="history-row" to={`/exam/result/${item.attempt_id}`} key={item.attempt_id}><span className={`history-status ${item.passed ? "passed" : "failed"}`}>{item.passed ? <Check size={16} /> : <X size={16} />}</span><span><b>{item.score} điểm</b><small>{item.started_at ? new Date(item.started_at).toLocaleString("vi-VN") : "Bài thi thử"}</small></span><span className={`tag ${item.passed ? "tag-green" : "tag-red"}`}>{item.passed ? "Đạt" : "Chưa đạt"}</span><ArrowRight size={16} /></Link>)}</div><div className="pagination"><button className="button button-outline button-small" disabled={!history.data.previous || page <= 1} onClick={() => setPage(page - 1)}>Trước</button><span>Trang {page}</span><button className="button button-outline button-small" disabled={!history.data.next} onClick={() => setPage(page + 1)}>Tiếp</button></div></> : <EmptyState icon={<Clock3 />} title="Chưa có bài thi nào" text="Sau khi hoàn thành một đề thi, kết quả sẽ xuất hiện tại đây." action={<Link className="text-link" to="/exam">Thi thử ngay <ArrowRight size={14} /></Link>} />}</section>
  </div>;
}
