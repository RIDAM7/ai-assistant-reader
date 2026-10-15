/**
 * The message contract between content script, popup, history page and the
 * service worker.
 *
 * Written down as types because there are three senders and one receiver, and
 * a mistyped `type` string fails silently — chrome.runtime just never calls
 * anyone back.
 */
import type { AnswerData, AnswerSummary, Assistant } from './answer';

export type ContentRequest =
  | { type: 'PING' }
  | { type: 'COLLECT'; includeRawHtml?: boolean }
  | { type: 'PREVIEW' };

export interface Preview {
  assistant: Assistant;
  question: string;
  model?: string;
  answerChars: number;
  links: number;
  sources: number;
  webSources: boolean;
  streaming: boolean;
}

export type ContentResponse =
  | { ok: true; type: 'PONG'; assistant: Assistant | null }
  | { ok: true; type: 'COLLECTED'; data: AnswerData }
  | ({ ok: true; type: 'PREVIEW' } & Preview)
  | { ok: false; error: string; code: 'NOT_SUPPORTED' | 'NO_ANSWER' | 'FAILED' };

export type BackgroundRequest =
  | { type: 'SAVE'; data: AnswerData }
  | { type: 'LIST' }
  | { type: 'GET'; id: string }
  | { type: 'GET_ALL' }
  | { type: 'DELETE'; id: string }
  | { type: 'CLEAR' }
  | { type: 'COUNT' };

export type BackgroundResponse =
  | { ok: true; type: 'SAVED'; summary: AnswerSummary }
  | { ok: true; type: 'LIST'; summaries: AnswerSummary[] }
  | { ok: true; type: 'GET'; data: AnswerData | undefined }
  | { ok: true; type: 'GET_ALL'; answers: AnswerData[] }
  | { ok: true; type: 'DELETE' }
  | { ok: true; type: 'CLEAR' }
  | { ok: true; type: 'COUNT'; count: number }
  | { ok: false; error: string };
