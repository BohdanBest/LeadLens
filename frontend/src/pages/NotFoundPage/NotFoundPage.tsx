import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Compass } from "@phosphor-icons/react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import styles from "./NotFoundPage.module.scss";

export function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useDocumentTitle(t("notFound.title"));

  return (
    <div className={styles.wrap}>
      <Card padding="lg" className={styles.card}>
        <span className={styles.icon} aria-hidden="true">
          <Compass size={36} weight="duotone" />
        </span>
        <span className={styles.code}>{t("notFound.code")}</span>
        <h1 className={styles.title}>{t("notFound.title")}</h1>
        <p className={styles.desc}>{t("notFound.description")}</p>
        <Button
          variant="primary"
          icon={<ArrowLeft size={18} weight="bold" />}
          onClick={() => navigate("/dashboard")}
        >
          {t("notFound.goHome")}
        </Button>
      </Card>
    </div>
  );
}
