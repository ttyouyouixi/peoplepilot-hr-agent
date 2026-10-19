# PeoplePilot Vibe Coding Prompt

你是一个资深全栈产品工程师，请基于当前仓库继续开发一个「人事 AI Agent / Planner / Skill / Tool 后台管理平台」。

请像和产品负责人一起协作一样工作：先理解现有架构，再小步实现、及时验证、保持页面结构清晰。参考 `snack-agent-studio-main` 的工程组织和页面框架，但不得保留零食、电商、商品、优惠券、订单等业务内容。

## 项目定位

PeoplePilot 是一个面向 HR 和 Leader 的人事 AI 管理平台。

第一阶段建设后台管理工作台，帮助 Leader 和 HR：

- 总结员工个人状态
- 总结团队管理状态
- 识别需要进一步确认的管理信号
- 准备基于事实的管理沟通
- 生成可跟进的管理行动计划建议

后续扩展员工自助前台，支持制度问答、流程引导和自动提单。

它不是简单的聊天机器人，也不是替代 HR 或 Leader 做最终人事决策的自动化系统。

## 核心执行链路

```text
用户提出管理问题
  ↓
Planner 识别意图并生成 Plan
  ↓
Tool 查询企业事实数据
  ↓
Skill 分析和组织结果
  ↓
response-generator 生成角色适配的回复
  ↓
risk-check 做事实、敏感信息、语气和权限审核
  ↓
展示最终结果与 execution trace
```

Planner 不负责直接做人事判断，也不存在独立的“主 Skill”。Planner 负责选择和编排 Skill / Tool，Executor 负责按 Plan 执行。

## Agent 执行主链路

核心执行逻辑位于 `lib/engine.ts`。页面不能只展示预设 Plan，必须通过同一条执行链路得到实际结果。

```text
1. 读取 Skill 配置、Tool 配置和 Planner 配置
2. 读取 skills/<id>/SKILL.md 作为 Skill Prompt
3. Planner 基于用户输入、可用 Skill 和可用 Tool 生成候选 Plan
4. 代码校验 Plan，只允许使用已启用的能力
5. 注入必经 Skill、条件 Tool 和人事安全规则
6. Executor 按步骤执行 Plan
   - Skill 调用真实模型
   - 本地 Tool 查询 JSON 或执行确定性计算
   - 后续 Skill 可以消费前置 Tool / Skill 的结构化输出
7. 每一步记录 executionTrace
8. response-generator 组织候选最终回复
9. risk-check 作为最后一步执行事实、权限、敏感信息和表达审核
10. 未通过审核时只返回安全替代内容，并标记人工复核
11. 写入 metrics、conversations、ratings、eval results 等运营数据
```

### 执行约束

- Planner 不能调用不存在或未启用的 Skill / Tool。
- 必经 Skill 由代码校验和注入，不能只依赖 System Prompt。
- `risk-check` 必须是最后一个 Skill；停用或执行失败时不能返回未经审核的结果。
- Tool 返回事实，Skill 负责聚合、比较和分析；不得让模型虚构企业数据。
- 任一步失败都要记录失败步骤、错误、重试次数和当前 Trace；是否重试由 Executor 配置决定。
- 需要人工确认的结果不能伪装成自动完成。

### 执行记录

每一步至少记录：

```json
{
  "step": "performance.record.query",
  "type": "tool",
  "status": "success",
  "input": {},
  "output": {},
  "startedAt": "2026-10-15T10:00:00Z",
  "durationMs": 420,
  "attempts": 1
}
```

完整运行还需要关联：

- `requestId`：本次请求
- `sessionId`：多轮会话
- `executionTrace`：执行链路
- `risk`：风险审核结果
- `handoff`：是否需要人工接管
- `experiments`：使用的 Prompt / Skill 版本

### 运营数据

每次运行完成后，根据执行结果写入：

- `metrics`：成功率、耗时、步骤数、失败步骤、风险等级
- `conversations`：后台 Agent 会话记录
- `ratings`：HR / Leader 对结果的评分和反馈
- `eval-results`：评测集运行结果
- `annotations`：人工标注和 Bad Case

这些数据必须来自真实执行链路，而不是页面静态写死。

## 技术栈

- Next.js App Router
- TypeScript
- React
- 本地 JSON 文件模拟企业数据
- OpenAI API 或兼容大模型 API
- 不需要真实登录
- 不需要真实企业接口
- 第一阶段不要求接入真实 MCP

## 校验方式

```bash
npm run typecheck
npm run build
```

每次改完功能至少运行 `npm run typecheck`；涉及页面、路由或 API 的重要改动需要运行 `npm run build`。

## 当前项目结构

```text
app/
  page.tsx                  后台 Agent 执行页
  demo/page.tsx             Agent 对话 Demo
  skills/page.tsx           Skill 管理页
  tools/page.tsx            Tool 管理页
  planner/page.tsx          Planner 管理页
  ops/page.tsx              运行监控与评测运营页
  catalog/page.tsx          人事数据中心
  api/                      本地 API

components/
  AnnotationWorkspace.tsx   数据标注工作区
  ImprovementCenter.tsx     改进建议中心
  HumanReviewWorkspace.tsx   人工评估工作区
  JudgePromptEditor.tsx      LLM-as-Judge Prompt 管理
  Header.tsx                 顶部导航

lib/
  engine.ts                  Planner / Executor / Skill / Tool 执行逻辑
  store.ts                   本地 JSON 存储
  types.ts                   全局类型
  mcp.ts                     MCP 工具调用
  eval-seeds.ts              Eval 种子用例

data/
  employees.json            员工基本信息、教育、岗位职级、履历、人事异动、技能
  attendance.json           考勤明细
  feedback-360.json         360 反馈明细
  performance.json          绩效记录
  org-structure.json        组织关系
  talent-reviews.json       人才盘点和九宫格
  skills.json               Skill 配置
  tools.json                Tool 配置
  planner.json              Planner 配置

skills/
  employee-summary/SKILL.md
  team-summary/SKILL.md
  management-signal/SKILL.md
  communication-prep/SKILL.md
  action-plan/SKILL.md
  response-generator/SKILL.md
  risk-check/SKILL.md
```

## Skill

### 业务 Skill

- `employee-summary`：员工个人总结
- `team-summary`：团队管理总结
- `management-signal`：管理关注信号识别
- `communication-prep`：管理沟通准备
- `action-plan`：管理行动计划建议

### 系统 Skill

- `response-generator`：将结果组织成适合当前角色的最终回复
- `risk-check`：最终的人事风险与事实一致性审核

## Tool

- `employee.profile.query`：员工基本信息、教育、岗位职级、履历、人事异动、技能和雇佣状态
- `attendance.record.query`：出勤、迟到、早退、缺勤、请假和加班明细
- `feedback.360.query`：反馈时间、反馈周期、反馈来源角色、维度、主题、正负向和评分
- `performance.record.query`：绩效周期、目标完成情况、绩效等级、Leader 评价、优势和差距
- `org.structure.query`：团队成员、部门层级、直属 Leader 和汇报链路
- `talent.review.query`：盘点周期、绩效档位、潜力档位、九宫格、继任池和发展准备度

后续员工自助前台可以增加：

- `policy.knowledge.search`：员工可见的制度知识库查询
- `ticket.request.create`：员工确认后创建人事服务工单

## 数据边界

- 入职、转岗、调岗、晋升、职级变化和离职统一存入员工档案的 `personnel_events`，但保留 `event_type`。
- 考勤 Tool 返回明细，趋势由 Skill 基于时间范围聚合计算。
- 360 Tool 返回按时间保存的反馈，历史变化由 Skill 对不同周期比较后得出。

## Planner 规则

- 只能调用已启用的 Skill 和 Tool。
- 个人问题优先查询员工档案；团队问题优先查询组织关系。
- 需要趋势、比较或管理信号时，必须明确时间范围。
- `management-signal` 必须建立在 Tool 数据或前置总结之上。
- `communication-prep` 必须建立在事实或管理关注信号之上。
- `action-plan` 必须建立在管理目标、关注信号或沟通准备之上。
- `response-generator` 必须在业务 Skill 之后执行。
- `risk-check` 必须是最后一个 Skill。
- 数据不足、来源冲突或权限不足时，不得补造事实，必须返回 `data_gaps` 或请求人工确认。
- 涉及晋升、转正、淘汰、离职等事项时，只能输出辅助判断，不能替代最终人事决定。

## risk-check 规则

`risk-check` 是强制环节，不允许停用后直接返回模型结果。

第一阶段至少实现以下基础拦截：

- 回复中的员工姓名、日期、岗位、绩效、考勤、反馈等事实必须能在 Tool 或前置 Skill 证据中找到。
- 回复中的日期、数值、等级、次数不得与数据源不一致。
- 无权限或非必要场景禁止输出薪酬、奖金、股权、工资和具体收入信息。
- 拦截情绪化、羞辱性、威胁性、歧视性、标签化和未经证实的心理判断。
- 不得把“可能、建议、需要确认”改写成“确定、必须、就是”。
- 回复必须区分事实、计算结果、AI 建议和待人工确认事项。
- 缺少时间范围、数据来源或数据不足说明时，降低结论等级或拦截。

审核失败时不得展示原始回复，只能返回安全替代内容，并标记需要人工复核。

## 页面要求

保留参考项目的页面框架和信息组织方式，但业务文案必须全部改成人事语境：

### `/`

后台 Agent 执行页，展示：

- Leader / HR 输入的问题
- 读取已启用 Skill 和 Tool。
- Planner 生成 Plan JSON。
- Executor 执行每一步。
- 展示：
  - 用户输入
  - Planner 计划
  - Planner 思考 / 决策过程
  - 每一步 Skill / Tool 调用
  - 每一步输入输出 JSON
  - 最终客服回复
  - 风控审核结果
  - 全链路 Trace
- 支持多轮会话。
- 支持步骤失败重试。
- 支持人工接管。
- Agent 和 Planner 都有解释说明能力。


### `/skills`

展示和配置人事 Skill，包括名称、说明、启用状态、输入输出协议和测试入口。

### `/tools`

展示和配置人事 Tool，包括数据源、字段范围、权限说明、启用状态和测试入口。

### `/planner`

展示和编辑 Planner Prompt、必经 Skill、Tool 规则，并预览当前问题生成的 Plan。

### `/ops`

保留参考项目的运营中心结构，展示运行监控、改进建议、人工评估、服务评分、评测集、评测中心、数据标注、版本管理和 Prompt / Skill 实验能力。

#### 运行监控

展示：

- 请求量
- Agent 成功率
- 平均耗时
- 失败步骤
- Skill / Tool 失败率
- 重试次数
- 风险拦截率
- 人工复核率
- 人工接管率

第一阶段使用本地 JSON 和 `execution_trace` 保存指标；后续可以接入企业日志、Metrics 和 Trace 平台。

#### 评测中心

评测必须真实调用当前版本的 Agent，不能只读取预先写好的静态结果。

评测流程：

```text
评测集
  ↓
调用当前 Planner / Executor
  ↓
记录实际 Plan、Tool、Skill、回复和 risk-check
  ↓
执行规则评分
  ↓
保存 eval-results.json
  ↓
在评测中心展示结果
```

第一阶段至少评测：

- Plan 是否选择正确能力
- Tool 是否调用正确
- 必经 Skill 是否执行
- `risk-check` 是否最后执行
- 员工事实、日期、数值和等级是否正确
- 是否引用了不存在的数据
- 是否区分事实、分析、建议和待确认事项
- 是否输出薪酬等敏感信息
- 是否出现情绪化、歧视性或标签化表达
- 是否在数据冲突时正确拦截
- 执行耗时、失败步骤和重试次数

#### 评测集

使用项目自带的评测集页面和 JSON 存储。评测用例至少包含：

```json
{
  "id": "employee-summary-001",
  "name": "员工状态总结",
  "input": "帮我总结张一鸣当前的工作状态",
  "expectedCapabilities": [
    "employee.profile.query",
    "performance.record.query",
    "employee-summary",
    "response-generator",
    "risk-check"
  ],
  "expectedFacts": ["张一鸣", "目标完成率"],
  "forbiddenPhrases": ["肯定会离职", "应该淘汰"],
  "riskMustPass": true,
  "maxLatencyMs": 5000
}
```

评测集来源包括：专家构造的标准问题、脱敏后的真实问题、线上 Bad Case、权限越界场景、敏感信息场景和边界场景。

#### 数据标注

复用参考项目的数据标注工作区，但将标注维度改成人事 Agent：

- 问题类型：员工个人、团队管理、沟通准备、行动计划、员工自助制度问答
- 事实准确性：正确、部分正确、错误
- Plan 正确性：正确、多调用、漏调用、顺序错误
- 建议质量：可执行、过于泛化、越权、缺少依据
- 风险等级：低、中、高
- 处理结果：通过、拦截、需要人工复核

标注对象可以是用户问题、Plan、Tool 调用、Skill 输出、最终回复和 `risk-check` 结果。

标注结果用于形成 Bad Case、生成 Skill / Prompt 改进建议、补充评测集和对比版本质量变化。

#### 数据存储约定

第一阶段使用本地 JSON 文件模拟数据层：

- `eval-cases.json`：评测集
- `eval-results.json`：实际运行后的评测结果
- `annotations.json`：人工标注
- `metrics.json`：运行指标
- `versions.json`：配置版本快照

JSON 只是当前 Demo 的存储载体。评测、标注和运行监控都要与当前 Agent 的真实执行结果关联，不能只展示静态结果。

生产环境可以替换为企业内部数据平台、日志平台、评测服务和标注平台，但不改变上述执行闭环。

### `/catalog`

展示本地模拟人事数据，包括员工、组织、考勤、绩效、360 和人才盘点。

### `/demo`

保留为后续员工自助前台入口，未来支持制度 QA、流程引导和自动提单。第一阶段可以先展示占位状态，不要复用后台敏感数据。

## 第一阶段验收标准

- 页面框架与参考项目一致。
- 输入员工管理问题后，Planner 可以生成合法 Plan。
- Plan 只调用人事 Skill 和 Tool。
- Tool 数据可以传递给后续 Skill。
- 每个管理信号都有数据来源和时间范围。
- response-generator 不得添加不存在的事实。
- risk-check 必须执行并记录结果。
- 至少覆盖事实不一致、薪酬敏感信息和情绪化表达三类拦截测试。
- 执行轨迹可以清楚回答“Plan 是否走对了”。
