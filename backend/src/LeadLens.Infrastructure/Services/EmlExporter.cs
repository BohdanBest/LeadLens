using System.Text;

namespace LeadLens.Infrastructure.Services;

public static class EmlExporter
{
    public static byte[] BuildRfc5322Eml(
        string subject,
        string body,
        string? recipientEmail,
        string? senderEmail = null)
    {
        var sb = new StringBuilder();
        sb.Append($"Date: {DateTimeOffset.UtcNow:R}\r\n");
        if (!string.IsNullOrWhiteSpace(senderEmail))
        {
            sb.Append($"From: {SanitizeHeader(senderEmail)}\r\n");
        }
        if (!string.IsNullOrWhiteSpace(recipientEmail))
        {
            sb.Append($"To: {SanitizeHeader(recipientEmail)}\r\n");
        }
        sb.Append($"Subject: {EncodeUtf8Header(subject)}\r\n");
        sb.Append("X-Unsent: 1\r\n");
        sb.Append("MIME-Version: 1.0\r\n");
        sb.Append("Content-Type: text/plain; charset=\"utf-8\"\r\n");
        sb.Append("Content-Transfer-Encoding: base64\r\n");
        sb.Append("\r\n");

        var bodyBytes = Encoding.UTF8.GetBytes(body.Replace("\r\n", "\n").Replace("\n", "\r\n"));
        var b64 = Convert.ToBase64String(bodyBytes, Base64FormattingOptions.InsertLineBreaks);
        sb.Append(b64);
        sb.Append("\r\n");

        return Encoding.ASCII.GetBytes(sb.ToString());
    }

    private static string EncodeUtf8Header(string value)
    {
        var clean = SanitizeHeader(value);
        var b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(clean));
        return $"=?utf-8?B?{b64}?=";
    }

    private static string SanitizeHeader(string value) =>
        value.Replace("\r", " ").Replace("\n", " ").Trim();
}
