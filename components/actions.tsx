'use client';
import { useState, type ReactNode } from 'react';
import { Button, Form, Modal, useApp, type Day, type Field, type Row } from './ui';

export const field=(name:string,label:string,type:Field['type']='text',options:Partial<Field>={}):Field=>({name,label,type,...options});
export const memo=(name:string,label:string)=>field(name,label,'textarea',{optional:true});
export const optional=(name:string,label:string,type:Field['type']='text')=>field(name,label,type,{optional:true});
export const inr=(name:string,label:string)=>field(name,label+' (INR)','money',{optional:true});
export { addDays } from '../domains/shared';
export function ActionButton({action,input,children,success,className='outline',done}:{action:string;input:Row;children:ReactNode;success?:string;className?:string;done?:(result:Row)=>void}) {
  const {act}=useApp();
  const [busy,setBusy]=useState(false);
  return <Button className={className} disabled={busy} onClick={async()=>{
    setBusy(true);try{const result=await act(action,input,success||'Changes saved');done?.(result);}
    catch{}finally{setBusy(false);}
  }}>{busy?'Saving…':children}</Button>;
}
export function EditButton({label,title,fields,initial,action,input={},success,done,itinerary,onChange,totals=false,className='outline',children}:{
  label:string;title?:string;fields:Field[];initial?:Row;action:string;input?:Row;success?:string;done?:(result:Row)=>void;itinerary?:Day[];
  onChange?:(name:string,value:any)=>Row|void;totals?:boolean;className?:string;children?:ReactNode;
}) {
  const {act}=useApp();
  const [open,setOpen]=useState(false);
  return <><Button className={className} onClick={()=>setOpen(true)}>{children}{label}</Button>
    {open&&<Modal title={title||label} close={()=>setOpen(false)}><Form fields={fields} initial={initial} itinerary={itinerary} options={{totals}} onChange={onChange}
      label={label} submit={async p=>{const result=await act(action,{...p,...input},success||'Changes saved');setOpen(false);done?.(result);}}/></Modal>}</>;
}
