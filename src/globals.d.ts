// 本插件额外使用的宿主生命周期钩子声明。
//
// onQueryBusy 是后端在热重载（自动更新）前的忙碌探测钩子：报告 busy 时后端会推迟重载，
// 等插件空闲后再做，避免自动更新打断正在进行的播放。
// 返回值可以是 boolean，或 `{"busy":bool,"reason":string}` 形式的 JSON 字符串
// （宿主用 fmt.Sprintf("%v") 字符串化返回值，直接返回对象会丢结构，所以要自己 stringify）。
// 钩子在 @songloft/plugin-sdk 的 global.d.ts 里补上声明之前，先在本仓库本地声明。
declare global {
  function onQueryBusy(): boolean | string | Promise<boolean | string>;
}

export {};
