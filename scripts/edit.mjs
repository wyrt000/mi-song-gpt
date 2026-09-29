// 精确字符串替换工具：node scripts/edit.mjs <file>   （旧/新串取自环境变量 OLD/NEW）
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const oldStr = process.env.OLD;
const newStr = process.env.NEW;
if (!file || oldStr === undefined || newStr === undefined) {
  console.error('usage: OLD=.. NEW=.. node scripts/edit.mjs <file>');
  process.exit(2);
}
const text = readFileSync(file, 'utf8');
const first = text.indexOf(oldStr);
if (first < 0) {
  console.error('edit.mjs: old string not found');
  process.exit(1);
}
if (text.indexOf(oldStr, first + oldStr.length) >= 0) {
  console.error('edit.mjs: old string matches more than once');
  process.exit(1);
}
writeFileSync(file, text.slice(0, first) + newStr + text.slice(first + oldStr.length), 'utf8');
console.log('edit.mjs: ok');