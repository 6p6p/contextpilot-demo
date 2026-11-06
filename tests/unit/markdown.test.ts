import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SafeMarkdown,AnswerContent} from '../../apps/web/src/SafeMarkdown.js';
it('renders semantic Markdown but escapes untrusted HTML and disables script links',()=>{
 const html=renderToStaticMarkup(createElement(SafeMarkdown,{text:'# 标题\n**重点**\n- 一\n- 二\n> 引用\n```js\n<script>evil()</script>\n```\n<img src=x onerror=evil()>\n[危险](javascript:evil)'}));
 for(const tag of ['<h2>','<strong>','<ul>','<li>','<blockquote>','<pre>'])expect(html).toContain(tag);
 expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).not.toContain('href="javascript:');expect(html).toContain('&lt;script&gt;');
});
it('compact web answers preserve the entire evidence tail behind a closed disclosure',()=>{
 const html=renderToStaticMarkup(createElement(AnswerContent,{text:'基于官方证据归纳：支持状态仍需核对。[W1]\n\n来源：https://nodejs.org/\n查询时间：固定测试时钟',compactWeb:true}));
 expect(html).toContain('<details');expect(html).not.toContain('<details open');expect(html).toContain('查询时间：固定测试时钟');expect(html).toContain('https://nodejs.org/');
});
it('FIX03 GFM tables coexist with lists/code and escape unsafe HTML, links and pipe cells',()=>{
 const text='# 标题\n| 项目 | 内容 |\n| :--- | ---: |\n| **状态** | 已完成 |\n| 转义\\|管道 | `<script>` |\n| [危险](javascript:evil) | <img src=x onerror=evil()> |\n\n- 保留列表\n```txt\n| 代码 | 不解析 |\n| --- | --- |\n```';
 const html=renderToStaticMarkup(createElement(SafeMarkdown,{text}));
 expect(html.match(/<table>/g)).toHaveLength(1);expect(html).toContain('<thead>');expect(html).toContain('<tbody>');expect(html).toContain('<strong>状态</strong>');expect(html).toContain('转义|管道');expect(html).toContain('text-align:right');expect(html).toContain('<ul>');expect(html).toContain('<pre>');
 expect(html).not.toContain('<img');expect(html).not.toContain('<script>');expect(html).not.toContain('href="javascript:');
});
