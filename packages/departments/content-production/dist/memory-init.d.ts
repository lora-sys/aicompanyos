/** 初始化结果 */
export interface MemoryInitResult {
    designMDX: boolean;
    selfJSONL: boolean;
    userJSONL: boolean;
}
/**
 * 初始化内容产出部的记忆文件到项目根目录
 *
 * @param projectRoot 项目根目录绝对路径（如 /path/to/my-project）
 * @returns 各文件的初始化状态（true = 已写入/已存在，false = 写入失败）
 */
export declare function initDepartmentMemory(projectRoot: string): Promise<MemoryInitResult>;
