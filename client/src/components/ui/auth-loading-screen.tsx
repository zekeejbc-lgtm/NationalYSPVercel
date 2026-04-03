import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

type AuthLoadingScreenProps = {
  label?: string;
  className?: string;
};

const ORG_NAME = "Youth Service Philippines National";

export default function AuthLoadingScreen({
  label = "Preparing your data...",
  className,
}: AuthLoadingScreenProps) {
  const { resolvedTheme } = useTheme();

  return (
    <div
      className={cn(
        "auth-loading-screen min-h-screen",
        resolvedTheme === "dark" ? "auth-loading-screen-dark" : "auth-loading-screen-light",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="auth-loading-screen__atmosphere" aria-hidden="true">
        <div className="auth-loading-screen__gradient-layer" />
        <div className="auth-loading-screen__texture-layer" />
        <span className="auth-loading-screen__shadow auth-loading-screen__shadow-1" />
        <span className="auth-loading-screen__shadow auth-loading-screen__shadow-2" />
      </div>

      <div className="auth-loading-screen__content">
        <img
          src="/images/ysp-logo.png"
          alt="Youth Service Philippines National logo"
          className="auth-loading-screen__logo"
        />
        <p className="auth-loading-screen__org">{ORG_NAME}</p>
        <p className="auth-loading-screen__label">{label}</p>
        <div className="auth-loading-screen__progress" aria-hidden="true">
          <span className="auth-loading-screen__progress-bar" />
        </div>
      </div>
    </div>
  );
}