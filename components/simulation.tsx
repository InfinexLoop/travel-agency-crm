'use client';
import { useState, useEffect, useRef, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Check, ChevronRight, FlaskConical, Globe2, Headphones, Instagram, MessageCircle, Phone, Plus, Send, Sparkles, UserRound } from 'lucide-react';
import { money, scenarios, sources, timestamp, titleDate } from '../domains/shared';
import { Badge, Button, Details, Empty, Form, PageHeading, Panel, Table, Timeline, dateColumn, labelFor, selectRows, stateColumn, useApp, type Field, type Row } from './ui';

export const inputFields={
  name:{name:'name',label:'Full name'} as Field, phone:{name:'phone',label:'Phone number',type:'tel',optional:true} as Field,
  email:{name:'email',label:'Email address',type:'email',optional:true} as Field,
  whatsapp:{name:'whatsapp',label:'WhatsApp number',type:'tel',optional:true} as Field,
  instagram:{name:'instagram',label:'Instagram handle',optional:true} as Field,
};
export const travelFields:Field[]=[
  {name:'destination',label:'Destination',optional:true},{name:'city',label:'Departure city',optional:true},
  {name:'dates',label:'Proposed travel dates',optional:true,placeholder:'e.g. 15–20 December'},
  {name:'purpose',label:'Trip purpose',optional:true},{name:'adults',label:'Adults',type:'number',min:1,max:99,value:2},
  {name:'children',label:'Children',type:'number',min:0,max:99,value:0},{name:'ages',label:'Children’s ages',optional:true},
  {name:'budget',label:'Budget (INR)',type:'money',optional:true},{name:'flexible',label:'Travel dates are flexible',type:'checkbox'},
  {name:'preferences',label:'Additional requirements',type:'textarea',optional:true},
];
export function EnquiryForm({channel,initial={},onSaved,edit=false}:{channel:string;initial?:Row;onSaved:(r:Row)=>void;edit?:boolean}) {
  const {data,act}=useApp();
  const [scenario,setScenario]=useState('custom');
  const defaults:Row=scenario==='custom'?initial:{...initial,name:scenarios[Number(scenario)][6].split(',')[0],phone:scenarios[Number(scenario)][6].split(',')[1].trim(),
    email:scenarios[Number(scenario)][6].split(',')[2].trim(),destination:['Dubai','Bali','Kashmir','Thailand','Singapore','Goa','Kerala'][Number(scenario)],
    dates:scenarios[Number(scenario)][3],city:scenarios[Number(scenario)][4],preferences:scenarios[Number(scenario)][7],
    budget:Number(scenarios[Number(scenario)][5].replace(/\D/g,''))*100,adults:parseInt(scenarios[Number(scenario)][2]),children:Number(scenarios[Number(scenario)][2].match(/and (\d+)/)?.[1]||0)};
  const fields:Field[]=[
    ...(edit?[]:[inputFields.name,inputFields.phone,inputFields.email,...(channel==='Website'?[]:[inputFields.whatsapp,inputFields.instagram])]),
    ...travelFields,
    {name:'package_id',label:'Package interest',type:'select',options:selectRows(data.packages.filter(p=>p.active),'title'),optional:true},
    ...(channel==='Website'?[]:[{name:'priority',label:'Priority',type:'select',options:['Low','Normal','High','Urgent'],value:'Normal'} as Field,
      {name:'follow_up',label:'Follow-up date',type:'date',optional:true} as Field]),
    ...(!edit&&channel==='Manual'?[{name:'source',label:'Enquiry source',type:'select',options:sources,value:'Walk-in'} as Field]:[]),
    ...(!edit&&channel!=='Website'&&data.user.role!=='sales'?[{name:'owner',label:'Salesperson',type:'select',options:selectRows(data.team.filter(u=>u.active&&['sales','manager','admin'].includes(u.role))),optional:true} as Field]:[]),
    ...(channel==='Phone Call'&&!edit?[{name:'call_time',label:'Call date and time (IST)',type:'datetime-local',optional:true} as Field,
      {name:'call_notes',label:'Call notes',type:'textarea',optional:true} as Field]:[]),
  ];
  return <>
    {channel==='Website'&&<label className="field scenario-select"><span>Example traveller</span><select value={scenario} onChange={e=>setScenario(e.target.value)}><option value="custom">Enter your own information</option>{scenarios.map(([title],i)=><option key={title} value={i}>{title}</option>)}</select></label>}
    <Form key={scenario} fields={fields} initial={defaults} label={edit?'Save enquiry':channel==='Website'?'Submit website enquiry':channel==='Phone Call'?'Log phone enquiry':'Create enquiry'}
      submit={async payload=>{const result=await act(edit?'lead.edit':channel==='Website'?'website.ingest':'lead.create',
        {...(edit?{id:initial.id,name:initial.name}:{}),source:channel==='Manual'?payload.source:channel,...payload},
        edit?'Enquiry updated':channel==='Website'?'Website enquiry recorded':'Enquiry saved');onSaved(result);}}/>
  </>;
}
const channels=[['Website',Globe2],['WhatsApp',MessageCircle],['Instagram',Instagram],['Phone',Phone]] as const;
function Messages({conversation,customer=false}:{conversation:Row;customer?:boolean}) {
  const {data}=useApp();
  const scroll=useRef<HTMLDivElement>(null);
  const messages=data.messages.filter(m=>m.conversation_id===conversation.id);
  useEffect(()=>{if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;},[messages.length]);
  return <div className="chat-scroll" ref={scroll} role="log" aria-label="Conversation messages">
    {!messages.length&&<div className="chat-start"><MessageCircle size={26}/><p>Send the first message to start this conversation.</p></div>}
    {messages.map(m=><div className={'bubble '+(m.direction==='Internal'?'internal':(customer?m.direction==='Inbound':m.direction==='Outbound')?'right':'left')} key={m.id}>
      <b>{m.direction==='Internal'?'Staff note':m.direction==='Inbound'?'Customer':m.automated?'Automation':'Travel specialist'}</b><p>{m.body}</p>
      <small>{timestamp(m.created)}{m.direction==='Outbound'&&<><Check size={13}/> Simulated</>}</small></div>)}
  </div>;
}
function Composer({send,label='Send message',quick=[],placeholder='Write a message…'}:{send:(body:string)=>Promise<unknown>;label?:string;quick?:string[];placeholder?:string}) {
  const [body,setBody]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent) {
    e.preventDefault();
    if (!body.trim()||busy) return;
    setBusy(true);setError('');
    try {await send(body);setBody('');}catch(e){setError((e as Error).message);}finally {setBusy(false);}
  }
  return <div className="compose">{!!quick.length&&<div className="quick-replies">{quick.map(reply=><Button className="outline" key={reply} onClick={()=>setBody(reply)}>{reply}</Button>)}</div>}
    <form onSubmit={submit}><input value={body} onChange={e=>setBody(e.target.value)} maxLength={600} aria-label="Message" placeholder={placeholder} required/>
      <Button type="submit" disabled={busy||!body.trim()} aria-label={label}><Send size={18}/><span>{busy?'Sending…':'Send'}</span></Button></form>
    {error&&<p className="error" role="alert">{error}</p>}</div>;
}
export function Simulation({id}:{id?:string}) {
  const {data,act}=useApp();
  const router=useRouter();
  const params=useSearchParams();
  const selected=params.get('channel');
  const c=data.conversations.find(c=>c.id===id);
  const channel=c?.channel||(channels.some(([name])=>name===selected)?selected:'WhatsApp');
  const [lastSubmission,setResult]=useState<Row>();
  const result=lastSubmission?.channel===channel?lastSubmission:undefined;
  const [showHistory,setShowHistory]=useState(false);
  const state=c?JSON.parse(c.state):{};
  const entry=scenarios[state.scenario||0];
  const stageKeys=['destination','travellers','dates','city','budget','contact','preferences'];
  const reply=state.qualified?'Please send a quotation':entry[c&&state.step?Math.max(1,stageKeys.indexOf(state.step)+1):1];
  const events=data.events.filter(e=>e.conversation_id===(c?.id||result?.conversation)||(result?.lead&&e.lead_id===result.lead));
  return <>
    <PageHeading title="Simulation center" description="Follow a customer interaction and the records it creates in the CRM.">
      <Button className="outline" onClick={()=>setShowHistory(!showHistory)}><Activity size={16}/> Session history</Button><Link className="button outline" href="/guide">Demo guide</Link>
    </PageHeading>
    <div className="channel-tabs" aria-label="Simulation channel">{channels.map(([name,Icon])=><Link key={name} className={name===channel?'selected':''} href={'/simulation?channel='+name}><Icon size={21}/><span>{name==='Website'?'Website enquiry':name==='Phone'?'Phone enquiry':name==='Instagram'?'Instagram DM':'WhatsApp chat'}</span>{name===channel&&<ChevronRight size={16}/>}</Link>)}</div>
    {showHistory&&<Panel title="Saved conversations"><Table records={data.conversations.filter(c=>['WhatsApp','Instagram'].includes(c.channel)&&JSON.parse(c.state).scenario!==undefined)}
      columns={[{key:'id',label:'Conversation'},{key:'channel',label:'Channel'},{key:'identity',label:'Identity'},stateColumn()]} href={r=>'/simulation/'+r.id} size={6}/></Panel>}
    <div className="sim-grid">
      {channel==='Website'||channel==='Phone'?<Panel title={channel==='Website'?'Travel enquiry form':'Log a phone enquiry'} description={channel==='Website'?'Submit a synthetic enquiry through the demo website adapter.':'Capture the caller’s details and the follow-up agreed with staff.'}>
        <div className="panel-body">
          <EnquiryForm key={channel} channel={channel==='Website'?'Website':'Phone Call'} onSaved={r=>setResult({...r,channel})}/></div>
        </Panel>:<Panel className={'chat-panel '+(channel==='Instagram'?'instagram':'whatsapp')}>
          <div className="chat-header"><span className="chat-icon">{channel==='Instagram'?<Instagram size={22}/>:<MessageCircle size={22}/>}</span><div><h2>{channel==='Instagram'?'Instagram DMs':'WhatsApp chat'}</h2><p>{c?.identity||'Customer view'} · Simulated channel</p></div>
            {c&&<Link className="button outline" href={'/simulation?channel='+channel}><Plus size={16}/> New chat</Link>}</div>
          {id&&!c?<Empty title="Conversation unavailable" description="Begin a new simulated conversation or open one from session history."/>:
          c?<><Messages conversation={c} customer/><Composer send={body=>act('sim.message',{id:c.id,body})} quick={reply?[reply,...(state.qualified?['I’d like to speak to a salesperson']:[])]:[]}/></>:
            <div className="chat-setup"><div className="stat-icon green"><Sparkles size={22}/></div><h3>Start a customer conversation</h3><p>Pick an example or type your own messages once the chat opens.</p>
              <Form fields={[{name:'scenario',label:'Scenario',type:'select',value:'0',options:scenarios.map(([label],i)=>({value:String(i),label}))},
                {name:'identity',label:channel==='Instagram'?'Instagram handle':'Conversation label',value:channel==='Instagram'?'@zuri.demo.traveller':'Demo traveller',optional:channel!=='Instagram'}]}
                label="Start conversation" submit={async values=>{const r=await act('sim.start',{...values,channel});router.push('/simulation/'+r.id);}}/></div>}
        </Panel>}
      <div className="sim-side">
        <Panel title="CRM activity" description="Updates appear as customer details are collected." action={<span className="live-chip"><i/> Live</span>}>
          {(c||result)?<div className="panel-body">
            {(c?.lead_id||result?.lead)&&<div className="lead-result"><div><span>CRM lead</span><strong>{c?.lead_id||result?.lead}</strong><small>{result?.linked?'Linked to existing enquiry':'Saved to the CRM'}</small></div><Link className="button" href={'/leads/'+(c?.lead_id||result?.lead)}>View CRM lead</Link></div>}
            {c&&<><Details items={[['Destination',state.destination],['Travellers',state.adults?`${state.adults} adults · ${state.children||0} children`:undefined],
              ['Travel dates',state.dates],['Departure city',state.city],['Budget',state.budget?money(state.budget):null],['Contact',state.name],['Phone / email',state.phone||state.email],
              ['Preferences',state.preferences],['Suggested package',state.package_id?labelFor(data.packages,state.package_id,'title'):null],['Sales owner',labelFor(data.team,c.owner)]]}/>
              <div className="actions section-actions"><Link className="button outline" href={'/inbox/'+c.id}>Open staff inbox</Link>
              <a className="button outline" href="#automation-events">View automation events</a>
              {c.status==='Automation'&&<Button className="outline" onClick={()=>void act('inbox.state',{id:c.id,status:'Human'},'Salesperson now controls this conversation').catch(()=>{})}><Headphones size={16}/> Take over</Button>}</div></>}
          </div>:<Empty title="Waiting for an interaction" description="Submit an enquiry or start a chat to see the CRM change here."/>}
        </Panel>
        <div id="automation-events"><Panel title="Automation events" description={events.length+' recorded events'} className="sim-events"><div className="panel-body"><Timeline events={events} limit={18}/></div></Panel></div>
      </div>
    </div>
  </>;
}
export function Inbox({id}:{id?:string}) {
  const {data,portal,act}=useApp();
  const router=useRouter();
  const c=data.conversations.find(c=>c.id===id);
  const [note,setNote]=useState(false);
  const [action,setAction]=useState('');
  const href=(id:string)=>(portal?'/portal':'')+'/inbox/'+id;
  if (!id) return <>
    <PageHeading title={portal?'Messages & assistance':'Unified inbox'} description={portal?'Contact the team about your trip.':'Review conversations, take over chats and schedule follow-ups.'}>
      {!portal&&<Link className="button" href="/simulation"><FlaskConical size={16}/> Open simulator</Link>}</PageHeading>
    {portal&&<Panel title="Ask for help" description="Your request goes to the travel team inside the demo."><div className="panel-body"><Form fields={[{name:'body',label:'How can we help?',type:'textarea'}]} label="Send request"
      submit={async p=>{const r=await act('portal.assistance',p,'Assistance request sent');router.push(href(r.id));}}/></div></Panel>}
    <Panel title="Conversations"><Table records={data.conversations.map(c=>({...c,name:labelFor(data.customers,c.customer_id),owner_name:labelFor(data.team,c.owner)}))}
      search="Search conversations" filter="channel" columns={[{key:'identity',label:'Contact'},{key:'channel',label:'Channel'},{key:'name',label:'Customer'},stateColumn(),
        ...(!portal?[{key:'owner_name',label:'Sales owner'}]:[]),dateColumn('created','Started')]} href={r=>href(r.id)}/></Panel>
  </>;
  if (!c) return <Empty title="Conversation not found" description="Open a conversation from the inbox." />;
  return <>
    <PageHeading title={c.identity||'Conversation'} description={`${c.channel} · ${c.id}`}><Link className="button outline" href={portal?'/portal/inbox':'/inbox'}>All conversations</Link>
      {!portal&&c.lead_id&&<Link className="button" href={'/leads/'+c.lead_id}>View CRM lead</Link>}</PageHeading>
    <div className="sim-grid">
      <Panel className={'chat-panel '+(c.channel==='Instagram'?'instagram':'whatsapp')}>
        <div className="chat-header"><span className="chat-icon"><MessageCircle size={22}/></span><div><h2>{c.channel} conversation</h2><p>Stored conversation history</p></div><Badge value={c.status}/></div>
        <Messages conversation={c} customer={portal}/>
        {!portal&&<label className="compose-toggle check-label"><input type="checkbox" checked={note} onChange={e=>setNote(e.target.checked)}/> Save as internal note</label>}
        <Composer label={note?'Save note':'Send reply'} send={body=>act('inbox.message',{id:c.id,body,internal:note},note?'Note saved':portal?'Message saved':'Simulated reply saved')}
          quick={portal?[]:['Thanks for your enquiry. I’ll check the options.','Could you confirm your travel dates?']}/>
      </Panel>
      {!portal&&<div className="sim-side">
        <Panel title="Conversation controls"><div className="panel-body"><Details items={[['Channel',c.channel],['Sales owner',labelFor(data.team,c.owner)],['Customer',c.customer_id?<Link className="text-link" href={'/customers/'+c.customer_id}>{labelFor(data.customers,c.customer_id)}</Link>:c.identity],['Started',titleDate(c.created)]]}/>
          <div className="actions section-actions">{[['Human','Take over'],['Paused','Pause automation'],['Automation','Resume automation'],['Closed','Close'],['Open','Reopen']].filter(([s])=>s!==c.status&&(s!=='Open'||c.status==='Closed')).map(([status,label])=>
            <Button className="outline" key={status} disabled={Boolean(action)} onClick={async()=>{setAction(status);try{await act('inbox.state',{id:c.id,status},'Conversation updated');}catch{}finally{setAction('');}}}>{label}</Button>)}</div>
          {c.lead_id&&<Form fields={[{name:'due',label:'Next follow-up',type:'date',value:data.today}]} label="Schedule follow-up"
            submit={p=>act('inbox.followup',{...p,id:c.id},'Follow-up scheduled')}/>}</div></Panel>
        <Panel title="Conversation events"><div className="panel-body"><Timeline events={data.events.filter(e=>e.conversation_id===c.id)}/></div></Panel>
      </div>}
    </div>
  </>;
}
