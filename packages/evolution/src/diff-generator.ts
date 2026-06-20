// 差异生成器 - 对比当前文档与新模式，生成增量更新建议
import type {
  DesignMDXData,
  UserMemoryData,
  SelfMemoryData,
  SelfExperienceEntry,
} from "@aicos/memory";
import type {
  ExtractedPatterns,
  PreferencePatterns,
  UXDecisionPatterns,
  DesignDiffItem,
  UserDiffItem,
  CriticSummary,
} from "./types.js";

export class DiffGenerator {
  // 对比当前 design.mdx 与新模式，生成增量更新
  generateDesignDiff(
    currentDesign: DesignMDXData,
    patterns: UXDecisionPatterns,
  ): DesignDiffItem[] {
    const diffs: DesignDiffItem[] = [];

    // 检查色彩变化
    if (patterns.colorChanges) {
      const colorBlock = currentDesign.blocks.find((b) => b.blockType === "color_palette");
      diffs.push({
        blockType: "color_palette",
        currentContent: colorBlock?.content ?? "(不存在)",
        suggestedContent: JSON.stringify(patterns.colorChanges.palette, null, 2),
        reason: patterns.colorChanges.reasoning || "检测到色彩偏好变化",
      });
    }

    // 检查字体/排版变化
    if (patterns.typographyChanges) {
      const typoBlock = currentDesign.blocks.find((b) => b.blockType === "typography");
      diffs.push({
        blockType: "typography",
        currentContent: typoBlock?.content ?? "(不存在)",
        suggestedContent: JSON.stringify(patterns.typographyChanges.settings, null, 2),
        reason: patterns.typographyChanges.reasoning || "检测到排版偏好变化",
      });
    }

    // 检查布局偏好变化
    if (patterns.layoutPreferences && patterns.layoutPreferences.length > 0) {
      const layoutBlock = currentDesign.blocks.find((b) => b.blockType === "layout_templates");
      diffs.push({
        blockType: "layout_templates",
        currentContent: layoutBlock?.content ?? "(不存在)",
        suggestedContent: patterns.layoutPreferences.join("\n"),
        reason: `检测到 ${patterns.layoutPreferences.length} 条布局偏好`,
      });
    }

    // 当无 UX 决策数据时，标记设计文档需要关注
    if (diffs.length === 0 && currentDesign) {
      diffs.push({
        blockType: "general",
        currentContent: currentDesign.blocks.map((b) => b.blockType).join(", ") || "(空)",
        suggestedContent: "(需审查)",
        reason: "本轮未检测到 UX 决策变化，建议定期审查设计文档",
      });
    }

    return diffs;
  }

  // 对比当前 user.md 与新模式，生成增量更新
  generateUserDiff(
    currentUser: UserMemoryData,
    patterns: PreferencePatterns,
  ): UserDiffItem[] {
    const diffs: UserDiffItem[] = [];

    // 写作风格变化
    if (patterns.writingStyleChanges && currentUser.profile) {
      diffs.push({
        key: "writingStyle",
        currentValue: currentUser.profile.writingStyle ?? "(未设置)",
        suggestedValue: patterns.writingStyleChanges.to,
        confidence: 0.85,
      });
    }

    // 新偏好字段
    if (patterns.newPreferences && Array.isArray(currentUser.fields)) {
      for (const pref of patterns.newPreferences) {
        // 检查是否已存在该字段
        const existing = currentUser.fields.find((f) => f.key === pref.key);
        diffs.push({
          key: pref.key,
          currentValue: existing?.value ?? "(未设置)",
          suggestedValue: pref.value,
          confidence: pref.confidence,
        });
      }
    }

    // 当无偏好模式数据时，从话题倾向中提取用户偏好建议
    if (diffs.length === 0 && patterns.topicTendencies && patterns.topicTendencies.length > 0) {
      diffs.push({
        key: "topicTendencies",
        currentValue: (currentUser.profile?.topicTendencies ?? []).join(", "),
        suggestedValue: patterns.topicTendencies.join(", "),
        confidence: 0.7,
      });
    }

    // ★ 内容偏好结构化提取（Task 3.3）
    if (patterns.topicTendencies && patterns.topicTendencies.length >= 2) {
      // 当话题倾向集中时（前2个话题占比超过60%），建议更新 contentPreferences
      const totalTopics = patterns.topicTendencies.length;
      const topTopics = patterns.topicTendencies.slice(0, 2);
      // 简单启发式：如果话题不多且集中，记录偏好
      if (totalTopics <= 5) {
        diffs.push({
          key: "contentPreferences",
          currentValue: JSON.stringify(currentUser.contentPreferences ?? {}),
          suggestedValue: JSON.stringify({
            preferredContentTypes: [],
            preferredTopics: topTopics,
            avgSatisfactionScore: 0,
          }),
          confidence: 0.65,
        });
      }
    }

    return diffs;
  }

  // 生成 self.md 经验条目差异
  generateSelfDiff(
    _currentSelf: SelfMemoryData,
    patterns: ExtractedPatterns,
    taskSuccess: boolean,
    taskType: string,
    criticSummary?: CriticSummary,
    guardSummary?: { totalGoals: number; verifiedGoals: number; stopReason?: string },
  ): Omit<SelfExperienceEntry, "entryId" | "timestamp"> {
    // 综合成功/失败模式 + Critic 评估 + Guard 结果生成经验教训
    const relevantPatterns = taskSuccess ? (patterns.successPatterns ?? []) : (patterns.failurePatterns ?? []);
    let patternSummary: string;
    if (relevantPatterns.length > 0) {
      patternSummary = relevantPatterns.join("; ");
    } else {
      // 从工具使用和偏好中提取替代模式
      const altParts: string[] = [];
      if (patterns.toolUsage?.frequentTools?.length) {
        altParts.push(`常用工具: ${patterns.toolUsage.frequentTools.map((t: { toolName: string }) => t.toolName).join(",")}`);
      }
      if (patterns.preferences?.newPreferences?.length) {
        altParts.push(`新偏好: ${patterns.preferences.newPreferences.map((p: { key: string }) => p.key).join(",")}`);
      }
      if (patterns.uxDecisions?.layoutPreferences?.length) {
        altParts.push(`布局偏好: ${patterns.uxDecisions.layoutPreferences.length}条`);
      }
      patternSummary = altParts.length > 0 ? altParts.join("; ") : `${taskType}-executed`;
    }

    // 生成经验条目
    const entry: Omit<SelfExperienceEntry, "entryId" | "timestamp"> = {
      type: taskSuccess ? "success" : "learning",
      taskType,
      pattern: patternSummary,
      lesson: this.generateLesson(patterns, taskSuccess, taskType, criticSummary, guardSummary),
    };

    // 如果有工具使用效率问题，记录能力变化
    const efficiencyTips = patterns.toolUsage?.usageEfficiencyTips ?? [];
    if (efficiencyTips.length > 0) {
      entry.capabilityDelta = {
        improvedStrategies: efficiencyTips,
      };
    }
    const failedTools = patterns.toolUsage?.failedTools ?? [];
    if (failedTools.length > 0) {
      entry.capabilityDelta = {
        ...entry.capabilityDelta,
        discoveredLimitations: failedTools.map((f) => f.toolName),
      };
    }

    // ★ 高分任务：将成功策略写入 improvedStrategies（Prompt 知识库）
    if (taskSuccess && criticSummary && criticSummary.totalScore > 85) {
      const strategies: string[] = entry.capabilityDelta?.improvedStrategies ?? [];

      // 从成功模式中提炼策略
      if (patterns.successPatterns.length > 0) {
        strategies.push(...patterns.successPatterns.slice(0, 3));
      }

      // 从 Critic 高分维度中提炼策略
      const highDims = (criticSummary.dimensionScores ?? [])
        .filter((d) => d.rawScore >= (d.maxScore * 0.8));
      for (const dim of highDims.slice(0, 2)) {
        strategies.push(`${dim.dimensionName}: ${dim.comment ?? "表现优秀"}`);
      }

      if (strategies.length > 0) {
        entry.capabilityDelta = {
          ...entry.capabilityDelta,
          improvedStrategies: [...new Set(strategies)], // 去重
        };
      }
    }

    return entry;
  }

  // 根据模式生成经验教训
  private generateLesson(
    patterns: ExtractedPatterns,
    taskSuccess: boolean,
    taskType: string,
    criticSummary?: CriticSummary,
    guardSummary?: { totalGoals: number; verifiedGoals: number; stopReason?: string },
  ): string {
    const lessons: string[] = [];

    // ★ 优先使用 Critic 评估结果生成归因式经验
    if (criticSummary) {
      const dimScores = criticSummary.dimensionScores ?? [];
      const lowDims = dimScores.filter((d) => d.rawScore < (d.maxScore * 0.6));
      const highDims = dimScores.filter((d) => d.rawScore >= (d.maxScore * 0.8));

      if (taskSuccess && highDims.length > 0) {
        lessons.push(`高分维度: ${highDims.map((d) => `${d.dimensionName}(${d.rawScore}/${d.maxScore})`).join(", ")}`);
      }
      if (!taskSuccess && lowDims.length > 0) {
        lessons.push(`待改进维度: ${lowDims.map((d) => `${d.dimensionName}(${d.rawScore}/${d.maxScore}) — ${d.comment}`).join("; ")}`);
      }

      // 如果总分刚过线，记录关键提升点
      if (criticSummary.passed && !criticSummary.excellent && dimScores.length > 0) {
        const weakest = dimScores.sort((a, b) => a.rawScore - b.rawScore)[0];
        lessons.push(`下次优先提升: ${weakest.dimensionName}（当前 ${weakest.rawScore}/${weakest.maxScore}）`);
      }
    }

    // ★ 使用 Guard 结果补充停止条件信息
    if (guardSummary) {
      lessons.push(`目标完成度: ${guardSummary.verifiedGoals}/${guardSummary.totalGoals}${guardSummary.stopReason ? `，停止原因: ${guardSummary.stopReason}` : ""}`);
    }

    if (!taskSuccess) {
      // 失败时的教训
      if (patterns.failurePatterns.length > 0) {
        lessons.push(`需避免: ${patterns.failurePatterns.slice(0, 3).join(", ")}`);
      }
      const failedToolsForLesson = patterns.toolUsage?.failedTools ?? [];
      if (failedToolsForLesson.length > 0) {
        const failedNames = failedToolsForLesson.map((f) => f.toolName).join(", ");
        lessons.push(`工具 ${failedNames} 需要更谨慎使用或寻找替代方案`);
      }
    } else {
      // 成功时的经验
      if (patterns.successPatterns.length > 0) {
        lessons.push(`有效策略: ${patterns.successPatterns.join(", ")}`);
      }
      if ((patterns.preferences?.newPreferences?.length ?? 0) > 0) {
        lessons.push(
          `发现用户新偏好: ${patterns.preferences!.newPreferences!.map((p: { key: string }) => p.key).join(", ")}`,
        );
      }
    }

    // 从工具使用和偏好中生成有信息的默认 lesson
    if (lessons.length === 0) {
      const parts: string[] = [];
      parts.push(`${taskType} 任务${taskSuccess ? "完成" : "未通过"}`);
      if (criticSummary) {
        parts.push(`总分 ${criticSummary.totalScore}/100`);
      }
      if (patterns.toolUsage?.frequentTools?.length) {
        parts.push(`主要使用工具: ${patterns.toolUsage.frequentTools.slice(0, 3).map((t: { toolName: string }) => t.toolName).join(", ")}`);
      }
      if (patterns.toolUsage?.failedTools?.length) {
        parts.push(`工具失败: ${patterns.toolUsage.failedTools.map((t: { toolName: string }) => t.toolName).join(", ")}`);
      }
      if (patterns.preferences?.newPreferences?.length) {
        parts.push(`发现新偏好: ${patterns.preferences.newPreferences.slice(0, 3).map((p: { key: string }) => p.key).join(", ")}`);
      }
      return parts.length > 0 ? parts.join("；") : `完成 ${taskType} 任务，暂无显著模式可提取`;
    }
    return lessons.join("；");
  }
}
