import fs from 'node:fs/promises';
import path from 'node:path';

export async function getProjectAgentsFile(projectPath: string) {
  const filePath = getAgentsPath(projectPath);
  return {
    path: filePath,
    content: await readTextSafe(filePath),
    updatedAt: await getUpdatedAt(filePath)
  };
}

export async function saveProjectAgentsFile(projectPath: string, content: string) {
  const filePath = getAgentsPath(projectPath);
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, content, 'utf8');
  return getProjectAgentsFile(projectPath);
}

function getAgentsPath(projectPath: string) {
  if (!projectPath.trim()) {
    throw new Error('Missing project path');
  }
  return path.join(path.resolve(projectPath), 'AGENTS.md');
}

async function readTextSafe(filePath: string) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

async function getUpdatedAt(filePath: string) {
  try {
    return (await fs.stat(filePath)).mtime.toISOString();
  } catch {
    return undefined;
  }
}
