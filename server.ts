import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;
const VERIFIED_FILE = path.join(__dirname, '.moh_verified_employees.json');
const VISIBLE_ROLES_FILE = path.join(__dirname, '.moh_visible_roles.json');
const VISIBLE_ROLES_MANAGER_ROLE_ID = '1571297044360990750';
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  return process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 8
    ? process.env.SESSION_SECRET.trim()
    : EPHEMERAL_SECRET;
}

function getAppBaseUrl(): string {
  const raw = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  return raw;
}

function getDiscordRedirectUri(req: Request): string {
  const baseUrl = getAppBaseUrl();
  if (baseUrl) {
    return `${baseUrl}/auth/discord/callback`;
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}/auth/discord/callback`;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

function signToken(payload: unknown): string {
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json, 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken<T>(token: string | undefined): T | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

interface DiscordRoleMeta {
  id: string;
  name: string;
  colorHex: string;
  position: number;
  isAdminRole?: boolean;
}

interface DiscordSessionUser {
  id: string;
  username: string;
  globalName: string;
  serverNick: string | null;
  displayName: string;
  avatarUrl: string | null;
  guildId: string | null;
  guildName?: string | null;
  roleIds: string[];
  roleNames?: DiscordRoleMeta[];
  isDirector: boolean;
  isAdmin?: boolean;
  canManageVisibleRoles?: boolean;
  verifiedAt: string;
}

function isDiscordAdminRole(name: string, permissions?: string): boolean {
  try {
    if (permissions && (BigInt(permissions) & 8n) === 8n) return true;
  } catch {
    // Ignore malformed permission bitfield
  }
  const normalized = name.normalize('NFKD').toLowerCase();
  return /\badmin\b|\badmins\b|administrator|ادمن|أدمن/i.test(normalized);
}

interface GuildMemberSnapshot {
  guildId: string | null;
  serverNick: string | null;
  serverAvatarHash: string | null;
  roleIds: string[];
}

const memberCache = new Map<string, { data: GuildMemberSnapshot; expiresAt: number }>();
const guildMetaCache = new Map<
  string,
  { guildName: string; roles: DiscordRoleMeta[]; expiresAt: number }
>();
const guildDataResponseCache = new Map<string, { payload: unknown; expiresAt: number }>();
let botGuildIdsCache: { ids: string[]; expiresAt: number } | null = null;

async function getBotGuildIds(botToken: string): Promise<string[]> {
  if (botGuildIdsCache && Date.now() < botGuildIdsCache.expiresAt) {
    return botGuildIdsCache.ids;
  }
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!res.ok) return [];
    const guilds = (await res.json()) as Array<{ id: string }>;
    const ids = guilds.map((g) => g.id).filter(Boolean);
    botGuildIdsCache = { ids, expiresAt: Date.now() + 5 * 60 * 1000 };
    return ids;
  } catch {
    return [];
  }
}

async function getGuildMetaAndRoles(
  guildId: string,
  botToken: string
): Promise<{ guildName: string; roles: DiscordRoleMeta[] } | null> {
  if (!guildId || !botToken) return null;
  const cached = guildMetaCache.get(guildId);
  if (cached && Date.now() < cached.expiresAt) {
    return { guildName: cached.guildName, roles: cached.roles };
  }
  try {
    const headers = { Authorization: `Bot ${botToken}` };
    const [guildRes, rolesRes] = await Promise.all([
      fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}`, { headers }),
      fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/roles`, { headers }),
    ]);
    if (!guildRes.ok || !rolesRes.ok) return null;
    const guildJson = (await guildRes.json()) as { name?: string };
    const rolesJson = (await rolesRes.json()) as Array<{
      id: string;
      name: string;
      color: number;
      position: number;
      managed: boolean;
      permissions?: string;
    }>;
    const isMeaningfulRoleName = (name: string) =>
      !/^[\u064B-\u065F\u0670\s\u200B-\u200D\uFE0E\uFE0F\-_=|•·⠀]+$/u.test(name.trim());
    const cleanedRoles: DiscordRoleMeta[] = rolesJson
      .filter((r) => r.name !== '@everyone' && !r.managed && isMeaningfulRoleName(r.name))
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        colorHex: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : '#64748b',
        position: r.position,
        isAdminRole: isDiscordAdminRole(r.name, r.permissions),
      }));
    const entry = {
      guildName: guildJson.name || 'خادم وزارة الصحة',
      roles: cleanedRoles,
      expiresAt: Date.now() + 2 * 60 * 1000,
    };
    guildMetaCache.set(guildId, entry);
    return { guildName: entry.guildName, roles: entry.roles };
  } catch {
    return null;
  }
}

async function resolveGuildMemberInfo(
  userId: string,
  preferredGuildId?: string | null,
  accessToken?: string | null
): Promise<GuildMemberSnapshot> {
  const envGuildId = (process.env.DISCORD_GUILD_ID || '').trim() || null;
  const botToken = (process.env.DISCORD_BOT_TOKEN || '').trim();
  const targetGuildId = preferredGuildId || envGuildId;

  const cacheKey = `${targetGuildId || 'auto'}:${userId}`;
  if (!accessToken) {
    const cached = memberCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
  }

  let candidateGuildIds: string[] = [];
  const botGuilds = botToken ? await getBotGuildIds(botToken) : [];
  if (targetGuildId) {
    candidateGuildIds = [targetGuildId, ...botGuilds.filter((id) => id !== targetGuildId)].slice(0, 5);
  } else if (botGuilds.length > 0) {
    candidateGuildIds = botGuilds.slice(0, 5);
  }

  let resolved: GuildMemberSnapshot = {
    guildId: targetGuildId,
    serverNick: null,
    serverAvatarHash: null,
    roleIds: [],
  };

  for (const gid of candidateGuildIds) {
    if (botToken) {
      try {
        const memberRes = await fetch(
          `https://discord.com/api/v10/guilds/${encodeURIComponent(gid)}/members/${encodeURIComponent(userId)}`,
          { headers: { Authorization: `Bot ${botToken}` } }
        );
        if (memberRes.ok) {
          const memberData = (await memberRes.json()) as {
            nick?: string | null;
            avatar?: string | null;
            roles?: string[];
          };
          resolved = {
            guildId: gid,
            serverNick: memberData.nick?.trim() || null,
            serverAvatarHash: memberData.avatar || null,
            roleIds: Array.isArray(memberData.roles) ? memberData.roles : [],
          };
          break;
        }
      } catch {
        // Fallback below
      }
    }

    if (accessToken) {
      try {
        const meMemberRes = await fetch(
          `https://discord.com/api/v10/users/@me/guilds/${encodeURIComponent(gid)}/member`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (meMemberRes.ok) {
          const memberData = (await meMemberRes.json()) as {
            nick?: string | null;
            avatar?: string | null;
            roles?: string[];
          };
          resolved = {
            guildId: gid,
            serverNick: memberData.nick?.trim() || null,
            serverAvatarHash: memberData.avatar || null,
            roleIds: Array.isArray(memberData.roles) ? memberData.roles : [],
          };
          break;
        }
      } catch {
        // Member might not be in this guild
      }
    }
  }

  memberCache.set(cacheKey, { data: resolved, expiresAt: Date.now() + 60 * 1000 });
  return resolved;
}

function isDiscordUserDirector(userId: string, roleIds: string[]): boolean {
  const adminIds = (process.env.DISCORD_ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminIds.includes(userId)) return true;

  const adminRoles = (process.env.DISCORD_ADMIN_ROLE_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return roleIds.some((r) => adminRoles.includes(r));
}

async function recordVerifiedDiscordUser(user: DiscordSessionUser): Promise<void> {
  try {
    let existing: Record<string, DiscordSessionUser> = {};
    try {
      const raw = await fs.readFile(VERIFIED_FILE, 'utf8');
      existing = JSON.parse(raw) as Record<string, DiscordSessionUser>;
    } catch {
      existing = {};
    }
    existing[user.id] = user;
    await fs.writeFile(VERIFIED_FILE, JSON.stringify(existing, null, 2), 'utf8');
  } catch {
    // Non-fatal persistence safeguard
  }
}

function setCrossOriginCookie(res: Response, name: string, value: string, maxAgeMs: number): void {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: maxAgeMs,
    path: '/',
  });
}

function clearCrossOriginCookie(res: Response, name: string): void {
  res.clearCookie(name, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
  });
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  // Health Check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'moh-staff-portal', timestamp: new Date().toISOString() });
  });

  // Discord integration configuration status
  app.get('/api/discord/status', (req: Request, res: Response) => {
    const clientId = (process.env.DISCORD_CLIENT_ID || '').trim();
    const clientSecret = (process.env.DISCORD_CLIENT_SECRET || '').trim();
    const botToken = (process.env.DISCORD_BOT_TOKEN || '').trim();
    const defaultGuildId = (process.env.DISCORD_GUILD_ID || '').trim();
    const redirectUri = getDiscordRedirectUri(req);

    res.json({
      oauthConfigured: Boolean(clientId && clientSecret),
      botConfigured: Boolean(botToken),
      defaultGuildId,
      redirectUri,
    });
  });

  // Generate Discord OAuth2 Authorize URL (opened directly in popup)
  app.get('/api/discord/auth-url', (req: Request, res: Response) => {
    const clientId = (process.env.DISCORD_CLIENT_ID || '').trim();
    const clientSecret = (process.env.DISCORD_CLIENT_SECRET || '').trim();

    if (!clientId || !clientSecret) {
      res.status(400).json({
        error: 'لم يتم ضبط بيانات Discord OAuth (DISCORD_CLIENT_ID و DISCORD_CLIENT_SECRET) في إعدادات البيئة.',
      });
      return;
    }

    const redirectUri = getDiscordRedirectUri(req);
    const state = crypto.randomBytes(16).toString('hex');
    const signedState = signToken({ state, exp: Date.now() + 10 * 60 * 1000 });
    setCrossOriginCookie(res, 'moh_discord_state', signedState, 10 * 60 * 1000);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds guilds.members.read',
      state,
      prompt: 'consent',
    });

    res.json({
      url: `https://discord.com/api/oauth2/authorize?${params.toString()}`,
      redirectUri,
    });
  });

  // Discord OAuth2 Callback Handler (supports trailing slash variations)
  const discordCallbackHandler = async (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const oauthError = typeof req.query.error === 'string' ? req.query.error : '';

    if (oauthError) {
      res.status(400).send(`
        <!doctype html>
        <html lang="ar" dir="rtl">
          <body style="font-family:sans-serif;padding:32px;text-align:center;color:#991b1b;">
            <h2>تعذر ربط حساب ديسكورد</h2>
            <p>رفض المستخدم أو مزود الخدمة عملية التفويض (${oauthError.replace(/</g, '&lt;')}).</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'DISCORD_OAUTH_ERROR', error: 'oauth_denied' }, '*');
              }
            </script>
          </body>
        </html>
      `);
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const stateToken = verifyToken<{ state: string; exp: number }>(cookies.moh_discord_state);
    clearCrossOriginCookie(res, 'moh_discord_state');

    if (!code || !state || !stateToken || stateToken.state !== state || Date.now() > stateToken.exp) {
      res.status(400).send(`
        <!doctype html>
        <html lang="ar" dir="rtl">
          <body style="font-family:sans-serif;padding:32px;text-align:center;color:#991b1b;">
            <h2>انتهت صلاحية جلسة التحقق</h2>
            <p>يرجى إغلاق هذه النافذة وإعادة المحاولة من بوابة وزارة الصحة.</p>
          </body>
        </html>
      `);
      return;
    }

    const clientId = (process.env.DISCORD_CLIENT_ID || '').trim();
    const clientSecret = (process.env.DISCORD_CLIENT_SECRET || '').trim();
    const redirectUri = getDiscordRedirectUri(req);

    try {
      const tokenBody = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      });

      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`);
      }

      const tokenData = (await tokenRes.json()) as { access_token: string };
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        throw new Error(`User profile fetch failed (${userRes.status})`);
      }

      const discordProfile = (await userRes.json()) as {
        id: string;
        username: string;
        global_name?: string | null;
        avatar?: string | null;
      };

      const memberInfo = await resolveGuildMemberInfo(
        discordProfile.id,
        null,
        tokenData.access_token
      );

      const globalName = discordProfile.global_name || discordProfile.username;
      const serverNick = memberInfo.serverNick;
      const displayName = serverNick || globalName;
      const guildAvatarUrl =
        memberInfo.guildId && memberInfo.serverAvatarHash
          ? `https://cdn.discordapp.com/guilds/${memberInfo.guildId}/users/${discordProfile.id}/avatars/${memberInfo.serverAvatarHash}.png?size=128`
          : null;
      const globalAvatarUrl = discordProfile.avatar
        ? `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}.png?size=128`
        : null;

      const botToken = (process.env.DISCORD_BOT_TOKEN || '').trim();
      let guildName: string | null = null;
      let roleNames: DiscordRoleMeta[] = [];
      if (botToken && memberInfo.guildId) {
        const meta = await getGuildMetaAndRoles(memberInfo.guildId, botToken);
        if (meta) {
          guildName = meta.guildName;
          const roleSet = new Set(memberInfo.roleIds);
          roleNames = meta.roles.filter((r) => roleSet.has(r.id));
        }
      }

      const isAdmin =
        isDiscordUserDirector(discordProfile.id, memberInfo.roleIds) ||
        roleNames.some((r) => Boolean(r.isAdminRole));
      const canManageVisibleRoles = memberInfo.roleIds.includes(VISIBLE_ROLES_MANAGER_ROLE_ID);

      const sessionUser: DiscordSessionUser = {
        id: discordProfile.id,
        username: discordProfile.username,
        globalName,
        serverNick,
        displayName,
        avatarUrl: guildAvatarUrl || globalAvatarUrl,
        guildId: memberInfo.guildId,
        guildName,
        roleIds: memberInfo.roleIds,
        roleNames,
        isDirector: isDiscordUserDirector(discordProfile.id, memberInfo.roleIds),
        isAdmin,
        canManageVisibleRoles,
        verifiedAt: new Date().toISOString(),
      };

      await recordVerifiedDiscordUser(sessionUser);
      const signedSession = signToken(sessionUser);
      setCrossOriginCookie(res, 'moh_discord_session', signedSession, 24 * 60 * 60 * 1000);

      const safeUserJson = JSON.stringify(sessionUser).replace(/</g, '\\u003c');

      res.send(`
        <!doctype html>
        <html lang="ar" dir="rtl">
          <head><meta charset="utf-8" /><title>تم ربط ديسكورد</title></head>
          <body style="font-family:sans-serif;padding:40px;text-align:center;color:#0f172a;background:#f8fafc;">
            <h2 style="color:#0f766e;">تم التحقق وربط حساب ديسكورد بنجاح</h2>
            <p>جاري تحديث البوابة وإغلاق هذه النافذة تلقائياً...</p>
            <script>
              (function () {
                var userPayload = ${safeUserJson};
                if (window.opener) {
                  window.opener.postMessage({ type: 'DISCORD_OAUTH_SUCCESS', user: userPayload }, '*');
                  window.close();
                } else {
                  window.location.href = '/';
                }
              })();
            </script>
          </body>
        </html>
      `);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown OAuth error';
      console.error('Discord callback error:', message);
      res.status(500).send(`
        <!doctype html>
        <html lang="ar" dir="rtl">
          <body style="font-family:sans-serif;padding:32px;text-align:center;color:#991b1b;">
            <h2>حدث خطأ أثناء إتمام الربط مع ديسكورد</h2>
            <p>تأكد من تطابق رابط الاستجابة (Redirect URI) مع إعدادات تطبيق ديسكورد.</p>
          </body>
        </html>
      `);
    }
  };

  app.get(['/auth/discord/callback', '/auth/discord/callback/'], discordCallbackHandler);

  // Current linked Discord session from signed cookie (refreshes server nickname & roles if bot is configured)
  app.get('/api/discord/me', async (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = verifyToken<DiscordSessionUser>(cookies.moh_discord_session);
    if (!session) {
      res.json({ connected: false, user: null });
      return;
    }

    let serverNick = session.serverNick ?? null;
    let guildId = session.guildId ?? null;
    let guildName = session.guildName ?? null;
    let roleIds = session.roleIds || [];
    let roleNames: DiscordRoleMeta[] = session.roleNames || [];
    let avatarUrl = session.avatarUrl;
    const botToken = (process.env.DISCORD_BOT_TOKEN || '').trim();

    if (botToken) {
      const liveMember = await resolveGuildMemberInfo(session.id, guildId);
      if (liveMember.guildId) {
        guildId = liveMember.guildId;
      }
      if (liveMember.serverNick !== null) {
        serverNick = liveMember.serverNick;
      }
      if (liveMember.roleIds.length > 0) {
        roleIds = liveMember.roleIds;
      }
      if (liveMember.guildId && liveMember.serverAvatarHash) {
        avatarUrl = `https://cdn.discordapp.com/guilds/${liveMember.guildId}/users/${session.id}/avatars/${liveMember.serverAvatarHash}.png?size=128`;
      }
      if (guildId) {
        const meta = await getGuildMetaAndRoles(guildId, botToken);
        if (meta) {
          guildName = meta.guildName;
          const roleSet = new Set(roleIds);
          roleNames = meta.roles.filter((r) => roleSet.has(r.id));
        }
      }
    }

    const displayName = serverNick || session.displayName || session.globalName;
    const isAdmin =
      isDiscordUserDirector(session.id, roleIds) ||
      roleNames.some((r) => Boolean(r.isAdminRole)) ||
      Boolean(session.isAdmin);
    const canManageVisibleRoles = roleIds.includes(VISIBLE_ROLES_MANAGER_ROLE_ID);

    res.json({
      connected: true,
      user: {
        ...session,
        serverNick,
        displayName,
        avatarUrl,
        guildId,
        guildName,
        roleIds,
        roleNames,
        isDirector: isDiscordUserDirector(session.id, roleIds) || Boolean(session.isDirector),
        isAdmin,
        canManageVisibleRoles,
      },
    });
  });

  app.post('/api/discord/logout', (_req: Request, res: Response) => {
    clearCrossOriginCookie(res, 'moh_discord_session');
    res.json({ ok: true });
  });

  // Visible Discord Role IDs allowlist (controls which ranks & members appear in Staff Portal)
  app.get('/api/discord/visible-roles', async (_req: Request, res: Response) => {
    try {
      const raw = await fs.readFile(VISIBLE_ROLES_FILE, 'utf8');
      const parsed = JSON.parse(raw) as {
        roles?: Array<{ roleId: string; departmentName?: string }>;
        updatedAt?: string;
      };
      res.json({
        roles: Array.isArray(parsed.roles) ? parsed.roles : [],
        updatedAt: parsed.updatedAt || null,
      });
    } catch {
      res.json({ roles: [], updatedAt: null });
    }
  });

  app.post('/api/discord/visible-roles', async (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = verifyToken<DiscordSessionUser>(cookies.moh_discord_session);
    if (!session) {
      res.status(401).json({
        error: 'يرجى تسجيل الدخول عبر ديسكورد أولاً لحفظ قائمة الرتب.',
      });
      return;
    }

    let roleIds = session.roleIds || [];
    const botToken = (process.env.DISCORD_BOT_TOKEN || '').trim();
    if (botToken) {
      const liveMember = await resolveGuildMemberInfo(session.id, session.guildId ?? null);
      if (liveMember.guildId) {
        roleIds = liveMember.roleIds;
      }
    }

    if (!roleIds.includes(VISIBLE_ROLES_MANAGER_ROLE_ID)) {
      res.status(403).json({
        error: 'هذا الإجراء متاح لحامل الرتبة المخولة فقط.',
      });
      return;
    }

    const rawRoles = Array.isArray(req.body?.roles) ? req.body.roles : [];
    const seen = new Set<string>();
    const sanitized: Array<{ roleId: string; departmentName?: string }> = [];

    for (const item of rawRoles) {
      const roleId = typeof item?.roleId === 'string' ? item.roleId.replace(/[^0-9]/g, '').trim() : '';
      if (!roleId || !/^[0-9]{5,30}$/.test(roleId) || seen.has(roleId)) continue;
      seen.add(roleId);
      const dept =
        typeof item?.departmentName === 'string' ? item.departmentName.trim().slice(0, 120) : '';
      sanitized.push(dept ? { roleId, departmentName: dept } : { roleId });
      if (sanitized.length >= 100) break;
    }

    const payload = {
      roles: sanitized,
      updatedBy: session.id,
      updatedAt: new Date().toISOString(),
    };

    try {
      await fs.writeFile(VISIBLE_ROLES_FILE, JSON.stringify(payload, null, 2), 'utf8');
      res.json({
        roles: payload.roles,
        updatedAt: payload.updatedAt,
      });
    } catch {
      res.status(500).json({ error: 'تعذر حفظ قائمة الرتب على الخادم.' });
    }
  });

  // Guild Roles & Members Sync using Bot Token (Server-side REST v10)
  app.get('/api/discord/guild-data', async (req: Request, res: Response) => {
    const botToken = (process.env.DISCORD_BOT_TOKEN || '').trim();
    const queryGuildId = typeof req.query.guildId === 'string' ? req.query.guildId.trim() : '';
    let guildId = queryGuildId || (process.env.DISCORD_GUILD_ID || '').trim();

    if (!botToken) {
      res.status(400).json({
        error: 'رمز البوت (DISCORD_BOT_TOKEN) غير مهيأ في إعدادات البيئة السرية.',
      });
      return;
    }

    if (!guildId) {
      const botGuilds = await getBotGuildIds(botToken);
      guildId = botGuilds[0] || '';
    }

    if (!guildId || !/^[0-9]+$/.test(guildId)) {
      res.status(400).json({
        error: 'يرجى إدخال معرف سيرفر ديسكورد (Guild ID) بصيغة رقمية صحيحة.',
      });
      return;
    }

    const bypassCache = req.query.refresh === '1';
    const cachedResponse = guildDataResponseCache.get(guildId);
    if (!bypassCache && cachedResponse && Date.now() < cachedResponse.expiresAt) {
      res.json(cachedResponse.payload);
      return;
    }

    try {
      const headers = { Authorization: `Bot ${botToken}` };
      let activeGuildId = guildId;
      let [guildRes, rolesRes, membersRes] = await Promise.all([
        fetch(`https://discord.com/api/v10/guilds/${activeGuildId}?with_counts=true`, { headers }),
        fetch(`https://discord.com/api/v10/guilds/${activeGuildId}/roles`, { headers }),
        fetch(`https://discord.com/api/v10/guilds/${activeGuildId}/members?limit=250`, { headers }),
      ]);

      if (!guildRes.ok && !queryGuildId) {
        const botGuilds = await getBotGuildIds(botToken);
        const fallbackGuildId = botGuilds.find((id) => id !== activeGuildId);
        if (fallbackGuildId) {
          activeGuildId = fallbackGuildId;
          [guildRes, rolesRes, membersRes] = await Promise.all([
            fetch(`https://discord.com/api/v10/guilds/${activeGuildId}?with_counts=true`, { headers }),
            fetch(`https://discord.com/api/v10/guilds/${activeGuildId}/roles`, { headers }),
            fetch(`https://discord.com/api/v10/guilds/${activeGuildId}/members?limit=250`, { headers }),
          ]);
        }
      }

      if (!guildRes.ok) {
        const text = await guildRes.text();
        res.status(guildRes.status).json({
          error: `تعذر الوصول إلى السيرفر من ديسكورد (${guildRes.status}). تأكد من وجود البوت داخل السيرفر.`,
          details: text,
        });
        return;
      }

      if (!rolesRes.ok) {
        res.status(rolesRes.status).json({
          error: `تعذر جلب الرتب من السيرفر (${rolesRes.status}).`,
        });
        return;
      }

      const guildJson = (await guildRes.json()) as {
        id: string;
        name: string;
        approximate_member_count?: number;
      };

      const rolesJson = (await rolesRes.json()) as Array<{
        id: string;
        name: string;
        color: number;
        position: number;
        managed: boolean;
        permissions?: string;
      }>;

      const isMeaningfulRoleName = (name: string) =>
        !/^[\u064B-\u065F\u0670\s\u200B-\u200D\uFE0E\uFE0F\-_=|•·⠀]+$/u.test(name.trim());
      const cleanedRoles: DiscordRoleMeta[] = rolesJson
        .filter((r) => r.name !== '@everyone' && !r.managed && isMeaningfulRoleName(r.name))
        .sort((a, b) => b.position - a.position)
        .map((r) => ({
          id: r.id,
          name: r.name,
          colorHex: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : '#64748b',
          position: r.position,
          isAdminRole: isDiscordAdminRole(r.name, r.permissions),
        }));

      const roleById = new Map<string, DiscordRoleMeta>(cleanedRoles.map((r) => [r.id, r]));

      let membersList: Array<{
        id: string;
        username: string;
        displayName: string;
        nick: string | null;
        avatarUrl: string | null;
        roles: string[];
        roleObjects: DiscordRoleMeta[];
        joinedAt: string;
      }> = [];
      let membersWarning: string | null = null;

      if (membersRes.ok) {
        const rawMembers = (await membersRes.json()) as Array<{
          nick?: string | null;
          avatar?: string | null;
          roles: string[];
          joined_at: string;
          user: {
            id: string;
            username: string;
            global_name?: string | null;
            avatar?: string | null;
            bot?: boolean;
          };
        }>;

        membersList = rawMembers
          .filter((m) => !m.user.bot)
          .map((m) => {
            const memberRoleIds = m.roles || [];
            const roleObjects = memberRoleIds
              .map((rid) => roleById.get(rid))
              .filter((r): r is DiscordRoleMeta => Boolean(r))
              .sort((a, b) => b.position - a.position);

            const guildAvatarUrl = m.avatar
              ? `https://cdn.discordapp.com/guilds/${activeGuildId}/users/${m.user.id}/avatars/${m.avatar}.png?size=128`
              : null;
            const globalAvatarUrl = m.user.avatar
              ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=128`
              : null;

            return {
              id: m.user.id,
              username: m.user.username,
              displayName: m.nick || m.user.global_name || m.user.username,
              nick: m.nick || null,
              avatarUrl: guildAvatarUrl || globalAvatarUrl,
              roles: memberRoleIds,
              roleObjects,
              joinedAt: m.joined_at,
            };
          });
      } else {
        membersWarning =
          'تعذر جلب قائمة الأعضاء (تأكد من تفعيل Server Members Intent للبوت في Discord Developer Portal). تم جلب الرتب بنجاح.';
      }

      const payload = {
        guild: {
          id: guildJson.id,
          name: guildJson.name,
          memberCount: guildJson.approximate_member_count ?? membersList.length,
        },
        roles: cleanedRoles,
        members: membersList,
        membersWarning,
      };

      guildDataResponseCache.set(guildId, {
        payload,
        expiresAt: Date.now() + 45 * 1000,
      });

      res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Discord guild sync error:', message);
      res.status(500).json({
        error: 'حدث خطأ أثناء الاتصال بخوادم ديسكورد.',
      });
    }
  });

  // Vite integration in development / static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ministry of Health Portal server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
