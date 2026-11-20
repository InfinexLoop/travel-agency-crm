import { describe, expect, it } from 'vitest';
import { report } from '../../domains/reporting';
import { balance, paymentSchedule } from '../../domains/shared';
import { travelWindow } from '../../domains/travel-dates';
import { phone } from '../../server/input';

describe('commercial definitions',()=>{
  it('distinguishes booking value, confirmed revenue, recorded cash and supplier costs',()=>{
    const result=report({leads:[],quotes:[],bookings:[
      {id:'a',created:'2026-11-01',status:'Pending Advance',total:2000,paid:0,cost:1600},
      {id:'b',created:'2026-11-01',status:'Confirmed',total:1000,paid:600,cost:500,assigned_cost:650},
      {id:'c',created:'2026-11-01',status:'Cancelled',total:3000,paid:200,cost:1800},
    ],supplier_jobs:[{booking_id:'b',status:'Confirmed',cost:650,settled:250},{booking_id:'c',status:'Cancelled',cost:500,settled:0}]},{},'2026-11-20');
    expect(result).toMatchObject({value:3000,sales:1000,cash:800,outstanding:2400,payable:400,costs:650,profit:350,margin:35});
    expect(balance(1000,600,'Cancelled')).toBe(0);
  });
  it('normalizes contact numbers for cross-channel deduplication',()=>{
    expect(phone('90000 01001')).toBe('+919000001001');
    expect(phone('+91 (90000) 01001')).toBe('+919000001001');
    expect(phone('invalid')).toBe('');
  });
});

describe('quotation travel dates',()=>{
  it('prefills concrete dates and leaves approximate ranges for staff to confirm',()=>{
    expect(travelWindow('15–20 December','2026-11-20')).toEqual({departure:'2026-12-15',return_date:'2026-12-20'});
    expect(travelWindow('10 Jan','2026-11-20')).toEqual({departure:'2027-01-10',return_date:undefined});
    expect(travelWindow('Next month for five days','2026-11-20')).toBeUndefined();
    expect(travelWindow('2026-11-31','2026-11-20')).toBeUndefined();
  });
});

it('allocates partial payments to advance first and uses the business date',()=>{
  const schedule=paymentSchedule(3000,1000,1600,'2026-11-19 20:30:00','2026-11-21','Confirmed','2026-11-20');
  expect(schedule).toEqual([
    {title:'Advance',amount:1000,date:'2026-11-20',outstanding:0,state:'Paid'},
    {title:'Remaining trip balance',amount:2000,date:'2026-11-21',outstanding:1400,state:'Pending'},
  ]);
});
