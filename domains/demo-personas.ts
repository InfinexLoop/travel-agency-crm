export const demoOwnerId='USR-DEMO-OWNER';

export const demoPersonas={
  owner:{label:'Owner / Admin',id:demoOwnerId,role:'admin',customerId:null},
  manager:{label:'Sales Manager',id:'USR-MANAGER',role:'manager',customerId:null},
  sales:{label:'Sales Executive',id:'USR-SALES',role:'sales',customerId:null},
  sales2:{label:'Sales Executive — Ravi',id:'USR-SALES2',role:'sales',customerId:null},
  operations:{label:'Operations Executive',id:'USR-OPS',role:'ops',customerId:null},
  finance:{label:'Finance Executive',id:'USR-FIN',role:'finance',customerId:null},
  customer:{label:'Ananya Rao',id:'USR-CUSTOMER',role:'customer',customerId:'CUS-0001'},
  customer2:{label:'Rohan Mehta',id:'USR-CUSTOMER2',role:'customer',customerId:'CUS-0002'},
  customer3:{label:'Meera Iyer',id:'USR-CUSTOMER3',role:'customer',customerId:'CUS-0003'},
} as const;
