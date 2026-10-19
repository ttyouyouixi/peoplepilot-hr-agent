import { promises as fs } from "fs";
import path from "path";
import type { AnnotationRecord, Conversation, EvaluationCase, EvaluationResult, EvaluationSettings, McpServerConfig, PlannerConfig, PromptExperiment, RunMetric, ServiceRating, Skill, SkillRuntimeConfig, ToolConfig, VersionSnapshot } from "./types";

const dataDir = path.join(process.cwd(), "data");
const businessData = (file: string) => `business/${file}`;
const agentData = (file: string) => `agent/${file}`;
const runtimeData = (file: string) => `runtime/${file}`;
const evaluationData = (file: string) => `evaluation/${file}`;
const governanceData = (file: string) => `governance/${file}`;
const skillsDir = path.join(process.cwd(), "skills");
const legacySkillIds: Record<string, string> = {
  need_extraction: "need-extraction",
  recommendation_decision: "recommendation-decision",
  recommendation_reason: "recommendation-reason",
  response_generator: "response-generator",
  risk_check: "risk-check"
};

function normalizeSkillId(id: string) { return legacySkillIds[id] || id; }

export async function readData<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8")) as T;
}

export async function writeData<T>(file: string, value: T) {
  const tmp = path.join(dataDir, `${file}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, path.join(dataDir, file));
}

export async function createVersion(kind: VersionSnapshot["kind"], label: string, payload: unknown) {
  const versions = await readData<VersionSnapshot[]>(governanceData("versions.json"));
  const version: VersionSnapshot = { id: crypto.randomUUID(), kind, label, payload, createdAt: new Date().toISOString() };
  await writeData(governanceData("versions.json"), [version, ...versions].slice(0, 100));
  return version;
}

function yamlValue(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try { return JSON.parse(trimmed); } catch { return trimmed.slice(1, -1); }
  }
  return trimmed;
}

function parseSkillMarkdown(markdown: string) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("SKILL.md 缺少标准 YAML frontmatter");
  const fields = Object.fromEntries(match[1].split(/\r?\n/).map(line => {
    const index = line.indexOf(":");
    return index < 0 ? [line.trim(), ""] : [line.slice(0, index).trim(), yamlValue(line.slice(index + 1))];
  }));
  if (!fields.name || !fields.description) throw new Error("SKILL.md 必须包含 name 和 description");
  return { id: fields.name, description: fields.description, prompt: match[2].trim() };
}

function readDisplayName(yaml: string, fallback: string) {
  const match = yaml.match(/^\s*display_name:\s*(.+)$/m);
  return match ? yamlValue(match[1]) : fallback;
}

export async function getSkills(): Promise<Skill[]> {
  const configs = (await readData<SkillRuntimeConfig[]>(agentData("skills.json"))).map(config => ({ ...config, id: normalizeSkillId(config.id) }));
  return Promise.all(configs.map(async config => {
    const directory = path.join(skillsDir, config.id);
    const [markdown, agentYaml] = await Promise.all([
      fs.readFile(path.join(directory, "SKILL.md"), "utf8"),
      fs.readFile(path.join(directory, "agents", "openai.yaml"), "utf8").catch(() => "")
    ]);
    const skill = parseSkillMarkdown(markdown);
    if (skill.id !== config.id) throw new Error(`Skill 目录 ${config.id} 与 frontmatter name 不一致`);
    return { ...skill, name: readDisplayName(agentYaml, skill.id), model: config.model, temperature: config.temperature, maxTokens: config.maxTokens, enabled: config.enabled, inputSchema: config.inputSchema, outputSchema: config.outputSchema };
  }));
}

export async function readSkillFile(id: string) {
  const normalizedId = normalizeSkillId(id);
  if (!/^[a-z0-9-]{1,64}$/.test(normalizedId)) throw new Error("非法 Skill 名称");
  return fs.readFile(path.join(skillsDir, normalizedId, "SKILL.md"), "utf8");
}

function skillMarkdown(skill: Skill) {
  return `---\nname: ${skill.id}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.prompt.trim()}\n`;
}

function shortDescription(description: string) {
  let value = description.trim().slice(0, 64);
  const suffix = "，用于本平台 Agent 标准化能力调用流程";
  if (value.length < 25) value = (value + suffix).slice(0, 64);
  return value;
}

function agentMetadata(skill: Skill) {
  return `interface:\n  display_name: ${JSON.stringify(skill.name)}\n  short_description: ${JSON.stringify(shortDescription(skill.description))}\n  default_prompt: ${JSON.stringify(`Use $${skill.id} to handle this request.`)}\n`;
}

function validateSkillDefinition(skill: Skill) {
  if (!/^[a-z0-9-]{1,64}$/.test(skill.id) || skill.id.startsWith("-") || skill.id.endsWith("-") || skill.id.includes("--")) throw new Error("Skill 名称必须是 1-64 位小写连字符格式");
  if (!skill.name.trim() || !skill.description.trim() || !skill.prompt.trim()) throw new Error("显示名称、触发描述和 Skill 指令不能为空");
  if (skill.description.length > 1024 || /[<>]/.test(skill.description)) throw new Error("触发描述不能超过 1024 字符或包含尖括号");
}

export async function createSkill(skill: Skill) {
  validateSkillDefinition(skill);
  const directory = path.join(skillsDir, skill.id);
  const exists = await fs.access(directory).then(() => true).catch(() => false);
  if (exists) throw new Error(`Skill $${skill.id} 已存在`);
  await fs.mkdir(path.join(directory, "agents"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(directory, "SKILL.md"), skillMarkdown(skill), "utf8"),
    fs.writeFile(path.join(directory, "agents", "openai.yaml"), agentMetadata(skill), "utf8")
  ]);
  const configs = (await readData<SkillRuntimeConfig[]>(agentData("skills.json"))).filter(config => normalizeSkillId(config.id) !== skill.id);
  configs.push({ id: skill.id, model: skill.model, temperature: skill.temperature, maxTokens: skill.maxTokens, enabled: skill.enabled, inputSchema: skill.inputSchema, outputSchema: skill.outputSchema });
  const tmp = path.join(dataDir, "agent/skills.json.tmp");
  await fs.writeFile(tmp, JSON.stringify(configs, null, 2), "utf8");
  await fs.rename(tmp, path.join(dataDir, agentData("skills.json")));
  return skill;
}
export async function getTools() { return readData<ToolConfig[]>(agentData("tools.json")); }
export async function getMcpServers() { return readData<McpServerConfig[]>(agentData("mcp-servers.json")); }
export async function getPlanner() { return readData<PlannerConfig>(agentData("planner.json")); }

export async function readToolImplementation(id: string) {
  const tool = (await getTools()).find(item => item.id === id);
  if (!tool) throw new Error(`Tool 不存在：${id}`);

  if (tool.implementation === "json_query") {
    const file = path.basename(tool.dataSource);
    if (file !== tool.dataSource || !/^[a-z0-9-]+\.json$/.test(file)) throw new Error("Tool JSON 数据源不合法");
    const value = JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8"));
    return { kind: "json", path: `data/${file}`, content: JSON.stringify(value, null, 2) };
  }

  if (tool.implementation === "code") {
    if (tool.id !== "calculate_price") throw new Error("该代码 Tool 尚未配置可查看的实现片段");
    const source = await fs.readFile(path.join(process.cwd(), "lib", "engine.ts"), "utf8");
    const startMarker = `  if (id === "${tool.id}") {`;
    const start = source.indexOf(startMarker);
    const end = source.indexOf("\n  throw new Error(`未知 Tool:", start);
    if (start < 0 || end < 0) throw new Error("未找到 Tool 实现代码");
    return { kind: "typescript", path: "lib/engine.ts", content: source.slice(start, end).trim() };
  }

  const server = (await getMcpServers()).find(item => item.id === tool.serverId);
  return {
    kind: "json",
    path: `MCP / ${tool.serverId || "unknown"} / ${tool.remoteName || tool.id}`,
    content: JSON.stringify({
      tool: { id: tool.id, name: tool.name, description: tool.description, remoteName: tool.remoteName, inputSchema: tool.inputSchema },
      server: server ? { id: server.id, name: server.name, url: server.url, authTokenEnv: server.authTokenEnv, enabled: server.enabled } : null
    }, null, 2)
  };
}

export async function saveSkills(skills: Skill[]) {
  const normalizedSkills = skills.map(skill => ({ ...skill, id: normalizeSkillId(skill.id) }));
  await createVersion("skills", "保存 Skill 配置", await getSkills());
  for (const skill of normalizedSkills) {
    validateSkillDefinition(skill);
    const directory = path.join(skillsDir, skill.id);
    await fs.writeFile(path.join(directory, "SKILL.md"), skillMarkdown(skill), "utf8");
    const agentPath = path.join(directory, "agents", "openai.yaml");
    const agentYaml = await fs.readFile(agentPath, "utf8").catch(() => "interface:\n");
    const displayLine = `  display_name: ${JSON.stringify(skill.name)}`;
    const nextAgentYaml = /^\s*display_name:.*$/m.test(agentYaml) ? agentYaml.replace(/^\s*display_name:.*$/m, displayLine) : agentYaml.replace(/^interface:\s*$/m, `interface:\n${displayLine}`);
    await fs.mkdir(path.dirname(agentPath), { recursive: true });
    await fs.writeFile(agentPath, nextAgentYaml, "utf8");
  }
  const tmp = path.join(dataDir, "skills.json.tmp");
  const runtime: SkillRuntimeConfig[] = normalizedSkills.map(({ id, model, temperature, maxTokens, enabled, inputSchema, outputSchema }) => ({ id, model, temperature, maxTokens, enabled, inputSchema, outputSchema }));
  await fs.writeFile(tmp, JSON.stringify(runtime, null, 2), "utf8");
  await fs.rename(tmp, path.join(dataDir, agentData("skills.json")));
}

export async function saveTools(tools: ToolConfig[]) {
  await createVersion("tools", "保存 Tool 配置", await getTools());
  const tmp = path.join(dataDir, "agent/tools.json.tmp");
  await fs.writeFile(tmp, JSON.stringify(tools, null, 2), "utf8");
  await fs.rename(tmp, path.join(dataDir, agentData("tools.json")));
}

export async function saveMcpServers(servers: McpServerConfig[]) {
  const tmp = path.join(dataDir, "agent/mcp-servers.json.tmp");
  await fs.writeFile(tmp, JSON.stringify(servers, null, 2), "utf8");
  await fs.rename(tmp, path.join(dataDir, agentData("mcp-servers.json")));
}

export async function savePlanner(planner: PlannerConfig) {
  if (!planner.name.trim() || !planner.prompt.trim()) throw new Error("Planner 名称和 Prompt 不能为空");
  if (!planner.requiredSkills.includes("risk-check")) throw new Error("必经 Skill 必须包含 risk-check");
  await createVersion("planner", "保存 Planner 配置", await getPlanner());
  const tmp = path.join(dataDir, "agent/planner.json.tmp");
  await fs.writeFile(tmp, JSON.stringify(planner, null, 2), "utf8");
  await fs.rename(tmp, path.join(dataDir, agentData("planner.json")));
}

export async function getVersions() { return readData<VersionSnapshot[]>(governanceData("versions.json")); }
export async function getConversations() { return readData<Conversation[]>(runtimeData("conversations.json")); }
export async function getConversation(id: string) { return (await getConversations()).find(item => item.id === id); }
export async function saveConversation(conversation: Conversation) {
  const all = await getConversations();
  await writeData(runtimeData("conversations.json"), [conversation, ...all.filter(item => item.id !== conversation.id)].slice(0, 100));
}
export async function appendMetric(metric: RunMetric) {
  await writeData(runtimeData("metrics.json"), [metric, ...(await readData<RunMetric[]>(runtimeData("metrics.json")))].slice(0, 500));
}
export async function getMetrics() { return readData<RunMetric[]>(runtimeData("metrics.json")); }
export async function getEvaluationCases() { return readData<EvaluationCase[]>(evaluationData("eval-cases.json")); }
export async function saveEvaluationCases(cases: EvaluationCase[]) { await writeData(evaluationData("eval-cases.json"), cases); }
export async function getEvaluationResults() { return readData<EvaluationResult[]>(evaluationData("eval-results.json")); }
export async function appendEvaluationResult(result: EvaluationResult) { await writeData(evaluationData("eval-results.json"), [result, ...(await getEvaluationResults())].slice(0, 300)); }
export async function getEvaluationSettings() { return readData<EvaluationSettings>(evaluationData("eval-settings.json")); }
export async function saveEvaluationSettings(settings: EvaluationSettings) { await writeData(evaluationData("eval-settings.json"), settings); }
export async function getExperiments() { return readData<PromptExperiment[]>(governanceData("experiments.json")); }
export async function saveExperiments(experiments: PromptExperiment[]) { await writeData(governanceData("experiments.json"), experiments); }
export async function appendHandoff(value: unknown) { await writeData(runtimeData("handoffs.json"), [value, ...(await readData<unknown[]>(runtimeData("handoffs.json")))].slice(0, 200)); }
export async function getAnnotations() { return readData<AnnotationRecord[]>(evaluationData("annotations.json")); }
export async function saveAnnotations(records: AnnotationRecord[]) { await writeData(evaluationData("annotations.json"), records.slice(0, 1000)); }
export async function getServiceRatings() { return readData<ServiceRating[]>(runtimeData("service-ratings.json")); }
export async function appendServiceRating(rating: ServiceRating) { await writeData(runtimeData("service-ratings.json"), [rating, ...(await getServiceRatings())].slice(0, 1000)); }
