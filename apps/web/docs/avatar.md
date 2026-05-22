
头像显示规则
@apps/web/src/components/SeatAvatar.tsx

头像显示要手动凭借

function mxcToHttp(mxcUrl: string, homeserver: string, token: string): string {
    // mxc://server/mediaId → https://homeserver/_matrix/media/v3/download/server/mediaId
    const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    if (!match) return mxcUrl;
    const [, server, mediaId] = match;
    const url = `${homeserver}/_matrix/media/v3/download/${server}/${mediaId}`;
    const sep = url.includes("?") ? "&" : "?";
    return token ? `${url}${sep}access_token=${encodeURIComponent(token)}` : url;
}

function getAuthedAvatarUrl(avatarUrl: string, token: string): string {
    if (!avatarUrl || !token) return avatarUrl;
    const sep = avatarUrl.includes("?") ? "&" : "?";
    return `${avatarUrl}${sep}access_token=${encodeURIComponent(token)}`;
}

const src = avatarUrl.startsWith("mxc://")
    ? mxcToHttp(avatarUrl, homeserver, token)
    : getAuthedAvatarUrl(avatarUrl, token);


帮我分析下该如何修改，先给我修改文档