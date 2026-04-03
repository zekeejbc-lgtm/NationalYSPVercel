import { useState } from "react";
import { Monitor, Moon, Sun, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { useTheme } from "@/hooks/use-theme";
import MyProfile from "@/pages/MyProfile";

interface UniversalDashboardHeaderProps {
  title: string;
  subtitle?: string;
  onLogout: () => void | Promise<void>;
}

export default function UniversalDashboardHeader({ title, subtitle, onLogout }: UniversalDashboardHeaderProps) {
  const { themeMode, resolvedTheme, cycleThemeMode } = useTheme();
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const themeActionIcon = themeMode === "light" ? Sun : themeMode === "dark" ? Moon : Monitor;
  const ThemeActionIcon = themeActionIcon;
  const currentThemeLabel =
    themeMode === "system"
      ? `System (${resolvedTheme === "dark" ? "Dark" : "Light"})`
      : themeMode === "dark"
        ? "Dark"
        : "Light";

  return (
    <>
      <div className="border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src="/images/ysp-logo.png"
                alt="YSP Logo"
                className="h-10 w-auto"
              />
              <div>
                <h1 className="text-xl font-bold">{title}</h1>
                {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={cycleThemeMode}
                data-testid="button-theme-toggle-header"
                aria-label={`Current theme ${currentThemeLabel}. Click to cycle theme.`}
                title="Cycle theme: Light -> Dark -> System"
              >
                <ThemeActionIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setProfileModalOpen(true)}
                data-testid="button-my-profile"
              >
                <UserRound className="h-4 w-4 mr-2" />
                My Profile
              </Button>
            </div>
            <div className="sm:hidden flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={cycleThemeMode}
                data-testid="button-theme-toggle-header-mobile"
                aria-label={`Current theme ${currentThemeLabel}. Click to cycle theme.`}
                title="Cycle theme: Light -> Dark -> System"
              >
                <ThemeActionIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="sm:hidden mt-3 grid gap-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setProfileModalOpen(true)}
              data-testid="button-my-profile-mobile"
            >
              <UserRound className="h-4 w-4 mr-2" />
              My Profile
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={profileModalOpen} onOpenChange={setProfileModalOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden" hideClose>
          <div className="flex h-[85dvh] flex-col">
            <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">My Profile</h2>
                <p className="text-sm text-muted-foreground">Manage your account information and password</p>
              </div>
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="button-my-profile-modal-close"
                  aria-label="Close profile panel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <MyProfile embedded hideEmbeddedHeading />
            </div>
            <div className="flex justify-end border-t px-6 py-4">
              <Button
                variant="outline"
                onClick={onLogout}
                data-testid="button-my-profile-modal-logout"
              >
                Logout
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
