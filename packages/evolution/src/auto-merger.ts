// 自动合并引擎 - 评估风险并合并低风险变更
import type { SelfExperienceEntry } from "@aicos/memory";
import type { IEvolutionDocWriter } from "./types.js";
import type { DiffResult, DesignDiffItem, UserDiffItem, MergeResult } from "./types.js";

const DEFAULT_RISK_THRESHOLD = 0.8;

export class AutoMerger {
  private riskThreshold: number;

  constructor(
    private evolutionDocs: IEvolutionDocWriter,
    riskThreshold?: number,
  ) {
    this.riskThreshold = riskThreshold ?? DEFAULT_RISK_THRESHOLD;
  }

  // 合并所有变更
  async mergeAll(diff: DiffResult): Promise<MergeResult> {
    const highRiskChangesDeferred: unknown[] = [];

    // 合并 design.mdx 变更（只合低风险的）
    const designBlocksUpdated = await this.mergeDesignChanges(diff.designDiffs);

    // 合并 user.md 变更（只合低风险的）
    const userFieldsUpdated = await this.mergeUserChanges(diff.userDiffs);

    // self.md 经验条目总是追加（低风险）
    let selfEntriesAdded = 0;
    try {
      await this.mergeSelfChange(diff.selfDiff);
      selfEntriesAdded = 1;
    } catch {
      // self.md 不存在时静默跳过
    }

    return {
      designBlocksUpdated,
      userFieldsUpdated,
      selfEntriesAdded,
      highRiskChangesDeferred,
    };
  }

  // 合并 design.mdx 变更，返回实际更新的 block 数量
  async mergeDesignChanges(diffs: DesignDiffItem[]): Promise<number> {
    let updatedCount = 0;

    for (const diff of diffs) {
      const risk = this.assessRisk(diff);

      if (risk.level === "high") {
        // 高风险：跳过，记录到 deferred
        continue;
      }

      // 低/中风险：执行合并
      try {
        await this.evolutionDocs.updateDesignBlock(
          diff.blockType as any,
          diff.suggestedContent,
          "evolution",
        );
        updatedCount++;
      } catch {
        // 文档不存在时静默跳过
      }
    }

    return updatedCount;
  }

  // 合并 user.md 变更，返回实际更新的字段数量
  async mergeUserChanges(diffs: UserDiffItem[]): Promise<number> {
    let updatedCount = 0;

    for (const diff of diffs) {
      const risk = this.assessRisk(diff);

      if (risk.level === "high") {
        continue;
      }

      // 低/中风险：执行合并
      try {
        await this.evolutionDocs.updateUserField(
          diff.key,
          diff.suggestedValue,
          "evolution",
          diff.confidence,
        );
        updatedCount++;
      } catch {
        // 文档不存在时静默跳过
      }
    }

    return updatedCount;
  }

  // 合并 self.md 变更（追加经验条目）
  async mergeSelfChange(
    entry: Omit<SelfExperienceEntry, "entryId" | "timestamp">,
  ): Promise<void> {
    await this.evolutionDocs.addExperience(entry);
  }

  // 评估变更的风险等级
  assessRisk(change: unknown): { level: "low" | "medium" | "high"; score: number } {
    // DesignDiffItem 风险评估
    if (this.isDesignDiff(change)) {
      return this.assessDesignRisk(change);
    }

    // UserDiffItem 风险评估
    if (this.isUserDiff(change)) {
      return this.assessUserRisk(change);
    }

    // 默认中等风险
    return { level: "medium", score: 0.6 };
  }

  // === 私有风险评估方法 ===

  private isDesignDiff(change: unknown): change is DesignDiffItem {
    return typeof change === "object" && change !== null && "blockType" in change && "suggestedContent" in change;
  }

  private isUserDiff(change: unknown): change is UserDiffItem {
    return typeof change === "object" && change !== null && "key" in change && "confidence" in change;
  }

  // Design 变更风险评估：基于内容变化幅度
  private assessDesignRisk(diff: DesignDiffItem): { level: "low" | "medium" | "high"; score: number } {
    const currentLen = diff.currentContent.length;
    const suggestedLen = diff.suggestedContent.length;
    const changeRatio = Math.abs(suggestedLen - currentLen) / Math.max(currentLen, 1);

    // 小幅调整（如微调色彩值）→ 低风险
    if (changeRatio < 0.3) {
      return { level: "low", score: 0.9 };
    }
    // 中等规模变更 → 中等风险
    if (changeRatio < 0.7) {
      return { level: "medium", score: 0.6 };
    }
    // 大规模变更 → 高风险
    return { level: "high", score: 0.3 };
  }

  // User 变更风险评估：基于置信度
  private assessUserRisk(diff: UserDiffItem): { level: "low" | "medium" | "high"; score: number } {
    const confidence = diff.confidence;

    if (confidence >= this.riskThreshold) {
      return { level: "low", score: confidence };
    }
    if (confidence >= 0.5) {
      return { level: "medium", score: confidence };
    }
    return { level: "high", score: confidence };
  }
}
