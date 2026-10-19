export type Skill = {
  id: string; name: string; description: string; prompt: string; model: string;
  temperature: number; maxTokens: number; enabled: boolean;
  inputSchema?: JsonSchema; outputSchema?: JsonSchema;
};

export type JsonSchema = { type?: string; required?: string[]; properties?: Record<string, { type?: string }>; additionalProperties?: boolean };

export type SkillRuntimeConfig = {
  id: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
};

export type PlannerConfig = {
  id: "customer-service-planner";
  name: string;
  description: string;
  prompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  requiredSkills: string[];
  baseTools: string[];
  priceTools: string[];
};

export type ToolConfig = {
  id: string;
  name: string;
  description: string;
  implementation: "json_query" | "code" | "mcp";
  dataSource: string;
  enabled: boolean;
  serverId?: string;
  remoteName?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpServerConfig = {
  id: string;
  name: string;
  url: string;
  authTokenEnv: string;
  enabled: boolean;
};

export type PlanStep = { id: string; capability: string; type: "skill" | "tool"; purpose: string; dependsOn?: string[]; parallelGroup?: string; condition?: string };
export type PlannerDecisionEvent = {
  stage: "intent" | "availability" | "policy" | "model" | "validation" | "assembly";
  title: string;
  detail: string;
  data?: Record<string, unknown>;
};
export type Plan = { goal: string; reasoning: string; decisionTrace: PlannerDecisionEvent[]; steps: PlanStep[] };

export type TraceItem = PlanStep & {
  status: "running" | "success" | "failed" | "waiting_human";
  input: unknown; output: unknown; startedAt: string; durationMs: number; attempts?: number;
};

export type RunResult = {
  requestId: string; mode: "ai"; userInput: string; plan: Plan;
  executionTrace: TraceItem[]; finalReply: string;
  risk: { passed: boolean; risk_level: string; issues: string[]; safe_reply?: string };
  sessionId?: string;
  handoff?: { required: boolean; reason?: string };
  experiments?: Array<{ skillId: string; variant: "control" | "variant" }>;
};

export type Conversation = { id: string; createdAt: string; updatedAt: string; messages: Array<{ role: "user" | "assistant"; content: string; at: string }>; };
export type ServiceQaPair = { question: string; answer: string };
export type ServiceRating = {
  id: string; sessionId?: string; requestId?: string; score: 1 | 2 | 3 | 4 | 5; feedback: string;
  qaPairs: ServiceQaPair[]; messages: Array<{ role: "user" | "assistant"; content: string }>;
  createdAt: string; source: "demo" | "agent";
};
export type VersionSnapshot = { id: string; kind: "skills" | "planner" | "tools" | "catalog"; label: string; createdAt: string; payload: unknown };
export type EvaluationAssertions = {
  expectedCapabilities: string[];
  forbiddenCapabilities: string[];
  expectedFacts: string[];
  forbiddenPhrases: string[];
  riskMustPass: boolean;
  maxLatencyMs: number;
};
export type EvaluationCase = {
  id: string; name: string; input: string; expectedKeywords: string[]; enabled: boolean;
  tags: string[]; judgeCriteria: string; assertions: EvaluationAssertions;
  qualityDimensions?: QualityDimensions;
};
export type EvaluationLayerScores = { planner: number; skills: number; tools: number; response: number; risk: number; performance: number };
export type EvaluationScoringMethod = {
  id: "exact_match" | "cosine_similarity" | "llm_as_judge" | "human_review";
  name: string;
  enabled: boolean;
  score?: number;
  weight?: number;
  evidence: string;
  details: string[];
};
export type EvaluationSettings = {
  judgePrompt: string;
  updatedAt: string;
};
export type EvaluationResult = {
  id: string; caseId: string; passed: boolean; score: number; latencyMs: number; issues: string[]; createdAt: string;
  requestId?: string; layerScores: EvaluationLayerScores; capabilityPath: string[];
  judge?: { score: number; issues: string[] };
  scoringMethods?: EvaluationScoringMethod[];
  finalReply?: string; plannerReasoning?: string; trace?: TraceItem[];
  risk?: { passed: boolean; risk_level: string; issues: string[]; safe_reply?: string };
};
export type RunMetric = { id: string; requestId: string; createdAt: string; success: boolean; latencyMs: number; stepCount: number; failedStep?: string; riskLevel?: string; sessionId?: string; experiments?: Array<{ skillId: string; variant: string }> };
export type PromptExperiment = { id: string; name: string; skillId: string; variantPrompt: string; trafficPercent: number; enabled: boolean; createdAt: string };
export type QualityDimensionKey = "correctness" | "relevance" | "completeness" | "safety" | "tone" | "overall";
export type QualityDimensions = Record<QualityDimensionKey, { score: number; note: string }>;
export type AnnotationRecord = {
  id: string; source: "manual" | "bad_case" | "conversation"; sourceId?: string;
  input: string; modelResponse: string; expectedResponse: string;
  intentLabel: string; riskLevel: "low" | "medium" | "high"; qualityLabel: "good" | "bad" | "uncertain";
  qualityDimensions: QualityDimensions;
  requiredCapabilities: string[]; expectedFacts: string[]; forbiddenPhrases: string[];
  status: "pending" | "annotated" | "approved" | "rejected"; notes: string;
  createdAt: string; updatedAt: string;
};
