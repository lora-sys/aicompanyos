/**
 * GoalTemplateRegistry — 验收目标自动模板匹配
 *
 * 当 PlanStep.metadata 中没有显式定义 acceptanceGoals 时，
 * 根据 step 的 agentType 和 description 自动生成默认验收目标。
 *
 * 设计原则：
 * - writer 类型的 step 自动获得代码/内容验证目标
 * - critic/ui-ux 类型不生成（它们不是产出型 step）
 * - 模板可扩展：通过 registerTemplate() 注册自定义模板
 */

import type { AcceptanceGoal, VerificationMethod } from "./types.js";
import type { WorkerRole } from "../types.js";

/** 目标模板 — 根据上下文生成具体的 AcceptanceGoal */
export interface GoalTemplate {
  /** 匹配条件 */
  match: {
    /** 匹配的 agentType（已知角色编译期可检查，* 表示全部） */
    agentType: WorkerRole | string;
    /** description 中的关键词（任一匹配即触发，空数组表示无条件） */
    keywords?: string[];
    /** description 中的反关键词（包含则排除） */
    antiKeywords?: string[];
  };
  /** 生成的目标列表工厂 */
  generate: (stepId: string, description: string) => AcceptanceGoal[];
}

export class GoalTemplateRegistry {
  private builtinTemplates: GoalTemplate[] = [];
  private customTemplates: GoalTemplate[] = [];

  constructor() {
    this.registerBuiltinTemplates();
  }

  // ============================================================
  // 公共 API
  // ============================================================

  /** 注册自定义模板（自定义模板优先于内置模板匹配） */
  registerTemplate(template: GoalTemplate): void {
    this.customTemplates.unshift(template); // unshift = 后注册的自定义模板先匹配
  }

  /**
   * 根据 step 信息生成验收目标
   *
   * @param stepId Step ID
   * @param agentType Agent 类型 (writer/critic/ui-ux)
   * @param description Step 描述
   * @returns 生成的 AcceptanceGoal 列表（无匹配则返回空数组）
   */
  generateGoals(stepId: string, agentType: WorkerRole | string, description: string): AcceptanceGoal[] {
    const lowerDesc = description.toLowerCase();

    // 优先检查自定义模板
    for (const template of this.customTemplates) {
      if (this.matchesTemplate(template, agentType, lowerDesc)) {
        return template.generate(stepId, description);
      }
    }

    // 然后检查内置模板（按注册顺序，通用兜底在最后）
    for (const template of this.builtinTemplates) {
      if (this.matchesTemplate(template, agentType, lowerDesc)) {
        return template.generate(stepId, description);
      }
    }

    return [];
  }

  /** 检查模板是否匹配 */
  private matchesTemplate(template: GoalTemplate, agentType: WorkerRole | string, lowerDesc: string): boolean {
    if (template.match.agentType !== "*" && template.match.agentType !== agentType) {
      return false;
    }
    if (template.match.keywords && template.match.keywords.length > 0) {
      const hasKeyword = template.match.keywords.some((kw) => lowerDesc.includes(kw.toLowerCase()));
      if (!hasKeyword) return false;
    }
    if (template.match.antiKeywords && template.match.antiKeywords.length > 0) {
      const hasAntiKeyword = template.match.antiKeywords.some((kw) => lowerDesc.includes(kw.toLowerCase()));
      if (hasAntiKeyword) return false;
    }
    return true;
  }

  // ============================================================
  // 内置模板
  // ============================================================

  private registerBuiltinTemplates(): void {
    // --- Template 1: TypeScript/代码实现 ---
    this.builtinTemplates.push({
      match: {
        agentType: "writer",
        keywords: [
          "实现", "implement", "创建", "create", "写", "write",
          "代码", "code", "函数", "function", "类", "class",
          "接口", "interface", "api", "module", "模块",
          "component", "组件", "crud", "service", "handler",
          "typescript", "javascript", "js", "ts",
        ],
        antiKeywords: ["文章", "article", "文档", "document", "markdown"],
      },
      generate: (stepId, desc) => this.generateCodeGoals(stepId, desc),
    });

    // --- Template 2: 文章/内容写作 ---
    this.builtinTemplates.push({
      match: {
        agentType: "writer",
        keywords: [
          "文章", "article", "博客", "blog", "文档", "document",
          "报告", "report", "markdown", "md", "写作", "write",
          "内容", "content", "教程", "tutorial", "说明",
        ],
      },
      generate: (stepId, desc) => this.generateArticleGoals(stepId, desc),
    });

    // --- Template 3: UI/前端页面 ---
    this.builtinTemplates.push({
      match: {
        agentType: "writer",
        keywords: [
          "页面", "page", "ui", "界面", "frontend", "前端",
          "component", "组件", "html", "css", "样式", "style",
          "react", "vue", "svelte", "web", "网页",
        ],
      },
      generate: (stepId, desc) => this.generateUIGoals(stepId, desc),
    });

    // --- Template 4: 通用 Writer 兜底 ---
    this.builtinTemplates.push({
      match: {
        agentType: "writer", // 所有未匹配的 writer step
      },
      generate: (stepId, desc) => this.generateGenericWriterGoals(stepId, desc),
    });
  }

  // ============================================================
  // 目标生成器
  // ============================================================

  /** 代码实现类目标的默认集合 */
  private generateCodeGoals(stepId: string, _desc: string): AcceptanceGoal[] {
    return [
      {
        id: `${stepId}_tsc_clean`,
        stepId,
        description: "TypeScript 编译零错误",
        verifyBy: [{ type: "command", command: "npx tsc --noEmit" }],
        priority: "critical",
        required: true,
      },
      {
        id: `${stepId}_file_exists`,
        stepId,
        description: "产出文件已存在",
        verifyBy: [{ type: "file_exists", path: "src/**/*.ts" }],
        priority: "critical",
        required: true,
      },
      {
        id: `${stepId}_lint_ok`,
        stepId,
        description: "Lint 检查无 error",
        verifyBy: [{ type: "lint", tool: "eslint", failOnWarning: false }],
        priority: "major",
        required: false,
      },
    ];
  }

  /** 文章/内容写作类目标的默认集合 */
  private generateArticleGoals(stepId: string, _desc: string): AcceptanceGoal[] {
    return [
      {
        id: `${stepId}_file_exists`,
        stepId,
        description: "文章产出文件已存在且非空",
        verifyBy: [
          { type: "file_exists", path: "**/*.md", minSizeBytes: 100 },
        ],
        priority: "critical",
        required: true,
      },
      {
        id: `${stepId}_has_content`,
        stepId,
        description: "文件包含实质内容（非仅标题）",
        verifyBy: [
          {
            type: "content_match",
            target: "**/*.md",
            pattern: /^#{1,3}\s+/m, // 至少有一个标题
          },
        ],
        priority: "major",
        required: false,
      },
    ];
  }

  /** UI/前端页面类目标的默认集合 */
  private generateUIGoals(stepId: string, _desc: string): AcceptanceGoal[] {
    return [
      {
        id: `${stepId}_tsc_clean`,
        stepId,
        description: "TypeScript 编译零错误",
        verifyBy: [{ type: "command", command: "npx tsc --noEmit" }],
        priority: "critical",
        required: true,
      },
      {
        id: `${stepId}_ui_file_exists`,
        stepId,
        description: "UI 组件/页面文件已存在",
        verifyBy: [{ type: "file_exists", path: "src/**/*.{tsx,jsx,vue,svelte}" }],
        priority: "critical",
        required: true,
      },
    ];
  }

  /** 通用 Writer 兜底目标 */
  private generateGenericWriterGoals(stepId: string, _desc: string): AcceptanceGoal[] {
    return [
      {
        id: `${stepId}_output_exists`,
        stepId,
        description: "产出文件已存在",
        verifyBy: [{ type: "file_exists", path: "**/*" }],
        priority: "critical",
        required: true,
      },
    ];
  }
}
