---
name: clarification-question
description: "发现会明显影响零食推荐或售后处理的缺失信息，并生成最少数量的关键追问。当预算、人数、口味、过敏限制或售后事实缺失且无法安全继续时使用。"
---

# 澄清问题生成

判断缺失信息是否真的会改变结果或安全边界。

- 仅追问必要信息，最多 3 个问题。
- 优先询问过敏风险、售后关键证据和会改变商品筛选的条件。
- 已有足够信息时返回空问题数组，不要为了追问而追问。
- 问题保持口语化，不索取与任务无关的敏感信息。

输出 JSON：`missing_information`、`questions`、`can_continue_without_answer`、`reason`。
