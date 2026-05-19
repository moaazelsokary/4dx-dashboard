/** Profile avatars — keys stored on users.avatar_key */
export const AVATAR_OPTIONS = [
  { key: 'hairWoman', label: 'Community', path: '/Hair Woman Avatar.png' },
  { key: 'woman', label: 'Case / HR', path: '/Woman Avatar.png' },
  { key: 'man', label: 'General', path: '/Man Avatar.png' },
] as const;

export type AvatarKey = (typeof AVATAR_OPTIONS)[number]['key'];

const AVATAR_PATH_BY_KEY: Record<AvatarKey, string> = {
  hairWoman: '/Hair Woman Avatar.png',
  woman: '/Woman Avatar.png',
  man: '/Man Avatar.png',
};

export function isAvatarKey(v: unknown): v is AvatarKey {
  return v === 'hairWoman' || v === 'woman' || v === 'man';
}

export function resolveAvatarSrc(user: {
  avatarKey?: string | null;
  avatar_key?: string | null;
  departments?: string[];
  role?: string;
}): string {
  const raw = user.avatarKey ?? user.avatar_key;
  if (isAvatarKey(raw)) return AVATAR_PATH_BY_KEY[raw];
  const depts = (user.departments || []).map((d) => d.toLowerCase());
  if (depts.includes('community')) return AVATAR_PATH_BY_KEY.hairWoman;
  if (depts.some((d) => ['case', 'communication', 'hr'].includes(d))) return AVATAR_PATH_BY_KEY.woman;
  return AVATAR_PATH_BY_KEY.man;
}
