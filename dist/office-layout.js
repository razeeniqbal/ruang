(function(root){
  // V2 office: the backdrop is design/v2 "Master Test Office Composition" (1536x1024) on a 48x32 grid of 32px cells.
  // Furniture lives in the image, so objects here are invisible collision rectangles and interaction points.
  // Slots may carry dx/dy (fraction of a cell) to sit exactly on a pictured chair, and face for the seated direction.
  const layout={version:6,width:48,height:32,tile:32,background:'v2/office.png',zones:[],objects:[],spawns:[{x:19,y:28},{x:12,y:8},{x:21,y:21},{x:36,y:23},{x:40,y:10}]};
  function add(id,x,y,w=1,h=1,options={}){layout.objects.push({id,x,y,width:w,height:h,collision:true,...options})}
  let n=0;const block=(x,y,w,h)=>add('block-'+n++,x,y,w,h);
  const seat=(x,y,face,dx=0,dy=0)=>({x,y,face,dx,dy});
  function desk(id,x,y,w,h,name,slots,kind='work'){add(id,x,y,w,h,{name,kind,actions:['work'],capacity:slots.length,slots})}

  // Shell: windows and back rooms along the top, outer walls, and the entrance gap at the bottom.
  block(0,0,48,5);block(0,5,3,25);block(47,5,1,25);block(0,30,48,2);

  // Upper lounge, window bar and pantry.
  add('sofa',3,5,5,1,{name:'Lounge sofa',kind:'break',actions:['sit'],capacity:2,slots:[seat(4,6,'down',.1,-.35),seat(6,6,'down',.1,-.35)]});
  add('armchair',8,5,3,1,{name:'Armchair',kind:'break',actions:['sit'],capacity:1,slots:[seat(9,6,'down',-.1,-.5)]});
  block(5,7,3,1);block(8,7,2,1);block(22,5,1,1);
  add('window-view',15,3,7,2,{name:'Window bar',kind:'break',actions:['look_outside'],capacity:3,collision:false,slots:[seat(16,5,'up',-.4,-.3),seat(17,5,'up',.4,-.3),seat(19,5,'up',.4,-.3)]});
  add('coffee',25,3,2,2,{name:'Coffee machine',kind:'break',actions:['get_coffee'],capacity:1,slots:[seat(25,5,'up',.3)]});
  add('water',28,3,1,3,{name:'Water dispenser',kind:'break',actions:['get_water'],capacity:1,slots:[seat(28,6,'up',.4)]});
  add('snacks',29,5,3,1,{name:'Pantry fridge',kind:'break',actions:['get_coffee'],capacity:1,slots:[seat(30,6,'up')]});
  block(41,5,1,2);

  // Open-plan workstations. Monitors facing away from the camera mean the seat is on the near side.
  desk('manager',3,10,4,2,'Manager desk',[seat(4,9,'down',-.05,.1)]);
  desk('research',9,10,3,2,'Research workstation',[seat(10,12,'up',-.35)]);
  desk('analysis',12,10,2,2,'Analysis workstation',[seat(12,12,'up')]);
  desk('developer',15,10,3,2,'Development workstation',[seat(16,12,'up',-.05)]);
  desk('qa',18,10,2,2,'QA workstation',[seat(18,12,'up',.15)]);
  block(10,9,1,1);block(12,9,1,1);block(16,9,1,1);block(18,9,1,1);
  desk('hotdesk',2,14,4,2,'Hot desk',[seat(4,16,'up',-.35)]);
  desk('ai',10,15,4,2,'AI workstation',[seat(12,17,'up',-.4)]);block(9,16,1,2);
  desk('pair',15,15,4,2,'Pair programming desk',[seat(17,17,'up',-.4),seat(15,17,'up',.5)],'collaboration');block(19,15,2,3);
  block(6,13,2,4);block(9,20,7,3);

  // Lower lounge, reception and entrance vestibule.
  add('lounge',2,18,5,2,{name:'Lounge sofa (lower)',kind:'break',actions:['sit'],capacity:2,slots:[seat(3,20,'down',.1,-.6),seat(5,20,'down',.1,-.6)]});
  block(3,21,2,2);block(6,20,1,2);
  add('reception',4,25,7,2,{name:'Reception',kind:'utility',actions:['work'],capacity:1,slots:[seat(8,24,'down',-.45)]});
  block(4,24,2,1);block(9,24,2,1);block(13,26,1,3);
  block(14,24,1,6);block(15,24,3,3);block(21,24,3,3);block(15,26,2,2);block(22,26,2,2);block(24,24,1,6);block(25,26,1,3);

  // Glass meeting room (door at x23-24, y15-16).
  block(22,7,1,11);block(23,7,10,3);block(33,7,1,10);block(25,15,8,2);block(23,10,1,4);block(31,9,2,2);
  add('projectboard',24,10,1,1,{name:'Meeting room whiteboard',kind:'planning',actions:['plan','review'],capacity:2,slots:[seat(24,11,'up'),seat(25,11,'up')]});
  add('meeting',26,11,5,2,{name:'Meeting table',kind:'collaboration',actions:['discuss'],capacity:8,slots:[
    seat(26,10,'down',.4),seat(28,10,'down',-.2),seat(29,10,'down',.2),seat(26,13,'up',.4,.3),seat(28,13,'up',-.2,.3),seat(29,13,'up',.2,.3),seat(25,12,'right',.3),seat(31,12,'left',-.15)]});

  // Collaboration corner, bookshelf and the right-hand corridor to the lift.
  block(34,7,5,3);block(37,9,2,2);block(37,12,2,3);block(35,14,2,1);block(39,7,1,16);block(34,18,1,3);
  add('whiteboard',35,11,3,3,{name:'Whiteboard',kind:'planning',actions:['plan','present'],capacity:3,slots:[seat(34,12,'right'),seat(34,13,'right'),seat(34,14,'right')]});
  add('bookshelf',35,16,4,5,{name:'Bookshelf',kind:'research',actions:['read'],capacity:2,slots:[seat(36,21,'up'),seat(37,21,'up')]});
  block(42,5,6,9);block(42,14,1,1);block(46,16,1,2);block(40,18,8,5);

  // Round table, focus booths, café corner.
  add('discussion',28,18,2,3,{name:'Round table',kind:'collaboration',actions:['discuss'],capacity:4,slots:[seat(27,18,'right',-.25),seat(30,18,'left',.15),seat(27,20,'right',-.1),seat(30,20,'left',.1)]});
  block(27,22,1,6);block(29,22,1,6);block(31,22,1,6);block(33,22,1,6);block(30,24,1,3);block(34,24,5,4);block(46,23,1,6);
  add('booth-1',28,22,1,4,{name:'Focus booth',kind:'focus',actions:['work'],capacity:1,slots:[seat(28,26,'down',0,.2)]});
  add('booth-2',32,22,1,4,{name:'Focus booth',kind:'focus',actions:['work'],capacity:1,slots:[seat(32,26,'down',0,.2)]});
  add('cafe',42,24,2,3,{name:'Café table',kind:'break',actions:['take_break'],capacity:2,slots:[seat(40,25,'right',.4),seat(44,25,'left',-.1)]});

  layout.homeByAgent=['manager','research','analysis','developer','qa'];
  const api=layout;if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OfficeLayout=api;
})(typeof window!=='undefined'?window:globalThis);
