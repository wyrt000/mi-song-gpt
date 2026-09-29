/// <reference types="@songloft/plugin-sdk" />

interface FavoritePlaylist {
  id: number;
  type: string;
  name: string;
  labels?: string[];
}

/**
 * 定位宿主内置的歌曲收藏歌单。内置歌单的稳定身份是 id=1；名称可能被用户修改，
 * 仅在兼容旧数据时才退回到 built_in 标签和默认名称。
 */
export function findFavoritesPlaylist<T extends FavoritePlaylist>(playlists: T[]): T | undefined {
  return playlists.find(playlist => playlist.id === 1 && playlist.type === 'normal')
    ?? playlists.find(playlist =>
      playlist.type === 'normal'
      && playlist.labels?.includes('built_in')
      && playlist.name === '收藏')
    ?? playlists.find(playlist => playlist.type === 'normal' && playlist.name === '收藏');
}
