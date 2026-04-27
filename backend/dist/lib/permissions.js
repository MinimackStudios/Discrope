"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasPermission = exports.parseMemberPermissions = exports.DEFAULT_MEMBER_PERMISSIONS = void 0;
exports.DEFAULT_MEMBER_PERMISSIONS = {
    kickMembers: false,
    banMembers: false,
    manageChannels: false,
    manageMessages: false
};
const parseMemberPermissions = (permissionsJson) => {
    try {
        const parsed = JSON.parse(permissionsJson || "{}");
        return {
            ...exports.DEFAULT_MEMBER_PERMISSIONS,
            ...parsed
        };
    }
    catch {
        return { ...exports.DEFAULT_MEMBER_PERMISSIONS };
    }
};
exports.parseMemberPermissions = parseMemberPermissions;
const hasPermission = (member, serverOwnerId, userId, permission) => {
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
    const perms = (0, exports.parseMemberPermissions)(member.permissions || null);
    return perms[permission] === true;
};
exports.hasPermission = hasPermission;
