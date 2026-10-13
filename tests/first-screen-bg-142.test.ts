import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FlowMachine } from '../src/game/flow';
import { C } from '../src/game/select/scene';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('#142 等字体期间首屏底色与首个场景（选将页）一致', () => {
  it('首屏场景是 select', () => {
    expect(new FlowMachine().page).toBe('select');
  });
  it('index.html 内联 #screen 用选将页漆底渐变，html/body 深色', () => {
    const html = read('index.html');
    expect(html).toContain(`#screen{background:radial-gradient(circle at 50% 38%,${C.lac4} 0,${C.lac2} 50%,${C.lac0} 100%)}`);
    expect(html).toMatch(/html,body\{background:#120806\}/);
    expect(html).not.toMatch(/#efe6d2/i);
  });
  it('style.css 两侧留深色 #120806', () => {
    const css = read('src/platform/web/style.css');
    expect(css).toMatch(/html,\s*body\s*\{[^}]*background:\s*#120806/);
    expect(css).not.toMatch(/#efe6d2/i);
  });
});
