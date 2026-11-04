import type { PptSource, PptPlan } from '../../shared/presentations.js';
// Synthetic, credential-free fixture. Not evidence of delivered business capabilities.
export const pptSources:PptSource[]=[
 {id:'S1',kind:'pdf',title:'合成项目资料.pdf · 第 2 页',text:'项目负责人为林岚，试点地点是南京。',classification:'fact',locator:{documentId:'00000000-0000-4000-8000-000000000001',page:2}},
 {id:'S2',kind:'meeting_risk',title:'合成会议.txt · 风险评估',text:'供应商交付延期，可能影响试点。',classification:'analysis',riskLevel:'high',locator:{meetingId:'00000000-0000-4000-8000-000000000002',evidence:{quote:'供应商交付延期',startLine:2,endLine:2}}},
 {id:'S3',kind:'todo',title:'合成会议.txt · 已保存待办',text:'复核供应商交付清单',classification:'fact',owner:'周宁',dueDate:'2026-11-08',locator:{todoId:'00000000-0000-4000-8000-000000000003',todoVersion:2}},
 {id:'S4',kind:'memory',title:'长期记忆（合成）',text:'林岚负责青杉项目，地点南京。',classification:'fact',locator:{memoryId:'00000000-0000-4000-8000-000000000004'}},
];
export const pptPlan:PptPlan={slides:[
 {kind:'cover',items:[]},
 {kind:'summary',items:[{kind:'quote',sourceId:'S1',quote:'项目负责人为林岚，试点地点是南京。'}]},
 {kind:'risk',items:[{kind:'quote',sourceId:'S2',quote:'供应商交付延期，可能影响试点。'}]},
 {kind:'todos',items:[{kind:'quote',sourceId:'S3',quote:'复核供应商交付清单'}]},
 {kind:'references',items:[]},
]};
export const pptTen:PptPlan={slides:[...pptPlan.slides.slice(0,2),
 {kind:'background',items:[{kind:'quote',sourceId:'S4',quote:'林岚负责青杉项目，地点南京。'}]},
 {kind:'progress',items:[{kind:'gap',text:'未提供可核实的项目进展'}]},
 ...pptPlan.slides.slice(2,4),
 {kind:'next',items:[{kind:'recommendation',text:'建议先核实供应商交付承诺，再复核试点安排',sourceIds:['S2','S3']}]},
 {kind:'gaps',items:[{kind:'gap',text:'需要补充原始资料后再判断'}]},
 {kind:'summary',items:[{kind:'analysis',text:'交付延期可能影响试点安排，需要进一步核实',sourceIds:['S2']}]},
 {kind:'references',items:[]} ]};
