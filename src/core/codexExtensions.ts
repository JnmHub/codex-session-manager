import fs from 'node:fs/promises';
import path from 'node:path';
import {getCodexHome} from './paths.js';

export type SkillScope = 'global' | 'project';
export type HookScope = 'global' | 'project';

export type SkillRecord = {
  id: string;
  name: string;
  scope: SkillScope;
  directory: string;
  skillFile: string;
  exists: boolean;
  description?: string;
  updatedAt?: string;
};

export async function listSkills(input: {scope?: SkillScope; projectPath?: string}) {
  const scopes = resolveSkillScopes(input);
  const skills: SkillRecord[] = [];

  for (const scope of scopes) {
    await fs.mkdir(scope.root, {recursive: true});
    const entries = await fs.readdir(scope.root, {withFileTypes: true});
    for (const entry of entries.filter(item => item.isDirectory())) {
      const directory = path.join(scope.root, entry.name);
      const skillFile = path.join(directory, 'SKILL.md');
      const content = await readTextSafe(skillFile);
      const stat = await statSafe(skillFile);
      skills.push({
        id: `${scope.scope}:${entry.name}`,
        name: entry.name,
        scope: scope.scope,
        directory,
        skillFile,
        exists: Boolean(stat),
        description: parseSkillDescription(content),
        updatedAt: stat?.mtime.toISOString()
      });
    }
  }

  return skills.sort((a, b) => `${a.scope}:${a.name}`.localeCompare(`${b.scope}:${b.name}`));
}

export async function getSkill(input: {scope: SkillScope; name: string; projectPath?: string}) {
  const root = resolveSkillRoot(input.scope, input.projectPath);
  const directory = resolveChildDirectory(root, input.name);
  const skillFile = path.join(directory, 'SKILL.md');
  return {
    skill: {
      id: `${input.scope}:${path.basename(directory)}`,
      name: path.basename(directory),
      scope: input.scope,
      directory,
      skillFile,
      exists: Boolean(await statSafe(skillFile)),
      description: parseSkillDescription(await readTextSafe(skillFile)),
      updatedAt: (await statSafe(skillFile))?.mtime.toISOString()
    },
    content: await readTextSafe(skillFile)
  };
}

export async function saveSkill(input: {scope: SkillScope; name: string; content: string; projectPath?: string}) {
  const root = resolveSkillRoot(input.scope, input.projectPath);
  const directory = resolveChildDirectory(root, input.name);
  await fs.mkdir(directory, {recursive: true});
  await fs.writeFile(path.join(directory, 'SKILL.md'), input.content, 'utf8');
  return getSkill(input);
}

export async function saveSkillFiles(input: {
  scope: SkillScope;
  name: string;
  files: Array<{path: string; content: string}>;
  projectPath?: string;
}) {
  const root = resolveSkillRoot(input.scope, input.projectPath);
  const directory = resolveChildDirectory(root, input.name);
  await fs.mkdir(directory, {recursive: true});

  for (const file of input.files) {
    const target = resolveRelativeFile(directory, file.path);
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.writeFile(target, file.content, 'utf8');
  }

  return getSkill(input);
}

export async function deleteSkill(input: {scope: SkillScope; name: string; projectPath?: string}) {
  const root = resolveSkillRoot(input.scope, input.projectPath);
  const directory = resolveChildDirectory(root, input.name);
  await fs.rm(directory, {recursive: true, force: true});
  return {ok: true};
}

export async function listMcpServers() {
  const configPath = path.join(getCodexHome(), 'config.toml');
  const config = await readTextSafe(configPath);
  return {
    configPath,
    servers: parseMcpServerBlocks(config)
  };
}

export async function saveMcpServer(input: {name: string; body: string}) {
  const configPath = path.join(getCodexHome(), 'config.toml');
  const name = normalizeTomlName(input.name);
  const body = input.body.trim();
  const nextBlock = [`[mcp_servers.${name}]`, body].filter(Boolean).join('\n');
  const config = await readTextSafe(configPath);
  const next = replaceNamedTomlBlock(config, 'mcp_servers', name, nextBlock);
  await fs.writeFile(configPath, ensureTrailingNewline(next), 'utf8');
  return listMcpServers();
}

export async function deleteMcpServer(name: string) {
  const configPath = path.join(getCodexHome(), 'config.toml');
  const config = await readTextSafe(configPath);
  const next = replaceNamedTomlBlock(config, 'mcp_servers', normalizeTomlName(name), '');
  await fs.writeFile(configPath, ensureTrailingNewline(next), 'utf8');
  return listMcpServers();
}

export async function getHooksFile(input: {scope: HookScope; projectPath?: string}) {
  const filePath = resolveHooksFile(input.scope, input.projectPath);
  return {
    scope: input.scope,
    path: filePath,
    content: await readTextSafe(filePath),
    updatedAt: (await statSafe(filePath))?.mtime.toISOString()
  };
}

export async function saveHooksFile(input: {scope: HookScope; content: string; projectPath?: string}) {
  const filePath = resolveHooksFile(input.scope, input.projectPath);
  const content = input.content.trim();
  if (content) {
    JSON.parse(content);
  }
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, content ? `${content}\n` : '', 'utf8');
  return getHooksFile(input);
}

function resolveSkillScopes(input: {scope?: SkillScope; projectPath?: string}) {
  if (input.scope) {
    return [{scope: input.scope, root: resolveSkillRoot(input.scope, input.projectPath)}];
  }
  const scopes: Array<{scope: SkillScope; root: string}> = [{scope: 'global', root: resolveSkillRoot('global')}];
  if (input.projectPath) {
    scopes.push({scope: 'project', root: resolveSkillRoot('project', input.projectPath)});
  }
  return scopes;
}

function resolveSkillRoot(scope: SkillScope, projectPath?: string) {
  if (scope === 'global') {
    return path.join(getCodexHome(), 'skills');
  }
  if (!projectPath) {
    throw new Error('项目级 Skills 需要选择工作区路径');
  }
  return path.join(path.resolve(projectPath), '.codex', 'skills');
}

function resolveHooksFile(scope: HookScope, projectPath?: string) {
  if (scope === 'global') {
    return path.join(getCodexHome(), 'hooks.json');
  }
  if (!projectPath) {
    throw new Error('项目级 Hooks 需要选择工作区路径');
  }
  return path.join(path.resolve(projectPath), '.codex', 'hooks.json');
}

function resolveChildDirectory(root: string, name: string) {
  const safeName = sanitizeDirectoryName(name);
  const directory = path.resolve(root, safeName);
  const relative = path.relative(path.resolve(root), directory);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('路径越界');
  }
  return directory;
}

function resolveRelativeFile(root: string, relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/').trim();
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) {
    throw new Error('文件路径无效');
  }
  const target = path.resolve(root, normalized);
  const relative = path.relative(path.resolve(root), target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('文件路径越界');
  }
  return target;
}

function sanitizeDirectoryName(name: string) {
  const trimmed = name.trim();
  if (!/^[\w.-]+$/.test(trimmed)) {
    throw new Error('名称只能包含字母、数字、下划线、点和短横线');
  }
  return trimmed;
}

function parseSkillDescription(content: string) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const source = frontmatter?.[1] ?? content;
  const match = source.match(/^description:\s*["']?(.+?)["']?\s*$/m);
  return match?.[1];
}

function parseMcpServerBlocks(config: string) {
  const blocks = findNamedTomlBlocks(config, 'mcp_servers');
  return blocks.map(block => ({
    name: block.name,
    body: block.body.trim(),
    command: readTomlString(block.body, 'command'),
    url: readTomlString(block.body, 'url'),
    transport: readTomlString(block.body, 'transport'),
    cwd: readTomlString(block.body, 'cwd')
  }));
}

function findNamedTomlBlocks(config: string, prefix: string) {
  const lines = config.split(/\r?\n/);
  const blocks: Array<{name: string; start: number; end: number; body: string}> = [];
  let active: {name: string; start: number} | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^\s*\[([^\]]+)\]\s*$/);
    if (!heading) {
      continue;
    }

    if (active) {
      blocks.push({
        ...active,
        end: index,
        body: lines.slice(active.start + 1, index).join('\n')
      });
      active = undefined;
    }

    const name = parsePrefixedTableName(heading[1], prefix);
    if (name) {
      active = {name, start: index};
    }
  }

  if (active) {
    blocks.push({
      ...active,
      end: lines.length,
      body: lines.slice(active.start + 1).join('\n')
    });
  }

  return blocks;
}

function replaceNamedTomlBlock(config: string, prefix: string, name: string, block: string) {
  const lines = config.split(/\r?\n/);
  const existing = findNamedTomlBlocks(config, prefix).find(item => item.name === name);
  if (!existing) {
    return [config.trimEnd(), block].filter(Boolean).join('\n\n');
  }

  const before = lines.slice(0, existing.start);
  const after = lines.slice(existing.end);
  return [...before, ...(block ? block.split('\n') : []), ...after].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function parsePrefixedTableName(table: string, prefix: string) {
  const normalized = table.trim();
  if (!normalized.startsWith(`${prefix}.`)) {
    return undefined;
  }
  return normalized.slice(prefix.length + 1).replace(/^"(.+)"$/, '$1');
}

function normalizeTomlName(name: string) {
  const trimmed = name.trim();
  if (!/^[\w.-]+$/.test(trimmed)) {
    throw new Error('MCP 名称只能包含字母、数字、下划线、点和短横线');
  }
  return trimmed;
}

function readTomlString(source: string, key: string) {
  const match = source.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"`, 'm'));
  return match?.[1];
}

function ensureTrailingNewline(value: string) {
  return `${value.trimEnd()}\n`;
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

async function statSafe(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch {
    return undefined;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
