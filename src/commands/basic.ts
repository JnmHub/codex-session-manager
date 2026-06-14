import fs from 'node:fs';
import {getCodexHome, getStoreFile} from '../core/paths.js';
import {scanSessions} from '../core/scanner.js';
import {formatSessionLine} from '../core/format.js';
import {getSession, listProjects, listSessions, setBoundPath, setNote} from '../core/sessions.js';
import {launchSession} from '../core/launcher.js';

export async function scanCommand() {
  const metas = await scanSessions();
  console.log(`Indexed ${metas.length} Codex sessions.`);
}

export async function listCommand(options: {all?: boolean; limit?: string; query?: string; project?: string}) {
  const sessions = await listSessions({
    all: options.all,
    limit: options.limit ? Number(options.limit) : 30,
    query: options.query,
    project: options.project
  });

  if (sessions.length === 0) {
    console.log('No sessions found. Run "cxm scan" first.');
    return;
  }

  for (const session of sessions) {
    console.log(formatSessionLine(session));
  }
}

export async function openCommand(
  id: string,
  options: {dryRun?: boolean; inline?: boolean; profile?: string; yolo?: boolean}
) {
  const session = await getSession(id);
  const command = launchSession(session, options);
  if (options.dryRun) {
    console.log(command);
  }
}

export async function noteCommand(id: string, note: string) {
  const session = await setNote(id, note);
  console.log(`Updated note for ${session.id.slice(0, 8)}.`);
}

export async function bindCommand(id: string, targetPath: string) {
  const session = await setBoundPath(id, targetPath);
  console.log(`Bound ${session.id.slice(0, 8)} to ${session.boundPath}.`);
}

export async function projectsCommand() {
  const projects = await listProjects();
  if (projects.length === 0) {
    console.log('No projects found. Run "cxm scan" first.');
    return;
  }

  for (const project of projects) {
    const state = project.missing ? 'missing' : 'ok';
    console.log(`${project.count.toString().padStart(3, ' ')}  ${state.padEnd(7, ' ')}  ${project.path}`);
  }
}

export function doctorCommand() {
  const codexHome = getCodexHome();
  const storeFile = getStoreFile();
  console.log(`CODEX_HOME: ${codexHome}`);
  console.log(`Sessions:   ${fs.existsSync(`${codexHome}\\sessions`) ? 'ok' : 'missing'}`);
  console.log(`History:    ${fs.existsSync(`${codexHome}\\history.jsonl`) ? 'ok' : 'missing'}`);
  console.log(`Store:      ${storeFile}`);
}
