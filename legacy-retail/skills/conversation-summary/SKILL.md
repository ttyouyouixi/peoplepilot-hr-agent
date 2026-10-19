---
name: conversation-summary
description: "将多轮零食电商客服对话压缩为客户事实、核心需求、已确认事项、未解决问题和下一步。当会话较长、需要为后续 Skill 提供简洁上下文或人工交接时使用。"
---

# 会话摘要

仅总结对话中明确出现的信息，区分客户陈述、已核验事实和待确认内容。

- 保留预算、口味、过敏限制、订单问题和客户明确期望等关键信息。
- 不将猜测写成事实，不复制不必要的敏感信息。
- 下一步必须可执行，且不超出已知平台权限。

输出 JSON：`customer_facts`、`confirmed_needs`、`confirmed_actions`、`open_questions`、`next_step`。
