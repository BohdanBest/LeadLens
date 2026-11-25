import { WarningCircle } from "@phosphor-icons/react";
import { useUiStore } from "@/stores/useUiStore";
import { Button } from "@/components/ui/Button/Button";
import { Modal } from "./Modal";
import styles from "./Modal.module.scss";

export function ConfirmDialog() {
  const confirmDialog = useUiStore((s) => s.confirmDialog);
  const resolveConfirm = useUiStore((s) => s.resolveConfirm);

  if (!confirmDialog) return null;

  return (
    <Modal
      open={true}
      onClose={() => resolveConfirm(false)}
      title={confirmDialog.title}
      size="sm"
      footer={
        <>
          <Button
            variant="secondary"
            autoFocus
            onClick={() => resolveConfirm(false)}
          >
            {confirmDialog.cancelLabel}
          </Button>
          <Button
            variant={confirmDialog.danger ? "danger" : "primary"}
            onClick={() => resolveConfirm(true)}
          >
            {confirmDialog.confirmLabel}
          </Button>
        </>
      }
    >
      <div className={styles.confirmContent}>
        {confirmDialog.danger && (
          <span className={styles.dangerIcon} aria-hidden="true">
            <WarningCircle size={24} weight="duotone" />
          </span>
        )}
        <p className={styles.confirmMessage}>{confirmDialog.message}</p>
      </div>
    </Modal>
  );
}
