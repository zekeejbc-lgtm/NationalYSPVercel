import type { KpiCompletion, KpiTemplate } from "@shared/schema";
import {
  evaluateKpiDependencyRule,
  formatKpiDependencyRuleDescription,
  parseKpiDependencyStartDateToDate,
  parseKpiDependencyConfig,
  summarizeKpiDependencyConfig,
  type KpiDependencyConfig,
  type KpiDependencyMetric,
} from "@shared/kpi-dependencies";
import { storage } from "./storage";

type AutoDependencyEvaluation = {
  isCompleted: boolean;
  numericValue: number | null;
  textValue: string | null;
};

type SyncAutoDependencyOptions = {
  chapterId: string;
  year?: number;
  quarter?: number;
};

function getDependencyTemplateConfig(template: KpiTemplate): KpiDependencyConfig | null {
  return parseKpiDependencyConfig(template.linkedEntityId);
}

function getMetricCacheKey(metric: KpiDependencyMetric, startDate?: string): string {
  return `${metric}|${startDate ?? "all_time"}`;
}

export function isAutoDependencyTemplate(template: Pick<KpiTemplate, "linkedEntityId">): boolean {
  return Boolean(parseKpiDependencyConfig(template.linkedEntityId));
}

async function resolveMetricValue(chapterId: string, metric: KpiDependencyMetric, startDate?: string): Promise<number> {
  const resolvedStartDate = parseKpiDependencyStartDateToDate(startDate);

  switch (metric) {
    case "members_directory_count": {
      const members = await storage.getMembersByChapter(chapterId, { startDate: resolvedStartDate });
      return members.filter((member) => member.isActive).length;
    }
    case "officers_count": {
      const officers = await storage.getChapterOfficers(chapterId);
      return officers.length;
    }
    case "project_reports_count": {
      const reports = await storage.getProjectReportsByChapter(chapterId, { startDate: resolvedStartDate });
      return reports.length;
    }
    case "documents_acknowledged_count": {
      const acknowledgements = await storage.getChapterDocumentAcks(chapterId);
      return acknowledgements.filter((ack) => ack.acknowledged).length;
    }
    case "national_messages_count": {
      const messages = await storage.getNationalRequestsBySender("chapter", chapterId);
      return messages.length;
    }
    case "volunteer_opportunities_count": {
      const opportunities = await storage.getVolunteerOpportunitiesByChapter(chapterId);
      return opportunities.length;
    }
    case "mou_submissions_count": {
      const mouSubmission = await storage.getMouSubmissionByChapter(chapterId);
      return mouSubmission ? 1 : 0;
    }
    case "chapter_requests_count": {
      const chapterRequests = await storage.getChapterRequestsByChapter(chapterId);
      return chapterRequests.length;
    }
    case "publications_count": {
      const publications = await storage.getPublicationsByChapter(chapterId, { startDate: resolvedStartDate });
      return publications.length;
    }
    case "active_barangay_accounts_count": {
      const barangays = await storage.getBarangayUsersByChapterId(chapterId);
      return barangays.filter((barangay) => barangay.isActive).length;
    }
    default:
      return 0;
  }
}

async function evaluateAutoDependencyConfig(
  chapterId: string,
  config: KpiDependencyConfig,
  metricCache: Map<string, number>,
): Promise<AutoDependencyEvaluation> {
  const ruleOutcomes: Array<{ ruleLine: string; passed: boolean; value: number }> = [];

  for (const rule of config.rules) {
    const cacheKey = getMetricCacheKey(rule.metric, rule.startDate);
    let actualValue = metricCache.get(cacheKey);
    if (actualValue === undefined) {
      actualValue = await resolveMetricValue(chapterId, rule.metric, rule.startDate);
      metricCache.set(cacheKey, actualValue);
    }

    const passed = evaluateKpiDependencyRule(actualValue, rule.operator, rule.targetValue);
    const expectedRule = formatKpiDependencyRuleDescription(rule.metric, rule.operator, rule.targetValue, rule.startDate);
    const ruleLine = `${expectedRule}; current value is ${actualValue}`;
    ruleOutcomes.push({
      ruleLine,
      passed,
      value: actualValue,
    });
  }

  const isCompleted =
    config.aggregation === "any"
      ? ruleOutcomes.some((outcome) => outcome.passed)
      : ruleOutcomes.every((outcome) => outcome.passed);

  const firstRuleValue = ruleOutcomes[0]?.value ?? null;
  const ruleSummaryLines = ruleOutcomes.map((outcome) => `${outcome.passed ? "PASS" : "PENDING"} - ${outcome.ruleLine}`);
  const textValue = `${summarizeKpiDependencyConfig(config)} || ${ruleSummaryLines.join(" || ")}`;

  return {
    isCompleted,
    numericValue: firstRuleValue,
    textValue,
  };
}

function shouldUpdateCompletion(
  existing: KpiCompletion,
  next: { isCompleted: boolean; numericValue: number | null; textValue: string | null; completedAt: Date | null },
): boolean {
  const existingCompletedAt = existing.completedAt ? new Date(existing.completedAt) : null;
  const nextCompletedAt = next.completedAt ? new Date(next.completedAt) : null;

  return (
    existing.isCompleted !== next.isCompleted ||
    (existing.numericValue ?? null) !== (next.numericValue ?? null) ||
    (existing.textValue ?? null) !== (next.textValue ?? null) ||
    (existingCompletedAt?.getTime() ?? null) !== (nextCompletedAt?.getTime() ?? null)
  );
}

export async function syncAutoDependencyKpiCompletions(
  options: SyncAutoDependencyOptions,
): Promise<void> {
  const templates = await storage.getKpiTemplatesForChapter(options.year, options.chapterId, options.quarter);
  const recipientTemplates = templates.filter((template) => template.scope !== "selected_barangays");
  const nonRecipientTemplateIds = templates
    .filter((template) => template.scope === "selected_barangays")
    .map((template) => template.id);

  const existingCompletions = await storage.getKpiCompletions(options.chapterId, options.year, options.quarter);

  if (nonRecipientTemplateIds.length > 0) {
    const staleCompletions = existingCompletions.filter((completion) =>
      nonRecipientTemplateIds.includes(completion.kpiTemplateId),
    );
    for (const completion of staleCompletions) {
      await storage.deleteKpiCompletion(completion.id);
    }
  }

  const autoTemplates = recipientTemplates
    .map((template) => ({ template, config: getDependencyTemplateConfig(template) }))
    .filter((item): item is { template: KpiTemplate; config: KpiDependencyConfig } => Boolean(item.config));

  if (autoTemplates.length === 0) {
    return;
  }

  const existingByTemplateId = new Map(existingCompletions.map((completion) => [completion.kpiTemplateId, completion]));
  const metricCache = new Map<string, number>();

  for (const { template, config } of autoTemplates) {
    const evaluation = await evaluateAutoDependencyConfig(options.chapterId, config, metricCache);
    const existingCompletion = existingByTemplateId.get(template.id);

    if (!existingCompletion) {
      await storage.createKpiCompletion({
        chapterId: options.chapterId,
        kpiTemplateId: template.id,
        numericValue: evaluation.numericValue,
        textValue: evaluation.textValue,
        isCompleted: evaluation.isCompleted,
        completedAt: evaluation.isCompleted ? new Date() : null,
      });
      continue;
    }

    const completedAt = evaluation.isCompleted
      ? existingCompletion.completedAt ?? new Date()
      : null;

    const updatePayload = {
      isCompleted: evaluation.isCompleted,
      numericValue: evaluation.numericValue,
      textValue: evaluation.textValue,
      completedAt,
    };

    if (shouldUpdateCompletion(existingCompletion, updatePayload)) {
      await storage.updateKpiCompletion(existingCompletion.id, updatePayload);
    }
  }
}
