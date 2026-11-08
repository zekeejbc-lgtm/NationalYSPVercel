import { ORGANIZATION_MOTTO } from "./branding";
import { z } from "zod";

export const newsletterEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);
export const newsletterDraftSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => !/[\r\n]/.test(value), "Use a single subject line"),
  previewText: z.string().trim().max(200).default(""),
  content: z.string().trim().min(1).max(7000),
});
export type NewsletterDraftInput = z.infer<typeof newsletterDraftSchema>;

export function renderNewsletterHtml(
  draft: NewsletterDraftInput,
  unsubscribeUrl?: string,
  isTest = false,
) {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  // Match the existing coalition email's branded shell. Preview and delivery
  // both call this renderer; only newsletter content and preferences differ.
  const content = draft.content
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => {
      const linked = paragraph
        .split(/(https?:\/\/[^\s<>"']+)/g)
        .map((part, index) =>
          index % 2
            ? `<a href="${escape(part)}" style="color:#b9470b;word-break:break-all">${escape(part)}</a>`
            : escape(part),
        )
        .join("")
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 18px;overflow-wrap:anywhere;word-break:break-word">${linked}</p>`;
    })
    .join("");
  const preferences = unsubscribeUrl
    ? `You received this email because you subscribed to Youth Service Philippines updates.<br><a href="${escape(unsubscribeUrl)}" style="color:#a63b08">Unsubscribe from newsletters</a>`
    : isTest
      ? "This is a test; no subscription was changed."
      : "An unsubscribe link is included in delivered newsletters.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(draft.subject)}</title><style>@media only screen and (max-width:600px){.email-pad{padding:24px 18px!important}.outer-pad{padding:12px 8px!important}.email-title{font-size:24px!important}}</style></head><body style="margin:0;padding:0;background:#f4f5f7;color:#243340;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escape(draft.previewText)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7"><tr><td class="outer-pad" align="center" style="padding:36px 16px"><!--[if mso]><table role="presentation" width="600"><tr><td><![endif]--><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e1e5ea;border-radius:12px"><tr><td class="email-pad" style="padding:28px 32px;background:#12334a;border-top:5px solid #f97316"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="76" valign="top" style="padding-right:16px"><a href="https://www.youthserviceph.org" style="text-decoration:none"><img src="https://www.youthserviceph.org/images/ysp-logo.png" width="60" height="60" alt="YSP logo" style="display:block;border:0;border-radius:8px"></a></td><td valign="middle"><p style="margin:0 0 6px;color:#ffad73;font-size:11px;font-weight:bold;letter-spacing:1px">NATIONAL NEWSLETTER</p><p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;line-height:1.35">Youth Service Philippines</p></td></tr></table></td></tr><tr><td class="email-pad" style="padding:32px;font-size:16px;line-height:1.75;word-break:break-word"><h1 class="email-title" style="margin:0 0 24px;color:#12334a;font-size:28px;line-height:1.3;overflow-wrap:anywhere">${escape(draft.subject)}</h1>${isTest ? '<p style="margin:0 0 18px;font-weight:bold">TEST EMAIL</p>' : ""}${content}</td></tr><tr><td class="email-pad" style="padding:22px 32px;background:#fff6ee;border-top:1px solid #f7dfcc"><p style="margin:0 0 6px;color:#12334a;font-size:14px;font-weight:bold">${escape(ORGANIZATION_MOTTO)}</p><p style="margin:0;color:#596675;font-size:12px;line-height:1.7">${preferences}</p><p style="margin:18px 0"><a href="https://www.youthserviceph.org" style="display:inline-block;background:#12334a;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:8px">Open YSP portal &rarr;</a></p><p style="margin:0 0 14px;color:#596675;font-size:12px;line-height:1.75"><a href="mailto:national.hq@youthserviceph.org" style="color:#596675">national.hq@youthserviceph.org</a><br><a href="tel:+639177798413" style="color:#596675">+63 917 779 8413</a></p><p style="margin:0 0 8px;color:#596675;font-size:12px">Connect with YSP</p><p style="margin:0 0 16px"><a href="https://www.facebook.com/YOUTHSERVICEPHILIPPINES" style="display:inline-block;border:1px solid #cbd3db;border-radius:6px;padding:10px 12px;margin:0 6px 8px 0;color:#12334a;font-size:12px;text-decoration:none"><img src="https://www.youthserviceph.org/images/mail/facebook.png" width="22" height="22" alt="" style="border:0;vertical-align:middle;margin-right:6px">Facebook</a><a href="https://www.instagram.com/youthserviceph/" style="display:inline-block;border:1px solid #cbd3db;border-radius:6px;padding:10px 12px;margin:0 6px 8px 0;color:#12334a;font-size:12px;text-decoration:none"><img src="https://www.youthserviceph.org/images/mail/instagram.png" width="22" height="22" alt="" style="border:0;vertical-align:middle;margin-right:6px">Instagram</a><a href="https://www.youtube.com/@YouthServicePhilippines" style="display:inline-block;border:1px solid #cbd3db;border-radius:6px;padding:10px 12px;margin:0 0 8px;color:#12334a;font-size:12px;text-decoration:none"><img src="https://www.youthserviceph.org/images/mail/youtube.png" width="22" height="22" alt="" style="border:0;vertical-align:middle;margin-right:6px">YouTube</a></p><p style="margin:0;padding-top:16px;border-top:1px solid #ecdccd;color:#637080;font-size:11px;line-height:1.75">Youth Service to the Filipino Youth, Inc.<br>Official owner and operator of youthserviceph.org<br>SEC Registration No. 2023010080782-00<br>&copy; ${new Date().getFullYear()} Youth Service Philippines. All rights reserved.</p></td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
}
