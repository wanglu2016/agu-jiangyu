/* “持有一月”排行榜服务器（Supabase）。
   填上项目的 Project URL 和 anon public key（Supabase 后台 Project Settings → API），排行榜就会开通；
   两项留空时，游戏照常能玩，只是不上传、不排名，战绩只记在玩家自己的浏览器里。
   anon key 本来就是给网页公开用的：数据库表对它全部关闭，它只能调用 cy_submit、cy_share、cy_top 三个函数（见 tools/chiyou-schema.sql）。 */
window.AGU_CY_CFG = {
  url: '',
  key: ''
};
