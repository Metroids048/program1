import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createProfile } from "../lib/interviewEngine";
import { applyFullResumeSuggestionToDrafts } from "./resume";
import { ResumeWorkspacePage } from "./resume";

describe("resume full apply", () => {
  it("maps structured full-resume suggestions back into matching sections", () => {
    const drafts = {
      basic: "张三",
      education: "本科",
      highlights: "原亮点",
      work: "原工作",
      projects: "原项目",
      skills: "SQL",
      risks: "原风险",
    };

    const next = applyFullResumeSuggestionToDrafts(
      [
        "亮点摘要",
        "1. 负责增长策略和数据闭环。",
        "项目经历",
        "主导校园增长项目，首单转化率从 12% 提升到 19%。",
        "技能与工具",
        "SQL、A/B 实验、增长漏斗分析。",
      ].join("\n"),
      [
        { id: "highlights", title: "亮点摘要" },
        { id: "projects", title: "项目经历" },
        { id: "skills", title: "技能与工具" },
      ],
      drafts,
    );

    expect(next.highlights).toContain("增长策略");
    expect(next.projects).toContain("首单转化率");
    expect(next.skills).toContain("A/B 实验");
  });

  it("falls back to highlights only when the full-resume suggestion is not section-structured", () => {
    const drafts = {
      basic: "张三",
      education: "本科",
      highlights: "原亮点",
      work: "原工作",
      projects: "原项目",
      skills: "SQL",
      risks: "原风险",
    };

    const next = applyFullResumeSuggestionToDrafts(
      "整份简历建议：先写结论，再补动作和结果。",
      [
        { id: "highlights", title: "亮点摘要" },
        { id: "projects", title: "项目经历" },
      ],
      drafts,
    );

    expect(next.highlights).toContain("先写结论");
    expect(next.projects).toBe(drafts.projects);
  });

  it("shows evidence preview on the main resume workspace", () => {
    const profile = createProfile(
      [
        "测试候选人",
        "AI 产品经理",
        "项目经历",
        "校园增长项目",
        "- 负责增长策略和数据闭环，首单转化率从 12% 提升到 19%。",
        "技能与工具",
        "SQL、A/B 实验、增长漏斗分析。",
      ].join("\n"),
    );

    render(
      <ResumeWorkspacePage
        profile={profile}
        onUpdateResume={vi.fn()}
        onUpdateEvidence={vi.fn()}
        onSetHighlights={vi.fn()}
        isLoggedIn
        onRequireLogin={vi.fn()}
      />,
    );

    expect(screen.getByText("AI 已识别的经历证据")).toBeInTheDocument();
    expect(screen.getByText(`${profile.evidenceLibrary.length} 条`)).toBeInTheDocument();
    expect(screen.getByText("命中关键词：")).toBeInTheDocument();
  });
});
