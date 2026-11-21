import { existsSync, renameSync } from 'node:fs';
import { dataDir, day, insert, migrate, one, transaction } from '../server/db.local.ts';
import { passwordHash } from '../server/password.ts';
import { addDays, roles, sources } from '../domains/shared.ts';

const demo=process.env.CRM_DEMO!=='0';
const action=process.argv[2];
if (action==='reset') {
  if (!demo || !process.argv.includes('--confirm')) throw Error('Stop the application. Use npm run db:reset -- --confirm to back up and recreate the local demo database.');
  if (existsSync(dataDir)) {
    const backup=dataDir+'.backup-'+new Date().toISOString().replace(/[:.]/g,'-');
    renameSync(dataDir,backup);
    console.log('Previous presentation data backed up to '+backup);
  }
}
migrate();
console.log('SQLite migrations ready.');
if (action==='migrate') process.exit(0);
if (!demo) throw Error('Seed data is available only when CRM_DEMO is enabled.');

const code=(prefix:string,n:number)=>prefix+'-'+String(n+1).padStart(4,'0');
const anchor=process.env.CRM_SEED_DATE;
if (anchor && (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || day(0,new Date(anchor+'T12:00:00Z'))!==anchor)) {
  throw Error('CRM_SEED_DATE must be a valid date (YYYY-MM-DD)');
}
const seedDate=anchor?new Date(anchor+'T12:00:00Z'):new Date();
const d=(offset:number)=>day(offset,seedDate);
const time=(offset:number)=>d(offset)+' 07:30:00';
const names=['Ananya Rao','Rohan Mehta','Meera Iyer','Kabir Shah','Ishita Sen','Arjun Nair','Nisha Menon','Aditya Patel','Tara Kapoor','Vihaan Verma',
  'Priya Joseph','Farah Khan','Sara Thomas','Karan Desai','Nandini Das','Sahil Jain','Maya Bose','Rhea Fernandes','Rahul Suri','Aisha Malik',
  'Dev Kulkarni','Nikhil Anand','Leena George','Vikram Gill','Aarohi Pillai','Samir Sethi','Diya Reddy','Neha Bhat','Aditi Gupta','Ravi Prasad',
  'Mina Tan','Daniel Reyes','Sofia Martins','Noah Bennett','Amira Haddad','Hana Kim','Elias Jensen','Yuki Mori','Lucas Meyer','Nora Diaz'];
const offerings=[
  ['Dubai','Dubai Family Discovery','Family','Marina evening cruise','Old Dubai and desert camp'],
  ['Kashmir','Kashmir Valley Escape','Nature','Srinagar lake and gardens','Gulmarg alpine excursion'],
  ['Bali','Bali Honeymoon Retreat','Honeymoon','Ubud rice terraces','Sunset at Uluwatu'],
  ['Kerala','Kerala Backwater Trail','Nature','Munnar tea estates','Alleppey backwaters'],
  ['Thailand','Thailand Island Explorer','Adventure','Old Phuket and markets','Krabi island excursion'],
  ['Singapore','Singapore Family Explorer','Family','Gardens by the Bay','Sentosa and Universal Studios'],
  ['Goa','Goa Coast Weekend','Leisure','Fontainhas heritage walk','South Goa beaches'],
  ['Maldives','Maldives Lagoon Retreat','Honeymoon','Lagoon snorkelling','Sunset boat outing'],
  ['Vietnam','Vietnam Heritage Journey','Culture','Hanoi old quarter','Ha Long Bay cruise'],
  ['Sri Lanka','Sri Lanka Hill Country','Nature','Kandy cultural visit','Ella scenic rail journey'],
  ['Nepal','Kathmandu and Pokhara','Adventure','Kathmandu valley tour','Pokhara lakeside'],
  ['Rajasthan','Rajasthan Palace Route','Culture','Jaipur forts and bazaars','Udaipur lakeside'],
  ['Japan','Japan City Discovery','Culture','Tokyo neighbourhoods','Kyoto heritage walk'],
  ['Dubai','Dubai Stopover Essentials','Leisure','Downtown Dubai landmarks','Creek and souk walk'],
  ['Kerala','Kerala Wellness Break','Leisure','Spice garden visit','Guided wellness sessions'],
] as const;
const sourceWeights=[20,18,12,9,4,5,2];
let sourceState=20261120;
function nextSource() {
  sourceState=(Math.imul(sourceState,1664525)+1013904223)>>>0;
  const point=Math.floor(sourceState/0x100000000*70);
  let through=0;
  return sources[sourceWeights.findIndex(weight=>(through+=weight)>point)];
}
const cities=['Chennai','Bengaluru','Mumbai','Kochi','Delhi','Hyderabad','Pune','Kolkata'];
const sales=['USR-SALES','USR-SALES2'];
const suppliers=['Coral Gate Stays','Snowline Guest Services','Lotus Bay Resorts','Coconut Trail Transfers','Andaman Route Operators','Orchid City Hotels','Konkan Coach Co','Lagoon Island Services','Lantern Local Guides','Ceylon Hill Transport','Mountain Circuit Travel','Amber Heritage Guides','Maple Rail Holidays','Meridian Visa Desk'];
function itinerary(i:number) {
  const [destination,,,...visits]=offerings[i%offerings.length];
  return [
    {title:`Arrive in ${destination}`,description:'Meet the local representative at the agreed pickup point. Transfer to the hotel and check in.'},
    ...visits.map(title=>({title,description:'Meet your guide after breakfast. Confirm pickup time with your local coordinator the previous evening.'})),
    {title:'Departure',description:'Check out after breakfast. Scheduled transfer to the airport or onward pickup point.'},
  ];
}

transaction(()=>{
  if (one("SELECT 1 FROM settings WHERE key='seed_version'")) { console.log('Seed already present. Existing records preserved.'); return; }
  for (const [key,value] of Object.entries({seed_version:'1',currency:'INR',timezone:'Asia/Kolkata',agency:'Zuri Holidays'})) insert('settings',{key,value});
  for (const [id,label] of Object.entries(roles)) insert('roles',{id,label});
  names.forEach((name,i)=>insert('customers',{id:code('CUS',i),name,phone:'+9190000'+String(1001+i).padStart(5,'0'),
    email:i===0?'ananya@example.test':name.toLowerCase().replace(' ','.')+'@example.test',instagram:i%5===0?name.toLowerCase().replace(' ','.'):null,
    preferences:['Vegetarian meals and private transfers','Family-friendly accommodation','Flexible travel dates','Boutique stays and guided day tours'][i%4],created:time(-190+i*3)}));
  const demoHash=passwordHash('ZuriDemo!2026');
  const users=[
    ['USR-ADMIN','Maya Srinivasan','owner','admin',null],
    ['USR-MANAGER','Vikram Kapoor','manager','manager',null],
    ['USR-SALES','Isha Nair','sales','sales',null],
    ['USR-SALES2','Ravi Menon','sales2','sales',null],
    ['USR-OPS','Nadia Joseph','operations','ops',null],
    ['USR-FIN','Dev Anand','finance','finance',null],
    ['USR-CUSTOMER','Ananya Rao','customer','customer',code('CUS',0)],
    ['USR-CUSTOMER2','Rohan Mehta','customer2','customer',code('CUS',1)],
    ['USR-CUSTOMER3','Meera Iyer','customer3','customer',code('CUS',2)],
  ];
  for (const [id,name,email,role,customer_id] of users) insert('users',{id,name,email:email+'@zuri.demo',hash:demoHash,role,customer_id});
  names.forEach((_,i)=>insert('customer_sales_assignments',{customer_id:code('CUS',i),salesperson_id:sales[i%2]}));
  for (const [id,label,template] of [
    ['acknowledgement','Website acknowledgement','Thanks, {name}. We received your travel brief and a specialist will be in touch.'],
    ['handoff','Human handoff','I’ve shared this conversation with a travel specialist. They can reply here.'],
    ['quotation','Quotation notification','Your quotation {quote} is ready. You can review and respond in the customer portal.'],
    ['followup','Follow-up reminder','A follow-up is due for your travel enquiry.'],
    ['departure','Departure reminder','Review documents and confirmed services before departure.'],
    ['documents','Document due alert','Check the requested traveller documents.'],
    ['feedback','Feedback request','We hope you enjoyed your trip. Tell us how it went in your customer portal.'],
  ]) insert('workflows',{id,label,template});
  suppliers.forEach((name,i)=>insert('suppliers',{id:code('SP',i),name,category:['Hotel','Transport','Tour operator','Consolidator','Guide / activity','Visa services'][i===13?5:i%5],
    destination:offerings[i][0],contact:'Partner desk',email:'partner'+(i+1)+'@example.test',phone:'+919500000'+String(100+i),
    rate:(2600+710*i)*100,terms:i%2?'50% on confirmation, balance on departure':'Net 15 days after service',notes:'Fictional partner profile for local demonstration.'}));
  offerings.forEach(([destination,title,category],i)=>{
    const packageId=code('PK',i);
    insert('packages',{id:packageId,title,destination,category,nights:3,overview:`A four-day ${category.toLowerCase()} itinerary in ${destination} with guided outings, a comfortable stay and flexible free time.`,
      cover:destination==='Dubai'?'/travel/dubai.jpg':'',hotel:'4-star or equivalent',meals:'Breakfast daily',transfers:'Airport pickup and drop-off',activities:offerings[i][3]+', '+offerings[i][4],
      flights:0,inclusions:'Three nights, daily breakfast, transfers and guided visits',exclusions:'Airfare, optional activities, personal expenses and visa fees',
      cancellation:'Written cancellation subject to supplier terms. Demo terms can be revised in the quotation.',
      base:(32000+4800*i)*100,markup:(8000+600*i)*100,valid_until:d(180),active:i===14?0:1});
    itinerary(i).forEach((item,j)=>insert('package_days',{package_id:packageId,position:j+1,...item}));
    insert('package_suppliers',{package_id:packageId,supplier_id:code('SP',i%suppliers.length)});
  });
  for (let i=0;i<70;i++) {
    const lead=code('LD',i);
    const customer=code('CUS',i%names.length);
    const cv=code('CV',i);
    const p=(i*7)%offerings.length;
    const destination=offerings[p][0];
    const source=nextSource();
    const stage=i<22?'Won':i<31?(i<25?'Quotation Sent':'Quotation Prepared'):
      ['New','Qualified','In Conversation','Negotiation','Lost','Unresponsive','Closed','New','Qualified'][i%9];
    const owner=sales[i%2];
    const ago=i>=58?(i-70):(-8-(i*13)%174);
    insert('leads',{id:lead,customer_id:customer,source,owner,stage,destination,package_id:code('PK',p),city:cities[i%8],dates:d(10+i%58),
      flexible:i%3===0?1:0,adults:2+i%3,children:i%2,ages:i%2?'8':'',budget:(52000+(i*7300)%170000)*100,purpose:offerings[p][2],
      preferences:i%2?'Late arrival and family-friendly hotel':'Shared transfers welcome',priority:i%8===0?'High':'Normal',follow_up:d(i%12-4),created:time(ago),touched:time(ago+1)});
    insert('conversations',{id:cv,channel:source,identity:names[i%names.length],lead_id:lead,customer_id:customer,owner,status:i%4===0?'Human':'Open',created:time(ago)});
    const body=`Hello, we’re interested in a trip to ${destination} from ${cities[i%8]}. Could you share options?`;
    insert('messages',{id:code('MS',i*2),conversation_id:cv,direction:source==='Phone Call'?'Internal':'Inbound',body,created:time(ago)});
    if (i%4!==0) insert('messages',{id:code('MS',i*2+1),conversation_id:cv,direction:'Outbound',body:`Thanks for your ${destination} enquiry. We’ll review travel dates and available demo packages.`,automated:1,created:time(ago)});
    insert('events',{id:code('EV',i),kind:'Enquiry received',summary:`${source} enquiry for ${destination}`,lead_id:lead,conversation_id:cv,actor:owner,created:time(ago)});
    if (source==='Website') insert('submissions',{id:code('FORM',i),lead_id:lead,conversation_id:cv,payload:JSON.stringify({name:names[i%names.length],destination,source}),created:time(ago)});
    if (i>=27) insert('tasks',{id:code('TSK',i),lead_id:lead,owner,title:`Follow up on ${destination} enquiry`,due:d(i%10-4),status:i%4===0?'Done':'Open',priority:i%8===0?'High':'Normal'});
    if (i>=32) continue;
    const quote=code('QT',i);
    const quoteStatus=i<22?'Accepted':['Sent','Viewed','Sent','Draft','Internal Review','Approved','Rejected','Expired','Draft','Sent'][i-22];
    const status=['Confirmed','Pending Advance','Documents Ready','Advance Recorded','Supplier Confirmation Pending','Completed','Cancelled','Cancelled','Confirmed','Documents Ready','Travel In Progress'][i%11];
    const departure=status==='Completed'?d(-15-i):status==='Travel In Progress'?d(-1):d(2+i%32);
    const end=status==='Completed'?d(-12-i):status==='Travel In Progress'?d(2):d(5+i%32);
    const cost=(39000+((i*7370)%85000))*100;
    const markup=(9000+((i*1020)%23000))*100;
    const tax=i%4===0?300_000:0, extras=i%3===0?240_000:0, discount=i%5===0?120_000:0;
    const total=cost+markup+tax+extras-discount, advance=Math.floor(total/300)*100;
    const trip=JSON.stringify(itinerary(p));
    const quoteRow={id:quote,lead_id:lead,customer_id:customer,package_id:code('PK',p),destination,departure,return_date:end,adults:2+i%3,children:i%2,
      status:quoteStatus,balance_due:addDays(departure,-7),itinerary:trip,cost,markup,discount,extras,tax,total,advance,
      expiry:d(quoteStatus==='Expired'?-4:22),schedule:'Advance on acceptance. Balance seven days before travel.',
      terms:'Rates are synthetic. Availability and travel conditions require manual confirmation.',notes:'Airport pickup is included.',internal:'Demo costing checked.',
      created:time(ago+2)};
    insert('quotes',quoteRow);
    insert('quote_revisions',{quote_id:quote,version:1,snapshot:JSON.stringify(quoteRow),actor:owner,created:time(ago+2)});
    if (i>=22) continue;
    const booking=code('BK',i), traveller=code('TR',i), job=code('SVC',i);
    insert('bookings',{id:booking,quote_id:quote,customer_id:customer,destination,status,departure,return_date:end,balance_due:addDays(departure,-7),itinerary:trip,total,cost,advance,
      hotel:status==='Pending Advance'?'':'Demo 4-star hotel',flight:'Traveller-arranged flight',transfer:'Demo private airport transfer',
      cancel_reason:status==='Cancelled'?'Traveller changed plans':'',created:time(ago+4)});
    insert('travellers',{id:traveller,customer_id:customer,name:names[i],nationality:'Indian',document_ref:'DEMO-ID-'+(i+1),emergency:'Contact agency desk'});
    insert('booking_travellers',{booking_id:booking,traveller_id:traveller});
    insert('travellers',{id:code('TR',i+40),customer_id:customer,name:'Travel companion of '+names[i],nationality:'Indian',assistance:i%4===0?'Vegetarian meal':''});
    insert('booking_travellers',{booking_id:booking,traveller_id:code('TR',i+40)});
    if (!['Pending Advance','Advance Recorded'].includes(status)) {
      const jStatus=status==='Supplier Confirmation Pending'?'Requested':status==='Cancelled'?'Cancelled':'Confirmed';
      insert('supplier_jobs',{id:job,booking_id:booking,supplier_id:code('SP',p%suppliers.length),service:'Accommodation and ground services',status:jStatus,
        cost,reference:jStatus==='Confirmed'?'DEMO-CONF-'+(2801+i):'',due:departure});
      if (jStatus==='Confirmed'&&i%3!==0) insert('settlements',{id:code('STL',i),job_id:job,amount:Math.floor(cost/2),actor:'USR-FIN',created:time(ago+11)});
    }
    if (status!=='Pending Advance') {
      insert('payments',{id:code('PAY',i*3),booking_id:booking,amount:advance,method:'UPI',status:'Paid',actor:'USR-FIN',created:time(ago+6)});
      if (['Completed','Documents Ready','Travel In Progress'].includes(status)) insert('payments',{id:code('PAY',i*3+1),booking_id:booking,amount:total-advance,method:'Bank transfer',status:'Paid',actor:'USR-FIN',created:time(ago+10)});
      if (status==='Cancelled') insert('payments',{id:code('PAY',i*3+2),booking_id:booking,amount:i%11===6?advance:Math.floor(advance/2),method:'UPI',status:'Refunded',parent:code('PAY',i*3),actor:'USR-FIN',created:time(ago+12)});
    } else insert('payments',{id:code('PAY',i*3),booking_id:booking,amount:advance,method:'Card',status:i%2?'Failed':'Pending',actor:'USR-FIN',created:time(ago+6)});
    if (['Confirmed','Documents Ready','Travel In Progress','Completed'].includes(status)) insert('invoices',{id:code('INV',i),booking_id:booking,created:time(ago+8)});
    for (let j=0;j<2;j++) {
      const kind=j?'Travel insurance':'Passport copy';
      const verified=['Documents Ready','Travel In Progress','Completed','Cancelled'].includes(status)||(i+j)%4===0;
      insert('documents',{id:code('DOC',i*2+j),customer_id:customer,booking_id:booking,traveller_id:traveller,kind,name:verified?'demo-'+kind.toLowerCase().replace(' ','-')+'.pdf':kind,
        mime:verified?'application/pdf':null,status:verified?'Verified':'Missing',due:departure,created:time(ago+7)});
    }
    if (p%3===0) insert('visas',{id:code('VISA',i),booking_id:booking,traveller_id:traveller,status:['Documents Ready','Travel In Progress','Completed'].includes(status)?'Approved':'Documents Pending',due:departure,notes:'Manually tracked synthetic status.'});
    if (!['Pending Advance','Cancelled'].includes(status)) for (let j=0;j<3;j++) {
      insert('tasks',{id:code('OPS',i*3+j),booking_id:booking,owner:'USR-OPS',title:['Check supplier confirmations','Review passport and insurance','Prepare travel itinerary'][j],due:departure,
        status:status==='Completed'?'Done':j===0?'In progress':'Open',priority:j===1?'High':'Normal'});
    }
    if (status==='Completed') insert('feedback',{id:code('FB',i),booking_id:booking,rating:5,notes:'Clear itinerary and smooth hotel coordination.',created:time(-2)});
  }
  insert('notifications',{id:'NT-DEMO',user_id:'USR-ADMIN',title:'Review upcoming departures and missing travel documents',href:'/operations',created:time(0)});
  console.log('Seeded 70 leads, 40 customers, 15 packages, 32 quotations, 22 bookings and 14 suppliers.');
});
