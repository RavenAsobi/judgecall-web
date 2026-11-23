# -*- coding: utf-8 -*-
"""解析 EventLink (eventlink.wizards.com) 配对/成绩表 HTML 片段。
用法: python parse_eventlink.py <html文件>
输出: 每桌 {桌号, 玩家1{姓名,战绩,drop,输}, 玩家2{...}, 比分, 结果类型}
"""
import re, sys, json

def parse_row(row_html):
    def cell(modifier):
        m = re.search(r'pairings-table__cell--%s">(.*?)</td>' % modifier, row_html, re.S)
        return m.group(1) if m else ''

    def player(cell_html):
        # 姓名 + 是否 dropped（team__text 类含 dropped）
        tm = re.search(r'class="team__text([^"]*)">\s*<span>([^<]*)</span>', cell_html)
        name = tm.group(2).strip() if tm else ''
        dropped = bool(tm and 'dropped' in tm.group(1))
        rm = re.search(r'team__record">([^<]*)<', cell_html)
        record = rm.group(1).strip() if rm else ''
        lost = 'team__lost' in cell_html
        return {'name': name, 'record': record.replace('–', '-'), 'dropped': dropped, 'lost': lost}

    table_m = re.search(r'cell--table-num">(\d+)<', row_html)
    if not table_m:
        return None
    table_no = int(table_m.group(1))
    p1 = player(cell('left'))
    p2 = player(cell('right'))

    # 比分：两个 box-score，按 DOM 顺序，类标 winner/loser
    scores = re.findall(r'box-score (winner|loser)">(\d+)<', cell('result'))
    s1 = int(scores[0][1]) if len(scores) > 0 else None
    s2 = int(scores[1][1]) if len(scores) > 1 else None

    # 结果判定
    if len(scores) < 2:
        outcome = 'no_result'
    elif scores[0][0] == 'winner' and scores[1][0] == 'loser':
        outcome = 'p1_win'
    elif scores[0][0] == 'loser' and scores[1][0] == 'winner':
        outcome = 'p2_win'
    elif scores[0][0] == 'winner' and scores[1][0] == 'winner':
        outcome = 'draw'  # 双 winner = 平局（EventLink 平局两边都亮）
    else:
        outcome = 'unknown'

    return {'table': table_no, 'p1': p1, 'p2': p2,
            'score': [s1, s2], 'outcome': outcome}

def main(path):
    html = open(path, encoding='utf-8').read()
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.S)
    tables = [r for r in (parse_row(h) for h in rows) if r]
    tables.sort(key=lambda r: r['table'])

    label = {'p1_win': 'P1胜', 'p2_win': 'P2胜', 'draw': '平局', 'no_result': '无成绩', 'unknown': '?'}
    print(f'共解析 {len(tables)} 桌\n')
    print(f'{"桌":>3}  {"玩家1":<20}{"战绩":<8}  比分   {"玩家2":<20}{"战绩":<8}  结果  备注')
    for t in tables:
        p1, p2 = t['p1'], t['p2']
        score = f"{t['score'][0]}:{t['score'][1]}" if t['score'][0] is not None else '-'
        notes = []
        if p1['dropped']: notes.append(f"P1({p1['name']})已Drop")
        if p2['dropped']: notes.append(f"P2({p2['name']})已Drop")
        print(f"{t['table']:>3}  {p1['name']:<20}{p1['record']:<8}  {score:<5}  {p2['name']:<20}{p2['record']:<8}  {label[t['outcome']]}  {'; '.join(notes)}")

    print('\n--- JSON ---')
    print(json.dumps(tables, ensure_ascii=False, indent=1))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else r'C:/Users/asus/Desktop/eventlink支持.txt')
