export const roles = {
  admin:'Owner / Admin', manager:'Sales Manager', sales:'Sales Executive',
  ops:'Operations Executive', finance:'Finance Executive', customer:'Customer',
} as const;
export type Role = keyof typeof roles;
export type User = {id:string; name:string; email:string; role:Role; customer_id:string|null};
export const sources = ['Website','WhatsApp','Instagram','Phone Call','Walk-in','Referral','Other'] as const;
export const stages = ['New','In Conversation','Qualified','Quotation Prepared','Quotation Sent','Negotiation','Won','Lost','Unresponsive','Closed'] as const;
export const quoteStatuses = ['Draft','Internal Review','Approved','Sent','Viewed','Accepted','Rejected','Expired'] as const;
export const bookingStatuses = ['Pending Advance','Advance Recorded','Supplier Confirmation Pending','Confirmed','Documents Ready','Travel In Progress','Completed','Cancelled'] as const;
export const visaStatuses = ['Not Required','Documents Pending','Application Prepared','Submitted','Processing','Approved','Rejected'] as const;
export const docKinds = ['Passport copy','Photograph','Visa application','Visa-status document','Travel insurance','Hotel voucher','Flight itinerary','Invoice','Payment receipt','Final travel itinerary','Other'] as const;
export const confirmed = ['Confirmed','Documents Ready','Travel In Progress','Completed'];
export const scenarios = [
  ['Dubai family holiday','Hi, I want a Dubai package.','2 adults and 1 child','15–20 December','Chennai','₹90,000','Aarav Demo, +91 90000 00071, aarav71@example.test','Family-friendly hotel and airport transfers'],
  ['Bali honeymoon','Hi, do you have Bali honeymoon packages?','2 adults','Next month for five days','Bengaluru','₹120,000','Mira Demo, +91 90000 00072, mira72@example.test','Private pool and a relaxed itinerary'],
  ['Kashmir group trip','Can you help our group with a Kashmir package?','6 adults','Next month, flexible dates','Mumbai','₹150,000','Neel Demo, +91 90000 00073, neel73@example.test','Snow activities and shared transfers'],
  ['Thailand on a budget','Hi, Thailand honeymoon package?','2 adults','February, flexible','Hyderabad','₹80,000','Ana Demo, +91 90000 00074, ana74@example.test','Budget-friendly hotels near the beach'],
  ['Singapore family trip','Please share a Singapore family package','2 adults and 2 children','Next month for six days','Kochi','₹140,000','Arun Demo, +91 90000 00075, arun75@example.test','Universal Studios and connecting rooms'],
  ['Corporate travel','I need a corporate trip to Goa','12 adults','10–13 December','Pune','₹240,000','Diya Demo, +91 90000 00076, diya76@example.test','Conference space and airport transfers'],
  ['Returning customer','Hello, I would like to travel to Kerala again','2 adults','Flexible next month','Chennai','₹65,000','Ananya Rao, +91 90000 01001, ananya@example.test','Backwaters and a vegetarian meal plan'],
] as const;
export const money = (paise: number) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:paise%100?2:0}).format(paise/100);
export const titleDate = (value: string) => {
  if (!value) return '—';
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  return new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(value.length===10?value+'T00:00:00Z':value.replace(' ','T')+'Z'));
};
export const timestamp = (value: string) => new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'}).format(new Date(value.replace(' ','T')+'Z'));
export function balance(total:number, paid:number, status:string) {
  return status==='Cancelled' ? 0 : Math.max(0,total-paid);
}

export function addDays(date:string,days:number) {
  const value=new Date(date+'T00:00:00Z');
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}
export function businessDate(value:string) {
  if(value.length===10) return value;
  return new Date(value.replace(' ','T')+'Z').toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
}
export function paymentSchedule(total:number,advance:number,paid:number,created:string,due:string,status:string,today:string) {
  const half=(title:string,amount:number,received:number,date:string)=>{
    const outstanding=status==='Cancelled'?0:Math.max(0,amount-received);
    return {title,amount,date,outstanding,state:status==='Cancelled'?'Cancelled':outstanding===0?'Paid':date<today?'Overdue':'Pending'};
  };
  return [
    half('Advance',advance,paid,businessDate(created)),
    half('Remaining trip balance',total-advance,Math.max(0,paid-advance),due),
  ];
}
