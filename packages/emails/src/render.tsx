import { render } from "@react-email/components";
import { EmailLayout } from "./layout";
import { emailTranslator, templates, type EmailData } from "./templates";

export type EmailTemplate = keyof EmailData;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/** Builds the subject, HTML and plain-text parts of one e-mail in the data's locale. */
export async function renderEmail<N extends EmailTemplate>(
  template: N,
  data: EmailData[N],
): Promise<RenderedEmail> {
  const def = templates[template];
  const t = emailTranslator(data.locale);
  const subject = def.subject(t, data);
  const element = (
    <EmailLayout
      locale={data.locale}
      preview={subject}
      heading={def.heading(t, data)}
      footer={t("footer")}
    >
      <def.Body t={t} data={data} />
    </EmailLayout>
  );
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { subject, html, text, replyTo: def.replyTo?.(data) };
}
