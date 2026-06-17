export class DiffGenerator {
    // 对比当前 design.mdx 与新模式，生成增量更新
    generateDesignDiff(currentDesign, patterns) {
        const diffs = [];
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
        return diffs;
    }
    // 对比当前 user.md 与新模式，生成增量更新
    generateUserDiff(currentUser, patterns) {
        const diffs = [];
        // 写作风格变化
        if (patterns.writingStyleChanges) {
            diffs.push({
                key: "writingStyle",
                currentValue: currentUser.profile.writingStyle,
                suggestedValue: patterns.writingStyleChanges.to,
                confidence: 0.85,
            });
        }
        // 新偏好字段
        if (patterns.newPreferences) {
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
        return diffs;
    }
    // 生成 self.md 经验条目差异
    generateSelfDiff(_currentSelf, patterns, taskSuccess, taskType) {
        // 综合成功/失败模式生成经验教训
        const relevantPatterns = taskSuccess ? patterns.successPatterns : patterns.failurePatterns;
        const patternSummary = relevantPatterns.length > 0 ? relevantPatterns.join("; ") : "无显著模式";
        // 生成经验条目
        const entry = {
            type: taskSuccess ? "success" : "learning",
            taskType,
            pattern: patternSummary,
            lesson: this.generateLesson(patterns, taskSuccess),
        };
        // 如果有工具使用效率问题，记录能力变化
        if (patterns.toolUsage.usageEfficiencyTips.length > 0) {
            entry.capabilityDelta = {
                improvedStrategies: patterns.toolUsage.usageEfficiencyTips,
            };
        }
        if (patterns.toolUsage.failedTools.length > 0) {
            entry.capabilityDelta = {
                ...entry.capabilityDelta,
                discoveredLimitations: patterns.toolUsage.failedTools.map((f) => f.toolName),
            };
        }
        return entry;
    }
    // 根据模式生成经验教训
    generateLesson(patterns, taskSuccess) {
        const lessons = [];
        if (!taskSuccess) {
            // 失败时的教训
            if (patterns.failurePatterns.length > 0) {
                lessons.push(`需避免: ${patterns.failurePatterns.slice(0, 3).join(", ")}`);
            }
            if (patterns.toolUsage.failedTools.length > 0) {
                const failedNames = patterns.toolUsage.failedTools.map((f) => f.toolName).join(", ");
                lessons.push(`工具 ${failedNames} 需要更谨慎使用或寻找替代方案`);
            }
        }
        else {
            // 成功时的经验
            if (patterns.successPatterns.length > 0) {
                lessons.push(`有效策略: ${patterns.successPatterns.join(", ")}`);
            }
            if (patterns.preferences.newPreferences?.length) {
                lessons.push(`发现用户新偏好: ${patterns.preferences.newPreferences.map((p) => p.key).join(", ")}`);
            }
        }
        return lessons.length > 0 ? lessons.join("；") : taskSuccess ? "任务顺利完成，保持当前策略" : "需要分析失败原因并调整策略";
    }
}
//# sourceMappingURL=diff-generator.js.map