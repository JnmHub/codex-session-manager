import React, {useEffect, useMemo, useState} from 'react';
import fs from 'node:fs';
import {Box, Text, useApp, useInput, useStdin} from 'ink';
import {scanSessions} from '../core/scanner.js';
import {formatDate, truncate} from '../core/format.js';
import {
  formatShortId,
  getActivePath,
  listSessions,
  projectName,
  toggleArchived,
  toggleFavorite
} from '../core/sessions.js';
import {launchSession} from '../core/launcher.js';
import type {SessionRecord} from '../types.js';

type Props = {
  shouldScan: boolean;
};

type Mode = 'loading' | 'list' | 'message';

export function App({shouldScan}: Props) {
  const {exit} = useApp();
  const {isRawModeSupported} = useStdin();
  const [mode, setMode] = useState<Mode>('loading');
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Loading sessions...');
  const [showArchived, setShowArchived] = useState(false);
  const [searching, setSearching] = useState(false);

  async function refresh(scan = false) {
    setMode('loading');
    setStatus(scan ? 'Scanning Codex sessions...' : 'Loading index...');
    if (scan) {
      await scanSessions();
    }

    const next = await listSessions({all: showArchived, limit: 200});
    setSessions(next);
    setSelected(0);
    setMode('list');
    setStatus(scan ? `Indexed ${next.length} sessions.` : `Loaded ${next.length} sessions.`);
  }

  useEffect(() => {
    refresh(shouldScan).catch(error => {
      setStatus(error instanceof Error ? error.message : String(error));
      setMode('message');
    });
  }, []);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    if (!needle) {
      return sessions;
    }

    return sessions.filter(session =>
      [session.id, session.cwd, session.boundPath, session.note, session.summary, projectName(session)]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle))
    );
  }, [query, sessions]);

  const active = filtered[selected];
  const visibleStart = Math.max(0, Math.min(selected - 6, Math.max(0, filtered.length - 14)));
  const visibleSessions = filtered.slice(visibleStart, visibleStart + 14);

  useInput((input, key) => {
    if (!isRawModeSupported) {
      return;
    }

    if (input === 'q' || key.escape) {
      exit();
      return;
    }

    if (mode !== 'list') {
      return;
    }

    if (searching) {
      if (key.return || key.escape) {
        setSearching(false);
        return;
      }

      if (key.backspace || key.delete) {
        setQuery(value => value.slice(0, -1));
        setSelected(0);
        return;
      }

      if (input && input >= ' ' && input.length === 1 && !key.ctrl && !key.meta) {
        setQuery(value => `${value}${input}`);
        setSelected(0);
      }

      return;
    }

    if (key.upArrow || input === 'k') {
      setSelected(index => Math.max(0, index - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      setSelected(index => Math.min(filtered.length - 1, index + 1));
      return;
    }

    if (key.return && active) {
      launchSession(active);
      setStatus(`Opened ${formatShortId(active.id)} in PowerShell.`);
      return;
    }

    if (input === 'r') {
      refresh(true).catch(error => setStatus(error instanceof Error ? error.message : String(error)));
      return;
    }

    if (input === 'a' && active) {
      toggleArchived(active.id)
        .then(() => refresh(false))
        .catch(error => setStatus(error instanceof Error ? error.message : String(error)));
      return;
    }

    if (input === 'f' && active) {
      toggleFavorite(active.id)
        .then(() => refresh(false))
        .catch(error => setStatus(error instanceof Error ? error.message : String(error)));
      return;
    }

    if (input === 'A') {
      setShowArchived(value => !value);
      setStatus(showArchived ? 'Archived sessions hidden.' : 'Archived sessions visible.');
      return;
    }

    if (input === '/') {
      setSearching(true);
      setStatus('Search mode. Press Enter or Esc to leave search.');
      return;
    }

    if (input === 'x') {
      setQuery('');
      setSelected(0);
      setStatus('Search cleared.');
      return;
    }
  });

  useEffect(() => {
    listSessions({all: showArchived, limit: 200})
      .then(next => {
        setSessions(next);
        setSelected(0);
      })
      .catch(error => setStatus(error instanceof Error ? error.message : String(error)));
  }, [showArchived]);

  if (!isRawModeSupported) {
    return <Text color="red">This terminal does not support interactive input. Use cxm list/open instead.</Text>;
  }

  if (mode === 'loading' || mode === 'message') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header />
        <Text color={mode === 'message' ? 'red' : 'cyan'}>{status}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header />
      <Box marginTop={1}>
        <Text color={searching ? 'cyan' : 'gray'}>Search: </Text>
        <Text color={query ? 'white' : 'gray'}>{query || (searching ? 'typing...' : 'press /')}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {visibleSessions.map((session, index) => (
          <SessionRow
            key={session.id}
            session={session}
            selected={visibleStart + index === selected}
          />
        ))}
      </Box>
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
        {active ? <Details session={active} /> : <Text color="yellow">No matching sessions.</Text>}
      </Box>
      <Box marginTop={1} justifyContent="space-between">
        <Text color="gray">Enter open  / search  x clear  r rescan  f favorite  a archive  A archived  q quit</Text>
        <Text color="cyan">{status}</Text>
      </Box>
    </Box>
  );
}

function Header() {
  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text bold>Codex Session Manager</Text>
      <Text color="gray">  unified resume console</Text>
    </Box>
  );
}

function SessionRow({session, selected}: {session: SessionRecord; selected: boolean}) {
  const activePath = getActivePath(session);
  const missing = activePath ? !fs.existsSync(activePath) : true;
  const marker = selected ? '>' : ' ';
  const favorite = session.favorite ? '*' : ' ';
  const archived = session.archived ? ' archived' : '';

  return (
    <Box>
      <Text color={selected ? 'cyan' : undefined} bold={selected}>
        {marker} {favorite} {formatShortId(session.id)}
      </Text>
      <Text color="gray">  {formatDate(session.updatedAt)}  </Text>
      <Text>{truncate(projectName(session), 24)}</Text>
      <Text color={missing ? 'yellow' : 'green'}>{missing ? ' missing' : ' ok'}</Text>
      <Text color="gray">{archived}</Text>
      {session.note ? <Text color="magenta">  {truncate(session.note, 36)}</Text> : null}
    </Box>
  );
}

function Details({session}: {session: SessionRecord}) {
  const activePath = getActivePath(session);
  return (
    <>
      <Text>
        <Text color="gray">ID: </Text>
        {session.id}
      </Text>
      <Text>
        <Text color="gray">Path: </Text>
        {activePath || '(none)'}
      </Text>
      {session.boundPath ? (
        <Text>
          <Text color="gray">Original: </Text>
          {session.cwd}
        </Text>
      ) : null}
      <Text>
        <Text color="gray">Summary: </Text>
        {session.summary ? truncate(session.summary, 110) : '(none)'}
      </Text>
      <Text>
        <Text color="gray">Note: </Text>
        {session.note || '(none)'}
      </Text>
    </>
  );
}
