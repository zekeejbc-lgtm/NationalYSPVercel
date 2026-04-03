import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Settings2, Trash2 } from "lucide-react";
import {
  createDefaultKpiDependencyRule,
  isKpiDependencyMetricStartDateCapable,
  KPI_DEPENDENCY_METRIC_LABELS,
  KPI_DEPENDENCY_OPERATOR_LABELS,
  KPI_DEPENDENCY_METRICS,
  KPI_DEPENDENCY_OPERATORS,
  type KpiDependencyAggregation,
  type KpiDependencyRule,
} from "@shared/kpi-dependencies";
import { useState } from "react";

type KpiDependencyEditorProps = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  aggregation: KpiDependencyAggregation;
  onAggregationChange: (aggregation: KpiDependencyAggregation) => void;
  rules: KpiDependencyRule[];
  onRulesChange: (rules: KpiDependencyRule[]) => void;
  dataTestIdPrefix: string;
};

export default function KpiDependencyEditor({
  enabled,
  onEnabledChange,
  aggregation,
  onAggregationChange,
  rules,
  onRulesChange,
  dataTestIdPrefix,
}: KpiDependencyEditorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const addRule = () => {
    onRulesChange([...rules, createDefaultKpiDependencyRule()]);
  };

  const removeRule = (ruleId: string) => {
    onRulesChange(rules.filter((rule) => rule.id !== ruleId));
  };

  const updateRule = (ruleId: string, nextRule: Partial<KpiDependencyRule>) => {
    onRulesChange(
      rules.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              ...nextRule,
            }
          : rule,
      ),
    );
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Auto-Check Dependencies</p>
          <p className="text-xs text-muted-foreground">
            Automatically mark KPI as completed when connected chapter metrics satisfy your rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            data-testid={`${dataTestIdPrefix}-switch-enabled`}
          />
          <Label>Enable</Label>
        </div>
      </div>

      {enabled && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {rules.length} rule{rules.length === 1 ? "" : "s"} configured
              </p>
              <p className="text-xs text-muted-foreground">
                {aggregation === "any" ? "Any rule can pass" : "All rules must pass"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(true)}
              data-testid={`${dataTestIdPrefix}-button-open-modal`}
            >
              <Settings2 className="mr-2 h-4 w-4" />
              Configure Dependencies
            </Button>
          </div>

          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Configure KPI Dependencies</DialogTitle>
                <DialogDescription>
                  Build readable rules that automatically complete this KPI when chapter activity meets your conditions.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Rule Matching Mode</Label>
                  <Select
                    value={aggregation}
                    onValueChange={(value) => onAggregationChange(value === "any" ? "any" : "all")}
                  >
                    <SelectTrigger data-testid={`${dataTestIdPrefix}-select-aggregation`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All rules must pass</SelectItem>
                      <SelectItem value="any">Any rule can pass</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Dependency Rules</Label>
                    <Button type="button" size="sm" variant="outline" onClick={addRule}>
                      <Plus className="mr-1 h-4 w-4" />
                      Add Rule
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    For members, reports, and publications, you can set a start date so old records are excluded.
                  </p>

                  {rules.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No rules yet. Add at least one rule.</p>
                  ) : (
                    <div className="space-y-2">
                      {rules.map((rule) => (
                        <div key={rule.id} className="grid gap-2 rounded-md border bg-background p-2 md:grid-cols-[2fr_1fr_0.9fr_1.3fr_auto]">
                          <Select
                            value={rule.metric}
                            onValueChange={(value) => {
                              const nextMetric = value as KpiDependencyRule["metric"];
                              updateRule(rule.id, {
                                metric: nextMetric,
                                ...(isKpiDependencyMetricStartDateCapable(nextMetric) ? {} : { startDate: undefined }),
                              });
                            }}
                          >
                            <SelectTrigger data-testid={`${dataTestIdPrefix}-select-metric-${rule.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {KPI_DEPENDENCY_METRICS.map((metric) => (
                                <SelectItem key={metric} value={metric}>
                                  {KPI_DEPENDENCY_METRIC_LABELS[metric]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select
                            value={rule.operator}
                            onValueChange={(value) => updateRule(rule.id, { operator: value as KpiDependencyRule["operator"] })}
                          >
                            <SelectTrigger data-testid={`${dataTestIdPrefix}-select-operator-${rule.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {KPI_DEPENDENCY_OPERATORS.map((operator) => (
                                <SelectItem key={operator} value={operator}>
                                  {KPI_DEPENDENCY_OPERATOR_LABELS[operator]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Input
                            type="number"
                            min={0}
                            value={String(rule.targetValue)}
                            onChange={(event) => {
                              const parsed = parseInt(event.target.value, 10);
                              updateRule(rule.id, { targetValue: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 });
                            }}
                            placeholder="Target"
                            data-testid={`${dataTestIdPrefix}-input-target-${rule.id}`}
                          />

                          {isKpiDependencyMetricStartDateCapable(rule.metric) ? (
                            <Input
                              type="date"
                              value={rule.startDate || ""}
                              onChange={(event) => {
                                updateRule(rule.id, { startDate: event.target.value || undefined });
                              }}
                              data-testid={`${dataTestIdPrefix}-input-start-date-${rule.id}`}
                            />
                          ) : (
                            <div className="flex items-center rounded-md border px-3 text-xs text-muted-foreground">
                              Counts all-time
                            </div>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRule(rule.id)}
                            data-testid={`${dataTestIdPrefix}-button-remove-${rule.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    data-testid={`${dataTestIdPrefix}-button-close-modal`}
                  >
                    Done
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
