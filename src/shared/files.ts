/**
 * Downloads, shared by the popup and the history page.
 */
import type { AnswerData } from '../types/answer';
import { answersCsv, answersJson, citationsCsv, exportStamp } from '../storage/export';

export function download(filename: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** The three files, written together. */
export function exportAll(answers: AnswerData[]) {
  const stamp = exportStamp();
  // true: the snapshot is why this export can be re-parsed after a parser fix.
  download(`answers-${stamp}.json`, answersJson(answers, true));
  download(`answers-${stamp}.csv`, answersCsv(answers), 'text/csv');
  download(`answer_citations-${stamp}.csv`, citationsCsv(answers), 'text/csv');
}
