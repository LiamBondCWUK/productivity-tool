"use client";

import { useEffect, useState } from "react";
import type { TeamMessage, FlaggedEmail } from "../types/dashboard";

interface TeamsData {
  teamMessages: TeamMessage[];
  fetchedAt: string | null;
}

interface EmailData {
  flaggedEmails: FlaggedEmail[];
  fetchedAt: string | null;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TeamMessages() {
  const [teams, setTeams] = useState<TeamsData>({
    teamMessages: [],
    fetchedAt: null,
  });
  const [email, setEmail] = useState<EmailData>({
    flaggedEmails: [],
    fetchedAt: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [teamsRes, emailRes] = await Promise.all([
          fetch("/api/teams"),
          fetch("/api/email"),
        ]);
        if (teamsRes.ok) setTeams(await teamsRes.json());
        if (emailRes.ok) setEmail(await emailRes.json());
      } catch {
        // network error — leave empty
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const hasTeams = teams.teamMessages.length > 0;
  const hasEmail = email.flaggedEmails.length > 0;
  const hasAny = hasTeams || hasEmail;

  if (loading) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Messages
        </p>
        <div className="text-xs text-gray-500">Loading…</div>
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Messages
        </p>
        <p className="text-xs text-gray-500 italic">
          No unread Teams or flagged emails
          {!teams.fetchedAt && !email.fetchedAt && (
            <>
              {" "}
              — run <code className="text-gray-400">m365 login</code> first
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Messages
      </p>

      {hasTeams && (
        <div>
          <p className="text-xs text-blue-400 font-medium mb-1">Teams</p>
          <ul className="space-y-1.5">
            {teams.teamMessages.map((msg) => (
              <li key={msg.id}>
                <a
                  href={msg.chatUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded p-1.5 hover:bg-gray-700/50 transition-colors group"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs text-gray-200 truncate font-medium group-hover:text-white">
                      {msg.from}
                    </span>
                    {msg.unreadCount > 0 && (
                      <span className="flex-shrink-0 text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5 leading-none">
                        {msg.unreadCount}
                      </span>
                    )}
                  </div>
                  {msg.preview && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {msg.preview}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatRelativeTime(msg.receivedAt)}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasEmail && (
        <div>
          <p className="text-xs text-amber-400 font-medium mb-1">
            Flagged Email
          </p>
          <ul className="space-y-1.5">
            {email.flaggedEmails.map((msg) => (
              <li key={msg.id}>
                <a
                  href={msg.webLink || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded p-1.5 hover:bg-gray-700/50 transition-colors group"
                >
                  <p className="text-xs text-gray-200 truncate font-medium group-hover:text-white">
                    {msg.subject}
                  </p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {msg.from}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatRelativeTime(msg.receivedAt)}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
