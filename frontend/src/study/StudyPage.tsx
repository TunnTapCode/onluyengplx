import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle2, CircleHelp, FileText, Maximize2, Minimize2, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { api, apiErrorMessage, getTokens, resolveMediaUrl } from "../api";
import type { Category, Page, Question } from "../api";
import { ApiNotice, EmptyState, QuestionSkeleton, useCurrentUser } from "../shared/Shared";

export function Study() {
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
