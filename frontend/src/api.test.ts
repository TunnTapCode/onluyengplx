import { describe, expect, it } from "vitest";
import { apiErrorMessage, resolveMediaUrl } from "./api";

describe("resolveMediaUrl", () => {
  it("serves backend media from the frontend origin", () => {
    expect(resolveMediaUrl("http://localhost:8000/media/questions/q_036.jpg"))
      .toBe("/media/questions/q_036.jpg");
  });

  it("preserves external image URLs", () => {
    expect(resolveMediaUrl("https://example.test/image.jpg"))
      .toBe("https://example.test/image.jpg");
  });

  it("returns undefined when the question has no image", () => {
    expect(resolveMediaUrl(null)).toBeUndefined();
  });
});

describe("apiErrorMessage", () => {
  it("shows backend field validation messages", () => {
    const error = {
      isAxiosError: true,
      message: "Request failed with status code 400",
      response: { data: { password: ["Mật khẩu này quá phổ biến."] } },
    };

    expect(apiErrorMessage(error)).toBe("Mật khẩu: Mật khẩu này quá phổ biến.");
  });

  it("shows backend detail messages", () => {
    const error = {
      isAxiosError: true,
      message: "Request failed with status code 400",
      response: { data: { detail: "Không thể xử lý yêu cầu." } },
    };

    expect(apiErrorMessage(error)).toBe("Không thể xử lý yêu cầu.");
  });
});
