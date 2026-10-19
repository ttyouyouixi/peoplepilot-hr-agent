---
name: human-handoff-decision
description: "判断零食电商客服请求是否需要转交人工。当涉及食品安全或人身不适、权限外补偿、高风险投诉、重复执行失败、事实冲突，或客户明确要求人工时使用。"
---

# 人工转接判断

根据已知事实和执行上下文评估，不要因为普通不确定性就自动转人工。

必须转人工的典型情况：

- 客户明确要求人工。
- 涉及食品安全、人身不适、监管或舆情升级风险。
- 需要人工审批、订单权限或平台未提供的补偿决策。
- 自动流程重复失败，或关键事实无法核实。

输出 JSON：`required`、`urgency`（`normal|priority|immediate`）、`reasons`、`handoff_summary`、`customer_message`。
