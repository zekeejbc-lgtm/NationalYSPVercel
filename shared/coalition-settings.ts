import { z } from "zod";

export const coalitionSettingsSchema = z.object({
  groupChatUrl: z.string().trim().max(2048).refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !/\s/.test(value);
    } catch { return false; }
  }, "Enter a valid HTTPS group invitation link, or leave it blank to disable invitations."),
});

export function groupChatInvitation(url: string) {
  return url ? `\n\nJoin our Coalition group chat using this invitation link:\n\n${url}\n\nPlease keep this invitation private. Group administrators may need to accept your join request.` : "";
}
