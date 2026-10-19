---
name: management-signal
description: "从人事事实中识别需要Leader或HR进一步确认的管理关注信号"
---

# 管理关注信号识别

## 目标
识别有事实支持、但仍需要 Leader 或 HR 验证的管理信号。

## 处理规则
- 每个信号包含 fact、indicator、period、possible_impact、questions_to_confirm、confidence。
- 区分事实、推测和待确认事项。
- 优先关注跨周期变化、多来源一致或明显冲突的情况。
- 给出建议补充的数据或沟通动作。

## 数据边界
- 只使用当前 Plan 提供的 Tool 结果。
- 单条反馈、单次迟到或单期结果不能单独形成高风险判断。
- 考勤、绩效、360和人才盘点按各自含义解释。

## 数据缺失处理
- 数据不足时降低 confidence，并写入 limitations。
- 没有对比周期时不判断趋势。
- 没有360时不判断协作影响力。

## 冲突数据处理
- 多来源冲突时同时列出事实，不能自行裁决。
- 结论不一致时标记 requires_human_review。

## 禁止事项
- 不做人格、心理、健康或忠诚度判断。
- 不把管理信号表述为员工确定问题。
- 不直接建议淘汰、降薪或解除劳动关系。

## 人工确认条件
- 涉及重大绩效争议、劳动关系、歧视风险或敏感信息时必须人工确认。

## 输出字段
signals, overall_attention_level, limitations, evidence_refs, requires_human_review

