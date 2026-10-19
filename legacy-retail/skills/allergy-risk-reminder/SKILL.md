---
name: allergy-risk-reminder
description: "识别零食咨询中的过敏原、宗教饮食、素食或其他成分限制，并生成克制、可核验的安全提示。当客户提到过敏、忌口、成分安全或特殊饮食需求时使用。"
---

# 过敏与饮食风险提示

1. 提取客户明确说明的过敏原和饮食限制。
2. 仅根据输入中已核验的成分、标签或商品信息判断。
3. 信息不足时明确标记不确定，建议核对商品实物配料表和过敏原提示。
4. 不得使用“绝对安全”“肯定不过敏”等保证性表述，不做医疗判断。

输出 JSON：`constraints`、`verified_matches`、`uncertainties`、`safety_message`、`requires_clarification`。
