import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface AdaptiveDashboardTab {
  value: string;
  label: string;
  icon?: LucideIcon;
  group?: string;
  dataTestId?: string;
  mobilePriority?: boolean;
  desktopPriority?: boolean;
}

interface AdaptiveDashboardNavProps {
  tabs: AdaptiveDashboardTab[];
  activeTab: string;
  onChange: (value: string) => void;
  mobileQuickCount?: number;
  desktopVisibleCount?: number;
  mobileTitle?: string;
  mobileDescription?: string;
  className?: string;
}

function getPreferredTabs(
  tabs: AdaptiveDashboardTab[],
  predicate: (tab: AdaptiveDashboardTab) => boolean,
  targetCount: number,
): AdaptiveDashboardTab[] {
  const preferred = tabs.filter(predicate);
  if (preferred.length >= targetCount) {
    return preferred.slice(0, targetCount);
  }

  const seen = new Set(preferred.map((tab) => tab.value));
  const fallback = tabs.filter((tab) => !seen.has(tab.value));
  return [...preferred, ...fallback].slice(0, targetCount);
}

function groupTabs(tabs: AdaptiveDashboardTab[]) {
  const grouped = new Map<string, AdaptiveDashboardTab[]>();

  for (const tab of tabs) {
    const key = tab.group || "More";
    const existing = grouped.get(key) || [];
    existing.push(tab);
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries());
}

export default function AdaptiveDashboardNav({
  tabs,
  activeTab,
  onChange,
  mobileQuickCount = 4,
  desktopVisibleCount = 7,
  mobileTitle = "Navigate",
  mobileDescription = "Choose a section",
  className,
}: AdaptiveDashboardNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const mobilePrimaryTabs = useMemo(
    () => getPreferredTabs(tabs, (tab) => Boolean(tab.mobilePriority), mobileQuickCount),
    [tabs, mobileQuickCount],
  );

  const desktopPrimaryTabs = useMemo(
    () => getPreferredTabs(tabs, (tab) => Boolean(tab.desktopPriority), desktopVisibleCount),
    [tabs, desktopVisibleCount],
  );

  const mobilePrimaryValues = useMemo(
    () => new Set(mobilePrimaryTabs.map((tab) => tab.value)),
    [mobilePrimaryTabs],
  );

  const desktopPrimaryValues = useMemo(
    () => new Set(desktopPrimaryTabs.map((tab) => tab.value)),
    [desktopPrimaryTabs],
  );

  const mobileMoreTabs = tabs.filter((tab) => !mobilePrimaryValues.has(tab.value));
  const desktopMoreTabs = tabs.filter((tab) => !desktopPrimaryValues.has(tab.value));
  const showMobileMore = mobileMoreTabs.length > 0;

  const mobileSlots = useMemo(() => {
    if (!showMobileMore) {
      return mobilePrimaryTabs.map((tab) => ({ kind: "tab" as const, tab }));
    }

    const centerIndex = Math.ceil(mobilePrimaryTabs.length / 2);
    return [
      ...mobilePrimaryTabs.slice(0, centerIndex).map((tab) => ({ kind: "tab" as const, tab })),
      { kind: "more" as const },
      ...mobilePrimaryTabs.slice(centerIndex).map((tab) => ({ kind: "tab" as const, tab })),
    ];
  }, [mobilePrimaryTabs, showMobileMore]);

  const mobileGroups = groupTabs(mobileMoreTabs);
  const desktopGroups = groupTabs(desktopMoreTabs);

  return (
    <>
      <nav className={cn("mb-6", className)}>
        <div className="hidden md:flex items-center gap-2 rounded-xl border bg-card p-1.5 shadow-sm">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {desktopPrimaryTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.value === activeTab;

              return (
                <Button
                  key={tab.value}
                  type="button"
                  variant={isActive ? "secondary" : "ghost"}
                  onClick={() => onChange(tab.value)}
                  className={cn(
                    "h-10 shrink-0 gap-2 rounded-lg px-3 text-sm",
                    isActive ? "font-semibold" : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={tab.dataTestId}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  <span>{tab.label}</span>
                </Button>
              );
            })}
          </div>

          {desktopMoreTabs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="h-10 gap-2" data-testid="tab-more-desktop">
                  <MoreHorizontal className="h-4 w-4" />
                  <span>More</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {desktopGroups.map(([groupName, groupTabs], groupIndex) => (
                  <div key={groupName}>
                    <DropdownMenuLabel>{groupName}</DropdownMenuLabel>
                    {groupTabs.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = tab.value === activeTab;

                      return (
                        <DropdownMenuItem
                          key={tab.value}
                          onClick={() => onChange(tab.value)}
                          className={cn(isActive && "bg-accent")}
                          data-testid={tab.dataTestId ? `${tab.dataTestId}-desktop-more` : undefined}
                        >
                          {Icon && <Icon className="h-4 w-4" />}
                          <span>{tab.label}</span>
                        </DropdownMenuItem>
                      );
                    })}
                    {groupIndex < desktopGroups.length - 1 && <DropdownMenuSeparator />}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </nav>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-1.5 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur sm:px-2 md:hidden">
        <div className="grid gap-0.5 sm:gap-1" style={{ gridTemplateColumns: `repeat(${mobileSlots.length}, minmax(0, 1fr))` }}>
          {mobileSlots.map((slot, index) => {
            if (slot.kind === "tab") {
              const tab = slot.tab;
              const Icon = tab.icon;
              const isActive = tab.value === activeTab;

              return (
                <Button
                  key={tab.value}
                  type="button"
                  variant="ghost"
                  onClick={() => onChange(tab.value)}
                  className={cn(
                    "h-11 min-h-[42px] flex-col gap-1 rounded-lg px-0.5 sm:h-12 sm:min-h-[44px] sm:px-1",
                    isActive ? "bg-secondary text-foreground" : "text-muted-foreground",
                  )}
                  data-testid={tab.dataTestId ? `${tab.dataTestId}-mobile-quick` : undefined}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  <span className="max-w-full truncate text-[10px] leading-none sm:text-[11px]">{tab.label}</span>
                </Button>
              );
            }

            return (
              <div key={`mobile-more-slot-${index}`} className="relative flex h-12 items-start justify-center">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(
                        "h-14 w-14 -translate-y-4 rounded-full border-4 border-background bg-primary p-0 text-primary-foreground shadow-xl hover:bg-primary/90 sm:h-16 sm:w-16 sm:-translate-y-5",
                        mobileMenuOpen && "scale-105",
                      )}
                      data-testid="tab-more-mobile"
                    >
                      <MoreHorizontal className="h-5 w-5 sm:h-6 sm:w-6" />
                      <span className="sr-only">More</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-4 pb-6">
                    <SheetHeader>
                      <SheetTitle>{mobileTitle}</SheetTitle>
                      <SheetDescription>{mobileDescription}</SheetDescription>
                    </SheetHeader>

                    <div className="mt-4 space-y-5">
                      {mobileGroups.map(([groupName, groupTabs]) => (
                        <section key={groupName} className="space-y-2">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{groupName}</h3>
                          <div className="space-y-1">
                            {groupTabs.map((tab) => {
                              const Icon = tab.icon;
                              const isActive = tab.value === activeTab;

                              return (
                                <Button
                                  key={tab.value}
                                  type="button"
                                  variant={isActive ? "secondary" : "ghost"}
                                  className="h-11 w-full justify-start gap-2"
                                  onClick={() => {
                                    onChange(tab.value);
                                    setMobileMenuOpen(false);
                                  }}
                                  data-testid={tab.dataTestId ? `${tab.dataTestId}-mobile-more` : undefined}
                                >
                                  {Icon && <Icon className="h-4 w-4" />}
                                  <span>{tab.label}</span>
                                </Button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
