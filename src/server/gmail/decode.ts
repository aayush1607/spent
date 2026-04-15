import type { gmail_v1 } from 'googleapis';
import { parse as parseHtml } from 'node-html-parser';
import pdfParse from 'pdf-parse';

export interface DecodedEmail {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  textContent: string;
  senderDomain: string;
}

function decodeBase64(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function extractSenderDomain(from: string): string {
  const match = from.match(/@([\w.-]+)/);
  return match ? match[1].toLowerCase() : '';
}

function htmlToText(html: string): string {
  const root = parseHtml(html);
  // Remove script/style
  root.querySelectorAll('script, style, head').forEach((el) => el.remove());
  return root.text.replace(/\s+/g, ' ').trim();
}

async function extractTextFromParts(
  parts: gmail_v1.Schema$MessagePart[]
): Promise<{ text: string; hasPdf: boolean }> {
  let text = '';
  let hasPdf = false;

  for (const part of parts) {
    const mime = part.mimeType ?? '';

    if (mime === 'text/plain' && part.body?.data) {
      text += decodeBase64(part.body.data).toString('utf8') + '\n';
    } else if (mime === 'text/html' && part.body?.data && !text) {
      // Only use HTML if no plain text found yet
      const html = decodeBase64(part.body.data).toString('utf8');
      text += htmlToText(html) + '\n';
    } else if (mime === 'application/pdf' && part.body?.data) {
      try {
        const pdfBuf = decodeBase64(part.body.data);
        const parsed = await pdfParse(pdfBuf);
        text += parsed.text + '\n';
        hasPdf = true;
      } catch {
        // PDF parse failure is non-fatal
      }
    } else if (part.parts?.length) {
      const sub = await extractTextFromParts(part.parts);
      text += sub.text;
      if (sub.hasPdf) hasPdf = true;
    }
  }

  return { text, hasPdf };
}

export async function decodeMessage(msg: gmail_v1.Schema$Message): Promise<DecodedEmail> {
  const headers = msg.payload?.headers ?? [];
  const subject = headerValue(headers, 'subject');
  const from    = headerValue(headers, 'from');
  const date    = headerValue(headers, 'date');

  let text = '';
  if (msg.payload?.parts?.length) {
    const extracted = await extractTextFromParts(msg.payload.parts);
    text = extracted.text;
  } else if (msg.payload?.body?.data) {
    const mime = msg.payload.mimeType ?? '';
    const raw = decodeBase64(msg.payload.body.data).toString('utf8');
    text = mime === 'text/html' ? htmlToText(raw) : raw;
  }

  return {
    messageId:    msg.id ?? '',
    threadId:     msg.threadId ?? '',
    subject,
    from,
    date,
    snippet:      msg.snippet ?? '',
    textContent:  text.replace(/\s+/g, ' ').trim(),
    senderDomain: extractSenderDomain(from),
  };
}
