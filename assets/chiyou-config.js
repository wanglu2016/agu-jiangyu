/* “持有一月”排行榜服务器（Supabase 项目 game-leaderboard，新加坡）。
   url 是 Project URL；key 是给网页用的公开密钥：新版的 Publishable key（sb_publishable_…），或旧版的 anon public key。
   两项留空时，游戏照常能玩，只是不上传、不排名，战绩只记在玩家自己的浏览器里。
   这个密钥本来就是公开的：数据库表对它全部关闭，它只能调用 cy_submit、cy_share、cy_top 三个函数（见 tools/chiyou-schema.sql）。 */
window.AGU_CY_CFG = {
  url: 'https://fsifwnwtdyjeretxdjkk.supabase.co',
  key: 'sb_publishable_yYWyE8EW91wPbze2sNHtcg_GDUvQ5TL'
};
