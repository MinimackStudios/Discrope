export interface MemberPermissions {
  kickMembers: boolean;
  banMembers: boolean;
  manageChannels: boolean;
  manageMessages: boolean;
}

export const DEFAULT_MEMBER_PERMISSIONS: MemberPermissions = {
  kickMembers: false,
  banMembers: false,
  manageChannels: false,
  manageMessages: false
};

export const parseMemberPermissions = (permissionsJson: string | null): MemberPermissions => {
  try {
    const parsed = JSON.parse(permissionsJson || "{}");
    return {
      ...DEFAULT_MEMBER_PERMISSIONS,
      ...parsed
    };
  } catch {
    return { ...DEFAULT_MEMBER_PERMISSIONS };
  }
};

export const hasPermission = (
  member: { role: string; permissions?: string } | null,
  serverOwnerId: string,
  userId: string,
  permission: keyof MemberPermissions
): boolean => {
  // Owner always has all permissions
  if (userId === serverOwnerId) {
    return true;
  }

  if (!member) {
    return false;
  }

  // ADMIN role has all permissions (backwards compatibility)
  if (member.role === "ADMIN") {
    return true;
  }

  // Check individual permissions
  const perms = parseMemberPermissions(member.permissions || null);
  return perms[permission] === true;
};
