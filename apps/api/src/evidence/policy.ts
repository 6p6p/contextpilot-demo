// Source text can describe business actions but cannot grant system/tool authority.
export const untrustedInstruction = (text:string) => /不可信(?:附言|指令)|忽略.{0,16}(?:系统|指令|规则|提示)|系统提示|system prompt|ignore.{0,24}instructions|(?:泄露|发送).{0,12}(?:密钥|凭据|密码)|立即发送邮件/i.test(text);
export function projectRelevant(question:string,content:string,quote:string) {
  const ids=[...question.matchAll(/\b[A-Z][A-Z0-9]*-[A-Z0-9]+\b/gi)].map(m=>m[0].toLowerCase());
  if(!ids.length)return true;
  return quote.split(/[；;。\n]/).some(s=>ids.some(id=>s.toLowerCase().includes(id))&&s.includes(content));
}
export function useCurrentContext(question:string,history:{role:string;content:string;status:string}[]) {
  if(!/刚才|本轮|当前会话|上面|上述/.test(question))return false;
  const ids=question.match(/\b[A-Z][A-Z0-9]*-[A-Z0-9]+\b/gi)??[];
  return ids.length>0&&history.filter(m=>m.role==='user'&&m.status==='completed').slice(0,-1).some(m=>ids.every(id=>m.content.includes(id)));
}
