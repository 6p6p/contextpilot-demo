import {sql} from 'drizzle-orm';
import type {Database} from './knowledge/service.js';
import {PublicError} from './errors.js';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
type Table='conversations'|'documents'|'meeting_todos';
const flags={conversations:'archived_at',documents:'removed_at',meeting_todos:'dismissed_at'} as const;
export async function setManagementFlag(db:Database,table:Table,id:string,clear=false,version?:number){
  const field=flags[table];
  const present=await db.pool.query('select 1 from information_schema.columns where table_schema=$1 and table_name=$2 and column_name=$3',['public',table,field]);
  if(!present.rowCount)throw new PublicError(503,'MANAGEMENT_MIGRATION_REQUIRED','管理功能需要已审查的0009增量迁移；未修改数据。');
  const client=await db.pool.connect();
  try{
    await client.query('begin');
    if(table==='conversations'){
      await client.query('select id from conversations where id=$1 for update',[id]);
      const pending=await client.query("select 1 from messages where conversation_id=$1 and status='processing' limit 1",[id]);
      if(pending.rowCount)throw new PublicError(409,'CONVERSATION_BUSY','会话正在生成，请完成后再归档。');
    }
    if(table==='meeting_todos'){
      const ref=await client.query('select meeting_id from meeting_todos where id=$1',[id]);
      if(!ref.rows[0])throw new PublicError(404,'TODO_NOT_FOUND','待办不存在。');
      await client.query('select id from meetings where id=$1 for update',[ref.rows[0].meeting_id]);
    }
    const query=`update ${table} set ${field}=${clear?'null':'clock_timestamp()'}${table==='meeting_todos'?',version=version+1,updated_at=clock_timestamp(),user_edited=true':''} where id=$1${table==='meeting_todos'?' and version=$2':''} returning id`;
    const result=await client.query(query,table==='meeting_todos'?[id,version]:[id]);
    if(!result.rowCount)throw new PublicError(409,'MANAGEMENT_CONFLICT','记录不存在或版本已变化，请刷新。');
    await client.query('commit');return {id,retained:true};
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}
}
export const visible = (table:unknown,field:'archived_at'|'removed_at'|'dismissed_at')=>sql`to_jsonb(${table}) ->> ${field} is null`;
export function registerManagementRoutes(app:FastifyInstance,db:Database|null){
 const requireDB=()=>{if(!db)throw new PublicError(503,'DATABASE_NOT_CONFIGURED','数据库未配置。');return db;};
 const id=(p:unknown)=>z.object({id:z.uuid()}).parse(p).id;
 app.delete('/api/conversations/:id',r=>setManagementFlag(requireDB(),'conversations',id(r.params)));
 app.delete('/api/documents/:id',r=>setManagementFlag(requireDB(),'documents',id(r.params)));
 app.post('/api/meeting-todos/:id/ignore',r=>{const input=z.object({version:z.number().int().positive(),restore:z.boolean().default(false)}).strict().parse(r.body);return setManagementFlag(requireDB(),'meeting_todos',id(r.params),input.restore,input.version);});
 app.patch('/api/conversations/:id',async r=>{
  const title=z.object({title:z.string().trim().min(1).max(100)}).strict().parse(r.body).title;
  const row=await requireDB().pool.query("update conversations set title=$2,updated_at=clock_timestamp() where id=$1 and to_jsonb(conversations)->>'archived_at' is null returning id,title",[id(r.params),title]);
  if(!row.rowCount)throw new PublicError(404,'CONVERSATION_NOT_FOUND','会话不存在或已归档。');return row.rows[0];
 });
}
