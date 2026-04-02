import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmDialogOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type RequiredConfirmDialogOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
};

type PendingConfirmDialog = {
  options: RequiredConfirmDialogOptions;
  resolve: (value: boolean) => void;
};

type ConfirmDialogContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
};

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

const DEFAULT_CONFIRM_OPTIONS: Omit<RequiredConfirmDialogOptions, "description"> = {
  title: "Confirm Action",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  destructive: false,
};

function resolveOptions(options: ConfirmDialogOptions): RequiredConfirmDialogOptions {
  return {
    title: options.title || DEFAULT_CONFIRM_OPTIONS.title,
    description: options.description,
    confirmLabel: options.confirmLabel || DEFAULT_CONFIRM_OPTIONS.confirmLabel,
    cancelLabel: options.cancelLabel || DEFAULT_CONFIRM_OPTIONS.cancelLabel,
    destructive: options.destructive ?? DEFAULT_CONFIRM_OPTIONS.destructive,
  };
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pendingDialog, setPendingDialog] = useState<PendingConfirmDialog | null>(null);

  const resolvePendingDialog = useCallback((value: boolean) => {
    setPendingDialog((current) => {
      if (!current) {
        return current;
      }

      current.resolve(value);
      return null;
    });
  }, []);

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    const nextOptions = resolveOptions(options);

    return new Promise<boolean>((resolve) => {
      setPendingDialog((current) => {
        current?.resolve(false);

        return {
          options: nextOptions,
          resolve,
        };
      });
    });
  }, []);

  const contextValue: ConfirmDialogContextValue = {
    confirm,
  };

  return (
    <ConfirmDialogContext.Provider value={contextValue}>
      {children}
      <AlertDialog
        open={Boolean(pendingDialog)}
        onOpenChange={(open) => {
          if (!open) {
            resolvePendingDialog(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDialog?.options.title}</AlertDialogTitle>
            <AlertDialogDescription>{pendingDialog?.options.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolvePendingDialog(false)}>
              {pendingDialog?.options.cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                pendingDialog?.options.destructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive"
                  : undefined
              }
              onClick={(event) => {
                event.preventDefault();
                resolvePendingDialog(true);
              }}
            >
              {pendingDialog?.options.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext);

  if (!context) {
    throw new Error("useConfirmDialog must be used within a ConfirmDialogProvider");
  }

  return context;
}

export function useDeleteConfirmation() {
  const { confirm } = useConfirmDialog();

  return useCallback(
    (description: string, title = "Delete Confirmation") => {
      return confirm({
        title,
        description,
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        destructive: true,
      });
    },
    [confirm],
  );
}