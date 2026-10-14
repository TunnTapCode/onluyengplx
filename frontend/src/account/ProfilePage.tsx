import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ShieldCheck } from "lucide-react";
import { api, apiErrorMessage } from "../api";
import { PageHeading } from "../shared/Shared";
import { useCurrentUser } from "../shared/Shared";

export function Profile() {
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
