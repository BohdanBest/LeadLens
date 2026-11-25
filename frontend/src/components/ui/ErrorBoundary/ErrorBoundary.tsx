import { Component, type ErrorInfo, type ReactNode } from "react";
import { WarningOctagon } from "@phosphor-icons/react";
import i18n from "@/i18n";
import { Button } from "@/components/ui/Button/Button";
import styles from "./ErrorBoundary.module.scss";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled UI error:", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: "" });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className={styles.wrap} role="alert">
        <div className={styles.card}>
          <span className={styles.icon} aria-hidden="true">
            <WarningOctagon size={36} weight="duotone" />
          </span>
          <h1 className={styles.title}>{i18n.t("common.errorTitle")}</h1>
          {this.state.message && <p className={styles.message}>{this.state.message}</p>}
          <Button variant="primary" onClick={this.handleReload}>
            {i18n.t("common.retry")}
          </Button>
        </div>
      </div>
    );
  }
}
