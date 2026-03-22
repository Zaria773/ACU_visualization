import json

input_file = r'd:\environment\tavern_helper_template-main\.kilocode\-《小回剧场指定版》-新年好.json'
output_file = r'd:\environment\tavern_helper_template-main\.kilocode\-《小回剧场指定版》-新年好.txt'

try:
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    processed_contents = []
    
    entries = data.get('entries', {})
    for key, item in entries.items():
        if isinstance(item, dict) and 'content' in item:
            processed_contents.append(item['content'].strip())

    if not processed_contents:
        print('未在文件中找到符合格式的 content 内容。')

    final_output = '\n\n###\n\n'.join(processed_contents)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(final_output)

    print(f'转换成功！已生成文件: {output_file}')
    print(f'共提取并改写了 {len(processed_contents)} 条内容。')

except Exception as e:
    print(f'发生错误: {e}')
