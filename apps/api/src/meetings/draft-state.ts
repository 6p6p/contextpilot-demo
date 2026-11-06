import {sql} from 'drizzle-orm';
import type {Database} from '../knowledge/service.js';
export async function changedTodos(executor:Pick<Database['db'],'execute'>,draftId:string) {
  const result=await executor.execute(sql`select exists(select 1 from meeting_todos t join email_drafts d on d.meeting_id=t.meeting_id where d.id=${draftId} and t.updated_at>d.updated_at) as changed`);
  return result.rows[0]?.changed===true;
}
export function latestDraftBody(todos:{task:string;owner:string|null;dueDate:string|null;origin:string}[],risks:{description:string;impact:string;level:string}[]=[]) {
  return `潜在风险（分析，需复核）：\n${risks.map(r=>`[${r.level}] ${r.description}；潜在影响：${r.impact}`).join('\n')}\n\n请复核以下最新明确行动项（人工保存后才成为新草稿版本）：\n\n${todos.filter(t=>t.origin==='meeting_action').map(t=>`${t.task}；负责人：${t.owner??'未明确'}；截止日期：${t.dueDate??'未明确'}`).join('\n')}\n\n风险跟进建议和待确认问题需另行复核，不视为已分配行动。`;
}
