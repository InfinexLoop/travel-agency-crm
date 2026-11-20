'use client';
import { useSearchParams } from 'next/navigation';
import { Customers, Leads, Packages, Quotes } from './sales-records';
import { Bookings, Documents, Operations } from './travel-records';
import { Finance, Suppliers, Team } from './business-records';
import { Empty } from './ui';
export function Records({section,id,sub}:{section:string;id?:string;sub?:string}) {
  const query=useSearchParams();
  switch(section) {
    case 'leads':return <Leads id={id}/>;
    case 'customers':return <Customers id={id}/>;
    case 'packages':return <Packages id={id}/>;
    case 'quotes':return <Quotes id={id} leadId={query.get('lead')||undefined}/>;
    case 'bookings':return <Bookings id={id}/>;
    case 'documents':return <Documents id={id} sub={sub} booking={query.get('booking')||undefined} lead={query.get('lead')||undefined}/>;
    case 'operations':return <Operations id={id}/>;
    case 'suppliers':return <Suppliers id={id} sub={sub}/>;
    case 'finance':return <Finance id={id} sub={sub}/>;
    case 'team':return <Team id={id}/>;
    default:return <Empty title="This page is unavailable"/>;
  }
}
