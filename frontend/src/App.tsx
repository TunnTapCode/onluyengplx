import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getTokens } from "./api";
import { Shell, useCurrentUser } from "./shared/Shared";
import { Landing } from "./landing/LandingPage";
import { AuthPage } from "./auth/AuthPage";
import { Dashboard } from "./dashboard/DashboardPage";
import { Study } from "./study/StudyPage";
import { QuestionPage, SavedQuestions } from "./study/QuestionPages";
import { ExamHome, ExamPage, History, ResultPage } from "./exam/ExamPages";
import { Profile } from "./account/ProfilePage";
import AdminExams from "./AdminExams";

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

export default App;
