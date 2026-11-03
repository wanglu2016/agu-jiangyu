# 行业“国家”划分：证监会行业大类 → 本图板块，外加少数主题名单
import re
SECTORS = [
 # key, 名称, 族
 ('bank','银行','fin'), ('broker','证券','fin'), ('insur','保险','fin'),
 ('estate','房地产','prop'), ('build','建筑','prop'), ('bmat','建材','prop'),
 ('baijiu','白酒','cons'), ('food','食品饮料','cons'), ('appl','家电','cons'), ('pharma','医药','cons'),
 ('agri','农林牧渔','cons'), ('light','轻工纺服','cons'), ('trade','商贸服务','cons'),
 ('auto','汽车','mfg'), ('power','电力设备与新能源','mfg'), ('mach','机械','mfg'), ('defense','国防军工','mfg'),
 ('elec','电子','tech'), ('semi','半导体','tech'), ('ai','AI算力','tech'), ('telecom','通信','tech'),
 ('soft','计算机','tech'), ('media','传媒互联网','tech'),
 ('oil','石油石化','cyc'), ('coal','煤炭','cyc'), ('metal','有色金属','cyc'), ('steel','钢铁','cyc'), ('chem','基础化工','cyc'),
 ('util','公用事业','infra'), ('transp','交通运输','infra'),
]
NEW = {
 'A':'agri',
 'B06':'coal','B07':'oil','B08':'steel','B09':'metal','B10':'bmat','B11':'oil','B12':'metal',
 'C13':'food','C14':'food','C15':'food','C16':'food','C17':'light','C18':'light','C19':'light','C20':'light','C21':'light',
 'C22':'light','C23':'light','C24':'light','C25':'oil','C26':'chem','C27':'pharma','C28':'chem','C29':'chem','C30':'bmat',
 'C31':'steel','C32':'metal','C33':'mach','C34':'mach','C35':'mach','C36':'auto','C37':'defense','C38':'power','C39':'elec',
 'C40':'mach','C41':'mach','C42':'chem','C43':'mach',
 'D':'util','E':'build','F':'trade','G':'transp','H':'trade',
 'I63':'telecom','I64':'media','I65':'soft',
 'J66':'bank','J67':'broker','J68':'insur','J69':'broker',
 'K':'estate','L':'trade','M73':'pharma','M74':'trade','M75':'trade','N':'util','O':'trade','P':'trade','Q':'pharma','R':'media','S':'trade',
}
def from_new(code):
    m=re.match(r'^([A-S])(\d\d)',code)
    if not m: return None
    L,d=m.group(1),m.group(1)+m.group(2)
    return NEW.get(d) or NEW.get(L)
NEWNAME={}  # 2012版大类名称 → 代码，由 build_final 填充
OLD_RULES=[  # 2012年前旧版证监会分类的关键词，按顺序匹配
 ('银行','bank'),('货币金融','bank'),('证券','broker'),('保险','insur'),('资本市场','broker'),('信托','broker'),('其他金融','broker'),
 ('批发','trade'),('零售','trade'),('商业经纪','trade'),
 ('房地产','estate'),
 ('仪器仪表','mach'),('金属制品','mach'),('建筑材料','bmat'),('土木工程','build'),('建筑','build'),('装修装饰','build'),
 ('燃料加工','oil'),('石油加工','oil'),('原油','oil'),('石油制品','oil'),('炼焦','oil'),('石油和天然气开采','oil'),('采掘服务','oil'),('开采专业及辅助','oil'),
 ('煤炭','coal'),
 ('黑色金属','steel'),('有色金属','metal'),('贵金属','metal'),('稀有稀土','metal'),
 ('非金属矿物','bmat'),('水泥','bmat'),('玻璃','bmat'),('陶瓷','bmat'),('耐火','bmat'),('石墨','bmat'),('矿物纤维','bmat'),
 ('化学','chem'),('塑','chem'),('橡胶','chem'),('化纤','chem'),('合成材料','chem'),('废弃资源','chem'),
 ('医药','pharma'),('生物制品','pharma'),('卫生','pharma'),('医疗器械','pharma'),('研究和试验','pharma'),
 ('酒','food'),('饮料','food'),('食品','food'),('乳制品','food'),('调味','food'),('屠宰','food'),('植物油','food'),('制糖','food'),('发酵','food'),('粮食及饲料','food'),('农副食品','food'),('水产品加工','food'),
 ('农、林','agri'),('农林','agri'),('农业','agri'),('林业','agri'),('畜牧','agri'),('渔业','agri'),('种植','agri'),
 ('纺织','light'),('服装','light'),('皮毛','light'),('皮革','light'),('制鞋','light'),('造纸','light'),('印刷','light'),('家具','light'),('木材','light'),('文教','light'),('体育用品','light'),('工美','light'),('钟表','light'),
 ('汽车运输','transp'),('汽车制造','auto'),('摩托车','auto'),('自行车','auto'),
 ('铁路运输设备','defense'),('船舶','defense'),('航空航天','defense'),('交通运输设备','auto'),
 ('日用电子','elec'),('电器机械','power'),('电气机械','power'),('输配电','power'),('电机','power'),('电工器械','power'),('照明','power'),
 ('雷达','telecom'),('广播电视设备','telecom'),('通信','telecom'),('电信','telecom'),
 ('计算机及相关设备','elec'),('电子计算机','elec'),('电子','elec'),
 ('计算机','soft'),('软件','soft'),('信息技术服务','soft'),
 ('互联网','media'),('传播','media'),('文化','media'),('出版','media'),('广播电影','media'),('电视','media'),('新闻','media'),('广告','media'),
 ('电力','util'),('热力','util'),('燃气','util'),('煤气','util'),('自来水','util'),('水的生产','util'),('环境治理','util'),('生态保护','util'),('公共设施','util'),('公共交通','util'),
 ('交通运输','transp'),('仓储','transp'),('港口','transp'),('航空','transp'),('公路','transp'),('水上运输','transp'),('铁路运输','transp'),('沿海运输','transp'),('远洋运输','transp'),('装卸搬运','transp'),('多式联运','transp'),('邮政','transp'),('管道运输','transp'),
 ('其他制造业','mach'),('机械','mach'),('设备','mach'),('锅炉','mach'),('轴承','mach'),('铸件','mach'),('集装箱','mach'),
 ('社会服务','trade'),('旅游','trade'),('旅馆','trade'),('住宿','trade'),('餐饮','trade'),('租赁','trade'),('商务','trade'),('综合','trade'),('专业科研','trade'),('专业技术服务','trade'),('教育','trade'),('科学研究','trade'),
]
def from_old(s):
    s=s.replace('金融保险业','金融业')
    for seg in reversed(s.split('-')):
        if seg in NEWNAME: 
            k=from_new(NEWNAME[seg])
            if k: return k
    for kw,k in OLD_RULES:
        if kw in s: return k
    return None
def map_csrc(s):
    if not s: return None
    return from_new(s) or from_old(s)

# 主题名单：代码 → (板块, 起始月或None)
BAIJIU=['SH600519','SZ000858','SZ000568','SH600809','SZ002304','SZ000596','SH603369','SH600702','SH600779','SZ000799',
        'SH603589','SH603198','SH600559','SH600199','SH600197','SZ000995','SZ002646','SH603919','SZ000860']
APPL=['SZ000333','SZ000527','SZ000651','SH600690','SZ000921','SH600060','SZ002508','SZ002032','SZ002242','SZ000418',
      'SH600839','SZ000016','SH600336','SZ002035','SH603486','SH688169','SZ002959','SH603868','SZ000521','SH600983',
      'SZ002677','SZ002705','SZ300894','SZ002668','SZ000404','SH600854']
SEMI=['SH688256','SH688041','SH688795','SH688802','SH688981','SZ002371','SH688012','SH603501','SH603986','SH688008','SH600584','SZ002156','SZ002185','SZ002049',
      'SZ300782','SH688126','SH688347','SH688396','SH600460','SH600745','SH688072','SH688120','SH688082','SZ300661',
      'SH688521','SH688536','SH603290','SZ300373','SH600703','SZ300223','SH688385','SH688099','SH688213','SH688220',
      'SH688249','SH688469','SH688234','SZ300604','SZ300567','SH688037','SZ002409','SZ300666','SH600667','SZ300346',
      'SH688019','SH688525','SZ301308','SH688825','SZ300672','SH688200','SH688052','SH688262','SH688261','SH603005',
      'SH688172','SH688702','SH688361','SH688107','SH688123','SH603893','SH688766','SH688608','SH688141','SH600171']
AI=['SH601138','SZ300308','SZ300502','SZ300394','SZ002281','SZ000988','SH603083','SH688498','SZ300570','SZ000977',
    'SH603019','SZ000938','SH688256','SH688041','SH688795','SH688802','SZ002463','SZ300476','SZ002837','SZ300442']
TELECOM=['SZ000063','SH600498','SH600487','SH600522','SH601869','SZ002281','SZ300308:2017-11','SZ300502','SZ300394','SH603083','SZ300570','SH688498']
NEWENERGY=['SH600438:2016-01','SZ002129','SH601012','SH600089','SZ300274','SZ002459','SH688599','SH688223','SH600732']
OTHER={'SZ300059':'broker','SH601766':'mach','SH601299':'mach','SH688187':'mach','SZ300760':'pharma','SH603259':'pharma',
       'SZ002714':'agri','SH601607':'pharma','SH600887':'food','SZ000876':'agri'}
AI_START='2023-01'

def build_overrides():
    ov={}  # sym -> list of (start_month or None, sector)
    def add(lst, sec, start=None):
        for x in lst:
            s,_,st=x.partition(':')
            ov.setdefault(s,[]).append((st or start, sec))
    add(BAIJIU,'baijiu'); add(APPL,'appl'); add(SEMI,'semi'); add(TELECOM,'telecom'); add(NEWENERGY,'power')
    for s,sec in OTHER.items(): ov.setdefault(s,[]).append((None,sec))
    add(AI,'ai',AI_START)
    return ov
