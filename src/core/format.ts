import fs from 'node:fs';
import {formatShortId, getActivePath, projectName} from './sessions.js';
import type {SessionRecord} from '../types.js';

export function formatSessionLine(session: SessionRecord) {
  const when = formatDate(session.updatedAt);
  const mark = session.favorite ? '*' : ' ';
  const missing = fs.existsSync(getActivePath(session)) ? '' : ' !missing';
  const note = session.note ? ` | ${session.note}` : '';
  const summary = session.summary ? ` | ${truncate(session.summary, 56)}` : '';
  return `${mark} ${formatShortId(session.id)}  ${when}  ${projectName(session)}${missing}${note}${summary}`;
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  return date.toLocaleString();
}

export function truncate(value: string, max: number) {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1)}…`;
}
