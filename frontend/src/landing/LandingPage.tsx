import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, Menu, ShieldCheck, Sparkles, Target, TrendingUp, X } from "lucide-react";
import { api } from "../api";
import type { Page, Question } from "../api";
import { Brand } from "../shared/Shared";

export function Landing() {
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
