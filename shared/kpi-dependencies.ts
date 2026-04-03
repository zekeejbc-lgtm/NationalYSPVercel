export const KPI_DEPENDENCY_STORAGE_PREFIX = "kpi_dependency_v1:";

export const KPI_DEPENDENCY_METRICS = [
  "members_directory_count",
  "officers_count",
  "project_reports_count",
  "documents_acknowledged_count",
  "national_messages_count",
  "volunteer_opportunities_count",
  "mou_submissions_count",
  "chapter_requests_count",
  "publications_count",
  "active_barangay_accounts_count",
] as const;

export const KPI_DEPENDENCY_START_DATE_METRICS = [
  "members_directory_count",
  "project_reports_count",
  "publications_count",
] as const;

export const KPI_DEPENDENCY_OPERATORS = [">=", ">", "=", "<=", "<"] as const;

export type KpiDependencyMetric = typeof KPI_DEPENDENCY_METRICS[number];
export type KpiDependencyOperator = typeof KPI_DEPENDENCY_OPERATORS[number];
export type KpiDependencyAggregation = "all" | "any";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type KpiDependencyRule = {
  id: string;
  metric: KpiDependencyMetric;
  operator: KpiDependencyOperator;
  targetValue: number;
  startDate?: string;
};

export type KpiDependencyConfig = {
  version: 1;
  mode: "auto";
  aggregation: KpiDependencyAggregation;
  rules: KpiDependencyRule[];
};

export const KPI_DEPENDENCY_METRIC_LABELS: Record<KpiDependencyMetric, string> = {
  members_directory_count: "Members In Directory",
  officers_count: "Officers Count",
  project_reports_count: "Project Reports Submitted",
  documents_acknowledged_count: "Acknowledged Documents",
  national_messages_count: "National Messages Sent",
  volunteer_opportunities_count: "Volunteer Opportunities Created",
  mou_submissions_count: "MOU Submission",
  chapter_requests_count: "Chapter Requests Sent",
  publications_count: "Publications Created",
  active_barangay_accounts_count: "Active Barangay Accounts",
};

export const KPI_DEPENDENCY_OPERATOR_LABELS: Record<KpiDependencyOperator, string> = {
  ">=": "is at least",
  ">": "is greater than",
  "=": "is exactly",
  "<=": "is at most",
  "<": "is less than",
};

function isDependencyMetric(value: unknown): value is KpiDependencyMetric {
  return typeof value === "string" && (KPI_DEPENDENCY_METRICS as readonly string[]).includes(value);
}

function isDependencyOperator(value: unknown): value is KpiDependencyOperator {
  return typeof value === "string" && (KPI_DEPENDENCY_OPERATORS as readonly string[]).includes(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeDateOnly(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!DATE_ONLY_PATTERN.test(trimmed)) {
    return null;
  }

  const [yearPart, monthPart, dayPart] = trimmed.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return trimmed;
}

export function isKpiDependencyMetricStartDateCapable(metric: KpiDependencyMetric): boolean {
  return (KPI_DEPENDENCY_START_DATE_METRICS as readonly string[]).includes(metric);
}

export function parseKpiDependencyStartDateToDate(startDate: string | null | undefined): Date | null {
  const normalized = normalizeDateOnly(startDate);
  if (!normalized) {
    return null;
  }

  const [yearPart, monthPart, dayPart] = normalized.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function normalizeRule(raw: unknown): KpiDependencyRule | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<KpiDependencyRule>;
  if (!isDependencyMetric(candidate.metric) || !isDependencyOperator(candidate.operator)) {
    return null;
  }

  const normalizedTarget = toFiniteNumber(candidate.targetValue);
  if (normalizedTarget === null || normalizedTarget < 0) {
    return null;
  }

  const ruleId =
    typeof candidate.id === "string" && candidate.id.trim().length > 0
      ? candidate.id.trim()
      : `rule_${Math.random().toString(36).slice(2, 10)}`;

  const normalizedStartDate = isKpiDependencyMetricStartDateCapable(candidate.metric)
    ? normalizeDateOnly(candidate.startDate)
    : null;

  return {
    id: ruleId,
    metric: candidate.metric,
    operator: candidate.operator,
    targetValue: Math.round(normalizedTarget),
    ...(normalizedStartDate ? { startDate: normalizedStartDate } : {}),
  };
}

export function createDefaultKpiDependencyRule(): KpiDependencyRule {
  return {
    id: `rule_${Math.random().toString(36).slice(2, 10)}`,
    metric: "members_directory_count",
    operator: ">=",
    targetValue: 1,
    startDate: undefined,
  };
}

export function parseKpiDependencyConfig(linkedEntityId: string | null | undefined): KpiDependencyConfig | null {
  if (!linkedEntityId) {
    return null;
  }

  const trimmed = linkedEntityId.trim();
  if (!trimmed) {
    return null;
  }

  const serialized = trimmed.startsWith(KPI_DEPENDENCY_STORAGE_PREFIX)
    ? trimmed.slice(KPI_DEPENDENCY_STORAGE_PREFIX.length)
    : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const candidate = parsed as Partial<KpiDependencyConfig>;
  if (candidate.version !== 1 || candidate.mode !== "auto") {
    return null;
  }

  const aggregation: KpiDependencyAggregation = candidate.aggregation === "any" ? "any" : "all";
  const normalizedRules = Array.isArray(candidate.rules)
    ? candidate.rules.map(normalizeRule).filter((rule): rule is KpiDependencyRule => Boolean(rule))
    : [];

  if (normalizedRules.length === 0) {
    return null;
  }

  return {
    version: 1,
    mode: "auto",
    aggregation,
    rules: normalizedRules,
  };
}

export function serializeKpiDependencyConfig(config: KpiDependencyConfig | null): string | null {
  if (!config) {
    return null;
  }

  const parsedConfig = parseKpiDependencyConfig(JSON.stringify(config));
  if (!parsedConfig) {
    return null;
  }

  return `${KPI_DEPENDENCY_STORAGE_PREFIX}${JSON.stringify(parsedConfig)}`;
}

export function evaluateKpiDependencyRule(actualValue: number, operator: KpiDependencyOperator, targetValue: number): boolean {
  switch (operator) {
    case ">=":
      return actualValue >= targetValue;
    case ">":
      return actualValue > targetValue;
    case "=":
      return actualValue === targetValue;
    case "<=":
      return actualValue <= targetValue;
    case "<":
      return actualValue < targetValue;
    default:
      return false;
  }
}

export function formatKpiDependencyRuleDescription(
  metric: KpiDependencyMetric,
  operator: KpiDependencyOperator,
  targetValue: number,
  startDate?: string,
): string {
  const suffix = startDate ? ` (counting from ${startDate})` : "";
  return `${KPI_DEPENDENCY_METRIC_LABELS[metric]} ${KPI_DEPENDENCY_OPERATOR_LABELS[operator]} ${targetValue}${suffix}`;
}

export function summarizeKpiDependencyConfig(config: KpiDependencyConfig): string {
  const modeLabel = config.aggregation === "any" ? "Any rule can pass" : "All rules must pass";
  const parts = config.rules.map(
    (rule) => formatKpiDependencyRuleDescription(rule.metric, rule.operator, rule.targetValue, rule.startDate),
  );

  return `${modeLabel}: ${parts.join("; ")}`;
}
