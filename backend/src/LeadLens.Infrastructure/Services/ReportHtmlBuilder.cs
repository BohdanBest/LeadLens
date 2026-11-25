using System.Net;
using System.Text;
using LeadLens.Application.DTOs;

namespace LeadLens.Infrastructure.Services;

public static class ReportHtmlBuilder
{
    public static string BuildPdfHtml(SiteReportDto report, string lang = "uk")
    {
        var sb = new StringBuilder();
        var isEn = string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase);

        sb.Append("""
        <!doctype html>
        <html lang="uk">
        <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; font-size: 13px; line-height: 1.45; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          h2 { font-size: 15px; margin: 18px 0 8px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
          .meta { color: #4b5563; font-size: 12px; margin-bottom: 14px; }
          .score-box { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
          .score-val { font-size: 26px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
          th { background: #f9fafb; font-weight: 600; }
          .finding { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; margin-bottom: 8px; page-break-inside: avoid; }
          .badge { display: inline-block; padding: 2px 6px; border-radius: 999px; font-size: 11px; font-weight: 600; border: 1px solid #9ca3af; }
          .snippet { background: #f9fafb; border: 1px solid #e5e7eb; padding: 6px; font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; margin-top: 6px; }
        </style>
        </head>
        <body>
        """);

        sb.Append($"<h1>LeadLens Audit Report — {Enc(report.Domain)}</h1>");
        sb.Append($"<div class=\"meta\">URL: {Enc(report.Url)} | v{report.AuditVersion} | {report.AuditedAt:yyyy-MM-dd HH:mm} UTC</div>");

        sb.Append("<div class=\"score-box\">");
        sb.Append($"<div><span class=\"score-val\">{report.NeedScore}/100</span> <span class=\"badge\">{Enc(report.Level)}</span></div>");
        if (report.CampaignMedianScore.HasValue)
        {
            sb.Append($"<div class=\"meta\">{(isEn ? "Campaign median score" : "Медіана кампанії")}: {report.CampaignMedianScore.Value}</div>");
        }
        sb.Append($"<p>{Enc(report.Summary)}</p>");
        sb.Append("</div>");

        sb.Append($"<h2>{(isEn ? "Category Breakdown" : "Розбивка за категоріями")}</h2>");
        sb.Append("<table><thead><tr>");
        sb.Append($"<th>{(isEn ? "Category" : "Категорія")}</th><th>{(isEn ? "Site Defect Score" : "Оцінка дефектів (%)")}</th><th>{(isEn ? "Campaign Median" : "Медіана кампанії")}</th>");
        sb.Append("</tr></thead><tbody>");
        foreach (var cat in report.CategoryComparisons)
        {
            var catName = isEn ? cat.NameEn : cat.NameUk;
            var median = cat.CampaignMedianScore.HasValue ? $"{cat.CampaignMedianScore.Value}%" : "—";
            sb.Append($"<tr><td>{Enc(catName)}</td><td>{cat.SiteScore}%</td><td>{median}</td></tr>");
        }
        sb.Append("</tbody></table>");

        sb.Append($"<h2>{(isEn ? "Key Findings" : "Виявлені знахідки")}</h2>");
        foreach (var f in report.Findings.Where(x => x.Result is "Fail" or "Warning"))
        {
            var title = isEn ? f.TitleEn : f.TitleUk;
            var desc = isEn ? f.DescriptionEn : f.DescriptionUk;
            sb.Append("<div class=\"finding\">");
            sb.Append($"<div><strong>{Enc(f.CheckId)}: {Enc(title)}</strong> <span class=\"badge\">{Enc(f.Result)}</span> (+{f.ScoreContribution} pts)</div>");
            sb.Append($"<div class=\"meta\">{(isEn ? "Measured" : "Значення")}: {Enc(f.Value ?? "—")} | Impact: {f.Impact}/5 | Effort: {f.Effort}/5 | Service: {Enc(f.Service)}</div>");
            sb.Append($"<div>{Enc(desc)}</div>");

            foreach (var ev in f.Evidences.Take(2))
            {
                if (!string.IsNullOrWhiteSpace(ev.PayloadJson))
                {
                    sb.Append($"<div class=\"snippet\">{Enc(ev.PayloadJson)}</div>");
                }
                else if (!string.IsNullOrWhiteSpace(ev.FileRef))
                {
                    sb.Append($"<div class=\"meta\">Artifact: {Enc(ev.FileRef)}</div>");
                }
            }
            sb.Append("</div>");
        }

        sb.Append("</body></html>");
        return sb.ToString();
    }

    private static string Enc(string text) => WebUtility.HtmlEncode(text);
}
