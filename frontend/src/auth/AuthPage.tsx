import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { api, apiErrorMessage, setTokens } from "../api";
import { Brand } from "../shared/Shared";

const authSchema = z.object({
  username: z.string().min(1, "Vui lòng nhập tên đăng nhập"),
  email: z.string().email("Email không hợp lệ").optional().or(z.literal("")),
  password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự"),
});

const registerSchema = authSchema.extend({ email: z.string().email("Email không hợp lệ") });

type AuthValues = z.infer<typeof authSchema> & { email?: string };

export function AuthPage({ mode }: { mode: "login" | "register" | "forgot" }) {
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
