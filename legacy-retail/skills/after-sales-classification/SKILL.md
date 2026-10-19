---
name: after-sales-classification
description: "识别零食电商售后请求的类型、证据需求和处理优先级。当客户提到退款、退货、破损、漏发、错发、过期、口感异常或物流问题时使用。"
---

# 售后问题分类

根据客户原话和已有会话信息进行分类，不要虚构订单状态、平台规则或处理结果。

1. 在 `refund`、`return`、`damaged`、`missing`、`wrong_item`、`expired`、`quality`、`logistics`、`other` 中选择问题类型。
2. 提取客户已提供的关键事实。
3. 列出下一步确实需要的证据或信息，避免过度索取。
4. 仅提供处理方向，不承诺退款、赔付或时效。

输出 JSON：`category`、`priority`（`low|medium|high`）、`known_facts`、`missing_evidence`、`recommended_action`。
