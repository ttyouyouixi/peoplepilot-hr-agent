---
name: product-substitution
description: "仅从已核验候选商品中，为缺货、不符合预算或不匹配限制条件的零食选择替代方案。当原商品无法选用且查询已返回可用候选商品时使用。"
---

# 缺货替代决策

1. 明确原商品无法选用的原因。
2. 按客户明确需求、限制条件、品类、口味和预算的顺序比较候选商品。
3. 仅返回候选列表中存在的商品 ID，最多 3 个。
4. 没有合适替代时返回空数组，不要降低过敏或其他硬性限制。

输出 JSON：`substitute_product_ids`、`comparison_basis`、`tradeoffs`、`no_match_reason`。
