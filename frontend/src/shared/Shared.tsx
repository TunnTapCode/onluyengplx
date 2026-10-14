import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Bookmark, ChevronDown, CircleHelp, Clock3, FileText, GraduationCap, LayoutDashboard, LogOut, Menu, Settings2, Sparkles, X } from "lucide-react";
import { api, getTokens, setTokens } from "../api";
import type { User } from "../api";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get<User>("/auth/me/")).data,
    enabled: Boolean(getTokens()),
    retry: false,
  });
}

export function Brand() {
  return <Link to="/" className="brand"><span className="brand-mark"><GraduationCap size={20} /></span><span>vững<span className="brand-light">tay</span>nái</span></Link>;
}

const navItems = [
  { to: "/dashboard", text: "Tổng quan", icon: LayoutDashboard },
  { to: "/study", text: "Ôn tập", icon: BookOpen },
  { to: "/exam", text: "Thi thử", icon: FileText },
  { to: "/history", text: "Lịch sử thi", icon: Clock3, private: true },
  { to: "/bookmarks", text: "Câu yêu thích", icon: Bookmark, private: true },
];

export function Shell({ children }: { children: ReactNode }) {
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

export function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action && <div>{action}</div>}</div>;
}

export function ApiNotice({ message }: { message: string }) {
  return <div className="api-notice"><span className="notice-icon"><CircleHelp size={18} /></span><span>{message}</span></div>;
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function Skeleton({ height = 100 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-label="Đang tải dữ liệu"><span /><span /><span /></div>;
}

export function QuestionSkeleton() {
  return <div className="question-grid">{[0, 1, 2, 3].map((key) => <Skeleton key={key} height={180} />)}</div>;
}
