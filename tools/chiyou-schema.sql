-- “持有一月”“持有三月”“持有一年”的对局记录与排行榜（PostgreSQL，按 Supabase 的习惯写）
-- 三个游戏共用两张表：答案表按持有期各有一列回报，对局表用 game（持有的月数：1、3、12）区分，排行榜各排各的。
-- 不要直接运行这个文件：运行 make_chiyou_sql.py 生成的 chiyou-supabase.sql（本文件 + 题库答案表）。
-- 可以重复运行：表已存在就保留，函数会被替换，答案表按 (v, r) 覆盖。
--
-- 安全做法：两张表都开启行级安全且不给任何策略，浏览器用公开的 anon key 直接读写不了表；
-- 只能调用下面三个函数。cy_submit 不相信浏览器算的盈亏，而是按题库答案表重新算一遍再排名。

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

-- 题库答案：每道题的股价、一个月后的回报、当天是否涨跌停（和网页 assets/chiyou-data.js 同一份数据）
create table if not exists cy_q (
  v   smallint not null,             -- 题库版本，对应 chiyou-data.js 里的 v
  r   int      not null,             -- 题号，即 chiyou-data.js 里的行号
  px  smallint not null,             -- 股价编码：元 = 10^(px/2000)
  f1  smallint not null,             -- 一个月后的涨跌（含分红）×10，单位 %
  f3  smallint,                      -- 三个月后的涨跌，同上；还没到期的为空
  f12 smallint,                      -- 一年后的涨跌，同上；还没到期的为空
  lim smallint not null,             -- 1 涨停收盘，-1 跌停收盘，0 其他
  primary key (v, r)
);
alter table cy_q add column if not exists f3 smallint;
alter table cy_q add column if not exists f12 smallint;

-- 每一局：谁（匿名的浏览器编号）、选了什么、结果如何
create table if not exists cy_rounds (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  v          smallint not null,
  game       smallint not null default 1,          -- 哪个游戏：持有的月数 1、3、12
  n          smallint not null,                    -- 几只股票
  pool       text not null,                        -- all 全部A股 / big 只看大公司
  cid        text not null,                        -- 浏览器里随机生成的编号，不含个人信息
  items      jsonb not null,                       -- 每只：r 题号, f 随机给的指标, fl 自己翻的指标, a 动作, x 比例, d 买卖股数（买正卖负）, b 是否因涨跌停没成交
  pnl        double precision not null,            -- 一个月后的账户盈亏（元）
  eff        double precision not null,            -- 你的操作带来（元）= 盈亏 − 一动不动的盈亏，排名用它
  ret        double precision not null,            -- 账户收益率（%）
  nick       text,                                 -- 昵称：选择晒战绩时才有
  secret     uuid not null default gen_random_uuid()   -- 只交给提交这一局的浏览器，凭它填昵称
);
alter table cy_rounds add column if not exists game smallint not null default 1;
create index if not exists cy_rounds_eff on cy_rounds (eff desc, id);
create index if not exists cy_rounds_game_eff on cy_rounds (game, eff desc, id);
create index if not exists cy_rounds_cid on cy_rounds (cid, created_at desc);

alter table cy_q enable row level security;
alter table cy_rounds enable row level security;
revoke all on cy_q, cy_rounds from anon, authenticated;
revoke all on sequence cy_rounds_id_seq from anon, authenticated;

-- 提交一局。p = { v, game, n, pool, cid, items: [{ r, f, fl, a, x, d, b }, …] }；game 省略时当作 1（持有一月）
-- 规则和网页一致：总资产 100 万；每只先按整手（100 股）买到接近 50 万 ÷ 只数；其余是现金。
-- 依次处理每只：卖出不超过原持仓、按整手（卖光除外），跌停不能卖；买入按整手、不超过当时的现金，涨停不能买；买卖各扣 0.1%。
create or replace function cy_submit(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ver   smallint := (p->>'v')::smallint;
  v_game  smallint := coalesce((p->>'game')::smallint, 1);
  v_f     smallint;
  v_items jsonb := p->'items';
  v_n     int;
  v_it    jsonb;
  v_q     cy_q;
  i       int;
  v_px    float8; v_sh0 int; v_d int; v_fee float8;
  v_cash  float8; v_tot0 float8 := 0; v_pnl float8 := 0; v_base float8 := 0;
  a_rows  int[] := '{}'; a_px float8[] := '{}'; a_sh0 int[] := '{}'; a_f1 float8[] := '{}'; a_lim int[] := '{}';
  v_cid   text := left(coalesce(p->>'cid', ''), 40);
  v_id    bigint; v_secret uuid; v_rank bigint; v_total bigint;
begin
  if jsonb_typeof(v_items) is distinct from 'array' then raise exception 'bad items'; end if;
  v_n := jsonb_array_length(v_items);
  if v_n < 1 or v_n > 5 or length(v_items::text) > 6000 then raise exception 'bad items'; end if;
  if coalesce(p->>'pool', '') not in ('all', 'big') then raise exception 'bad pool'; end if;
  if v_game not in (1, 3, 12) then raise exception 'bad game'; end if;
  if v_cid = '' then raise exception 'bad cid'; end if;
  if (select count(*) from cy_rounds r where r.cid = v_cid and r.created_at > now() - interval '20 seconds') >= 3 then raise exception 'too fast'; end if;
  for i in 0 .. v_n - 1 loop
    v_it := v_items -> i;
    select * into v_q from cy_q where cy_q.v = v_ver and cy_q.r = (v_it->>'r')::int;
    if not found then raise exception 'bad row'; end if;
    if v_q.r = any(a_rows) then raise exception 'dup row'; end if;
    v_f := case v_game when 1 then v_q.f1 when 3 then v_q.f3 else v_q.f12 end;
    if v_f is null then raise exception 'no answer'; end if;
    if jsonb_typeof(coalesce(v_it->'fl', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(v_it->'fl', '[]'::jsonb)) > 5 then raise exception 'bad flips'; end if;
    v_px  := power(10::float8, v_q.px / 2000.0);
    v_sh0 := greatest(1, floor(500000.0 / v_n / (v_px * 100) + 0.5)::int) * 100;
    a_rows := a_rows || v_q.r; a_px := a_px || v_px; a_sh0 := a_sh0 || v_sh0; a_f1 := a_f1 || (v_f / 1000.0); a_lim := a_lim || v_q.lim::int;
    v_tot0 := v_tot0 + v_sh0 * v_px;
  end loop;
  if v_tot0 > 1000000 then raise exception 'bad holdings'; end if;
  v_cash := 1000000 - v_tot0;
  for i in 1 .. v_n loop
    v_it := v_items -> (i - 1);
    v_d := coalesce((v_it->>'d')::int, 0); v_px := a_px[i]; v_sh0 := a_sh0[i];
    if v_d < 0 then
      if -v_d > v_sh0 or (-v_d % 100 <> 0 and -v_d <> v_sh0) or a_lim[i] = -1 then raise exception 'bad sell'; end if;
      v_fee := -v_d * v_px * 0.001; v_cash := v_cash + (-v_d) * v_px - v_fee;
    elsif v_d > 0 then
      if v_d % 100 <> 0 or a_lim[i] = 1 then raise exception 'bad buy'; end if;
      v_fee := v_d * v_px * 0.001;
      if v_d * v_px + v_fee > v_cash + 1 then raise exception 'not enough cash'; end if;
      v_cash := v_cash - v_d * v_px - v_fee;
    else
      v_fee := 0;
    end if;
    v_pnl  := v_pnl + (v_sh0 + v_d) * v_px * a_f1[i] - v_fee;
    v_base := v_base + v_sh0 * v_px * a_f1[i];
  end loop;
  insert into cy_rounds (v, game, n, pool, cid, items, pnl, eff, ret)
    values (v_ver, v_game, v_n, p->>'pool', v_cid, v_items, v_pnl, v_pnl - v_base, v_pnl / 10000.0)
    returning id, secret into v_id, v_secret;
  select count(*) + 1 into v_rank from cy_rounds r where r.game = v_game and r.eff > v_pnl - v_base;
  select count(*) into v_total from cy_rounds r where r.game = v_game;
  return jsonb_build_object('id', v_id, 'secret', v_secret, 'rank', v_rank, 'total', v_total,
                            'eff', round((v_pnl - v_base)::numeric, 2), 'pnl', round(v_pnl::numeric, 2));
end $$;

-- 晒战绩：凭提交时拿到的 secret 填昵称（1–12 个字）；只有此刻仍在前 100 名才能上榜
create or replace function cy_share(p_id bigint, p_secret uuid, p_nick text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_eff  float8; v_rank bigint; v_game smallint;
  v_nick text := btrim(regexp_replace(coalesce(p_nick, ''), '[[:cntrl:]<>&"]', '', 'g'));
begin
  if char_length(v_nick) < 1 or char_length(v_nick) > 12 then raise exception 'bad nick'; end if;
  select r.eff, r.game into v_eff, v_game from cy_rounds r where r.id = p_id and r.secret = p_secret;
  if not found then raise exception 'not found'; end if;
  select count(*) + 1 into v_rank from cy_rounds r where r.game = v_game and r.eff > v_eff;
  if v_rank > 100 then return jsonb_build_object('ok', false, 'rank', v_rank); end if;
  update cy_rounds set nick = v_nick where id = p_id;
  return jsonb_build_object('ok', true, 'rank', v_rank);
end $$;

-- 排行榜：某个游戏所有局按“你的操作带来”排的前 100 名（没晒的昵称为空），以及这个游戏的总局数、玩家数
drop function if exists cy_top();
create or replace function cy_top(p_game smallint default 1) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'game',    p_game,
    'total',   (select count(*) from cy_rounds where game = p_game),
    'players', (select count(distinct cid) from cy_rounds where game = p_game),
    'top', coalesce((select jsonb_agg(t order by t.rank, t.id) from (
      select a.id, (select count(*) + 1 from cy_rounds b where b.game = p_game and b.eff > a.eff) as rank, a.nick,
             round(a.eff::numeric, 0) as eff, round(a.pnl::numeric, 0) as pnl, a.n,
             to_char(a.created_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as d
      from cy_rounds a where a.game = p_game order by a.eff desc, a.id limit 100) t), '[]'::jsonb));
$$;

revoke all on function cy_submit(jsonb), cy_share(bigint, uuid, text), cy_top(smallint) from public;
grant execute on function cy_submit(jsonb), cy_share(bigint, uuid, text), cy_top(smallint) to anon, authenticated;
