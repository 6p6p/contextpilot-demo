import {and,eq,inArray,asc} from 'drizzle-orm';
import {documents,documentChunks} from '../db/schema.js';
import type {Database} from '../knowledge/service.js';
import {visible} from '../management.js';
import {PublicError} from '../errors.js';
export async function selectedDocuments(database:Database,ids:string[],storage?:{origin:string;bucket:string}){
 const selected=[...new Set(ids)];
 const identity=storage?and(eq(documents.storageOrigin,storage.origin),eq(documents.storageBucket,storage.bucket)):undefined;
 const ready=await database.db.select({id:documents.id}).from(documents).where(and(identity,inArray(documents.id,selected),eq(documents.status,'ready'),visible(documents,'removed_at')));
 if(ready.length!==selected.length)throw new PublicError(409,'PPT_DOCUMENT_NOT_READY','选定PDF已移除、未就绪或不属于当前私有存储配置，请调整附件。');
 const result=[];
 for(const id of selected){
  const rows=await database.db.select({sourceId:documentChunks.id,documentId:documents.id,filename:documents.filename,page:documentChunks.page,text:documentChunks.text}).from(documentChunks).innerJoin(documents,eq(documents.id,documentChunks.documentId)).where(and(identity,eq(documents.id,id),eq(documents.status,'ready'),visible(documents,'removed_at'))).orderBy(asc(documentChunks.ordinal)).limit(25);
  if(!rows.length)throw new PublicError(422,'PPT_DOCUMENT_EMPTY','选定PDF暂无可用原文，请等待解析或移除此附件。');
  if(rows.length>24)throw new PublicError(422,'PPT_SOURCE_LIMIT','选定PDF超过单次内容上限，请使用较短资料；不会截断原文或扩大来源范围。');
  result.push(...rows);
 }
 return result;
}
