import test from 'node:test';
import assert from 'node:assert/strict';
import { createDetector } from '../dist/lib/detector.js';
import { preparePreview as prepare } from '../dist/lib/privacy.js';
const detect = createDetector();
const secret = 'local-only-test-signing-secret-32-characters';
test('real local detector removes greetings, companies, signatures and contact details', async () => {
  const text = 'Hi Alex, thank you for your application to Acme. Unfortunately we cannot proceed. Contact alex@example.com.\nBest regards,\nSam Smith\nAcme Robotics';
  const result = await prepare({ outcome: 'rejection', response: text }, { detect, secret });
  const output = JSON.stringify(result.entry);
  for (const name of ['Alex', 'Acme', 'alex@example.com', 'Sam Smith']) assert.equal(output.includes(name),false,name);
  assert.ok(output.includes('Unfortunately we cannot proceed'));
});
test('local Chinese patterns remove identified spans without rejecting the language', async () => {
  const result = await prepare({ outcome:'rejection', response:'李明您好，感谢您申请测试公司的职位。很遗憾，我们无法继续。' }, {detect,secret});
  const output=JSON.stringify(result.entry); assert.ok(!output.includes('李明')); assert.ok(!output.includes('测试公司')); assert.ok(output.includes('很遗憾'));
});
test('permissive rules accept short, ambiguous, emotional and multilingual replies', async () => {
  for(const response of ['No.','Not this time.','Sorry.','不行。','Leider nein.','Désolé.','残念です。','لا، شكراً','Fuck no.','You are welcome to apply again.','Unusual words with no rejection keyword'])
    await prepare({outcome:'rejection',response},{detect,secret});
});
test('detector makes no external requests', async () => {
  const original=globalThis.fetch; globalThis.fetch=()=>{throw new Error('Unexpected network request')};
  try {await prepare({outcome:'rejection',response:'Dear Alex, we cannot proceed at Acme.'},{detect,secret});}
  finally {globalThis.fetch=original;}
});
