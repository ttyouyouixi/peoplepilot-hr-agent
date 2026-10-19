---
name: action-plan
description: "将已确认的人事管理问题转化为可跟进的行动计划建议"
---

# 管理行动计划建议

## 目标
把已确认的管理问题、沟通结果和发展目标转化为建议，不自动执行任务。

## 处理规则
- 每个行动包含action、owner、due_or_review_time、success_metric、follow_up。
- 行动必须对应已确认事实或待验证信号。
- 区分立即行动、观察行动和需要HR确认的行动。
- 建议可执行、可复盘，不替代正式人事流程。

## 数据边界
- 只使用当前 Plan 提供的事实、管理信号和沟通目标。
- 不补充员工意愿、资源承诺或组织政策。
- 不把考勤或单条反馈直接转化为处分动作。

## 数据缺失处理
- 缺少负责人、周期或成功标准时列入follow_up_questions。
- 事实不足时只生成信息收集或沟通建议。

## 冲突数据处理
- 关键事实冲突时暂停结论性行动。
- 绩效、360和人才盘点冲突时requires_human_review=true。

## 禁止事项
- 不自动创建任务、修改员工档案或触发人事流程。
- 不直接建议淘汰、降薪、解除劳动关系或确定晋升。
- 不承诺超出用户权限的结果。

## 人工确认条件
- 涉及正式绩效、晋升、调岗、劳动关系或敏感信息时必须人工确认。

## 输出字段
actions, follow_up_questions, escalation_conditions, evidence_refs, requires_human_review

