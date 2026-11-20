// Keep approximate enquiry dates as text and only prefill concrete calendar dates.
const monthNames=['january','february','march','april','may','june','july','august','september','october','november','december'];
const monthPattern=monthNames.map(month=>month.slice(0,3)+'(?:'+month.slice(3)+')?').join('|');
const exactDate=(year:number,month:number,day:number)=>{
  const date=new Date(Date.UTC(year,month,day));
  if(date.getUTCMonth()!==month||date.getUTCDate()!==day) return;
  return date.toISOString().slice(0,10);
};
export function travelWindow(brief:string,today:string) {
  const iso=brief.trim().match(/^(\d{4}-\d{2}-\d{2})(?:\s*(?:to|–|—|through)\s*(\d{4}-\d{2}-\d{2}))?$/i);
  if (iso) {
    const dates=iso.slice(1).filter(Boolean);
    if(dates.every(d=>{
      const [y,m,day]=d.split('-').map(Number);
      return exactDate(y,m-1,day)===d;
    })&&iso[1]>=today&&(!iso[2]||iso[2]>=iso[1])) return {departure:iso[1],return_date:iso[2]};
    return;
  }
  const monthDate=brief.trim().match(new RegExp(`^(\\d{1,2})(?:\\s*(?:to|[–—-])\\s*(\\d{1,2}))?\\s+(${monthPattern})(?:\\s+(\\d{4}))?$`,'i'));
  if(!monthDate) return;
  const [,start,end,word,explicitYear]=monthDate;
  const month=monthNames.findIndex(name=>name.startsWith(word.toLowerCase()));
  let year=explicitYear?Number(explicitYear):Number(today.slice(0,4));
  let departure=exactDate(year,month,Number(start));
  if (departure&&departure<today&&!explicitYear) departure=exactDate(++year,month,Number(start));
  const return_date=end?exactDate(year,month,Number(end)):undefined;
  if (departure&&departure>=today&&(!end||(return_date&&return_date>=departure))) return {departure,return_date};
}
