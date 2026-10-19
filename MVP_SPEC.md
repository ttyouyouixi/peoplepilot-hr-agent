# PeoplePilot 人事管理 Agent MVP 规格

## 1. 产品定位

PeoplePilot 是一个人事 AI 平台，包含两个入口：后台管理工作台（面向 HR 和 Leader）与员工自助前台（面向员工）。第一阶段先建设后台，但底层 Planner、Skill、Tool、权限和风险校验需要为员工自助前台预留扩展能力。

## 2. 架构原则

- Planner 负责理解问题、选择 Skill/Tool、编排执行顺序。
- Skill 负责一类可复用的人事管理任务，不存在独立的“主 Skill”。
- Tool 负责读取企业事实数据；趋势、比较、信号由 Skill 计算。
- Executor 按 Plan 执行并记录 execution trace。
- 所有管理判断必须输出证据引用、时间范围和数据不足提示。
- MVP 只生成行动计划建议，不自动写入任务系统。
- `risk-check` 是所有最终输出的强制最后一步；未通过时不得直接展示模型生成内容。
- 后台管理输出和员工前台输出必须使用不同的权限范围与回复策略。

## 3. Skills

| ID | 名称 | 责任 | 不负责 |
|---|---|---|---|
| `employee-summary` | 员工个人总结 | 汇总一个员工的基本情况、任职状态、履历、异动、技能、考勤、绩效、360 与人才盘点信息 | 直接判定员工风险或替 Leader 做最终决定 |
| `team-summary` | 团队管理总结 | 汇总团队结构、成员变化、技能分布、考勤/绩效/反馈状态与人才结构 | 直接给员工贴标签 |
| `management-signal` | 管理关注信号识别 | 基于事实识别需要 Leader 进一步确认的信号，并说明依据 | 将信号等同于离职、晋升或淘汰结论 |
| `communication-prep` | 管理沟通准备 | 根据事实和关注信号生成沟通目标、提问、表达顺序和注意事项 | 自动发送正式人事通知 |
| `action-plan` | 管理行动计划建议 | 把沟通目标转化为负责人、时间、指标和复盘点 | 未经确认自动创建或修改任务 |
| `response-generator` | 回复生成 | 将已通过前置分析的结构化结果组织成适合当前角色和场景的最终回复 | 不得自行添加事实、修改 Tool 数据或绕过风险校验 |
| `risk-check` | 人事风险与事实一致性审核 | 校验敏感内容、事实一致性、证据引用、语气和权限边界 | 不负责重新分析业务或补造缺失数据 |

## 4. Tools

| ID | 名称 | 事实范围 |
|---|---|---|
| `employee.profile.query` | 员工档案查询 | 基本信息、教育信息、当前岗位/职级、工作履历、人事异动、技能、雇佣状态 |
| `attendance.record.query` | 考勤记录查询 | 出勤、迟到、早退、缺勤、请假、加班明细；不直接返回趋势结论 |
| `feedback.360.query` | 360 反馈查询 | 反馈时间、周期、反馈来源角色、维度、主题、正负向、评分、原始内容 |
| `performance.record.query` | 绩效记录查询 | 绩效周期、目标、完成情况、绩效等级、Leader 评价、优势与差距 |
| `org.structure.query` | 组织关系查询 | 团队成员、部门层级、直属 Leader、上级链路、组织生效时间 |
| `talent.review.query` | 人才盘点查询 | 盘点周期、绩效档位、潜力档位、九宫格、继任池、关键岗位、准备度 |

员工自助前台后续可增加：

- `policy.knowledge.search`：查询员工可见的制度知识库
- `ticket.request.create`：员工确认后创建人事服务工单

## 5. 数据归属规则

- 入职、转岗、调岗、晋升、职级变化、离职统一归入员工档案中的 `personnel_events`，但保留 `event_type`。
- 考勤 Tool 返回明细；时间趋势由 Skill 按时间范围聚合计算。
- 360 Tool 返回按时间保存的反馈；“历史变化”由 Skill 对不同周期比较后得出。
- 360 的 `theme` 表示反馈在讨论什么；`polarity` 表示评价方向，两者不能混为一谈。
- 岗位和职级只由员工档案 Tool 维护；组织关系 Tool 只维护团队和汇报关系。
- 人才盘点不放进员工档案，作为有独立周期和权限的人才判断数据单独维护。
- MVP 暂不包含 PIP Tool。

## 6. Planner 规则

Planner 生成 JSON Plan，不输出隐藏思维链，只输出可审计的决策摘要。

### 必须遵守

1. 只选择已启用的 Skill 和 Tool。
2. 个人问题优先使用 `employee.profile.query`；团队问题优先使用 `org.structure.query`。
3. 需要趋势、比较或管理信号时，必须提供明确的时间范围。
4. `management-signal` 必须建立在已查询的数据或前置总结之上。
5. `communication-prep` 必须建立在事实或管理关注信号之上。
6. `action-plan` 必须建立在管理目标、关注信号或沟通准备之上。
7. 数据不足时返回 `data_gaps`，不得补造事实。
8. 涉及晋升、转正、淘汰、离职等高敏感事项时，输出仅作为辅助判断，并保留人工确认。
9. 所有最终回复必须经过 `risk-check`；`risk-check` 必须是最后一个 Skill。
10. 如果回复中的员工姓名、日期、岗位、绩效、考勤、反馈或其他事实与 Tool 结果不一致，必须拦截，不得直接输出。
11. 禁止在不必要或无权限的场景输出薪酬、奖金、股权、具体收入等敏感薪酬信息。
12. 禁止情绪化、羞辱性、歧视性、标签化和未经证实的心理判断表达。
13. 回复必须区分“数据事实”“系统计算结果”“AI 建议”和“待人工确认事项”。
14. Tool 权限不足、数据过期、数据缺失或来源冲突时，必须降级为澄清或转人工。

### risk-check 第一版拦截规则

第一版采用确定性规则 + Skill 审核，不完全依赖模型判断：

- 输出中的员工事实必须能在 Tool 返回结果或前置 Skill 证据中找到。
- 日期、数值、绩效等级、考勤次数、反馈次数不得与来源不一致。
- 检测薪酬、奖金、股权、工资、收入等敏感内容；无权限或非必要场景直接拦截。
- 检测侮辱、威胁、歧视、情绪化和诊断性表达。
- 检测把“可能、建议、需要确认”改写成“确定、必须、就是”的过度结论。
- 检测是否缺少证据引用、时间范围或数据不足说明。

拦截后只返回安全替代结果：

```json
{
  "passed": false,
  "risk_level": "high",
  "issues": ["回复中的绩效等级与 performance.record.query 返回值不一致"],
  "safe_reply": "当前信息存在不一致，暂不能生成可靠结论，请核对绩效记录后重试。",
  "requires_human_review": true
}
```

## 7. 推荐 Plan 示例

### 员工状态与管理建议

用户输入：

> 帮我总结张一鸣当前的状态，并告诉我下一步怎么管理。

执行顺序：

```text
employee.profile.query
attendance.record.query
performance.record.query
feedback.360.query
talent.review.query
employee-summary
management-signal
communication-prep
action-plan
```

### 团队管理总结

用户输入：

> 帮我看看研发二组当前的管理状态。

执行顺序：

```text
org.structure.query
employee.profile.query
attendance.record.query
performance.record.query
feedback.360.query
talent.review.query
team-summary
management-signal
action-plan
```

## 8. 产品入口

### 后台管理工作台

用户：HR、Leader。重点能力：员工/团队总结、管理信号识别、沟通准备、行动计划建议、证据和执行轨迹查看。

### 员工自助前台（后续扩展）

用户：普通员工。重点能力：制度 QA、个人可见信息查询、流程办理引导、创建人事服务工单和查看工单状态。

员工前台不能复用后台全部 Tool，不能返回其他员工信息、管理信号、人才盘点、360 原始反馈或 Leader 评价。

## 9. 第一阶段验收标准

- 输入一个员工管理问题，Planner 能生成合法 Plan。
- Plan 只调用白名单中的能力。
- Tool 返回的数据能传递给后续 Skill。
- 每个管理信号都有数据来源和时间范围。
- 数据不足时不会生成确定性结论。
- 执行轨迹能展示每一步调用的 Skill/Tool、输入、输出和状态。
- 页面暂时不追求完整后台，先验证一条端到端 Agent 链路。
- `risk-check` 必须执行；未通过时不得展示未经审核的最终回复。
- 至少覆盖事实不一致、薪酬敏感信息和情绪化表达三类拦截测试。
