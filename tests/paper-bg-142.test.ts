import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('#142 等字体期间页面与画布为宣纸色 #efe6d2', () => {
  it('index.html 内联首屏底色', () => {
    expect(read('index.html')).toMatch(/html,body,#app,#screen\{background:#efe6d2\}/);
  });
  it('style.css 中 html/body 与 #screen 底色', () => {
    const css = read('src/platform/web/style.css');
    expect(css).toMatch(/html,\s*body\s*\{[^}]*background:\s*#efe6d2/);
    expect(css).toMatch(/#screen\s*\{[^}]*background:\s*#efe6d2/);
    expect(css).not.toMatch(/#120806/);
  });
});
