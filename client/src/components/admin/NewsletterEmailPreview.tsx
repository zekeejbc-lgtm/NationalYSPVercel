import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  renderNewsletterHtml,
  type NewsletterDraftInput,
} from "@shared/newsletter";

export default function NewsletterEmailPreview({
  draft,
}: {
  draft: NewsletterDraftInput;
}) {
  const [mobile, setMobile] = useState(false);
  const [height, setHeight] = useState(320);
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);
  const empty = !draft.subject.trim() || !draft.content.trim();
  const html = renderNewsletterHtml(
    {
      subject: draft.subject.trim() || "Your email subject",
      previewText: draft.previewText.trim(),
      content:
        draft.content.trim() ||
        "Your newsletter message will appear here as you type.",
    },
    "#unsubscribe-preview",
  );

  return (
    <section
      className="space-y-3 border-t pt-6"
      aria-labelledby="newsletter-preview-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="newsletter-preview-title" className="font-semibold">
          Email preview
        </h3>
        <div
          className="flex gap-2"
          role="group"
          aria-label="Email preview size"
        >
          <Button
            size="sm"
            variant={mobile ? "outline" : "default"}
            aria-pressed={!mobile}
            onClick={() => setMobile(false)}
          >
            Desktop
          </Button>
          <Button
            size="sm"
            variant={mobile ? "default" : "outline"}
            aria-pressed={mobile}
            onClick={() => setMobile(true)}
          >
            Mobile
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Updates as you type using the same HTML sent to subscribers, including
        the unsubscribe link. Email apps may display small differences.
      </p>
      {empty && (
        <p className="text-xs text-muted-foreground">
          Empty fields show placeholder text here. Add your subject and message
          above to see your content.
        </p>
      )}
      <div className="rounded-lg border bg-muted/20 p-3 text-sm">
        <p className="font-medium break-words">
          {draft.subject.trim() || "Your email subject"}
        </p>
        <p className="text-muted-foreground break-words">
          {draft.previewText.trim() || "Inbox preview text will appear here."}
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-[#f4f5f7]">
        <iframe
          key={mobile ? "mobile" : "desktop"}
          title="Newsletter email preview"
          sandbox="allow-same-origin"
          className={`mx-auto block w-full border-0 bg-[#f4f5f7] ${mobile ? "max-w-[375px]" : ""}`}
          style={{ height }}
          srcDoc={html}
          onLoad={(event) => {
            observer.current?.disconnect();
            const body = event.currentTarget.contentDocument?.body;
            if (!body) return;
            const resize = () =>
              setHeight(
                Math.max(
                  200,
                  Math.ceil(body.getBoundingClientRect().height) + 2,
                ),
              );
            resize();
            observer.current = new ResizeObserver(resize);
            observer.current.observe(body);
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        The unsubscribe link shown here is a preview. Each delivered email gets
        the recipient’s own link.
      </p>
    </section>
  );
}
