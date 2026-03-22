import json
import re

new_json_file = r'd:\environment\tavern_helper_template-main\.kilocode\-《小回剧场指定版》-新年好.json'
output_file = r'd:\environment\tavern_helper_template-main\.kilocode\整合后新增小剧场.txt'

# 已有的title列表 (从用户提供的《已有的小回小剧场》中提取)
existing_titles = {
    "手机聊天", "跟踪日记", "后世史评", "野史", "cp相性一百问",
    "养成游戏", "平行宇宙群聊", "采访", "推特网黄", "直播网黄",
    "双人安利", "死亡房间", "user的游戏", "写歌", "恐怖鬼怪",
    "灵异直播", "多人群聊", "手机动态", "同人女九宫格", "弹幕",
    "物品有话说", "中式占卜", "临时家长", "头脑特工队",
    "突然召唤出user", "手机使用记录", "西式占卜", "读书笔记",
    "后室", "同人论坛", "恋综", "角色扮演小剧场", "时间胶囊",
    "婚后日常", "爱恋提醒", "真心话大冒险", "作者吐槽", "读者怨念",
    "相册小剧场", "吵架小剧场", "好嫌榜", "阿尔茨海默日记",
    "2ch小剧场", "随机论坛小剧场", "SCP小剧场", "恋爱助手小剧场",
    "同人小剧场", "体检小剧场", "克苏鲁小剧场", "求萌点小剧场",
    "冷知识小剧场", "动物塑小剧场", "信件小剧场", "cp相性一百问nsfw版",
    "外语教学小剧场", "超市采购小剧场", "桌宠小剧场", "片场日记小剧场",
    "消费记录小剧场", "旅游小剧场", "系统小剧场", "相反走向小剧场",
    "打投氪金小剧场", "秀什么呢", "社交媒体小剧场", "心灵之蛋小剧场",
    "AI助手小剧场", "轻松愉快", "恶俗小剧场", "红娘大师小剧场",
    "{{user}}背景补充小剧场", "平行事件小剧场", "随身携带物品",
    "色情偶像小剧场", "推荐小剧场", "电影预告片小剧场",
    "高潮迭起小剧场", "戒社忏悔小剧场", "galgame化剧情",
    "随笔四则小剧场", "变小孩小剧场", "回望", "性器开口小剧场",
    "星露谷", "换装小剧场", "char的游戏", "user那些不为人知的事",
    "辱追梦男小剧场", "旅行user", "性器状态小剧场", "隐身小剧场",
    "默契测试", "前列腺炎小剧场", "互换身体", "100次的循环小剧场",
    "随机生成meta小剧场", "情侣冷战记录", "美恐小剧场",
    "平行宇宙来信", "AO3小剧场", "体检报告小剧场", "催眠小剧场",
    "性幻想", "前世小剧场", "感官共享", "温情小剧场",
    "双向暗恋小剧场", "出口即黄小剧场", "字符画小剧场", "超能力",
    "user不存在的世界线", "char背景补充小剧场", "梦男日常",
    "变动物", "失忆小剧场", "反话小剧场", "变鬼", "BE小剧场",
    "第一次尝试·小剧场", "双人日记", "时空错乱小剧场", "夹心小剧场",
}

# 也用一些变体来匹配(JSON comment vs tag名)
# 建立一个规范化的已有title集合用于匹配
def normalize_title(t):
    """去除空格、标点差异以便匹配"""
    t = t.strip()
    # 移除一些常见后缀差异
    t = t.replace("小剧场", "").replace("·", "").replace("@", "").strip()
    return t.lower()

existing_normalized = {}
for t in existing_titles:
    existing_normalized[normalize_title(t)] = t

# 读取JSON
with open(new_json_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

entries = data.get('entries', {})

new_items = []
skipped = []

for key, item in sorted(entries.items(), key=lambda x: int(x[0]) if x[0].isdigit() else 0):
    if not isinstance(item, dict) or 'content' not in item:
        continue
    
    comment = item.get('comment', '').strip()
    content = item['content'].strip()
    
    # 从 content 中提取 <tag> 名称作为title
    tag_match = re.search(r'^<([^>/\n]+)>', content)
    tag_name = tag_match.group(1).strip() if tag_match else comment
    
    # 检查是否已存在 - 通过多种方式匹配
    found = False
    
    # 直接匹配 tag_name
    if tag_name in existing_titles:
        found = True
    # 直接匹配 comment
    if comment in existing_titles:
        found = True
    # comment去掉@后缀等
    comment_clean = re.sub(r'@.*$', '', comment).strip()
    if comment_clean in existing_titles:
        found = True
    # 规范化匹配
    if normalize_title(tag_name) in existing_normalized:
        found = True
    if normalize_title(comment) in existing_normalized:
        found = True
    if normalize_title(comment_clean) in existing_normalized:
        found = True
    
    # 特殊匹配：一些已有版本用了不同名称
    special_map = {
        "snow小剧场要求": True,  # 这是头部规则，不是小剧场
        "随机剧场": True,  # 已有中有"随机生成meta小剧场"等
        "方亦楷写歌": True,  # 对应已有的"写歌"  
        "方亦楷-开始写歌！": True,
    }
    if tag_name in special_map or comment in special_map:
        found = True
    # 使用必开(头)和使用必开(尾)是规则，不是小剧场
    if "使用必开" in comment:
        found = True
    
    if found:
        skipped.append(f"[跳过] {comment} / <{tag_name}>")
    else:
        # 替换 char -> 角色 (最优先)
        content_replaced = content.replace('char', '角色').replace('Char', '角色').replace('CHAR', '角色')
        
        # 生成 Title (用 tag_name 或 comment 中更简洁明了的那个)
        title = tag_name if tag_name else comment_clean
        
        new_items.append({
            'title': title,
            'content': content_replaced,
        })

# 输出
output_lines = []
for item in new_items:
    block = f"### {item['title']}\n"
    block += f"Title: {item['title']}\n"
    block += f"Category: 小回\n"
    block += f"Desc: 导入数据\n\n"
    block += item['content']
    output_lines.append(block)

final_output = "\n\n".join(output_lines)

with open(output_file, 'w', encoding='utf-8') as f:
    f.write(final_output)

print(f"=== 处理完成 ===")
print(f"JSON总条目: {len(entries)}")
print(f"跳过(已有): {len(skipped)}")
print(f"新增条目: {len(new_items)}")
print()
print("--- 跳过列表 ---")
for s in skipped:
    print(s)
print()
print("--- 新增列表 ---")
for item in new_items:
    print(f"[新增] {item['title']}")
