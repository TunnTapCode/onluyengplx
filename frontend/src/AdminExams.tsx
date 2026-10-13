import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Edit3, Plus, RefreshCw } from "lucide-react";
import { api, apiErrorMessage } from "./api";
import type { ExamConfiguration, Page } from "./api";

type ConfigurationOptions = {
  license_classes: Array<{
    id: number;
    code: string;
    name: string;
    eligible_question_count: number;
    eligible_critical_question_count: number;
  }>;
  categories: Array<{
    id: number;
    slug: string;
    name: string;
    eligible_question_count: number;
  }>;
};

type ConfigurationForm = {
  name: string;
  license_class: string;
  question_count: string;
  duration_minutes: string;
  passing_score: string;
  question_distribution: string;
  fixed_question_ids: string;
  is_active: boolean;
};

const emptyForm: ConfigurationForm = {
  name: "",
  license_class: "",
  question_count: "25",
  duration_minutes: "20",
  passing_score: "21",
  question_distribution: "{}",
  fixed_question_ids: "[]",
  is_active: true,
};

function rows<T>(data: Page<T> | T[] | undefined): T[] {
  if (Array.isArray(data)) return data;
  return data?.results ?? [];
}

function formFromConfiguration(configuration: ExamConfiguration): ConfigurationForm {
  return {
    name: configuration.name,
    license_class: String(configuration.license_class),
    question_count: String(configuration.question_count),
    duration_minutes: configuration.duration_seconds == null ? "" : String(Math.ceil(configuration.duration_seconds / 60)),
    passing_score: configuration.passing_score == null ? "" : String(configuration.passing_score),
    question_distribution: JSON.stringify(configuration.question_distribution ?? {}, null, 2),
    fixed_question_ids: JSON.stringify(configuration.fixed_question_ids ?? [], null, 2),
    is_active: configuration.is_active,
  };
}

export default function AdminExams() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ExamConfiguration | null>(null);
  const [form, setForm] = useState<ConfigurationForm>(emptyForm);
  const [error, setError] = useState("");
  const configurations = useQuery({
    queryKey: ["admin", "exam-configurations"],
    queryFn: async () => (await api.get<Page<ExamConfiguration> | ExamConfiguration[]>("/exams/configurations/")).data,
  });
  const options = useQuery({
    queryKey: ["admin", "exam-options", form.license_class],
    queryFn: async () => (await api.get<ConfigurationOptions>("/exams/admin-options/", {
      params: form.license_class ? { license_class: form.license_class } : {},
    })).data,
  });
  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => editing
      ? api.patch(`/exams/configurations/${editing.id}/`, payload)
      : api.post("/exams/configurations/", payload),
    onSuccess: async () => {
      setError("");
      setEditing(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["admin", "exam-configurations"] });
      await queryClient.invalidateQueries({ queryKey: ["exam-configurations"] });
    },
    onError: (reason) => setError(apiErrorMessage(reason)),
  });

  useEffect(() => {
    if (!form.license_class && options.data?.license_classes.length) {
      setForm((current) => ({ ...current, license_class: String(options.data!.license_classes[0].id) }));
    }
  }, [form.license_class, options.data]);

  const configurationsList = rows(configurations.data);
  const available = options.data?.license_classes.find(
    (licenseClass) => String(licenseClass.id) === form.license_class,
  );
  const setField = <K extends keyof ConfigurationForm>(key: K, value: ConfigurationForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const startNew = () => {
    setEditing(null);
    setError("");
    setForm({ ...emptyForm, license_class: options.data?.license_classes[0] ? String(options.data.license_classes[0].id) : "" });
  };
  const startEditing = (configuration: ExamConfiguration) => {
    setEditing(configuration);
    setError("");
    setForm(formFromConfiguration(configuration));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    let distribution: unknown;
    try {
      distribution = JSON.parse(form.question_distribution);
    } catch {
      setError("Phân bố câu hỏi phải là JSON hợp lệ, ví dụ {\"1\": 5}.");
      return;
    }
    if (!distribution || typeof distribution !== "object" || Array.isArray(distribution)) {
      setError("Phân bố câu hỏi phải là một JSON object.");
      return;
    }
    let fixedQuestionIds: unknown;
    try {
      fixedQuestionIds = JSON.parse(form.fixed_question_ids);
    } catch {
      setError("Bộ câu cố định phải là JSON array hợp lệ, ví dụ [12, 34, 56].");
      return;
    }
    if (!Array.isArray(fixedQuestionIds) || fixedQuestionIds.some((id) => !Number.isInteger(id))) {
      setError("Bộ câu cố định phải là một JSON array các mã câu hỏi dạng số nguyên.");
      return;
    }
    save.mutate({
      name: form.name.trim(),
      license_class: Number(form.license_class),
      question_count: Number(form.question_count),
      duration_seconds: form.duration_minutes.trim() ? Number(form.duration_minutes) * 60 : null,
      passing_score: form.passing_score.trim() ? Number(form.passing_score) : null,
      question_distribution: distribution,
      fixed_question_ids: fixedQuestionIds,
      is_active: form.is_active,
    });
  };

  return <div className="page-content">
    <div className="page-heading">
      <div><div className="eyebrow">QUẢN TRỊ HỆ THỐNG</div><h1>Cấu hình thi thử</h1><p>Tạo và quản lý đề thi theo hạng GPLX.</p></div>
      <button className="button button-dark" onClick={startNew}><Plus size={16} /> Tạo cấu hình</button>
    </div>

    <section className="admin-exam-layout">
      <div className="panel admin-config-panel">
        <div className="panel-heading"><div><h2>Danh sách cấu hình</h2><p>{configurationsList.length} đề thi</p></div><button className="icon-button" aria-label="Tải lại" onClick={() => void configurations.refetch()}><RefreshCw size={16} /></button></div>
        {configurations.isLoading ? <div className="admin-inline-state">Đang tải cấu hình...</div>
          : configurations.isError ? <div className="alert alert-error">{apiErrorMessage(configurations.error)}</div>
            : configurationsList.length === 0 ? <div className="admin-inline-state">Chưa có cấu hình thi thử.</div>
              : <div className="admin-config-list">{configurationsList.map((configuration) =>
                <article className="admin-config-item" key={configuration.id}>
                  <div className="admin-config-copy"><div className="admin-config-title"><h3>{configuration.name}</h3><span className={`admin-status ${configuration.is_active ? "is-active" : ""}`}>{configuration.is_active ? "Đang bật" : "Đã tắt"}</span></div>
                    <p>Hạng {configuration.license_class_code} · {configuration.question_count} câu · {configuration.duration_seconds == null ? "Chưa cài thời gian" : `${Math.ceil(configuration.duration_seconds / 60)} phút`} · {configuration.passing_score == null ? "Chưa cài điểm đạt" : `Đạt từ ${configuration.passing_score} câu`}</p>
                    <small>{configuration.eligible_question_count ?? 0} câu đủ điều kiện · {configuration.eligible_critical_question_count ?? 0}/3 câu điểm liệt</small></div>
                  <button className="button button-outline button-small" onClick={() => startEditing(configuration)}><Edit3 size={14} /> Sửa</button>
                </article>,
              )}</div>}
      </div>

      <div className="panel admin-form-panel">
        <div className="panel-heading"><div><h2>{editing ? "Chỉnh sửa đề thi" : "Tạo đề thi mới"}</h2><p>Các cấu hình bật sẽ hiển thị ở mục Thi thử.</p></div></div>
        <form className="admin-exam-form" onSubmit={submit}>
          <label>Tên cấu hình<input required maxLength={120} value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="Ví dụ: Đề thi hạng B" /></label>
          <label>Hạng giấy phép
            <select required value={form.license_class} onChange={(event) => setField("license_class", event.target.value)}>
              <option value="" disabled>Chọn hạng GPLX</option>
              {options.data?.license_classes.map((licenseClass) => <option key={licenseClass.id} value={licenseClass.id}>{licenseClass.code} — {licenseClass.name} ({licenseClass.eligible_question_count} câu, {licenseClass.eligible_critical_question_count}/3 điểm liệt)</option>)}
            </select>
          </label>
          {options.isError && <div className="alert alert-error">{apiErrorMessage(options.error)}</div>}
          {available && available.eligible_question_count === 0 && <div className="alert alert-info">Hạng {available.code} chưa có câu hỏi hoạt động được gán. Hãy gán câu hỏi cho hạng này trước khi bật đề.</div>}
          {available && available.eligible_critical_question_count < 3 && <div className="alert alert-info">Hạng {available.code} hiện có {available.eligible_critical_question_count}/3 câu điểm liệt được gán. Cần gán đủ câu có <code>is_critical = true</code> trước khi bật đề.</div>}
          <div className="admin-field-row">
            <label>Tổng số câu<input required type="number" min="1" max="65535" value={form.question_count} onChange={(event) => setField("question_count", event.target.value)} /></label>
            <label>Thời gian (phút)<input required={form.is_active} type="number" min="1" value={form.duration_minutes} onChange={(event) => setField("duration_minutes", event.target.value)} /></label>
            <label>Số câu đạt<input required={form.is_active} type="number" min="1" value={form.passing_score} onChange={(event) => setField("passing_score", event.target.value)} /></label>
          </div>
          <div className="alert alert-info">Mỗi đề tự động chọn đúng 3 câu có <code>is_critical = true</code>. Sai bất kỳ câu nào trong 3 câu sẽ trượt toàn bài.</div>
          <label>Phân bố theo chương (JSON, không bắt buộc)
            <textarea rows={4} value={form.question_distribution} onChange={(event) => setField("question_distribution", event.target.value)} placeholder={'{"1": 5, "chapter-slug": 3}'} />
            <small className="admin-help">Dùng ID hoặc slug chương làm khóa; để <code>{"{}"}</code> để chọn ngẫu nhiên. {options.data?.categories.length ? `Có ${options.data.categories.length} chương với câu hỏi phù hợp.` : ""}</small>
          </label>
          <label>Bộ câu hỏi cố định (JSON array, không bắt buộc)
            <textarea rows={4} value={form.fixed_question_ids} onChange={(event) => setField("fixed_question_ids", event.target.value)} placeholder="[12, 34, 56]" />
            <small className="admin-help">Nhập mã câu hỏi theo đúng thứ tự hiển thị. Mỗi bộ đề cố định phải có đúng số câu đã cấu hình và đúng 3 câu điểm liệt; không dùng chung với phân bố theo chương.</small>
          </label>
          <label className="admin-checkbox"><input type="checkbox" checked={form.is_active} onChange={(event) => setField("is_active", event.target.checked)} /> Bật cấu hình và cho phép làm đề</label>
          {error && <div className="alert alert-error">{error}</div>}
          {configurations.isError && <div className="alert alert-error">{apiErrorMessage(configurations.error)}</div>}
          <div className="admin-form-actions">
            {editing && <button type="button" className="button button-outline" onClick={startNew}>Hủy chỉnh sửa</button>}
            <button className="button button-dark" disabled={save.isPending || options.isLoading || !form.license_class}>{save.isPending ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Tạo cấu hình"} <ArrowRight size={15} /></button>
          </div>
        </form>
      </div>
    </section>
  </div>;
}
