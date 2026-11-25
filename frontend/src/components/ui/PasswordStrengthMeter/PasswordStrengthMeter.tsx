import { useTranslation } from "react-i18next";
import { CheckCircle, Circle } from "@phosphor-icons/react";
import { ProgressBar, type ProgressTone } from "@/components/ui/ProgressBar/ProgressBar";
import styles from "./PasswordStrengthMeter.module.scss";

export interface PasswordEvaluation {
  hasMinLength: boolean;
  hasLower: boolean;
  hasUpper: boolean;
  hasDigit: boolean;
  hasSymbolOrLong: boolean;
  score: number; // 0..5
  isValid: boolean;
}

export function evaluatePassword(password: string): PasswordEvaluation {
  const hasMinLength = password.length >= 10;
  const hasLower = /[a-zа-яіїєґ]/.test(password);
  const hasUpper = /[A-ZА-ЯІЇЄҐ]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbolOrLong = /[^A-Za-zА-Яа-яІіЇїЄєҐґ0-9]/.test(password) || password.length >= 14;

  const score = [hasMinLength, hasLower, hasUpper, hasDigit, hasSymbolOrLong].filter(Boolean).length;
  const isValid = hasMinLength && hasLower && hasUpper && hasDigit;

  return { hasMinLength, hasLower, hasUpper, hasDigit, hasSymbolOrLong, score, isValid };
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { t } = useTranslation();
  const evalResult = evaluatePassword(password);

  if (!password) return null;

  let tone: ProgressTone = "critical";
  let label = t("auth.strengthWeak");
  if (evalResult.score >= 5) {
    tone = "healthy";
    label = t("auth.strengthStrong");
  } else if (evalResult.score === 4) {
    tone = "accent";
    label = t("auth.strengthGood");
  } else if (evalResult.score === 3) {
    tone = "moderate";
    label = t("auth.strengthFair");
  }

  const rules = [
    { key: "len", met: evalResult.hasMinLength, text: t("auth.ruleLength") },
    { key: "upper", met: evalResult.hasUpper, text: t("auth.ruleUpper") },
    { key: "lower", met: evalResult.hasLower, text: t("auth.ruleLower") },
    { key: "digit", met: evalResult.hasDigit, text: t("auth.ruleDigit") },
  ];

  return (
    <div className={styles.meter} aria-live="polite">
      <div className={styles.header}>
        <span className={styles.label}>{t("auth.passwordStrength")}</span>
        <span className={`${styles.level} ${styles[`level_${tone}`]}`}>{label}</span>
      </div>
      <ProgressBar
        value={evalResult.score}
        max={5}
        tone={tone}
        size="sm"
        label={`${t("auth.passwordStrength")}: ${label}`}
      />
      <ul className={styles.rules}>
        {rules.map((r) => (
          <li key={r.key} className={`${styles.rule} ${r.met ? styles.ruleMet : ""}`.trim()}>
            {r.met ? (
              <CheckCircle size={14} weight="fill" aria-hidden="true" />
            ) : (
              <Circle size={14} weight="regular" aria-hidden="true" />
            )}
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
