import { describe, expect, it } from "vitest";
import { basename, defaultExportPath } from "./file-io";

describe("path helpers", () => {
  it("basename handles / and \\ separators", () => {
    expect(basename("/a/b/sched.ssim")).toBe("sched.ssim");
    expect(basename("C:\\v1.2\\schedules\\sched.ssim")).toBe("sched.ssim");
    expect(basename("sched.ssim")).toBe("sched.ssim");
  });

  it("defaultExportPath inserts _modified before the extension", () => {
    expect(defaultExportPath("/a/b/sched.ssim")).toBe("/a/b/sched_modified.ssim");
    expect(defaultExportPath("C:\\v1.2\\sched.ssim")).toBe("C:\\v1.2\\sched_modified.ssim");
    // dot in a directory name, none in the filename
    expect(defaultExportPath("C:\\v1.2\\sched")).toBe("C:\\v1.2\\sched_modified");
    expect(defaultExportPath("/a/.hidden")).toBe("/a/.hidden_modified");
  });
});
