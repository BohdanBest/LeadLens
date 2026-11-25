import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";

export function useEmailDrafts(leadId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.emails(leadId ?? ""),
    queryFn: () => api.listEmails(leadId!),
    enabled: Boolean(leadId),
  });
}

export function useEmailMutations(leadId: string | undefined) {
  const qc = useQueryClient();
  const invalidateEmails = () => {
    if (leadId) {
      void qc.invalidateQueries({ queryKey: queryKeys.emails(leadId) });
      void qc.invalidateQueries({ queryKey: queryKeys.lead(leadId) });
    }
    void qc.invalidateQueries({ queryKey: ["leads"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const generate = useMutation({
    mutationFn: (payload: {
      findingIds?: string[];
      language?: "uk" | "en";
      tone?: "formal" | "friendly";
      length?: "short" | "medium";
    }) => api.generateEmail(leadId!, payload),
    onSuccess: invalidateEmails,
  });

  const save = useMutation({
    mutationFn: ({
      emailId,
      subject,
      body,
      claims,
    }: {
      emailId: string;
      subject: string;
      body: string;
      claims: Array<{ id?: string | null; findingId?: string | null; text: string }>;
    }) => api.updateEmail(emailId, { subject, body, claims }),
    onSuccess: invalidateEmails,
  });

  const verify = useMutation({
    mutationFn: (emailId: string) => api.verifyEmail(emailId),
    onSuccess: invalidateEmails,
  });

  const markSent = useMutation({
    mutationFn: (emailId: string) => api.markEmailSent(emailId),
    onSuccess: invalidateEmails,
  });

  return { generate, save, verify, markSent };
}
